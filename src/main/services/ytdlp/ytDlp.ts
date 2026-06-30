// yt-dlp-Wrapper: findet die Binary (userData/bin oder System-PATH), kann sie
// von GitHub nachladen/aktualisieren und führt Download-Jobs mit Fortschritt
// aus. Muxing übernimmt das gebündelte ffmpeg (--ffmpeg-location). Bewusst
// dependency-frei (Electron `net` für den Binary-Download).

import { app, net } from 'electron'
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { YtEnqueueRequest, YtJob, YtToolStatus } from '@shared/types'
import { ffmpegBinPath } from '../ffmpeg/ffmpegPath'

type Sink = (job: YtJob) => void

function binDir(): string {
  const dir = join(app.getPath('userData'), 'bin')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function managedBinary(): string {
  return join(binDir(), process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp')
}

/** GitHub-Release-Asset je Plattform (immer der "latest"-Kanal). Bewusst die
 *  EIGENSTÄNDIGEN Binaries (linux/macos), nicht das Python-zipapp 'yt-dlp'. */
function assetUrl(): string {
  const base = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/'
  if (process.platform === 'win32') return base + 'yt-dlp.exe'
  if (process.platform === 'darwin') return base + 'yt-dlp_macos'
  return base + 'yt-dlp_linux'
}

function versionOf(bin: string): string | null {
  try {
    // Bare-Name auf dem System-PATH unter Windows nur via Shell auflösbar.
    const shell = process.platform === 'win32' && !/[\\/]/.test(bin)
    const res = spawnSync(bin, ['--version'], { windowsHide: true, timeout: 8000, shell })
    if (res.status === 0) return res.stdout.toString().trim() || null
  } catch {
    // nicht vorhanden / nicht ausführbar
  }
  return null
}

/** Bevorzugt die selbst verwaltete Binary, sonst PATH. */
function locateBinary(): { bin: string; location: 'managed' | 'path' } | null {
  const managed = managedBinary()
  if (existsSync(managed) && versionOf(managed)) return { bin: managed, location: 'managed' }
  if (versionOf('yt-dlp')) return { bin: 'yt-dlp', location: 'path' }
  return null
}

function ffmpegAvailable(): boolean {
  const ff = ffmpegBinPath('ffmpeg')
  return ff.includes('/') || ff.includes('\\') ? existsSync(ff) : true
}

export function getStatus(): YtToolStatus {
  const found = locateBinary()
  return {
    available: found != null,
    version: found ? versionOf(found.bin) : null,
    location: found?.location ?? null,
    ffmpeg: ffmpegAvailable()
  }
}

function downloadTo(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = net.request(url) // folgt Redirects (GitHub -> CDN) standardmäßig
    req.setHeader('User-Agent', 'av-toolbox') // manche GitHub-CDN-Edges verlangen UA
    req.on('response', (res) => {
      const status = res.statusCode ?? 0
      if (status !== 200) {
        reject(new Error(`Download fehlgeschlagen (HTTP ${status})`))
        return
      }
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => {
        try {
          writeFileSync(dest, Buffer.concat(chunks))
          if (process.platform !== 'win32') chmodSync(dest, 0o755)
          resolve()
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)))
        }
      })
      res.on('error', reject)
    })
    req.on('error', reject)
    req.end()
  })
}

export async function updateTool(): Promise<YtToolStatus> {
  await downloadTo(assetUrl(), managedBinary())
  return getStatus()
}

class YtManager {
  private jobs = new Map<string, YtJob>()
  private procs = new Map<string, ChildProcessWithoutNullStreams>()
  private sink: Sink = () => {}
  private active = 0
  private concurrency = 2

  setSink(sink: Sink): void {
    this.sink = sink
  }

  list(): YtJob[] {
    return [...this.jobs.values()]
  }

  private update(job: YtJob, patch: Partial<YtJob>): void {
    Object.assign(job, patch)
    this.sink({ ...job })
  }

  private isCanceled(job: YtJob): boolean {
    return job.status === 'canceled'
  }

  enqueue(req: YtEnqueueRequest): { jobId: string } {
    const id = randomUUID()
    const job: YtJob = {
      id,
      url: req.url,
      format: req.format,
      status: 'queued',
      progress: 0,
      title: null,
      speed: null,
      eta: null,
      outputDir: req.outputDir,
      outputFile: null,
      createdAt: Date.now()
    }
    this.jobs.set(id, job)
    this.params.set(id, req)
    this.sink({ ...job })
    this.schedule()
    return { jobId: id }
  }

