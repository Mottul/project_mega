// Bedienelement Farbe: Farbfläche, Kanäle (RGB/HSV/Alpha) und Pipette.

import { useEffect, useRef } from 'react'
import { Pipette } from 'lucide-react'
import { useOscSurface, type OscWidget } from './store'
import {
  CHECKER,
  clamp01,
  HAS_EYEDROPPER,
  hexToRgb01,
  hsv2rgb,
  HUE_GRADIENT,
  rgb01ToHex,
  rgb2hsv,
  type SendFn
} from './oscShared'

/* ------------------------- Bedienelement: Farbe ------------------------- */
// Alle Parameter sind direkt sichtbar: Hue + R/G/B-Regler, Hex und Pipette.

export function ColorPad({ w, onSend }: { w: OscWidget; onSend: SendFn }): JSX.Element {
  const hex = rgb01ToHex(w.r, w.g, w.b)
  const hsv = rgb2hsv(w.r, w.g, w.b)
  const lum = 0.299 * w.r + 0.587 * w.g + 0.114 * w.b
  const rgba = `rgba(${Math.round(w.r * 255)}, ${Math.round(w.g * 255)}, ${Math.round(w.b * 255)}, ${w.a})`
  const hueAccent = (() => {
    const c = hsv2rgb(hsv.h, 1, 1)
    return rgb01ToHex(c.r, c.g, c.b)
  })()

  function emit(r: number, g: number, b: number, a: number): void {
    useOscSurface.getState().updateWidget(w.id, { r, g, b, a })
    onSend({
      address: w.address,
      args: [
        { type: 'f', value: r },
        { type: 'f', value: g },
        { type: 'f', value: b },
        { type: 'f', value: a }
      ]
    })
  }
  function setHue(h: number): void {
    const { r, g, b } = hsv2rgb(h, hsv.s, hsv.v)
    emit(r, g, b, w.a)
  }
  async function pickColor(): Promise<void> {
    const ED = (
      window as unknown as { EyeDropper?: new () => { open(): Promise<{ sRGBHex: string }> } }
    ).EyeDropper
    if (!ED) return
    try {
      const res = await new ED().open()
      const c = hexToRgb01(res.sRGBHex)
      emit(c.r, c.g, c.b, w.a)
    } catch {
      // abgebrochen
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5">
      {/* Farbanzeige füllt die verbleibende Widget-Höhe; Hex-Code mittig. */}
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center rounded border border-white/15 font-mono text-[11px] uppercase"
        style={{
          background: `linear-gradient(${rgba}, ${rgba}), ${CHECKER}`,
          color: lum > 0.55 ? '#000' : '#fff'
        }}
      >
        {hex}
        {HAS_EYEDROPPER && (
          <button
            type="button"
            onClick={() => void pickColor()}
            title="Pipette"
            className="absolute right-1 top-1 flex size-6 items-center justify-center rounded border border-white/20 bg-background/70 text-foreground/80 hover:bg-background hover:text-foreground"
          >
            <Pipette className="size-3.5" />
          </button>
        )}
      </div>

      <div className="space-y-2">
        {/* Alle Regler greifen relativ (kein Sprung auf den Klickpunkt). */}
        <ChannelRow
          letter="H"
          value={hsv.h / 360}
          accent={hueAccent}
          track={HUE_GRADIENT}
          onChange={(v) => setHue(v * 360)}
        />
        <ChannelRow
          letter="R"
          value={w.r}
          accent="#ef4444"
          onChange={(v) => emit(v, w.g, w.b, w.a)}
        />
        <ChannelRow
          letter="G"
          value={w.g}
          accent="#22c55e"
          onChange={(v) => emit(w.r, v, w.b, w.a)}
        />
        <ChannelRow
          letter="B"
          value={w.b}
          accent="#3b82f6"
          onChange={(v) => emit(w.r, w.g, v, w.a)}
        />
        <ChannelRow
          letter="A"
          value={w.a}
          accent="#cbd5e1"
          track={`linear-gradient(to right, transparent, ${hex}), ${CHECKER}`}
          onChange={(v) => emit(w.r, w.g, w.b, v)}
        />
      </div>
    </div>
  )
}

function ChannelRow({
  letter,
  value,
  accent,
  track,
  onChange
}: {
  letter: string
  value: number
  accent: string
  track?: string
  onChange: (v: number) => void
}): JSX.Element {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-3 shrink-0 text-[10px] font-medium text-muted-foreground">{letter}</span>
      <RelSlider value={value} accent={accent} track={track} onChange={onChange} />
    </div>
  )
}

// Horizontaler Regler mit RELATIVEM Greifen (wie Fader/XY): beim Antippen wird der
// Anfasspunkt gemerkt und ab dort gezogen, statt auf den Klickwert zu springen.
function RelSlider({
  value,
  onChange,
  accent,
  track
}: {
  value: number // 0..1
  onChange: (v: number) => void
  accent: string
  track?: string // optionaler Track-Hintergrund (z.B. Hue-Verlauf)
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const raf = useRef(0)
  const pending = useRef<number | null>(null)
  const start = useRef<{ px: number; v: number } | null>(null)

  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  function flush(): void {
    raf.current = 0
    if (pending.current == null) return
    const v = pending.current
    pending.current = null
    onChange(v)
  }
  function drag(clientX: number): void {
    const el = ref.current
    const st = start.current
    if (!el || !st) return
    const r = el.getBoundingClientRect()
    pending.current = clamp01(st.v + (clientX - st.px) / r.width)
    if (!raf.current) raf.current = requestAnimationFrame(flush)
  }
  const pct = clamp01(value) * 100

  return (
    <div
      ref={ref}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        start.current = { px: e.clientX, v: clamp01(value) }
      }}
      onPointerMove={(e) => {
        if (e.buttons) drag(e.clientX)
      }}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId)
        start.current = null
      }}
      className="relative h-4 w-full cursor-ew-resize touch-none overflow-hidden rounded"
      style={track ? { background: track } : undefined}
    >
      {!track && <div className="absolute inset-0 bg-muted/50" />}
      {!track && (
        <div
          className="absolute inset-y-0 left-0"
          style={{ width: `${pct}%`, background: accent, opacity: 0.45 }}
        />
      )}
      <div
        className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
        style={{ left: `${pct}%`, background: accent }}
      />
    </div>
  )
}
