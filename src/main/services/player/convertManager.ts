// Konvertierungs-Queue des Players: sammelt Quelldateien, backt sie in die
// Wand-Auflösung ein (Fit-Modus) und legt sie als abspielbereite Medien in der
// Bibliothek ab. Aufbau analog zum HAP-jobManager (Map + sequentielle Queue).

import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync, readdirSync, rmSync, statSync, type Dirent } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { basename, extname, join } from 'node:path'
import { promisify } from 'node:util'
import type { ConvertJob, MediaKind, PlayerImportRequest } from '@shared/types'
import { ffmpegBinPath } from '../ffmpeg/ffmpegPath'
import { logLine } from '../log'
import { getSettings } from '../store'
import {
  buildImageArgs,
  buildThumbArgs,
  buildVideoArgs,
  resolveEncoder
} from './encoder'
import {
  convKeyFor,
  findByConvKey,
  insertMedia,
  isGifExt,
  isImageExt,
  mediaFilePath,
  storedExtFor
} from './mediaLibrary'

const pexecFile = promisify(execFile)

const VIDEO_EXT = new Set([
  '.mov', '.mp4', '.mxf', '.avi', '.mkv', '.m4v',
  '.mpg', '.mpeg', '.wmv', '.mts', '.m2ts', '.ts', '.webm'
])
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tif', '.tiff'])
const MEDIA_EXT = new Set([...VIDEO_EXT, ...IMAGE_EXT, '.gif'])

type JobSink = (job: ConvertJob) => void
type LibrarySink = () => void

interface ProbeInfo {
  width: number | null
  height: number | null
  durationSec: number | null
  hasVideo: boolean
  hasAudio: boolean
}