  private params = new Map<string, YtEnqueueRequest>()

  private schedule(): void {
    if (this.active >= this.concurrency) return
    for (const job of this.jobs.values()) {
      if (this.active >= this.concurrency) break
      if (job.status === 'queued') {
        this.active++
        this.run(job).finally(() => {
          this.active--
          this.schedule()
        })
      }
    }
  }

  private buildArgs(req: YtEnqueueRequest): string[] {
    const args = ['--newline', '--no-playlist', '--ffmpeg-location', ffmpegBinPath('ffmpeg')]
    if (req.format === 'video') {
      const cap = req.maxHeight
      args.push('-f', cap ? `bv*[height<=${cap}]+ba/b[height<=${cap}]/b` : 'bv*+ba/b')
      args.push('--merge-output-format', 'mp4')
    } else {
      args.push('-x', '--audio-format', req.format === 'audio-mp3' ? 'mp3' : 'm4a')
    }
    args.push('-o', join(req.outputDir, '%(title)s.%(ext)s'))
    args.push(req.url)
    return args
  }

  private run(job: YtJob): Promise<void> {
    return new Promise((resolve) => {
      if (this.isCanceled(job)) {
        resolve()
        return
      }
      const found = locateBinary()
      const req = this.params.get(job.id)!
      if (!found) {
        this.update(job, {
          status: 'error',
          error: 'yt-dlp nicht gefunden – zuerst herunterladen.'
        })
        resolve()
        return
      }
      this.update(job, { status: 'running' })
      const proc = spawn(found.bin, this.buildArgs(req), { windowsHide: true })
      this.procs.set(job.id, proc)
      let outBuf = ''
      let errTail = ''

      const handleLine = (line: string): void => {
        const pct = /\[download\]\s+([\d.]+)%/.exec(line)
        if (pct) {
          const p = Math.min(0.999, Math.max(0, parseFloat(pct[1]) / 100))
          const speed = /at\s+([\d.]+\s?\w+\/s)/.exec(line)?.[1] ?? null
          const eta = /ETA\s+([\d:]+)/.exec(line)?.[1] ?? null
          if (p - job.progress >= 0.005 || speed !== job.speed) {
            this.update(job, { progress: p, speed, eta })
          }
        }
        const dest =
          /\[download\] Destination:\s+(.+)/.exec(line) ??
          /Merging formats into "(.+)"/.exec(line) ??
          /\[ExtractAudio\] Destination:\s+(.+)/.exec(line)
        if (dest) {
          const file = dest[1].trim().replace(/"$/, '')
          const name = file.split(/[/\\]/).pop() ?? file
          this.update(job, { outputFile: file, title: name.replace(/\.[^.]+$/, '') })
        }
      }

      proc.stdout.on('data', (chunk: Buffer) => {
        outBuf += chunk.toString()
        const lines = outBuf.split('\n')
        outBuf = lines.pop() ?? ''
        for (const l of lines) handleLine(l)
      })
      proc.stderr.on('data', (chunk: Buffer) => {
        errTail = (errTail + chunk.toString()).slice(-2000)
      })
      proc.on('error', (err) => {
        this.procs.delete(job.id)
        this.update(job, { status: 'error', error: err.message })
        resolve()
      })
      proc.on('close', (code) => {
        this.procs.delete(job.id)
        if (this.isCanceled(job)) {
          resolve()
          return
        }
        if (code === 0) this.update(job, { status: 'done', progress: 1, speed: null, eta: null })
        else
          this.update(job, {
            status: 'error',
            error: errTail.trim().split('\n').pop() || `yt-dlp beendet mit Code ${code}`
          })
        resolve()
      })
    })
  }

  cancel(id: string): void {
    const job = this.jobs.get(id)
    if (!job) return
    if (job.status === 'queued') {
      this.update(job, { status: 'canceled' })
    } else if (job.status === 'running') {
      this.update(job, { status: 'canceled' })
      this.procs.get(id)?.kill('SIGKILL')
    }
  }

  clearFinished(): void {
    for (const [id, job] of this.jobs) {
      if (job.status === 'done' || job.status === 'error' || job.status === 'canceled') {
        this.jobs.delete(id)
        this.params.delete(id)
      }
    }
  }
}

export const ytManager = new YtManager()
