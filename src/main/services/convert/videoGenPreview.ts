// „Vorschau rechnen“ im Video-Generator: kleiner Probelauf (längere Seite 640 px) des Bereichs
// um ein Element – mit denselben Stücken, Übergängen und Ton-Graphen wie das Ergebnis, nur
// verkleinert und ohne Lautheitsangleichung. Gerechnet werden nur die Stücke im Ausschnitt;
// der Ton-Graph bleibt der ganze, Elemente außerhalb sind darin exakt lange Stille.
// Immer nur eine Vorschau zugleich: eine neue bricht die laufende ab. Ergebnisse liegen in
// vgen-cache/previews und werden bei gleichem Stand direkt wieder ausgeliefert.

import { writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { MEDIA_PROTOCOL } from '@shared/ipc-contracts'
import type { VgenPreviewOutcome, VgenPreviewProgress, VgenPreviewRequest } from '@shared/types'
import {
  audioRun,
  concatList,
  hash53,
  piecesForRanges,
  planVideoGen,
  previewFinalArgs,
  previewRanges,
  previewSize,
  rangeOffset,
  VGEN_PLAN_VERSION
} from '@shared/videoGenPlan'
import { logLine } from '../log'
import { FfmpegCanceledError, runFfmpeg } from './runFfmpeg'
import {
  commit,
  ensureDirs,
  haveAll,
  jobDir,
  piecesDir,
  previewsDir,
  prunePreviews,
  removeQuietly,
  tempName,
  touch
} from './videoGenCache'
import { analyzeProject, pieceTasks, renderPieces, vgenCapabilities } from './videoGenRender'

type Sink = (p: VgenPreviewProgress) => void

let sink: Sink = () => {}
let current: AbortController | null = null

export function setPreviewSink(s: Sink): void {
  sink = s
}

/** Laufende Vorschau abbrechen (neue Auswahl, Werkzeug verlassen). */
export function cancelPreview(): void {
  current?.abort()
}

/** Projekt und Anfrage sind schon geprüft (videoGen.handlers.ts). */
export async function renderPreview(req: VgenPreviewRequest): Promise<VgenPreviewOutcome> {
  current?.abort()
  const abort = new AbortController()
  current = abort
  const work = jobDir(`preview-${req.requestId}`)
  const step = (progress: number, text: string): void =>
    sink({ requestId: req.requestId, progress: Math.min(0.999, progress), text })
  try {
    step(0, 'Analyse')
    const infos = await analyzeProject(req.project)
    if (abort.signal.aborted) throw new FfmpegCanceledError()
    const caps = await vgenCapabilities()
    const out = req.project.output
    const project = {
      ...req.project,
      output: { ...out, ...previewSize(out.width, out.height), format: 'h264' as const },
      loudnorm: null
    }
    const plan = planVideoGen(project, (p) => infos.get(p), caps)
    const error = plan.hints.find((h) => h.level === 'error')
    if (error) return { ok: false, canceled: false, error: error.text }
    const index = plan.elements.findIndex((e) => e.id === req.elementId)
    if (index < 0) return { ok: false, canceled: false, error: 'Element nicht im Projekt' }

    // eine Sekunde davor und danach: der Übergang hinein und heraus ist ganz zu sehen
    const ranges = previewRanges(plan, index, Math.round(plan.fps))
    const tasks = await pieceTasks(plan, piecesForRanges(plan, ranges))
    const elements: (string | null)[] = plan.elements.map(() => null)
    const wavs: (string | null)[] = plan.elements.map(() => null)
    for (const t of tasks.elements) {
      elements[t.i] = t.paths.video
      wavs[t.i] = t.paths.audio
    }
    const transitions: (string | null)[] = plan.elements.map(() => null)
    for (const t of tasks.transitions) transitions[t.index] = t.file
    const listFile = join(work, 'liste.ffconcat')
    const graphFile = join(work, 'ton.txt')
    const mix = join(work, 'mix.wav')
    const list = concatList(plan, { elements, transitions }, ranges)
    const audio = audioRun(plan, { wavs, graphFile, out: mix }, ranges)

    // Schlüssel: Stücke (Dateinamen = Quelle + Befehl), Ton-Graph und Musik-Quellen
    const musicSig = (plan.music?.entries ?? []).map((e) => {
      const i = infos.get(e.path)
      return [e.path.toLowerCase(), i?.sizeBytes, i?.modifiedMs]
    })
    const key = hash53(
      JSON.stringify({ v: VGEN_PLAN_VERSION, list, graph: audio.graph, music: musicSig })
    )
    const file = join(previewsDir(), `p_${key}.mp4`)
    const frames = ranges.reduce((s, [a, b]) => s + (b - a), 0)
    const e = plan.elements[index]
    const startF = rangeOffset(ranges, e.start, plan.totalFrames) ?? 0
    const endF = (rangeOffset(ranges, e.start + e.frames - 1, plan.totalFrames) ?? frames - 1) + 1
    const result = (cached: boolean): VgenPreviewOutcome => ({
      ok: true,
      url: `${MEDIA_PROTOCOL}://vgen/${basename(file)}`,
      width: plan.width,
      height: plan.height,
      durationSec: frames / plan.fps,
      elementStartSec: startF / plan.fps,
      elementEndSec: endF / plan.fps,
      cached
    })
    if (await haveAll([file])) {
      await touch([file])
      return result(true)
    }

    await ensureDirs(piecesDir(), previewsDir(), work)
    // Fortschritt in Bildern: neue Stücke + Endlauf (Ton ist schnell)
    const total = tasks.todoFrames + frames * 1.2
    await renderPieces(plan, tasks, {
      signal: abort.signal,
      tag: 'pv',
      onProgress: (p) =>
        step(p.framesDone / total, p.stage === 'elements' ? 'Elemente' : 'Übergänge')
    })
    step(tasks.todoFrames / total, 'Ton')
    await writeFile(graphFile, audio.graph)
    await runFfmpeg(audio.args, { durationSec: plan.durationSec, signal: abort.signal })
    await writeFile(listFile, list)
    const tmp = tempName(file, req.requestId.slice(0, 6))
    try {
      await runFfmpeg(previewFinalArgs(plan, listFile, mix, tmp), {
        durationSec: frames / plan.fps,
        signal: abort.signal,
        onProgress: (p) => step((tasks.todoFrames + frames * (0.2 + p)) / total, 'Kodieren')
      })
      await commit(tmp, file)
    } finally {
      await removeQuietly(tmp)
    }
    void prunePreviews().catch(() => {})
    return result(false)
  } catch (err) {
    if (err instanceof FfmpegCanceledError || abort.signal.aborted) {
      return { ok: false, canceled: true, error: 'Abgebrochen' }
    }
    const message = err instanceof Error ? err.message : String(err)
    logLine('[vgen] Vorschau fehlgeschlagen:', message)
    return { ok: false, canceled: false, error: message }
  } finally {
    if (current === abort) current = null
    await removeQuietly(work)
  }
}
