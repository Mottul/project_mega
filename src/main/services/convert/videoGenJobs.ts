// Aufträge des Video-Generators: ein Projekt -> EINE Datei. Ablauf (Plan und Messwerte:
// docs/PLAN-VIDEO-GENERATOR.md, Befehle aus shared/videoGenPlan):
//   1. Analyse je Datei (probeMediaInfo mit Tiefenanalyse – EXIF-Drehung von Fotos)
//   2. Element-Stücke (begrenzt parallel, aus dem Zwischenspeicher, wenn unverändert)
//   3. Übergangs-Stücke aus den Nachbarn
//   4. Ton: eigener Lauf über die WAVs (+ Musik), Lautheit zweistufig am fertigen Mix
//   5. Endlauf: Bildliste über den concat-Demuxer + Mix, einmal ins Zielformat (GPU mit Rückfall)
// Ein Auftrag belegt einen Platz in der Spur „converter“ (teilt sich GPU-Sitzungen mit dem
// Konverter); halbfertige Ausgaben werden nie liegen gelassen.

import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { CONVERT_FORMATS, rateArg } from '@shared/convertPlan'
import {
  loudnessOutcome,
  loudnessResultStep,
  loudnormApplyFilter,
  loudnormMeasureFilter,
  parseLoudnormOutput
} from '@shared/loudness'
import type {
  EncoderInfo,
  VgenEnqueueRequest,
  VgenJob,
  VgenJobStage,
  VgenProject
} from '@shared/types'
import {
  audioRun,
  concatList,
  estimateCacheBytes,
  finalAudioArgs,
  finalVideoFilter,
  planVideoGen,
  transitionPairs,
  VGEN_SAMPLE_RATE,
  type VgenPlan
} from '@shared/videoGenPlan'
import { logLine } from '../log'
import { getSettings } from '../store'
import { containerArgs, videoEncoderArgs } from './args'
import { computeChunks } from './converterJobs'
import {
  CPU_ENCODERS,
  encodeWithFallback,
  encoderPixFmt,
  PRORES_FAST,
  resolveConverterEncoder,
  type EncoderFamily
} from './encoders'
import { convertQueue } from './queue'
import { FfmpegCanceledError, runFfmpeg } from './runFfmpeg'
import { ensureDirs, freeBytes, jobDir, piecesDir, prune, removeQuietly } from './videoGenCache'
import { analyzeProject, pieceTasks, renderPieces, vgenCapabilities } from './videoGenRender'

type Sink = (job: VgenJob) => void

const STAGE_TEXT: Record<VgenJobStage, string> = {
  analyze: 'Analyse',
  elements: 'Elemente',
  transitions: 'Übergänge',
  audio: 'Ton',
  encode: 'Kodieren'
}

const isFinished = (j: VgenJob): boolean =>
  j.status === 'done' || j.status === 'error' || j.status === 'canceled'

function encoderFamily(format: VgenProject['output']['format']): EncoderFamily | null {
  const f = CONVERT_FORMATS[format].family
  return f === 'h264' || f === 'hevc' || f === 'prores' ? f : null
}

class VideoGenJobs {
  private jobs = new Map<string, VgenJob>()
  private specs = new Map<string, VgenEnqueueRequest>()
  private aborts = new Map<string, AbortController>()
  private sink: Sink = () => {}

  setSink(sink: Sink): void {
    this.sink = sink
  }

  list(): VgenJob[] {
    return [...this.jobs.values()]
  }

  private isCanceled(job: VgenJob): boolean {
    return job.status === 'canceled'
  }

  private update(job: VgenJob, patch: Partial<VgenJob>): void {
    Object.assign(job, patch)
    this.sink({ ...job, hints: [...job.hints] })
  }

  /** Projekt und Zieldatei sind schon geprüft (videoGen.handlers.ts). */
  enqueue(req: VgenEnqueueRequest): { jobId: string } {
    const id = randomUUID()
    const out = req.project.output
    const job: VgenJob = {
      id,
      status: 'queued',
      stage: null,
      stageText: 'Wartet',
      progress: 0,
      outputPath: req.outputPath,
      title: basename(req.outputPath, extname(req.outputPath)),
      durationSec: null,
      width: out.width,
      height: out.height,
      fps: out.fps,
      formatLabel: CONVERT_FORMATS[out.format].label,
      encoder: null,
      cachedPieces: 0,
      renderedPieces: 0,
      hints: [],
      createdAt: Date.now()
    }
    this.jobs.set(id, job)
    this.specs.set(id, req)
    this.sink({ ...job })
    convertQueue.add(id, 'converter', () => this.run(job))
    return { jobId: id }
  }

