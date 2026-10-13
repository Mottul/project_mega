// Bedienelemente der OSC-Steuerung: Fader, Poti, Schalter, Taster, Auswahl und XY-Pad.

import { useEffect, useRef, useState } from 'react'
import { Zap } from 'lucide-react'
import type { OscMessage } from '@shared/types'
import { cn } from '@renderer/lib/utils'
import { useOscSurface, type OscWidget } from './store'
import { clamp, clamp01, fmsg, type Nova, type SendFn, type SendMany } from './oscShared'

/* ------------------------- Bedienelement: Fader ------------------------- */

export function Fader({
  w,
  onSend,
  onNova
}: {
  w: OscWidget
  onSend: SendFn
  onNova?: Nova
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const raf = useRef(0)
  const pending = useRef<number | null>(null)
  const start = useRef<{ p: number; v: number } | null>(null)
  const horiz = w.orient === 'h'
  const isNova = w.target === 'nova'
  const lo = Math.min(w.min, w.max)
  const hi = Math.max(w.min, w.max)
  const span = hi - lo
  const norm = span > 0 ? clamp01((w.value - lo) / span) : 0

  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  function flush(): void {
    raf.current = 0
    if (pending.current == null) return
    const v = pending.current
    pending.current = null
    useOscSurface.getState().updateWidget(w.id, { value: v })
    if (isNova) onNova?.(w, v)
    else onSend(fmsg(w.address, v))
  }
  // Relativ: ab dem Anfasspunkt ziehen (kein Sprung auf den Klickwert).
  function drag(client: number): void {
    const el = ref.current
    const st = start.current
    if (!el || !st) return
    const r = el.getBoundingClientRect()
    const dNorm = horiz ? (client - st.p) / r.width : -(client - st.p) / r.height
    pending.current = clamp(st.v + dNorm * span, lo, hi)
    if (!raf.current) raf.current = requestAnimationFrame(flush)
  }

  return (
    <div
      ref={ref}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        start.current = { p: horiz ? e.clientX : e.clientY, v: w.value }
      }}
      onPointerMove={(e) => {
        if (e.buttons) drag(horiz ? e.clientX : e.clientY)
      }}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId)
        start.current = null
      }}
      className={cn(
        'relative h-full w-full touch-none overflow-hidden rounded-md bg-muted/50',
        horiz ? 'cursor-ew-resize' : 'cursor-ns-resize'
      )}
    >
      {horiz ? (
        <>
          <div
            className="absolute inset-y-0 left-0"
            style={{ width: `${norm * 100}%`, background: w.color, opacity: 0.85 }}
          />
          <div className="absolute inset-y-0" style={{ left: `${norm * 100}%` }}>
            <div className="h-full w-0.5 bg-foreground/80" />
          </div>
        </>
      ) : (
        <>
          <div
            className="absolute inset-x-0 bottom-0"
            style={{ height: `${norm * 100}%`, background: w.color, opacity: 0.85 }}
          />
          <div className="absolute inset-x-0" style={{ bottom: `${norm * 100}%` }}>
            <div className="h-0.5 w-full bg-foreground/80" />
          </div>
        </>
      )}
      <span className="absolute inset-x-0 bottom-1 text-center text-[11px] tabular-nums text-foreground/90">
        {isNova ? `${Math.round(w.value)} %` : w.value.toFixed(2)}
      </span>
    </div>
  )
}

/* -------------------------- Bedienelement: Poti ------------------------- */