function readEntries(dir: string): Dirent<string>[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

function collectMedia(sources: string[]): string[] {
  const out = new Set<string>()
  const walk = (dir: string): void => {
    for (const e of readEntries(dir)) {
      const fp = join(dir, e.name)
      if (e.isDirectory()) walk(fp)
      else if (MEDIA_EXT.has(extname(e.name).toLowerCase())) out.add(fp)
    }
  }
  for (const p of sources) {
    try {
      if (statSync(p).isDirectory()) walk(p)
      else if (MEDIA_EXT.has(extname(p).toLowerCase())) out.add(p)
    } catch {
      // unzugängliche Pfade ignorieren
    }
  }
  return [...out]
}

function kindOf(path: string): MediaKind {
  if (isGifExt(path)) return 'gif'
  if (isImageExt(path)) return 'image'
  return 'video'
}

async function probeSource(path: string): Promise<ProbeInfo> {
  const args = [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_streams',
    '-show_format',
    path
  ]
  const { stdout } = await pexecFile(ffmpegBinPath('ffprobe'), args, {
    maxBuffer: 16 * 1024 * 1024
  })
  const json = JSON.parse(stdout) as {
    streams?: { codec_type?: string; width?: number; height?: number; duration?: string }[]
    format?: { duration?: string }
  }
  const streams = json.streams ?? []
  const video = streams.find((s) => s.codec_type === 'video')
  const hasAudio = streams.some((s) => s.codec_type === 'audio')
  const durStr = video?.duration ?? json.format?.duration
  const dur = durStr ? Number(durStr) : null
  return {
    width: video?.width ?? null,
    height: video?.height ?? null,
    durationSec: dur && Number.isFinite(dur) ? dur : null,
    hasVideo: Boolean(video),
    hasAudio
  }
}

class ConvertManager {
  private jobs = new Map<string, ConvertJob>()
  private procs = new Map<string, ChildProcessWithoutNullStreams>()
  private specs = new Map<string, { fit: PlayerImportRequest['fitMode']; width: number; height: number }>()
  private sink: JobSink = () => {}
  private librarySink: LibrarySink = () => {}
  private active = 0
  private readonly concurrency = 1 // GPU-Encode bewusst sequentiell

  setSink(sink: JobSink): void {
    this.sink = sink
  }
  setLibrarySink(sink: LibrarySink): void {
    this.librarySink = sink
  }

  list(): ConvertJob[] {
    return [...this.jobs.values()]
  }

  private isCanceled(job: ConvertJob): boolean {
    return job.status === 'canceled'
  }

  private update(job: ConvertJob, patch: Partial<ConvertJob>): void {
    Object.assign(job, patch)
    this.sink({ ...job })
  }

  enqueue(req: PlayerImportRequest): { jobIds: string[] } {
    const files = collectMedia(req.sources)
    const width = Math.max(2, Math.round(req.wall.width))
    const height = Math.max(2, Math.round(req.wall.height))
    const jobIds: string[] = []
    for (const src of files) {
      const id = randomUUID()
      const job: ConvertJob = {
        id,
        sourcePath: src,
        title: basename(src, extname(src)),
        status: 'queued',
        progress: 0,
        fitMode: req.fitMode,
        targetWidth: width,
        targetHeight: height,
        kind: kindOf(src),
        mediaId: null,
        encoder: null,
        createdAt: Date.now()
      }
      this.jobs.set(id, job)
      this.specs.set(id, { fit: req.fitMode, width, height })
      this.sink({ ...job })
      jobIds.push(id)
    }
    this.schedule()
    return { jobIds }
  }

  private schedule(): void {
    if (this.active >= this.concurrency) return
    for (const job of this.jobs.values()) {
      if (this.active >= this.concurrency) break
      if (job.status === 'queued') {
        this.active++
        void this.run(job).finally(() => {
          this.active--
          this.schedule()
        })
      }
    }
  }

  private async run(job: ConvertJob): Promise<void> {
    if (this.isCanceled(job)) return
    const spec = this.specs.get(job.id)!
    try {
      const kind = job.kind ?? kindOf(job.sourcePath)
      const convKey = convKeyFor(job.sourcePath, spec.fit, spec.width, spec.height)

      // Dedup: gleiche Quelle, gleicher Fit, gleiche Auflösung -> bereits vorhanden.
      const existing = findByConvKey(convKey)
      if (existing) {
        this.update(job, { status: 'done', progress: 1, kind, mediaId: existing.id })
        return
      }

      this.update(job, { status: 'probing', kind })
      const info = await probeSource(job.sourcePath)
      if (this.isCanceled(job)) return
      if (kind !== 'image' && !info.hasVideo) {
        throw new Error('Keine Videospur gefunden')
      }

      const storedName = `${job.id}${storedExtFor(kind)}`
      const output = mediaFilePath(storedName)
      // eigener Suffix -> kollidiert nicht mit der gebackenen Bild-Datei (${id}.jpg)
      const thumbName = `${job.id}_thumb.jpg`
      const thumbPath = mediaFilePath(thumbName)

      if (kind === 'image') {
        this.update(job, { status: 'converting' })
        await this.spawnFf(job, buildImageArgs({
          input: job.sourcePath, output, fit: spec.fit, width: spec.width, height: spec.height
        }), null)
      } else {
        const encoder = await resolveEncoder(getSettings().player.encoder)
        this.update(job, { status: 'converting', encoder })
        await this.spawnFf(job, buildVideoArgs({
          input: job.sourcePath, output, encoder, fit: spec.fit,
          width: spec.width, height: spec.height, hasAudio: info.hasAudio
        }), info.durationSec)
      }
      if (this.isCanceled(job)) return

      // Thumbnail (best effort -> Fehler hier darf den Import nicht versenken).
      this.update(job, { status: 'thumbnail' })
      let thumbOk = false
      try {
        const seek = Math.min(1, (info.durationSec ?? 1) * 0.1)
        await this.spawnFf(job, buildThumbArgs({
          input: kind === 'image' ? output : job.sourcePath,
          output: thumbPath,
          seekSec: seek,
          isVideo: kind !== 'image'
        }), null, true)
        thumbOk = existsSync(thumbPath)
      } catch (thumbErr) {
        logLine('[player] Thumbnail fehlgeschlagen:', thumbErr instanceof Error ? thumbErr.message : String(thumbErr))
      }
      if (this.isCanceled(job)) return

      const sizeBytes = (() => {
        try {
          return statSync(output).size
        } catch {
          return 0
        }
      })()

      const item = insertMedia({
        id: job.id,
        kind,
        title: job.title,
        originalName: basename(job.sourcePath),
        storedName,
        thumbName: thumbOk ? thumbName : null,
        width: spec.width,
        height: spec.height,
        durationSec: kind === 'image' ? null : info.durationSec,
        fitMode: spec.fit,
        hasAudio: kind === 'image' ? false : info.hasAudio,
        convKey,
        sizeBytes
      })
      this.update(job, { status: 'done', progress: 1, mediaId: item.id })
      this.librarySink()
    } catch (err) {
      if (!this.isCanceled(job)) {
        this.update(job, { status: 'error', error: err instanceof Error ? err.message : String(err) })
      }
    }
  }

  // Spawnt ffmpeg; durationSec!=null -> Fortschritt aus -progress. silent -> keine
  // Job-Fehlermeldung setzen (für best-effort-Schritte wie Thumbnails).
  private spawnFf(
    job: ConvertJob,
    args: string[],
    durationSec: number | null,
    silent = false
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(ffmpegBinPath('ffmpeg'), args, { windowsHide: true })
      this.procs.set(job.id, proc)
      let stdoutBuf = ''
      let stderrTail = ''

      proc.stdout.on('data', (chunk: Buffer) => {
        stdoutBuf += chunk.toString()
        const lines = stdoutBuf.split('\n')
        stdoutBuf = lines.pop() ?? ''
        for (const line of lines) {
          const [key, value] = line.split('=')
          if (key === 'out_time_us' && durationSec && durationSec > 0) {
            const us = Number(value)
            if (Number.isFinite(us)) {
              const p = Math.min(0.999, Math.max(0, us / 1_000_000 / durationSec))
              if (p - job.progress >= 0.01) this.update(job, { progress: p })
            }
          }
        }
      })
      proc.stderr.on('data', (chunk: Buffer) => {
        stderrTail = (stderrTail + chunk.toString()).slice(-2000)
      })
      proc.on('error', (err) => {
        this.procs.delete(job.id)
        reject(err)
      })
      proc.on('close', (code) => {
        this.procs.delete(job.id)
        if (this.isCanceled(job)) {
          resolve()
          return
        }
        if (code === 0) resolve()
        else if (silent) resolve()
        else reject(new Error(`ffmpeg beendet mit Code ${code}. ${stderrTail.trim().split('\n').pop() ?? ''}`))
      })
    })
  }

  cancel(id: string): void {
    const job = this.jobs.get(id)
    if (!job) return
    if (job.status === 'done' || job.status === 'error' || job.status === 'canceled') return
    this.update(job, { status: 'canceled' })
    this.procs.get(id)?.kill('SIGKILL')
    // unfertige Ausgaben aufräumen
    for (const name of [`${id}.mp4`, `${id}.jpg`, `${id}_thumb.jpg`]) {
      try {
        const f = mediaFilePath(name)
        if (existsSync(f)) rmSync(f)
      } catch {
        // ignorieren
      }
    }
  }

  clearFinished(): void {
    for (const [id, job] of this.jobs) {
      if (job.status === 'done' || job.status === 'error' || job.status === 'canceled') {
        this.jobs.delete(id)
        this.specs.delete(id)
      }
    }
  }
}

export const convertManager = new ConvertManager()
