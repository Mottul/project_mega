// Aufträge des Video-Konverters (früher HAP-Konverter): Eingaben auflösen, je Datei
// analysieren (Medien-Info, mit Cache), planen (shared/convertPlan), einen freien
// Ausgabenamen vergeben (nie überschreiben) und über die gemeinsame Warteschlange
// mit ffmpeg ausführen. Der Player-Import nutzt denselben Kern auf eigener Spur.
// H.264/H.265/ProRes laufen je nach Einstellung auf der GPU bzw. dem schnellsten
// geprüften Encoder; scheitert der, wird der Auftrag einmal auf der CPU wiederholt.

import { randomUUID } from 'node:crypto'
import { existsSync, rmSync } from 'node:fs'
import { cpus } from 'node:os'
import { basename, dirname, extname, join } from 'node:path'
import { CONVERT_FORMATS, planConversion, type ConvertPlan } from '@shared/convertPlan'
import type {
  ConverterEnqueueRequest,
  ConverterJob,
  ConverterSettings,
  ConvertOptions,
  EncoderInfo
} from '@shared/types'
import { collectConvertInputs, probeMediaInfo } from '../ffmpeg/mediaInfo'
import { logLine } from '../log'
import { getSettings } from '../store'
import { buildConvertArgs } from './args'
import { getConvertCapabilities } from './capabilities'
import {
  CPU_ENCODERS,
  PRORES_FAST,
  encodeWithFallback,
  resolveConverterEncoder,
  type EncoderFamily
} from './encoders'
import { convertQueue } from './queue'
import { FfmpegCanceledError, runFfmpeg } from './runFfmpeg'

type Sink = (job: ConverterJob) => void

interface JobSpec {
  options: ConvertOptions
  outputDir: string | null
  /** beim Einreihen festgehalten: Umstellen gilt erst für neue Aufträge */
  encoderMode: ConverterSettings['encoder']
}

/** Encoder-Familie eines Plans (nur diese haben eine GPU- bzw. Schnell-Variante). */
function encoderFamily(plan: ConvertPlan): EncoderFamily | null {
  const f = plan.formatInfo.family
  return f === 'h264' || f === 'hevc' || f === 'prores' ? f : null
}

/**
 * HAP-Chunks automatisch aus der Fläche (720p -> 1, darüber mehr, höchstens Kernzahl):
 * HAP dekodiert mehrere Chunks parallel; mehr als Kerne bringt nichts.
 */
export function computeChunks(width: number | null, height: number | null): number {
  const cores = Math.max(1, cpus().length)
  if (!width || !height) return 1
  return Math.min(Math.max(Math.round((width * height) / (1280 * 720)), 1), cores)
}

/** Freier Ausgabepfad: clip_<suffix>.ext, sonst clip_<suffix>_2.ext … – nie überschreiben. */
export function uniqueOutputPath(
  input: string,
  outputDir: string | null,
  suffix: string,
  ext: string,
  taken: (path: string) => boolean
): string {
  const dir = outputDir ?? dirname(input)
  const base = `${basename(input, extname(input))}_${suffix}`
  for (let n = 1; ; n++) {
    const path = join(dir, `${base}${n === 1 ? '' : `_${n}`}${ext}`)
    if (path !== input && !taken(path)) return path
  }
}

const isFinished = (j: ConverterJob): boolean =>
  j.status === 'done' || j.status === 'error' || j.status === 'canceled'

class ConverterJobs {
  private jobs = new Map<string, ConverterJob>()
  private specs = new Map<string, JobSpec>()
  private aborts = new Map<string, AbortController>()
  // vergebene, aber noch nicht geschriebene Ausgaben (Groß/klein egal: macOS/Windows)
  private reserved = new Set<string>()
  private sink: Sink = () => {}

  setSink(sink: Sink): void {
    this.sink = sink
  }

  list(): ConverterJob[] {
    return [...this.jobs.values()]
  }

  // Methode statt Feldzugriff: der Status kann sich durch cancel() jederzeit ändern
  // (sonst „weiß" TypeScript nach einem await fälschlich noch den alten Wert)
  private isCanceled(job: ConverterJob): boolean {
    return job.status === 'canceled'
  }

  private update(job: ConverterJob, patch: Partial<ConverterJob>): void {
    Object.assign(job, patch)
    this.sink({ ...job, steps: [...job.steps] })
  }

  async enqueue(req: ConverterEnqueueRequest): Promise<{ jobIds: string[] }> {
    convertQueue.setLimit('converter', req.concurrency)
    const files = await collectConvertInputs(req.inputs, req.options.format === 'wav')
    const encoderMode = getSettings().converter.encoder === 'cpu' ? 'cpu' : 'auto'
    const jobIds: string[] = []
    for (const input of files) {
      const id = randomUUID()
      const job: ConverterJob = {
        id,
        inputPath: input,
        outputPath: null,
        format: req.options.format,
        formatLabel: CONVERT_FORMATS[req.options.format].label,
        status: 'queued',
        progress: 0,
        width: null,
        height: null,
        fps: null,
        chunks: null,
        encoder: null,
        steps: [],
        durationSec: null,
        createdAt: Date.now()
      }
      this.jobs.set(id, job)
      this.specs.set(id, { options: req.options, outputDir: req.outputDir, encoderMode })
      this.sink({ ...job })
      convertQueue.add(id, 'converter', () => this.run(job))
      jobIds.push(id)
    }
    return { jobIds }
  }

