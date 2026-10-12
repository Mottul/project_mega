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
import { withLoudnessResult } from '@shared/loudness'
import type {
  ConverterEnqueueRequest,
  ConverterJob,
  ConverterSettings,
  ConvertOptions,
  EncoderInfo
} from '@shared/types'
import { collectConvertInputs, probeMediaInfo } from '../ffmpeg/mediaInfo'
import { getSettings } from '../store'
import { buildConvertArgs } from './args'
import { getConvertCapabilities } from './capabilities'
import { measureLoudness } from './loudness'
import {
  CPU_ENCODERS,
  PRORES_FAST,
  encodeWithFallback,
  resolveConverterEncoder,
  type EncoderFamily
} from './encoders'
import { JobList } from '../jobs/jobList'
import { jobQueue } from '../jobs/queue'
import { runFfmpeg } from './runFfmpeg'

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

class ConverterJobs extends JobList<ConverterJob, JobSpec> {
  // vergebene, aber noch nicht geschriebene Ausgaben (Groß/klein egal: macOS/Windows)
  private reserved = new Set<string>()

  constructor() {
    super('converter', '[konverter]')
  }

  protected label(job: ConverterJob): string {
    return job.inputPath
  }

  protected snapshot(job: ConverterJob): ConverterJob {
    return { ...job, steps: [...job.steps] }
  }

  async enqueue(req: ConverterEnqueueRequest): Promise<{ jobIds: string[] }> {
    jobQueue.setLimit('converter', req.concurrency)
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
      this.add(job, { options: req.options, outputDir: req.outputDir, encoderMode })
      jobIds.push(id)
    }
    return { jobIds }
  }

  protected async run(job: ConverterJob, spec: JobSpec, signal: AbortSignal): Promise<void> {
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
      // Lautheit vorab messen (gehört zur Analyse): der eigentliche Lauf braucht die Werte
      const loudness = await measureLoudness(plan, job.inputPath, {
        signal,
        onProgress: (p) => this.update(job, { progress: p })
      })
      if (this.isCanceled(job)) return
      const steps =
        loudness && plan.audio?.loudness
          ? withLoudnessResult(plan.steps, plan.audio.loudness, loudness)
          : plan.steps
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
        progress: 0,
        outputPath: output,
        format: plan.format,
        formatLabel: plan.formatInfo.label,
        width: v?.width ?? null,
        height: v?.height ?? null,
        fps: v?.fps ?? null,
        chunks,
        steps,
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
          encoder: enc?.id,
          loudness
        })
        await runFfmpeg(args, {
          durationSec: plan.durationSec,
          signal,
          onProgress: (p) => this.update(job, { progress: p })
        })
      }
      if (family && primary) {
        // schnelles ProRes bleibt auch im Rückfall schnell (prores_aw statt prores_ks)
        const cpu = family === 'prores' && mode === 'auto' ? PRORES_FAST : CPU_ENCODERS[family]
        await encodeWithFallback(primary, cpu, run, () =>
          this.update(job, {
            steps: [...steps, `${primary.label} fehlgeschlagen – mit ${cpu.id} wiederholt`]
          })
        )
      } else {
        await run(null)
      }
      this.update(job, { status: 'done', progress: 1 })
    } catch (err) {
      // halbfertige Ausgabe nie liegen lassen (sähe wie ein fertiger Clip aus)
      if (output) removeQuietly(output)
      this.fail(job, err)
    } finally {
      if (output) this.reserved.delete(output.toLowerCase())
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
