// Anzeigen der OSC-Steuerung: Label und Meter (Wert, Text oder Restzeit des Videos).

import { useContext } from 'react'
import { cn } from '@renderer/lib/utils'
import type { OscWidget } from './store'
import { clamp01, fmtClock, VideoCtx, type VideoInfo } from './oscShared'

/* ------------------------- Anzeige: Label ------------------------------- */
// Reine Beschriftung/Überschrift (kein OSC). Textgröße wächst mit der Kachelhöhe.

export function LabelView({ w }: { w: OscWidget }): JSX.Element {
  const align =
    w.align === 'left'
      ? 'items-start text-left'
      : w.align === 'right'
        ? 'items-end text-right'
        : 'items-center text-center'
  return (
    <div className={cn('flex h-full w-full flex-col justify-center', align)}>
      <span
        className="font-semibold leading-tight"
        style={{ color: w.color, fontSize: Math.min(10 + w.ch * 6, 42) }}
      >
        {w.label || 'Überschrift'}
      </span>
    </div>
  )
}

/* ------------------------- Anzeige: Meter ------------------------------- */
// Zeigt einen Wert als Balken + Zahl. Quelle: eingehendes OSC-Feedback (Adresse)
// oder die Restzeit des laufenden Videos aus dem Video-Player.

export function meterReadout(w: OscWidget, video: VideoInfo): { level: number; text: string } {
  if (w.source === 'video') {
    if (video.remainingSec == null) return { level: 0, text: '–:––' }
    const level = video.durationSec > 0 ? clamp01(video.remainingSec / video.durationSec) : 0
    return { level, text: fmtClock(video.remainingSec) }
  }
  // Text-Quelle: zuletzt empfangenen OSC-String zeigen (kein Balken).
  if (w.source === 'text') return { level: 0, text: w.text || '–' }
  const lo = Math.min(w.min, w.max)
  const hi = Math.max(w.min, w.max)
  const level = hi > lo ? clamp01((w.value - lo) / (hi - lo)) : 0
  const text = Number.isInteger(w.value) ? String(w.value) : w.value.toFixed(2)
  return { level, text }
}

export function Meter({ w }: { w: OscWidget }): JSX.Element {
  const video = useContext(VideoCtx)
  const { level, text } = meterReadout(w, video)
  // Text-Quelle: nur den String zeigen (umbrechend, kein Balken).
  const isText = w.source === 'text'
  return (
    <div className="flex h-full w-full flex-col justify-center gap-1.5">
      <div
        className={cn(
          'text-center font-semibold leading-tight',
          isText ? 'break-words text-base' : 'text-lg leading-none tabular-nums'
        )}
        style={{ color: w.color }}
      >
        {text}
      </div>
      {!isText && (
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full transition-[width] duration-150"
            style={{ width: `${level * 100}%`, background: w.color }}
          />
        </div>
      )}
    </div>
  )
}