// Drehknopf/Poti: vertikal ziehen ändert den Wert. Absolut (min..max) oder als
// Endlos-Encoder (sendet relative Schritte = onValue je „Rastung").
export function Knob({ w, onSend }: { w: OscWidget; onSend: SendFn }): JSX.Element {
  const lo = Math.min(w.min, w.max)
  const hi = Math.max(w.min, w.max)
  const span = hi - lo || 1
  const norm = w.endless ? 0.5 : clamp01((w.value - lo) / span)
  const start = useRef<{ py: number; v: number; acc: number } | null>(null)
  const step = Math.abs(w.onValue) || 1
  // Zifferblatt: 270°-Bogen von -135° bis +135°.
  const ang = -135 + norm * 270
  const dialRef = useRef<SVGSVGElement>(null)

  function drag(clientY: number): void {
    const st = start.current
    if (!st) return
    const dNorm = -(clientY - st.py) / 140 // 140 px = ganzer Bereich
    if (w.endless) {
      // relative Schritte beim Überschreiten je 1/20 des Bereichs
      const acc = st.acc + dNorm
      const detents = Math.trunc(acc / 0.05)
      if (detents !== 0) {
        st.acc = acc - detents * 0.05
        st.py = clientY
        const d = detents > 0 ? step : -step
        for (let i = 0; i < Math.abs(detents); i++) onSend(fmsg(w.address, d))
      }
    } else {
      const v = clamp(st.v + dNorm * span, lo, hi)
      useOscSurface.getState().updateWidget(w.id, { value: v })
      onSend(fmsg(w.address, v))
    }
  }

  return (
    <div
      className="flex h-full w-full touch-none items-center justify-center"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        start.current = { py: e.clientY, v: w.value, acc: 0 }
      }}
      onPointerMove={(e) => {
        if (e.buttons) drag(e.clientY)
      }}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId)
        start.current = null
      }}
    >
      <svg
        ref={dialRef}
        viewBox="0 0 100 100"
        className="h-full max-h-full w-auto cursor-ns-resize"
      >
        <circle
          cx="50"
          cy="50"
          r="40"
          fill="none"
          stroke="currentColor"
          className="text-muted-foreground/25"
          strokeWidth="3"
        />
        <circle
          cx="50"
          cy="50"
          r="32"
          fill="none"
          stroke={w.color}
          strokeWidth="2.5"
          opacity="0.7"
        />
        <line
          x1="50"
          y1="50"
          x2={50 + 34 * Math.cos(((ang - 90) * Math.PI) / 180)}
          y2={50 + 34 * Math.sin(((ang - 90) * Math.PI) / 180)}
          stroke={w.color}
          strokeWidth="4"
          strokeLinecap="round"
        />
        {!w.endless && (
          <text
            x="50"
            y="92"
            textAnchor="middle"
            className="fill-foreground/80"
            style={{ fontSize: 13 }}
          >
            {w.value.toFixed(2)}
          </text>
        )}
      </svg>
    </div>
  )
}

/* ------------------------- Bedienelement: Schalter ---------------------- */

export function Toggle({
  w,
  onSend,
  onNova
}: {
  w: OscWidget
  onSend: SendFn
  onNova?: Nova
}): JSX.Element {
  const on = w.value >= 0.5
  return (
    <button
      type="button"
      onClick={() => {
        const next = on ? 0 : 1
        useOscSurface.getState().updateWidget(w.id, { value: next })
        if (w.target === 'nova') onNova?.(w, next)
        else onSend(fmsg(w.address, next ? w.onValue : w.offValue))
      }}
      className="flex h-full w-full items-center justify-center rounded-md border text-sm font-semibold transition-colors"
      style={{
        borderColor: w.color,
        background: on ? w.color : 'transparent',
        color: on ? '#fff' : undefined
      }}
    >
      {on ? 'AN' : 'AUS'}
    </button>
  )
}

/* ------------------------- Bedienelement: Taster ------------------------ */

export function Momentary({
  w,
  onSend,
  onNova
}: {
  w: OscWidget
  onSend: SendFn
  onNova?: Nova
}): JSX.Element {
  const [pressed, setPressed] = useState(false)
  const isNova = w.target === 'nova'
  function release(): void {
    if (!pressed) return
    setPressed(false)
    // NovaStar-Taster feuern die Aktion beim Druck (kein „Loslassen"-Wert).
    if (!isNova) onSend(fmsg(w.address, w.offValue))
  }
  return (
    <button
      type="button"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        setPressed(true)
        if (isNova) onNova?.(w, 1)
        else onSend(fmsg(w.address, w.onValue))
      }}
      onPointerUp={release}
      onPointerCancel={release}
      className="flex h-full w-full items-center justify-center rounded-md border text-sm font-semibold transition-transform active:scale-[0.98]"
      style={{ borderColor: w.color, background: pressed ? w.color : 'transparent' }}
    >
      {isNova && w.nova.fn === 'brightnessSet' ? (
        <span style={{ color: pressed ? '#fff' : w.color }}>{Math.round(w.nova.value)} %</span>
      ) : isNova && w.nova.fn === 'brightnessStep' ? (
        <span style={{ color: pressed ? '#fff' : w.color }}>
          {w.nova.value >= 0 ? '+' : '−'}
          {Math.abs(Math.round(w.nova.value))} %
        </span>
      ) : (
        <Zap className="size-7" style={{ color: pressed ? '#fff' : w.color }} />
      )}
    </button>
  )
}

