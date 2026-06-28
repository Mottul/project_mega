import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync, readdirSync, rmSync, statSync, type Dirent } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { extname, join } from 'node:path'
import type { ChunksMode, HapEnqueueRequest, HapJob } from '@shared/types'
import { ffmpegBinPath } from './ffmpegPath'
import { buildHapArgs, computeChunks, hapOutputPath } from './hapEncoder'
import { probe } from './probe'

const VIDEO_EXT = new Set([
  '.mov',
  '.mp4',
  '.mxf',
  '.avi',
  '.mkv',
  '.m4v',
  '.mpg',
  '.mpeg',
  '.wmv',
  '.mts',
  '.m2ts',
  '.ts',
  '.webm'
])

type Sink = (job: HapJob) => void

function readEntries(dir: string): Dirent<string>[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

function walk(dir: string, out: Set<string>): void {
  for (const e of readEntries(dir)) {
    const fp = join(dir, e.name)
    if (e.isDirectory()) walk(fp, out)
    else if (VIDEO_EXT.has(extname(e.name).toLowerCase())) out.add(fp)
  }
}

function collectVideos(inputs: string[]): string[] {
  const out = new Set<string>()
  for (const p of inputs) {
    try {
      if (statSync(p).isDirectory()) walk(p, out)
      else if (VIDEO_EXT.has(extname(p).toLowerCase())) out.add(p)
    } catch {
      // unzugaengliche Pfade ignorieren
    }
  }
  return [...out]
}

class JobManager {
  private jobs = new Map<string, HapJob>()
  private procs = new Map<string, ChildProcessWithoutNullStreams>()
  private chunkModes = new Map<string, ChunksMode>()
  private sink: Sink = () => {}
  private concurrency = 1
  private active = 0

  setSink(sink: Sink): void {
    this.sink = sink
  }

  list(): HapJob[] {
    return [...this.jobs.values()]
  }

  // Separate Methode: der Status kann durch cancel() jederzeit mutieren -- ueber
  // einen Funktionsaufruf umgehen wir das (falsche) Narrowing von TypeScript.
  private isCanceled(job: HapJob): boolean {
    return job.status === 'canceled'
  }

  private update(job: HapJob, patch: Partial<HapJob>): void {
    Object.assign(job, patch)
    this.sink({ ...job })
  }

  enqueue(req: HapEnqueueRequest): { jobIds: string[] } {
    this.concurrency = Math.max(1, Math.min(req.concurrency || 1, 8))
    const files = collectVideos(req.inputs)
    const jobIds: string[] = []
    for (const input of files) {
      const id = randomUUID()
      const job: HapJob = {
        id,
        inputPath: input,
        outputPath: hapOutputPath(input, req.outputDir, req.format),
        format: req.format,
        compressor: req.compressor ?? 'snappy',
        status: 'queued',
        progress: 0,
        width: null,
        height: null,
        chunks: null,
        durationSec: null,
        createdAt: Date.now()
      }
      this.jobs.set(id, job)
      this.chunkModes.set(id, req.chunks)
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

  private async run(job: HapJob): Promise<void> {
    if (this.isCanceled(job)) return
    try {
      this.update(job, { status: 'probing' })
      const info = await probe(job.inputPath)
      if (this.isCanceled(job)) return
      // Manuelle Chunks respektieren; sonst automatisch aus der Aufloesung ableiten.
      const mode = this.chunkModes.get(job.id)
      const chunks =
        mode?.kind === 'manual'
          ? Math.max(1, Math.min(64, mode.value))
          : computeChunks(info.width, info.height)
      this.update(job, {
        status: 'running',
        width: info.width,
        height: info.height,
        durationSec: info.durationSec,
        chunks
      })
      await this.spawnEncode(job, info.durationSec)
    } catch (err) {
      if (job.status !== 'canceled') {
        this.update(job, {
          status: 'error',
          error: err instanceof Error ? err.message : String(err)
        })
      }
    }
  }

  private spawnEncode(job: HapJob, durationSec: number | null): Promise<void> {
    return new Promise((resolve) => {
      const args = buildHapArgs(
        job.inputPath,
        job.outputPath,
        job.format,
        job.chunks ?? 1,
        job.compressor
      )
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
          } else if (key === 'progress' && value?.trim() === 'end') {
            this.update(job, { progress: 1 })
          }
        }
      })

      proc.stderr.on('data', (chunk: Buffer) => {
        stderrTail = (stderrTail + chunk.toString()).slice(-2000)
      })

      proc.on('error', (err) => {
        this.procs.delete(job.id)
        this.update(job, { status: 'error', error: err.message })
        resolve()
      })

      proc.on('close', (code) => {
        this.procs.delete(job.id)
        if (this.isCanceled(job)) {
          this.cleanupPartial(job.outputPath)
          resolve()
          return
        }
        if (code === 0) {
          this.update(job, { status: 'done', progress: 1 })
        } else {
          this.cleanupPartial(job.outputPath)
          this.update(job, {
            status: 'error',
            error: `ffmpeg beendet mit Code ${code}. ${stderrTail.trim().split('\n').pop() ?? ''}`
          })
        }
        resolve()
      })
    })
  }

  private cleanupPartial(path: string): void {
    try {
      if (existsSync(path)) rmSync(path)
    } catch {
      // ignorieren
    }
  }

  cancel(id: string): void {
    const job = this.jobs.get(id)
    if (!job) return
    if (job.status === 'queued' || job.status === 'probing') {
      this.update(job, { status: 'canceled' })
      return
    }
    if (job.status === 'running') {
      this.update(job, { status: 'canceled' })
      this.procs.get(id)?.kill('SIGKILL')
    }
  }

  cancelAll(): void {
    for (const id of this.jobs.keys()) this.cancel(id)
  }

  clearFinished(): void {
    for (const [id, job] of this.jobs) {
      if (job.status === 'done' || job.status === 'error' || job.status === 'canceled') {
        this.jobs.delete(id)
        this.chunkModes.delete(id)
      }
    }
  }
}

export const jobManager = new JobManager()
