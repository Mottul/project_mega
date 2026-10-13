// Bedienelement Bank: Raster aus Potis und Tasten mit gemeinsamer Adresse.

import { useRef, useState } from 'react'
import { useOscSurface, type OscItem, type OscWidget } from './store'
import { clamp, clamp01, fmsg, type SendFn } from './oscShared'

/* ------------------------- Bedienelement: Bank -------------------------- */

// Raster gleichartiger Felder; je nach bankMode Taster (momentan), Schalter
// (rastend) oder Drehknopf. Spalten frei wählbar (cols), Zeilen folgen aus der
// Anzahl. Jedes Feld feuert seine eigene Adresse (Fallback: Widget-Adresse).
export function BankGrid({ w, onSend }: { w: OscWidget; onSend: SendFn }): JSX.Element {
  const cols = w.cols >= 1 ? w.cols : Math.min(Math.max(1, w.items.length), 4)
  return (
    <div
      className="grid h-full w-full gap-1"
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridAutoRows: '1fr' }}
    >
      {w.items.map((it, i) => (
        <BankCell key={i} w={w} item={it} index={i} onSend={onSend} />
      ))}
    </div>
  )
}

function BankCell({
  w,
  item,
  index,
  onSend
}: {
  w: OscWidget
  item: OscItem
  index: number
  onSend: SendFn
}): JSX.Element {
  const addr = item.address || w.address
  const setItem = (value: number): void =>
    useOscSurface.getState().updateWidget(w.id, {
      items: w.items.map((x, i) => (i === index ? { ...x, value } : x))
    })

  if (w.bankMode === 'toggle') {
    const on = item.value >= 0.5
    return (
      <button
        type="button"
        onClick={() => {
          const next = on ? 0 : 1
          setItem(next)
          onSend(fmsg(addr, next ? w.onValue : w.offValue))
        }}
        className="flex min-h-0 items-center justify-center overflow-hidden rounded-md border px-1 text-sm font-semibold transition-colors"
        style={{
          borderColor: w.color,
          background: on ? w.color : 'transparent',
          color: on ? '#fff' : w.color
        }}
      >
        <span className="truncate">{item.label || index + 1}</span>
      </button>
    )
  }

  if (w.bankMode === 'knob') {
    return <BankKnob w={w} item={item} index={index} onSend={onSend} />
  }

  return <BankButton w={w} item={item} index={index} onSend={onSend} />
}

function BankKnob({
  w,
  item,
  index,
  onSend
}: {
  w: OscWidget
  item: OscItem
  index: number
  onSend: SendFn
}): JSX.Element {
  const lo = Math.min(w.min, w.max)
  const hi = Math.max(w.min, w.max)
  const span = hi - lo || 1
  const norm = clamp01((item.value - lo) / span)
  const ang = -135 + norm * 270
  const addr = item.address || w.address
  const start = useRef<{ py: number; v: number } | null>(null)
  function drag(clientY: number): void {
    const st = start.current
    if (!st) return
    const v = clamp(st.v + (-(clientY - st.py) / 140) * span, lo, hi)
    useOscSurface.getState().updateWidget(w.id, {
      items: w.items.map((x, i) => (i === index ? { ...x, value: v } : x))
    })
    onSend(fmsg(addr, v))
  }
  return (
    <div
      className="flex min-h-0 touch-none flex-col items-center justify-center"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        start.current = { py: e.clientY, v: item.value }
      }}
      onPointerMove={(e) => {
        if (e.buttons) drag(e.clientY)
      }}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId)
        start.current = null
      }}
    >
      <svg viewBox="0 0 100 100" className="min-h-0 w-auto flex-1 cursor-ns-resize">
        <circle
          cx="50"
          cy="50"
          r="40"
          fill="none"
          stroke="currentColor"
          className="text-muted-foreground/25"
          strokeWidth="4"
        />
        <line
          x1="50"
          y1="50"
          x2={50 + 34 * Math.cos(((ang - 90) * Math.PI) / 180)}
          y2={50 + 34 * Math.sin(((ang - 90) * Math.PI) / 180)}
          stroke={w.color}
          strokeWidth="5"
          strokeLinecap="round"
        />
      </svg>
      {item.label && (
        <span className="max-w-full truncate text-[10px] text-muted-foreground">{item.label}</span>
      )}
    </div>
  )
}

function BankButton({
  w,
  item,
  index,
  onSend
}: {
  w: OscWidget
  item: OscItem
  index: number
  onSend: SendFn
}): JSX.Element {
  const [pressed, setPressed] = useState(false)
  const addr = item.address || w.address
  function release(): void {
    if (!pressed) return
    setPressed(false)
    onSend(fmsg(addr, w.offValue))
  }
  return (
    <button
      type="button"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        setPressed(true)
        onSend(fmsg(addr, w.onValue))
      }}
      onPointerUp={release}
      onPointerCancel={release}
      className="flex min-h-0 items-center justify-center overflow-hidden rounded-md border px-1 text-sm font-semibold transition-transform active:scale-[0.98]"
      style={{
        borderColor: w.color,
        background: pressed ? w.color : 'transparent',
        color: pressed ? '#fff' : w.color
      }}
    >
      <span className="truncate">{item.label || index + 1}</span>
    </button>
  )
}