/* ------------------------- Bedienelement: Auswahl ----------------------- */

// 1-aus-n: Tippen sendet die Adresse der Option (Fallback: Widget-Adresse) mit
// ihrem Wert; die zuletzt gewählte Option bleibt markiert (value = Index).
export function SelectPad({
  w,
  onSend,
  onNova
}: {
  w: OscWidget
  onSend: SendFn
  onNova?: Nova
}): JSX.Element {
  const sel = Math.round(w.value)
  const cols = w.cols >= 1 ? w.cols : 1
  return (
    <div
      className="grid h-full w-full gap-1"
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridAutoRows: '1fr' }}
    >
      {w.items.map((it, i) => {
        const active = i === sel
        return (
          <button
            key={i}
            type="button"
            onClick={() => {
              useOscSurface.getState().updateWidget(w.id, { value: i })
              if (w.target === 'nova') onNova?.(w, it.value)
              else onSend(fmsg(it.address || w.address, it.value))
            }}
            className="flex min-h-0 items-center justify-center overflow-hidden rounded-md border px-1 text-sm font-medium transition-colors"
            style={{
              borderColor: w.color,
              background: active ? w.color : 'transparent',
              color: active ? '#fff' : undefined
            }}
          >
            <span className="truncate">{it.label || `Option ${i + 1}`}</span>
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------- Bedienelement: XY-Pad ------------------------ */
// Relativ: der Klickpunkt verschiebt NICHT auf den Wert; gezogen wird ab der
// aktuellen Position (Delta zum Anfasspunkt).

export function XYPad({ w, onSendMany }: { w: OscWidget; onSendMany: SendMany }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const raf = useRef(0)
  const pend = useRef<{ x: number; y: number } | null>(null)
  const start = useRef<{ px: number; py: number; vx: number; vy: number } | null>(null)

  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  function flush(): void {
    raf.current = 0
    if (!pend.current) return
    const { x, y } = pend.current
    pend.current = null
    useOscSurface.getState().updateWidget(w.id, { x, y })
    const msgs: OscMessage[] = [fmsg(w.address, x)]
    if (w.addressY) msgs.push(fmsg(w.addressY, y))
    onSendMany(msgs)
  }
  function drag(clientX: number, clientY: number): void {
    const el = ref.current
    const st = start.current
    if (!el || !st) return
    const r = el.getBoundingClientRect()
    const dx = (clientX - st.px) / r.width
    const dy = -(clientY - st.py) / r.height
    pend.current = { x: clamp01(st.vx + dx), y: clamp01(st.vy + dy) }
    if (!raf.current) raf.current = requestAnimationFrame(flush)
  }

  return (
    <div
      ref={ref}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        start.current = { px: e.clientX, py: e.clientY, vx: w.x, vy: w.y }
      }}
      onPointerMove={(e) => {
        if (e.buttons) drag(e.clientX, e.clientY)
      }}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId)
        start.current = null
      }}
      className="relative h-full w-full cursor-grab touch-none overflow-hidden rounded-md bg-muted/50 active:cursor-grabbing"
    >
      <div className="absolute inset-y-0" style={{ left: `${w.x * 100}%` }}>
        <div className="h-full w-px bg-foreground/25" />
      </div>
      <div className="absolute inset-x-0" style={{ top: `${(1 - w.y) * 100}%` }}>
        <div className="h-px w-full bg-foreground/25" />
      </div>
      <div
        className="absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
        style={{ left: `${w.x * 100}%`, top: `${(1 - w.y) * 100}%`, background: w.color }}
      />
    </div>
  )
}
