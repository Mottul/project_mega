// Konvertierungs-Queue des Players: sammelt Quelldateien, backt sie in die
// Wand-Auflösung ein (Fit-Modus) und legt sie als abspielbereite Medien in der
// Bibliothek ab. Aufbau analog zum HAP-jobManager (Map + sequentielle Queue).

import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync, readdirSync, renameSync, rmSync, statSync, type Dirent } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { basename, extname, join } from 'node:path'
import { promisify } from 'node:util'
import type { ConvertJob, MediaKind, PlayerImportRequest } from '@shared/types'
import { ffmpegBinPath } from '../ffmpeg/ffmpegPath'
import { logLine } from '../log'
import { getSettings } from '../store'
import {
  buildCopyArgs,
  buildImageArgs,
  buildThumbArgs,
  buildVideoArgs,
  resolveEncoder
} from './encoder'
import {
  convKeyFor,
  deleteMedia,
  findByConvKey,
  getMedia,
  insertMedia,
  isGifExt,
  isImageExt,
  mediaFilePath,
  storedExtFor,
  updateMediaConversion
} from './mediaLibrary'

const pexecFile = promisify(execFile)

const VIDEO_EXT = new Set([
  '.mov', '.mp4', '.mxf', '.avi', '.mkv', '.m4v',
  '.mpg', '.mpeg', '.wmv', '.mts', '.m2ts', '.ts', '.webm'
])
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tif', '.tiff'])
const MEDIA_EXT = new Set([...VIDEO_EXT, ...IMAGE_EXT, '.gif'])
export const ALLOWED_MEDIA_EXT = MEDIA_EXT

type JobSink = (job: ConvertJob) => void
type LibrarySink = () => void

interface ProbeInfo {
  width: number | null
  height: number | null
  durationSec: number | null
  hasVideo: boolean
  hasAudio: boolean
  codecName: string | null
  pixFmt: string | null
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

// Dieselbe Quelle kann mit unterschiedlicher Aufbereitung mehrfach in der
// Bibliothek liegen (eigene conv_key je Fit-Modus). Damit die Einträge nicht
// gleich aussehen, wandert der Fit in den Titel (das Thumbnail wird ohnehin aus
// dem aufbereiteten Ergebnis erzeugt, zeigt also Blur/Balken/Streckung direkt).
const FIT_TITLE: Record<PlayerImportRequest['fitMode'], string> = {
  blur: 'Blur',
  bars: 'Letterbox',
  stretch: 'Stretch'
}
function titleWithFit(base: string, fit: PlayerImportRequest['fitMode']): string {
  return `${base} · ${FIT_TITLE[fit]}`
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
    streams?: {
      codec_type?: string
      codec_name?: string
      pix_fmt?: string
      width?: number
      height?: number
      duration?: string
    }[]
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
    hasAudio,
    codecName: video?.codec_name ?? null,
    pixFmt: video?.pix_fmt ?? null
  }
}

// Quelle liegt bereits exakt in Zielauflösung + browsertauglichem H.264 vor
// -> kein Re-Encode nötig, nur Container-Copy.
function canStreamCopy(kind: MediaKind, info: ProbeInfo, w: number, h: number): boolean {
  return (
    kind === 'video' &&
    info.width === w &&
    info.height === h &&
    info.codecName === 'h264' &&
    info.pixFmt === 'yuv420p'
  )
}

/** Aktuelle Blur-Fill-Parameter aus den Einstellungen (global). */
function currentBlur(): { blurStrength: number; blurDarken: number } {
  const p = getSettings().player
  return { blurStrength: p.blurStrength ?? 50, blurDarken: p.blurDarken ?? 0 }
}

/** Schlüssel-Variante nur für Blur-Fit (Stärke/Abdunkelung verändern das Bild). */
function blurVariant(spec: {
  fit: PlayerImportRequest['fitMode']
  blurStrength: number
  blurDarken: number
}): string | undefined {
  return spec.fit === 'blur' ? `b${spec.blurStrength}d${spec.blurDarken}` : undefined
}

