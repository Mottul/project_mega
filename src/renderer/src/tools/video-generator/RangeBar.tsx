// Videoausschnitt grafisch: Start und Ende als zwei Griffe über der ganzen Länge der Quelle.
// Beim Ziehen zeigt die Bühne das Bild der Quelle an der Griffposition (onScrub); übernommen
// wird beim Loslassen. Pfeiltasten ±0,1 s (Umschalt ±1 s), Pos1/Ende springen an die Enden.

import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { fmtDuration } from './presets'

type Which = 'in' | 'out'

const round3 = (v: number): number => Math.round(v * 1000) / 1000

export function RangeBar({
  durationSec,
  inSec,
  outSec,
  minLenSec,
  onScrub,
  onCommit
}: {
  /** Länge der Quelle */
  durationSec: number
  inSec: number | null
  outSec: number | null
  /** kürzester Ausschnitt (ein Bild der Ausgabe) */
  minLenSec: number
  /** Griff wird gezogen: Zeitpunkt der Quelle zeigen; null = fertig */
  onScrub: (timeSec: number | null) => void
  /** null = Anfang bzw. Ende der Quelle */
  onCommit: (inSec: number | null, outSec: number | null) => void
}): JSX.Element {
  const D = durationSec
  const bar = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ which: Which; value: number } | null>(null)
  const a = drag?.which === 'in' ? drag.value : Math.min(Math.max(0, inSec ?? 0), D)
  const b = drag?.which === 'out' ? drag.value : Math.min(Math.max(a, outSec ?? D), D)

  const clampFor = (which: Which, v: number): number =>
    which === 'in'
      ? Math.min(Math.max(0, v), Math.max(0, b - minLenSec))
      : Math.max(Math.min(D, v), Math.min(D, a + minLenSec))

  function commit(which: Which, v: number): void {
    const na = which === 'in' ? v : a
    const nb = which === 'out' ? v : b
    onCommit(na <= 0.0005 ? null : round3(na), nb >= D - 0.0005 ? null : round3(nb))
  }

  function timeAt(clientX: number): number {
    const r = bar.current?.getBoundingClientRect()
    if (!r || !r.width) return 0
    return ((clientX - r.left) / r.width) * D
  }

  function start(e: PointerEvent, which: Which): void {
    e.preventDefault()
    const target = e.currentTarget as HTMLElement
    target.setPointerCapture(e.pointerId)
    // relativ zur aktuellen Lage, nicht zum Zeiger: der Griff ist breiter als ein Punkt
    const v0 = which === 'in' ? a : b
    const t0 = timeAt(e.clientX)
    let value = v0
    setDrag({ which, value })
    onScrub(value)
    const move = (ev: globalThis.PointerEvent): void => {
      value = clampFor(which, v0 + timeAt(ev.clientX) - t0)
      setDrag({ which, value })
      onScrub(value)
    }
    const up = (): void => {
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', up)
      target.removeEventListener('pointercancel', up)
      setDrag(null)
      onScrub(null)
      commit(which, value)
    }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', up)
    target.addEventListener('pointercancel', up)
  }

  function key(e: KeyboardEvent, which: Which): void {
    const cur = which === 'in' ? a : b
    const step = e.shiftKey ? 1 : 0.1
    const next: Record<string, number> = {
      ArrowLeft: cur - step,
      ArrowDown: cur - step,
      ArrowRight: cur + step,
      ArrowUp: cur + step,
      Home: 0,
      End: D
    }
    if (!(e.key in next)) return
    e.preventDefault()
    commit(which, clampFor(which, next[e.key]))
  }

  const pos = (v: number): string => `${D > 0 ? (v / D) * 100 : 0}%`
  const handle = (which: Which, v: number, label: string): JSX.Element => (
    <div
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(D * 10) / 10}
      aria-valuenow={Math.round(v * 10) / 10}
      aria-valuetext={fmtDuration(v)}
      onPointerDown={(e) => start(e, which)}
      onKeyDown={(e) => key(e, which)}
      className="absolute inset-y-0 z-10 flex w-3 -translate-x-1/2 cursor-ew-resize items-center justify-center rounded-sm bg-primary outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{ left: pos(v) }}
    >
      <span className="h-3 w-0.5 rounded bg-primary-foreground/80" />
    </div>
  )

  return (
    <div className="space-y-1">
      <div
        ref={bar}
        className="relative h-7 touch-none select-none rounded border border-border bg-muted/40"
      >
        <div
          className="absolute inset-y-0 bg-primary/30"
          style={{ left: pos(a), width: `${D > 0 ? ((b - a) / D) * 100 : 0}%` }}
        />
        {handle('in', a, 'Start des Ausschnitts')}
        {handle('out', b, 'Ende des Ausschnitts')}
      </div>
      <p className="flex justify-between text-xs tabular-nums text-muted-foreground">
        <span>Start {fmtDuration(a)}</span>
        <span>Länge {fmtDuration(b - a)}</span>
        <span>
          Ende {fmtDuration(b)} von {fmtDuration(D)}
        </span>
      </p>
    </div>
  )
}
