// Gemeinsame Schritte des Video-Generators für Aufträge (videoGenJobs) und „Vorschau rechnen“
// (videoGenPreview): Analyse, Fähigkeiten, Stücke mit Zwischenspeicher. Die Befehle selbst
// kommen aus shared/videoGenPlan – Vorschau und Ergebnis rechnen also dieselben Stücke.

import { randomUUID } from 'node:crypto'
import { CONVERT_FORMATS } from '@shared/convertPlan'
import type { ConvertFormat, MediaInfo, VgenProject } from '@shared/types'
import {
  elementCacheKey,
  elementPieceArgs,
  transitionCacheKey,
  transitionPairs,
  transitionPieceArgs,
  type VgenCaps,
  type VgenPlan
} from '@shared/videoGenPlan'
import { probeMediaInfo } from '../ffmpeg/mediaInfo'
import { getConvertCapabilities } from './capabilities'
import { runFfmpeg } from './runFfmpeg'
import {
  commit,
  elementPaths,
  haveAll,
  removeQuietly,
  tempName,
  touch,
  transitionFile
} from './videoGenCache'

/** Element- und Übergangs-Stücke gleichzeitig (gemessen: 2 parallel auf 4 Kernen). */
export const PIECE_PARALLEL = 2

/** Führt `fn` mit höchstens `limit` gleichzeitig aus; der erste Fehler bricht ab. */
export async function pool<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let next = 0
  let failed: unknown = null
  const worker = async (): Promise<void> => {
    while (failed === null && next < items.length) {
      const item = items[next++]
      try {
        await fn(item)
      } catch (err) {
        failed ??= err
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  if (failed !== null) throw failed
}

/**
 * Analyse aller Dateien des Projekts (Elemente und Musik) über den Cache des main – mit
 * Tiefenanalyse (EXIF-Drehung von Fotos). Unlesbares fehlt in der Map; der Plan meldet es.
 */
export async function analyzeProject(
  project: VgenProject,
  onStep?: (done: number, total: number) => void
): Promise<Map<string, MediaInfo>> {
  const paths = [
    ...new Set([...project.elements.map((e) => e.path), ...(project.music?.tracks ?? [])])
  ]
  const infos = new Map<string, MediaInfo>()
  let done = 0
  await Promise.all(
    paths.map(async (p) => {
      const res = await probeMediaInfo(p, { deep: true })
      if (res.ok) infos.set(p, res.info)
      onStep?.(++done, paths.length)
    })
  )
  return infos
}

/** Fähigkeiten des gebündelten ffmpeg für den Plan; wirft, wenn ffmpeg oder das Format fehlt. */
export async function vgenCapabilities(format?: ConvertFormat): Promise<VgenCaps> {
  const caps = await getConvertCapabilities()
  if (!caps.ffmpegFound) throw new Error('ffmpeg nicht gefunden')
  if (format && !caps.formats[format]) {
    throw new Error(`${CONVERT_FORMATS[format].label} kann das gebündelte ffmpeg nicht schreiben`)
  }
  return {
    tonemap: caps.tonemap,
    vpxAlpha: caps.vpxAlpha,
    xfade: caps.xfade,
    perspective: caps.perspective
  }
}

export interface ElementTask {
  i: number
  key: string
  paths: { video: string; audio: string }
  frames: number
  hit: boolean
}

export interface TransitionTask {
  index: number
  next: number
  key: string
  file: string
  frames: number
  hit: boolean
}

export interface PieceTasks {
  elements: ElementTask[]
  transitions: TransitionTask[]
  /** Bilder, die neu gerechnet werden müssen */
  todoFrames: number
}

/**
 * Stücke eines Plans mit Cache-Schlüssel und Treffer; `only` begrenzt auf einen Ausschnitt
 * (Vorschau). Elemente ohne Aufgabe bleiben in `elements` außen vor.
 */
export async function pieceTasks(
  plan: VgenPlan,
  only?: { elements: number[]; transitions: number[] }
): Promise<PieceTasks> {
  const wantE = only ? new Set(only.elements) : null
  const wantT = only ? new Set(only.transitions) : null
  const elements: ElementTask[] = []
  for (let i = 0; i < plan.elements.length; i++) {
    if (wantE && !wantE.has(i)) continue
    const key = elementCacheKey(plan, plan.elements[i])
    const paths = elementPaths(key)
    elements.push({
      i,
      key,
      paths,
      frames: plan.elements[i].frames,
      hit: await haveAll([paths.video, paths.audio])
    })
  }
  const transitions: TransitionTask[] = []
  for (const p of transitionPairs(plan)) {
    if (wantT && !wantT.has(p.index)) continue
    const key = transitionCacheKey(plan, p.index, p.next)
    const file = transitionFile(key)
    transitions.push({
      ...p,
      key,
      file,
      frames: plan.elements[p.index].transition?.frames ?? 0,
      hit: await haveAll([file])
    })
  }
  const todoFrames =
    elements.reduce((s, t) => s + (t.hit ? 0 : t.frames), 0) +
    transitions.reduce((s, t) => s + (t.hit ? 0 : t.frames), 0)
  return { elements, transitions, todoFrames }
}

export interface PieceProgress {
  stage: 'elements' | 'transitions'
  /** fertige Stücke der Stufe / alle der Stufe */
  finished: number
  count: number
  /** neu gerechnete Bilder bis jetzt (auch angefangene Stücke anteilig) */
  framesDone: number
}

/**
 * Rechnet die fehlenden Stücke (Elemente, dann Übergänge; begrenzt parallel) und markiert die
 * Treffer als benutzt. Ein Stück landet erst nach einem erfolgreichen Lauf im Cache.
 * Liefert die Übergangs-Dateien je Element-Index (null = keiner) und die Element-Pfade.
 */
export async function renderPieces(
  plan: VgenPlan,
  tasks: PieceTasks,
  opts: {
    signal: AbortSignal
    /** kurzer Name für Temporärdateien (Auftrag/Vorschau) */
    tag: string
    onProgress?: (p: PieceProgress) => void
    onPiece?: (cached: boolean) => void
    isCanceled?: () => boolean
  }
): Promise<{ elementFiles: (string | null)[]; transitionFiles: (string | null)[] }> {
  let doneFrames = 0
  const partial = new Map<string, number>()
  const framesDone = (): number => {
    let p = doneFrames
    for (const v of partial.values()) p += v
    return p
  }
  const elementFiles: (string | null)[] = plan.elements.map(() => null)
  const elementPathOf = new Map(tasks.elements.map((t) => [t.i, t.paths.video]))
  let finished = 0
  const report = (stage: PieceProgress['stage'], count: number): void =>
    opts.onProgress?.({ stage, finished, count, framesDone: framesDone() })

  // 1. Element-Stücke
  report('elements', tasks.elements.length)
  await pool(tasks.elements, PIECE_PARALLEL, async (t) => {
    if (t.hit) {
      await touch([t.paths.video, t.paths.audio])
    } else {
      await renderElement(plan, t.i, t.paths, opts.signal, (p) => {
        partial.set(`e${t.i}`, p * t.frames)
        report('elements', tasks.elements.length)
      })
      partial.delete(`e${t.i}`)
      doneFrames += t.frames
    }
    elementFiles[t.i] = t.paths.video
    opts.onPiece?.(t.hit)
    finished++
    report('elements', tasks.elements.length)
  })
  if (opts.isCanceled?.()) return { elementFiles, transitionFiles: [] }

  // 2. Übergänge (aus den beiden Nachbar-Stücken)
  finished = 0
  const transitionFiles: (string | null)[] = plan.elements.map(() => null)
  report('transitions', tasks.transitions.length)
  await pool(tasks.transitions, PIECE_PARALLEL, async (t) => {
    if (t.hit) {
      await touch([t.file])
    } else {
      const a = elementPathOf.get(t.index)
      const b = elementPathOf.get(t.next)
      if (!a || !b) throw new Error(`Übergang ${t.index + 1}: Nachbar-Stück fehlt`)
      const tmp = tempName(t.file, `${opts.tag}${randomUUID().slice(0, 4)}`)
      try {
        await runFfmpeg(transitionPieceArgs(plan, t.index, { a, b, out: tmp }), {
          durationSec: t.frames / plan.fps,
          signal: opts.signal,
          onProgress: (p) => {
            partial.set(`t${t.index}`, p * t.frames)
            report('transitions', tasks.transitions.length)
          }
        })
        await commit(tmp, t.file)
      } finally {
        await removeQuietly(tmp)
      }
      partial.delete(`t${t.index}`)
      doneFrames += t.frames
    }
    transitionFiles[t.index] = t.file
    opts.onPiece?.(t.hit)
    finished++
    report('transitions', tasks.transitions.length)
  })
  return { elementFiles, transitionFiles }
}

async function renderElement(
  plan: VgenPlan,
  i: number,
  paths: { video: string; audio: string },
  signal: AbortSignal,
  onProgress: (p: number) => void
): Promise<void> {
  const e = plan.elements[i]
  const id = randomUUID().slice(0, 8)
  const video = tempName(paths.video, id)
  const audio = tempName(paths.audio, id)
  try {
    await runFfmpeg(elementPieceArgs(plan, e, { input: e.path, video, audio }), {
      durationSec: e.frames / plan.fps,
      signal,
      onProgress
    })
    // erst der Ton, dann das Bild: haveAll prüft beide, ein halbes Paar zählt nie als Treffer
    await commit(audio, paths.audio)
    await commit(video, paths.video)
  } finally {
    await removeQuietly(video, audio)
  }
}
