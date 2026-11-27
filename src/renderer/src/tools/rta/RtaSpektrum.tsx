// Spektrum und Spektrogramm des RTA mit Fadenkreuz und Ablesung. Gezeichnet wird nicht hier,
// sondern im Bildtakt von useRtaMessung – in die Zeichenflächen, die er hereinreicht.

import {
  useRef,
  type Dispatch,
  type MutableRefObject,
  type PointerEvent,
  type RefObject,
  type SetStateAction
} from 'react'
import { cn } from '@renderer/lib/utils'
import { fmt } from '../_calc/ui'
import type { RtaProcessor } from './analysis'
import { levelAt, freqText, SUB_BANDS, subPosition } from './bands'
import { PAD, ROW_MS, spectroFreq, spectroRow, xToFreq } from './draw'
import { noteOf } from './feedback'
import type { RtaPrefs } from './store'
import type { Pointer } from './useRtaMessung'

/** Pegelanzeige: eine Nachkommastelle, Stille als „–“ */
export function dbText(v: number): string {
  return Number.isFinite(v) && v > -150 ? fmt(v, 1) : ''
}

/** Spektrum mit Fadenkreuz und Ablesung: Frequenz, Note, Band- und Kurvenpegel */
export function Spektrum({
  graph,
  running,
  unsupported,
  hover,
  setHover,
  pointerIn,
  proc,
  shown,
  unit
}: {
  graph: RefObject<HTMLCanvasElement>
  running: boolean
  unsupported: string | null
  hover: Pointer | null
  setHover: Dispatch<SetStateAction<Pointer | null>>
  pointerIn: (area: Pointer['area']) => (e: PointerEvent<HTMLDivElement>) => void
  proc: MutableRefObject<RtaProcessor>
  shown: MutableRefObject<{ levels: number[]; curve: number[] | null }>
  unit: string
}): JSX.Element {
  const graphBox = useRef<HTMLDivElement>(null)
  const onPointer = pointerIn('graph')
  const box = graphBox.current
  const hoverInfo = (() => {
    if (!hover || hover.area !== 'graph' || !box) return null
    const w = box.clientWidth
    if (hover.x < PAD.l || hover.x > w - PAD.r) return null
    const f = xToFreq(hover.x, w)
    const bands = proc.current.bandLayout
    const bi = bands.findIndex((b) => f >= b.lo && f < b.hi)
    const si = SUB_BANDS.findIndex((b) => f >= b.lo && f < b.hi)
    const band = bi >= 0 ? shown.current.levels[bi] : undefined
    const fine = si >= 0 ? shown.current.curve?.[si] : undefined
    const note = noteOf(f)
    return { f, bandLabel: bi >= 0 ? bands[bi].label : '', band, fine, note }
  })()

  return (
    <div
      ref={graphBox}
      className="relative touch-none select-none"
      onPointerMove={onPointer}
      onPointerDown={onPointer}
      onPointerLeave={() => setHover(null)}
    >
      <canvas
        ref={graph}
        className="block h-56 w-full sm:h-72"
        aria-label="Spektrum"
        data-testid="rta-graph"
      />
      {!running && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rounded-md bg-card/80 px-3 py-1.5 text-sm text-muted-foreground">
            {unsupported ? 'Messen ist hier nicht möglich' : '„Messen“ startet das Mikrofon'}
          </span>
        </div>
      )}
      {hoverInfo && running && (
        <div
          className="pointer-events-none absolute top-2 z-10 rounded-md border border-border bg-card/95 px-2 py-1 text-xs shadow-lg"
          style={
            hover && box && hover.x > box.clientWidth / 2
              ? { right: box.clientWidth - hover.x + 12 }
              : { left: (hover?.x ?? 0) + 12 }
          }
        >
          <p className="font-semibold tabular-nums">
            {freqText(hoverInfo.f)}{' '}
            <span className="font-normal text-muted-foreground">
              {hoverInfo.note.name} {hoverInfo.note.cents >= 0 ? '+' : '−'}
              {Math.abs(hoverInfo.note.cents)} ct
            </span>
          </p>
          {hoverInfo.band != null && Number.isFinite(hoverInfo.band) && (
            <p className="tabular-nums text-muted-foreground">
              Band {hoverInfo.bandLabel}: {dbText(hoverInfo.band)} {unit}
            </p>
          )}
          {hoverInfo.fine != null && Number.isFinite(hoverInfo.fine) && (
            <p className="tabular-nums text-muted-foreground">
              Kurve: {dbText(hoverInfo.fine)} {unit}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Spektrogramm als Wasserfall (Frequenzen waagrecht wie im Spektrum, das Fadenkreuz läuft mit)
 * oder als Zeitachse, mit Ablesung
 */
export function Spektrogramm({
  p,
  spec,
  specAxes,
  history,
  running,
  hover,
  setHover,
  pointerIn,
  unit
}: {
  p: RtaPrefs
  spec: RefObject<HTMLCanvasElement>
  specAxes: RefObject<HTMLCanvasElement>
  history: MutableRefObject<Float32Array[]>
  running: boolean
  hover: Pointer | null
  setHover: Dispatch<SetStateAction<Pointer | null>>
  pointerIn: (area: Pointer['area']) => (e: PointerEvent<HTMLDivElement>) => void
  unit: string
}): JSX.Element {
  const specBox = useRef<HTMLDivElement>(null)
  // Ablesung im Spektrogramm: Frequenz, Note, Pegel und wie lange es her ist
  const sbox = specBox.current
  const specInfo = (() => {
    if (!hover || hover.area !== 'spectro' || !sbox || p.spectrogram === 'off') return null
    const w = sbox.clientWidth
    const h = sbox.clientHeight
    const f = spectroFreq(p.spectrogram, hover.x, hover.y, w, h)
    const row = spectroRow(p.spectrogram, hover.x, hover.y, w)
    const line = row >= 0 ? history.current[row] : undefined
    if (!line) return null
    return { f, note: noteOf(f), db: levelAt(line, subPosition(f)), ago: (row * ROW_MS) / 1000 }
  })()

  return (
    <div
      ref={specBox}
      className="relative touch-none select-none overflow-hidden rounded-md bg-background/40"
      onPointerMove={pointerIn('spectro')}
      onPointerDown={pointerIn('spectro')}
      onPointerLeave={() => setHover(null)}
    >
      <canvas
        ref={spec}
        className={cn(
          'block w-full',
          p.spectrogram === 'waterfall' ? 'h-40 sm:h-48' : 'h-28 sm:h-32'
        )}
        aria-label={p.spectrogram === 'waterfall' ? 'Wasserfall' : 'Zeitachse des Spektrums'}
        data-testid="rta-spectro"
      />
      <canvas
        ref={specAxes}
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden
      />
      {/* Fadenkreuz durch den Wasserfall – dieselbe Frequenzachse wie das Spektrum */}
      {hover && p.spectrogram === 'waterfall' && running && (
        <div
          className="pointer-events-none absolute inset-y-0 w-px bg-foreground/50"
          style={{ left: Math.round(hover.x) }}
        />
      )}
      {specInfo && running && (
        <div
          className="pointer-events-none absolute top-2 z-10 rounded-md border border-border bg-card/95 px-2 py-1 text-xs shadow-lg"
          style={
            hover && sbox && hover.x > sbox.clientWidth / 2
              ? { right: sbox.clientWidth - hover.x + 12 }
              : { left: (hover?.x ?? 0) + 12 }
          }
        >
          <p className="font-semibold tabular-nums">
            {freqText(specInfo.f)}{' '}
            <span className="font-normal text-muted-foreground">
              {specInfo.note.name} {specInfo.note.cents >= 0 ? '+' : '−'}
              {Math.abs(specInfo.note.cents)} ct
            </span>
          </p>
          <p className="tabular-nums text-muted-foreground">
            {Number.isFinite(specInfo.db) ? `${dbText(specInfo.db)} ${unit}` : 'still'} ·{' '}
            {specInfo.ago < 0.05 ? 'jetzt' : `vor ${fmt(specInfo.ago, 1)} s`}
          </p>
        </div>
      )}
    </div>
  )
}
