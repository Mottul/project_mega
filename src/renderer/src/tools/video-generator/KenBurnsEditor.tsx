// Ken-Burns-Rahmen direkt auf dem Bild: die ganze Zeichenfläche mit Start- und Endausschnitt.
// Ziehen verschiebt, die Ecke zoomt um die Mitte; Pfeiltasten und +/− gehen auch (kein
// Mausrad: das scrollte zugleich die Seite). Jede Änderung wird zum eigenen Rahmen (mode
// 'custom') und läuft durch clampKenBurnsFrame – dieselbe Klammer wie im Plan, der Rahmen
// bleibt also immer auf dem Bild.

import { useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { ArrowLeftRight, RotateCcw } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import type { VgenElement, VgenKenBurns, VgenKenBurnsFrame } from '@shared/types'
import {
  baseWindow,
  clampKenBurnsFrame,
  KEN_BURNS_STRENGTH,
  kenBurnsFrames,
  type VgenElementPlan,
  type VgenPlan
} from '@shared/videoGenPlan'
import { CanvasContent } from './Stage'

type Which = 'from' | 'to'

export function KenBurnsEditor({
  el,
  ep,
  plan,
  onChange,
  onReset
}: {
  el: VgenElement
  ep: VgenElementPlan
  plan: VgenPlan
  onChange: (kb: VgenKenBurns) => void
  /** zurück zur Vorgabe */
  onReset: () => void
}): JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  const base = baseWindow(ep.canvas, { width: plan.width, height: plan.height })
  const strength = el.kenBurns?.strength ?? 'medium'
  const frames = ep.kenBurns
    ? kenBurnsFrames(ep.kenBurns)
    : {
        from: { cx: 0.5, cy: 0.5, zoom: 1 },
        to: { cx: 0.5, cy: 0.5, zoom: KEN_BURNS_STRENGTH[strength] }
      }

  function set(which: Which, f: VgenKenBurnsFrame): void {
    const next = { ...frames, [which]: clampKenBurnsFrame(f, base.w, base.h) }
    onChange({ mode: 'custom', strength, from: next.from, to: next.to })
  }

  /** Zeigerposition in Anteilen der Zeichenfläche. */
  function at(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const r = box.current?.getBoundingClientRect()
    if (!r || !r.width || !r.height) return { x: 0.5, y: 0.5 }
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }
  }

  function drag(e: PointerEvent, which: Which, mode: 'move' | 'zoom'): void {
    e.preventDefault()
    e.stopPropagation()
    const target = e.currentTarget as HTMLElement
    target.setPointerCapture(e.pointerId)
    const start = at(e)
    const f0 = frames[which]
    const move = (ev: globalThis.PointerEvent): void => {
      const p = at(ev)
      if (mode === 'move') {
        set(which, { ...f0, cx: f0.cx + p.x - start.x, cy: f0.cy + p.y - start.y })
      } else {
        // Ecke folgt dem Zeiger, die Mitte bleibt: halbe Breite bzw. Höhe -> Zoom
        const halfW = Math.abs(p.x - f0.cx)
        const halfH = Math.abs(p.y - f0.cy)
        const half = Math.max(halfW, (halfH * base.w) / base.h, 1e-3)
        set(which, { ...f0, zoom: base.w / (2 * half) })
      }
    }
    const up = (): void => {
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', up)
      target.removeEventListener('pointercancel', up)
    }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', up)
    target.addEventListener('pointercancel', up)
  }

  function key(e: KeyboardEvent, which: Which): void {
    const f = frames[which]
    const step = e.shiftKey ? 0.05 : 0.01
    const moves: Record<string, Partial<VgenKenBurnsFrame>> = {
      ArrowLeft: { cx: f.cx - step },
      ArrowRight: { cx: f.cx + step },
      ArrowUp: { cy: f.cy - step },
      ArrowDown: { cy: f.cy + step },
      '+': { zoom: f.zoom * 1.05 },
      '=': { zoom: f.zoom * 1.05 },
      '-': { zoom: f.zoom / 1.05 }
    }
    const m = moves[e.key]
    if (!m) return
    e.preventDefault()
    set(which, { ...f, ...m })
  }

  const rectOf = (f: VgenKenBurnsFrame): { x: number; y: number; w: number; h: number } => ({
    x: f.cx - base.w / f.zoom / 2,
    y: f.cy - base.h / f.zoom / 2,
    w: base.w / f.zoom,
    h: base.h / f.zoom
  })

  // Start in Vordergrundfarbe, Ende in der Akzentfarbe – unterscheidbar bei jedem Akzent
  const TONE: Record<Which, { border: string; fill: string }> = {
    from: { border: 'border-foreground', fill: 'bg-foreground text-background' },
    to: { border: 'border-primary', fill: 'bg-primary text-primary-foreground' }
  }

  const frameBox = (which: Which, label: string): JSX.Element => {
    const r = rectOf(frames[which])
    const tone = TONE[which]
    return (
      <div
        role="slider"
        tabIndex={0}
        aria-label={`${label}ausschnitt`}
        aria-valuetext={`Mitte ${Math.round(frames[which].cx * 100)} % / ${Math.round(frames[which].cy * 100)} %, Zoom ${frames[which].zoom.toFixed(2)}×`}
        onPointerDown={(e) => drag(e, which, 'move')}
        onKeyDown={(e) => key(e, which)}
        className={cn(
          'absolute cursor-move border-2 outline-none focus-visible:ring-2 focus-visible:ring-ring',
          tone.border
        )}
        style={{
          left: `${r.x * 100}%`,
          top: `${r.y * 100}%`,
          width: `${r.w * 100}%`,
          height: `${r.h * 100}%`
        }}
      >
        <span className={cn('absolute left-0 top-0 px-1 text-[10px] font-medium', tone.fill)}>
          {label}
        </span>
        <span
          aria-hidden
          onPointerDown={(e) => drag(e, which, 'zoom')}
          className={cn(
            'absolute -bottom-1.5 -right-1.5 size-3 cursor-nwse-resize rounded-sm border border-background',
            tone.fill
          )}
        />
      </div>
    )
  }

  const a = frames.from
  const b = frames.to
  return (
    <div className="space-y-2">
      <div
        ref={box}
        className="relative mx-auto w-full touch-none select-none overflow-hidden rounded border border-border"
        style={{
          aspectRatio: `${ep.canvas.width} / ${ep.canvas.height}`,
          maxWidth: `calc(45vh * ${ep.canvas.width / ep.canvas.height})`,
          background: plan.background.replace(/^0x/, '#')
        }}
        data-testid="vgen-kb-editor"
      >
        <CanvasContent el={el} ep={ep} time={0} playing={false} volume={0} />
        <div className="absolute inset-0 bg-black/35" />
        <svg
          className="pointer-events-none absolute inset-0 size-full"
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
        >
          <line
            x1={a.cx}
            y1={a.cy}
            x2={b.cx}
            y2={b.cy}
            stroke="white"
            strokeWidth={2}
            strokeDasharray="6 4"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {frameBox('to', 'Ende')}
        {frameBox('from', 'Start')}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          Rahmen ziehen zum Verschieben, an der Ecke ziehen zum Zoomen (auch Pfeiltasten, +/−).
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange({ mode: 'custom', strength, from: b, to: a })}
        >
          <ArrowLeftRight className="size-4" /> Tauschen
        </Button>
        <Button variant="ghost" size="sm" onClick={onReset}>
          <RotateCcw className="size-4" /> Vorgabe
        </Button>
      </div>
    </div>
  )
}