  private async run(job: VgenJob): Promise<void> {
    if (this.isCanceled(job)) return
    const spec = this.specs.get(job.id)
    if (!spec) return
    const project = spec.project
    const abort = new AbortController()
    this.aborts.set(job.id, abort)
    const work = jobDir(job.id)
    let outputStarted = false
    // Fortschritt: Arbeit in Bildern (Stücke + Endlauf); der Ton zählt wenig, er ist schnell
    let total = 1
    let doneUnits = 0
    const report = (stage: VgenJobStage, text: string): void => {
      this.update(job, { stage, stageText: text, progress: Math.min(0.999, doneUnits / total) })
    }
    try {
      // 1. Analyse (Elemente und Musik)
      this.update(job, { status: 'probing', stage: 'analyze', stageText: STAGE_TEXT.analyze })
      const infos = await analyzeProject(project, (done, count) =>
        this.update(job, { stageText: `${STAGE_TEXT.analyze} ${done}/${count}`, progress: 0 })
      )
      if (this.isCanceled(job)) return
      const caps = await vgenCapabilities(project.output.format)
      const plan = planVideoGen(project, (p) => infos.get(p), caps)
      this.update(job, { hints: plan.hints, durationSec: plan.durationSec })
      const error = plan.hints.find((h) => h.level === 'error')
      if (error) throw new Error(error.text)

      // Aufgaben und Cache-Treffer bestimmen
      const tasks = await pieceTasks(plan)
      total = tasks.todoFrames + plan.totalFrames * 1.1
      await this.checkSpace(plan, tasks.todoFrames)
      await ensureDirs(piecesDir(), work)
      this.update(job, { status: 'running' })

      // 2./3. Element-Stücke und Übergänge
      const { transitionFiles } = await renderPieces(plan, tasks, {
        signal: abort.signal,
        tag: job.id.slice(0, 8),
        isCanceled: () => this.isCanceled(job),
        onPiece: (cached) => {
          if (cached) job.cachedPieces++
          else job.renderedPieces++
        },
        onProgress: (p) => {
          doneUnits = p.framesDone
          report(p.stage, `${STAGE_TEXT[p.stage]} ${p.finished}/${p.count}`)
        }
      })
      if (this.isCanceled(job)) return
      doneUnits = tasks.todoFrames

      // 4. Ton
      report('audio', STAGE_TEXT.audio)
      const graphFile = join(work, 'ton.txt')
      const mix = join(work, 'mix.wav')
      const audio = audioRun(plan, {
        wavs: tasks.elements.map((t) => t.paths.audio),
        graphFile,
        out: mix
      })
      await writeFile(graphFile, audio.graph)
      await runFfmpeg(audio.args, { durationSec: plan.durationSec, signal: abort.signal })
      const finalMix = await this.loudness(plan, project, mix, work, abort.signal, (text) =>
        report('audio', text)
      )
      doneUnits += plan.totalFrames * 0.1
      if (this.isCanceled(job)) return

      // 5. Endlauf
      const list = join(work, 'liste.ffconcat')
      await writeFile(
        list,
        concatList(plan, {
          elements: tasks.elements.map((t) => t.paths.video),
          transitions: transitionFiles
        })
      )
      report('encode', STAGE_TEXT.encode)
      const format = project.output.format
      const family = encoderFamily(format)
      const mode = getSettings().converter.encoder === 'cpu' ? 'cpu' : 'auto'
      const primary = family
        ? await resolveConverterEncoder(family, mode, { alpha: false, compat: false })
        : null
      const encodeBase = doneUnits
      const run = async (enc: EncoderInfo | null): Promise<void> => {
        this.update(job, { encoder: enc?.label ?? null })
        outputStarted = true
        await runFfmpeg(this.finalArgs(plan, project, list, finalMix, enc, job.outputPath), {
          durationSec: plan.durationSec,
          signal: abort.signal,
          onProgress: (p) => {
            doneUnits = encodeBase + p * plan.totalFrames
            report('encode', STAGE_TEXT.encode)
          }
        })
      }
      if (family && primary) {
        const cpu = family === 'prores' && mode === 'auto' ? PRORES_FAST : CPU_ENCODERS[family]
        await encodeWithFallback(primary, cpu, run, () =>
          this.update(job, {
            hints: [
              ...job.hints,
              {
                id: 'gpu-fallback',
                level: 'info',
                text: `${primary.label} fehlgeschlagen – mit ${cpu.id} wiederholt`
              }
            ]
          })
        )
      } else {
        await run(null)
      }
      this.update(job, {
        status: 'done',
        stage: null,
        stageText: 'Fertig',
        progress: 1,
        finishedAt: Date.now()
      })
      // gerade gebrauchte Stücke bleiben beim Aufräumen
      const keep = new Set<string>([
        ...tasks.elements.flatMap((t) => [t.paths.video, t.paths.audio]),
        ...tasks.transitions.map((t) => t.file)
      ])
      void prune(undefined, keep).catch(() => {})
    } catch (err) {
      // halbfertige Ausgabe nie liegen lassen (sähe wie ein fertiges Video aus)
      if (outputStarted) await removeQuietly(job.outputPath)
      if (err instanceof FfmpegCanceledError || this.isCanceled(job)) {
        if (!this.isCanceled(job))
          this.update(job, { status: 'canceled', stageText: 'Abgebrochen' })
        return
      }
      const message = err instanceof Error ? err.message : String(err)
      logLine('[vgen] Fehler', job.outputPath, '->', message)
      this.update(job, {
        status: 'error',
        stageText: 'Fehler',
        error: message,
        finishedAt: Date.now()
      })
    } finally {
      this.aborts.delete(job.id)
      await removeQuietly(work)
    }
  }