  private async run(job: ConverterJob): Promise<void> {
    if (this.isCanceled(job)) return
    const spec = this.specs.get(job.id)
    if (!spec) return
    const abort = new AbortController()
    this.aborts.set(job.id, abort)
    let output: string | null = null
    try {
      this.update(job, { status: 'probing' })
      const res = await probeMediaInfo(job.inputPath, { deep: true })
      if (this.isCanceled(job)) return
      if (!res.ok) throw new Error(res.detail ? `${res.error} (${res.detail})` : res.error)
      const caps = await getConvertCapabilities()
      if (this.isCanceled(job)) return
      const planned = planConversion(res.info, spec.options, caps)
      if (!planned.ok) throw new Error(planned.error)
      const plan = planned.plan
      if (!caps.formats[plan.format]) {
        throw new Error(`${plan.formatInfo.label} kann das gebündelte ffmpeg nicht schreiben`)
      }
      output = uniqueOutputPath(
        job.inputPath,
        spec.outputDir,
        plan.formatInfo.suffix,
        plan.formatInfo.ext,
        (p) => this.reserved.has(p.toLowerCase()) || existsSync(p)
      )
      this.reserved.add(output.toLowerCase())
      const v = plan.video
      const chunks =
        plan.formatInfo.family !== 'hap'
          ? null
          : spec.options.hapChunks.kind === 'manual'
            ? Math.max(1, Math.min(64, spec.options.hapChunks.value))
            : computeChunks(v?.width ?? null, v?.height ?? null)
      this.update(job, {
        status: 'running',
        outputPath: output,
        format: plan.format,
        formatLabel: plan.formatInfo.label,
        width: v?.width ?? null,
        height: v?.height ?? null,
        fps: v?.fps ?? null,
        chunks,
        steps: plan.steps,
        durationSec: plan.durationSec
      })
      const family = encoderFamily(plan)
      const mode = spec.encoderMode
      const primary = family
        ? await resolveConverterEncoder(family, mode, {
            alpha: Boolean(v?.pixFmt?.startsWith('yuva')),
            compat: spec.options.compat
          })
        : null
      if (this.isCanceled(job)) return
      const target = output
      const run = async (enc: EncoderInfo | null): Promise<void> => {
        this.update(job, { progress: 0, encoder: enc?.label ?? null })
        const args = buildConvertArgs(plan, spec.options, {
          input: job.inputPath,
          output: target,
          hapChunks: chunks ?? undefined,
          encoder: enc?.id
        })
        await runFfmpeg(args, {
          durationSec: plan.durationSec,
          signal: abort.signal,
          onProgress: (p) => this.update(job, { progress: p })
        })
      }
      if (family && primary) {
        // schnelles ProRes bleibt auch im Rückfall schnell (prores_aw statt prores_ks)
        const cpu = family === 'prores' && mode === 'auto' ? PRORES_FAST : CPU_ENCODERS[family]
        await encodeWithFallback(primary, cpu, run, () =>
          this.update(job, {
            steps: [...plan.steps, `${primary.label} fehlgeschlagen – mit ${cpu.id} wiederholt`]
          })
        )
      } else {
        await run(null)
      }
      this.update(job, { status: 'done', progress: 1 })
    } catch (err) {
      // halbfertige Ausgabe nie liegen lassen (sähe wie ein fertiger Clip aus)
      if (output) removeQuietly(output)
      if (err instanceof FfmpegCanceledError || this.isCanceled(job)) {
        if (!this.isCanceled(job)) this.update(job, { status: 'canceled' })
        return
      }
      const message = err instanceof Error ? err.message : String(err)
      logLine('[konverter] Fehler', job.inputPath, '->', message)
      this.update(job, { status: 'error', error: message })
    } finally {
      this.aborts.delete(job.id)
      if (output) this.reserved.delete(output.toLowerCase())
    }
  }

  cancel(id: string): void {
    const job = this.jobs.get(id)
    if (!job || isFinished(job)) return
    convertQueue.remove(id)
    this.update(job, { status: 'canceled' })
    this.aborts.get(id)?.abort()
  }

  cancelAll(): void {
    for (const id of this.jobs.keys()) this.cancel(id)
  }

  clearFinished(): void {
    for (const [id, job] of this.jobs) {
      if (isFinished(job)) {
        this.jobs.delete(id)
        this.specs.delete(id)
      }
    }
  }
}

function removeQuietly(path: string): void {
  try {
    if (existsSync(path)) rmSync(path)
  } catch {
    // nicht kritisch
  }
}

export const converterJobs = new ConverterJobs()