class ConvertManager {
  private jobs = new Map<string, ConvertJob>()
  private procs = new Map<string, ChildProcessWithoutNullStreams>()
  private specs = new Map<
    string,
    {
      fit: PlayerImportRequest['fitMode']
      width: number
      height: number
      blurStrength: number
      blurDarken: number
      reconvertId?: string
    }
  >()
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
        title: titleWithFit(basename(src, extname(src)), req.fitMode),
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
      this.specs.set(id, { fit: req.fitMode, width, height, ...currentBlur() })
      this.sink({ ...job })
      jobIds.push(id)
    }
    this.schedule()
    return { jobIds }
  }

  /** Vorhandene Bibliotheks-Medien neu auf die (neue) Wand-Auflösung konvertieren. */
  enqueueReconvert(
    items: { sourcePath: string; title: string; fit: PlayerImportRequest['fitMode']; width: number; height: number; reconvertId: string }[]
  ): { jobIds: string[] } {
    const jobIds: string[] = []
    for (const it of items) {
      const id = randomUUID()
      const job: ConvertJob = {
        id,
        sourcePath: it.sourcePath,
        title: it.title,
        status: 'queued',
        progress: 0,
        fitMode: it.fit,
        targetWidth: Math.max(2, Math.round(it.width)),
        targetHeight: Math.max(2, Math.round(it.height)),
        kind: kindOf(it.sourcePath),
        mediaId: it.reconvertId,
        encoder: null,
        createdAt: Date.now()
      }
      this.jobs.set(id, job)
      this.specs.set(id, {
        fit: it.fit,
        width: job.targetWidth,
        height: job.targetHeight,
        ...currentBlur(),
        reconvertId: it.reconvertId
      })
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
    if (spec.reconvertId) return this.runReconvert(job, spec.reconvertId)
    try {
      const kind = job.kind ?? kindOf(job.sourcePath)
      const convKey = convKeyFor(job.sourcePath, spec.fit, spec.width, spec.height, blurVariant(spec))

      // Dedup: gleiche Quelle, gleicher Fit, gleiche Auflösung, gleicher Blur-Look.
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

      const blur = { strength: spec.blurStrength, darken: spec.blurDarken }
      if (kind === 'image') {
        this.update(job, { status: 'converting' })
        await this.spawnFf(job, buildImageArgs({
          input: job.sourcePath, output, fit: spec.fit, width: spec.width, height: spec.height, blur
        }), null)
      } else if (canStreamCopy(kind, info, spec.width, spec.height)) {
        // Schon passend -> nur kopieren, kein Re-Encode.
        this.update(job, { status: 'converting', encoder: 'copy' })
        await this.spawnFf(job, buildCopyArgs({
          input: job.sourcePath, output, hasAudio: info.hasAudio
        }), info.durationSec)
      } else {
        const encoder = await resolveEncoder(getSettings().player.encoder)
        this.update(job, { status: 'converting', encoder })
        await this.spawnFf(job, buildVideoArgs({
          input: job.sourcePath, output, encoder, fit: spec.fit,
          width: spec.width, height: spec.height, hasAudio: info.hasAudio, blur
        }), info.durationSec)
      }
      if (this.isCanceled(job)) return

      // Thumbnail (best effort -> Fehler hier darf den Import nicht versenken).
      this.update(job, { status: 'thumbnail' })
      let thumbOk = false
      try {
        const seek = Math.min(1, (info.durationSec ?? 1) * 0.1)
        // Aus dem AUFBEREITETEN Ergebnis (output) miniaturisieren -> das Thumbnail
        // zeigt den tatsächlichen Fit (Blur-Rand / Letterbox / Streckung).
        await this.spawnFf(job, buildThumbArgs({
          input: output,
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
        sizeBytes,
        sourcePath: job.sourcePath
      })
      this.update(job, { status: 'done', progress: 1, mediaId: item.id })
      this.librarySink()
    } catch (err) {
      if (!this.isCanceled(job)) {
        this.update(job, { status: 'error', error: err instanceof Error ? err.message : String(err) })
      }
    }
  }

  private cleanupReconvertTmp(id: string, ext: string): void {
    for (const name of [`${id}__re${ext}`, `${id}__re_thumb.jpg`]) {
      try {
        const f = mediaFilePath(name)
        if (existsSync(f)) rmSync(f)
      } catch {
        // ignorieren
      }
    }
  }

  // Neu-Konvertierung eines vorhandenen Mediums (gleiche id). In Temp-Dateien
  // konvertieren, dann die alten ersetzen -> die laufende Wiedergabe bricht nicht ab.
  private async runReconvert(job: ConvertJob, id: string): Promise<void> {
    const spec = this.specs.get(job.id)!
    const ext = storedExtFor(job.kind ?? kindOf(job.sourcePath))
    try {
      const kind = job.kind ?? kindOf(job.sourcePath)
      const convKey = convKeyFor(job.sourcePath, spec.fit, spec.width, spec.height, blurVariant(spec))
      const collision = findByConvKey(convKey)
      if (collision && collision.id === id) {
        this.update(job, { status: 'done', progress: 1, kind, mediaId: id }) // bereits in dieser Auflösung
        return
      }
      if (collision && collision.id !== id) deleteMedia(collision.id) // Duplikat -> UNIQUE frei

      const tmpStored = mediaFilePath(`${id}__re${ext}`)
      const tmpThumb = mediaFilePath(`${id}__re_thumb.jpg`)

      this.update(job, { status: 'probing', kind })
      const info = await probeSource(job.sourcePath)
      if (this.isCanceled(job)) return this.cleanupReconvertTmp(id, ext)
      if (kind !== 'image' && !info.hasVideo) throw new Error('Keine Videospur gefunden')

      const blur = { strength: spec.blurStrength, darken: spec.blurDarken }
      if (kind === 'image') {
        this.update(job, { status: 'converting' })
        await this.spawnFf(job, buildImageArgs({
          input: job.sourcePath, output: tmpStored, fit: spec.fit, width: spec.width, height: spec.height, blur
        }), null)
      } else if (canStreamCopy(kind, info, spec.width, spec.height)) {
        this.update(job, { status: 'converting', encoder: 'copy' })
        await this.spawnFf(job, buildCopyArgs({
          input: job.sourcePath, output: tmpStored, hasAudio: info.hasAudio
        }), info.durationSec)
      } else {
        const encoder = await resolveEncoder(getSettings().player.encoder)
        this.update(job, { status: 'converting', encoder })
        await this.spawnFf(job, buildVideoArgs({
          input: job.sourcePath, output: tmpStored, encoder, fit: spec.fit,
          width: spec.width, height: spec.height, hasAudio: info.hasAudio, blur
        }), info.durationSec)
      }
      if (this.isCanceled(job)) return this.cleanupReconvertTmp(id, ext)

      this.update(job, { status: 'thumbnail' })
      let thumbOk = false
      try {
        const seek = Math.min(1, (info.durationSec ?? 1) * 0.1)
        await this.spawnFf(job, buildThumbArgs({
          input: tmpStored, output: tmpThumb, seekSec: seek, isVideo: kind !== 'image'
        }), null, true)
        thumbOk = existsSync(tmpThumb)
      } catch (thumbErr) {
        logLine('[player] Thumbnail (reconvert) fehlgeschlagen:', thumbErr instanceof Error ? thumbErr.message : String(thumbErr))
      }
      if (this.isCanceled(job)) return this.cleanupReconvertTmp(id, ext)

      // Dateien tauschen
      const finalStored = mediaFilePath(`${id}${ext}`)
      const finalThumb = mediaFilePath(`${id}_thumb.jpg`)
      try {
        if (existsSync(finalStored)) rmSync(finalStored)
      } catch {
        // ignorieren
      }
      renameSync(tmpStored, finalStored)
      if (thumbOk) {
        try {
          if (existsSync(finalThumb)) rmSync(finalThumb)
        } catch {
          // ignorieren
        }
        renameSync(tmpThumb, finalThumb)
      }

      const sizeBytes = (() => {
        try {
          return statSync(finalStored).size
        } catch {
          return 0
        }
      })()

      updateMediaConversion(id, {
        width: spec.width,
        height: spec.height,
        durationSec: kind === 'image' ? null : info.durationSec,
        fitMode: spec.fit,
        hasAudio: kind === 'image' ? false : info.hasAudio,
        convKey,
        sizeBytes,
        thumbName: existsSync(finalThumb) ? `${id}_thumb.jpg` : null,
        // Fit-Hinweis im Namen an die (evtl. geänderte) Aufbereitung anpassen.
        title: titleWithFit(basename(job.sourcePath, extname(job.sourcePath)), spec.fit)
      })
      this.update(job, { status: 'done', progress: 1, kind, mediaId: id })
      this.librarySink()
    } catch (err) {
      this.cleanupReconvertTmp(id, ext)
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

  /**
   * Eigenes Idle-Medium (Bild/Video) genau wie Bibliotheks-Medien auf die Wand-
   * Auflösung backen (Fit) und nach H.264/MP4 bzw. JPG konvertieren -> spielt auf
   * der Ausgabe sauber und formatfüllend. Legt KEINEN DB-Eintrag an, nur die Datei.
   */
  async convertIdle(sourcePath: string): Promise<{ storedName: string; kind: 'image' | 'video' }> {
    const p = getSettings().player
    const width = Math.max(2, Math.round(p.wallWidth))
    const height = Math.max(2, Math.round(p.wallHeight))
    const fit = p.defaultFit
    const blur = { strength: p.blurStrength ?? 50, darken: p.blurDarken ?? 0 }
    const kind = kindOf(sourcePath)
    const storedName = `__idle-${Date.now()}${storedExtFor(kind)}`
    const output = mediaFilePath(storedName)
    if (kind === 'image') {
      await this.spawnRaw(buildImageArgs({ input: sourcePath, output, fit, width, height, blur }))
      return { storedName, kind: 'image' }
    }
    // Video/GIF -> auf Wand-Auflösung gebackenes H.264-MP4 (GIF wird zur Loop-Datei).
    const info = await probeSource(sourcePath)
    if (!info.hasVideo) throw new Error('Keine Videospur in der Idle-Datei gefunden')
    const encoder = await resolveEncoder(p.encoder)
    await this.spawnRaw(
      buildVideoArgs({ input: sourcePath, output, encoder, fit, width, height, hasAudio: info.hasAudio, blur })
    )
    return { storedName, kind: 'video' }
  }

  // Schlanker ffmpeg-Lauf ohne Job-/Fortschritts-Anbindung (Einzelfälle wie Idle).
  private spawnRaw(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(ffmpegBinPath('ffmpeg'), args, { windowsHide: true })
      let tail = ''
      proc.stderr.on('data', (c: Buffer) => {
        tail = (tail + c.toString()).slice(-2000)
      })
      proc.on('error', reject)
      proc.on('close', (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`ffmpeg beendet mit Code ${code}. ${tail.trim().split('\n').pop() ?? ''}`))
      )
    })
  }
}

export const convertManager = new ConvertManager()