  /** Platz für die neu zu rechnenden Stücke (+ Reserve für Endergebnis und Mix). */
  private async checkSpace(plan: VgenPlan, todoFrames: number): Promise<void> {
    const free = await freeBytes()
    if (free === null) return
    const allFrames =
      plan.elements.reduce((s, e) => s + e.frames, 0) +
      transitionPairs(plan).reduce(
        (s, p) => s + (plan.elements[p.index].transition?.frames ?? 0),
        0
      )
    const need = allFrames > 0 ? (estimateCacheBytes(plan) * todoFrames) / allFrames : 0
    const reserve = 512 * 1024 ** 2
    if (free < need + reserve) {
      const gb = (n: number): string => (n / 1024 ** 3).toFixed(1).replace('.', ',')
      throw new Error(
        `Zu wenig Platz für die Zwischendateien: etwa ${gb(need + reserve)} GB nötig, ${gb(free)} GB frei`
      )
    }
  }

  /**
   * Lautheit zweistufig am fertigen Mix: messen, dann linear angleichen und exakt auf die
   * Gesamtlänge bringen (loudnorm arbeitet intern mit höherer Rate). Ohne Ziel: der Mix.
   */
  private async loudness(
    plan: VgenPlan,
    project: VgenProject,
    mix: string,
    work: string,
    signal: AbortSignal,
    onStep: (text: string) => void
  ): Promise<string> {
    const target = project.loudnorm
    if (!target) return mix
    onStep('Ton: Lautheit messen')
    let tail = ''
    try {
      await runFfmpeg(
        [
          ...['-hide_banner', '-nostdin', '-i', mix, '-af', loudnormMeasureFilter(target)],
          ...['-f', 'null', '-progress', 'pipe:1', '-nostats', '-']
        ],
        { durationSec: plan.durationSec, signal, onStderr: (t) => (tail = t) }
      )
    } catch (err) {
      if (err instanceof FfmpegCanceledError) throw err
      tail = ''
    }
    const outcome = loudnessOutcome(target, parseLoudnormOutput(tail))
    logLine('[vgen] Lautheit:', loudnessResultStep(target, outcome))
    const filter = loudnormApplyFilter(target, outcome)
    if (!filter) return mix
    onStep('Ton: Lautheit angleichen')
    const out = join(work, 'mix_norm.wav')
    await runFfmpeg(
      [
        ...['-hide_banner', '-nostdin', '-i', mix],
        ...[
          '-af',
          `${filter},aresample=${VGEN_SAMPLE_RATE},apad,atrim=end_sample=${plan.totalSamples}`
        ],
        ...['-c:a', 'pcm_s16le', '-progress', 'pipe:1', '-nostats', '-y', out]
      ],
      { durationSec: plan.durationSec, signal }
    )
    return out
  }

  private finalArgs(
    plan: VgenPlan,
    project: VgenProject,
    list: string,
    mix: string,
    enc: EncoderInfo | null,
    out: string
  ): string[] {
    const format = project.output.format
    const info = CONVERT_FORMATS[format]
    let vf = finalVideoFilter(plan, format)
    // Quick Sync u. a. arbeiten intern mit nv12
    if (enc && info.family !== 'hap') {
      const fmt = encoderPixFmt(enc.id, info.family === 'prores' ? 'yuv422p10le' : 'yuv420p')
      vf = vf.replace(/^format=[a-z0-9]+/, `format=${fmt}`)
    }
    return [
      ...['-hide_banner', '-nostdin', '-f', 'concat', '-safe', '0', '-i', list, '-i', mix],
      ...['-map', '0:v', '-map', '1:a', '-vf', vf],
      ...videoEncoderArgs(
        format,
        {
          width: plan.width,
          height: plan.height,
          fps: plan.fps,
          gop: info.family === 'h264' || info.family === 'hevc' ? Math.round(plan.fps * 2) : null
        },
        { quality: project.output.quality, compat: false, hapCompressor: 'snappy' },
        {
          encoder: enc?.id,
          hapChunks: info.family === 'hap' ? computeChunks(plan.width, plan.height) : undefined
        }
      ),
      // feste Bildrate: die Bildliste liefert lückenlose Zeitstempel, cfr hält sie im Raster
      ...['-fps_mode', 'cfr', '-r', rateArg(plan.fps)],
      ...finalAudioArgs(format),
      ...['-ar', String(VGEN_SAMPLE_RATE), '-ac', '2'],
      ...containerArgs(info.container),
      ...['-progress', 'pipe:1', '-nostats', '-y', out]
    ]
  }

  cancel(id: string): void {
    const job = this.jobs.get(id)
    if (!job || isFinished(job)) return
    convertQueue.remove(id)
    this.update(job, { status: 'canceled', stageText: 'Abgebrochen', finishedAt: Date.now() })
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

export const videoGenJobs = new VideoGenJobs()
