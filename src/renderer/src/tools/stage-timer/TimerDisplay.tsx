// Die eigentliche Bühnen-Anzeige: riesige Ziffern auf Schwarz, Farbe nach
// Restzeit (weiß -> gelb -> rot -> rot blinkend bei Überziehung), Fortschritts-
// balken, optional kleine Uhrzeit, Nachrichten-Banner. Wird identisch in der
// kleinen In-App-Vorschau UND im Vollbild-Ausgabefenster gerendert; die
// Schriftgrößen skalieren über die gemessene Containergröße.

import { useEffect, useRef, useState } from 'react'
import type { StageTimerState } from '@shared/types'
import { fmtClock, fmtTimer } from './format'

function useElementSize(): { ref: React.RefObject<HTMLDivElement>; w: number; h: number } {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])
  return { ref, w: size.w, h: size.h }
}

/** Tickende Uhrzeit (lokal, sekundengenau – braucht kein IPC). */
export function useClockNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    // Auf den Sekundenwechsel synchronisieren -> Anzeige springt exakt im Takt.
    let t: ReturnType<typeof setTimeout>
    const tick = (): void => {
      setNow(new Date())
      t = setTimeout(tick, 1000 - (Date.now() % 1000) + 5)
    }
    tick()
    return () => clearTimeout(t)
  }, [])
  return now
}

interface Props {
  state: StageTimerState
  remainingSec: number
}

export function TimerDisplay({ state, remainingSec }: Props): JSX.Element {
  const { ref, w, h } = useElementSize()
  const now = useClockNow()
  const seg = state.current >= 0 ? state.segments[state.current] : null
  const nextSeg = state.current >= 0 ? state.segments[state.current + 1] : state.segments[0]

  const phase =
    remainingSec < 0
      ? 'overtime'
      : remainingSec <= state.alertSec
        ? 'alert'
        : remainingSec <= state.warnSec
          ? 'warn'
          : 'ok'
  const color = phase === 'ok' ? '#ffffff' : phase === 'warn' ? '#eab308' : '#ef4444'

  // Schriftgröße aus Containermaß + Textlänge (Vorschau und Vollbild identisch).
  const mainText = state.displayMode === 'clock' ? fmtClock(now) : seg ? fmtTimer(remainingSec) : '--:--'
  const mainFs = Math.min((w / Math.max(4, mainText.length)) * 1.55, h * 0.42)
  const smallFs = Math.max(11, Math.min(w / 30, h / 14))

  const progress =
    seg && seg.durationSec > 0 ? Math.max(0, Math.min(1, remainingSec / seg.durationSec)) : 0

  return (
    <div
      ref={ref}
      className="absolute inset-0 overflow-hidden"
      style={{
        background: '#000',
        animation:
          phase === 'overtime' && state.displayMode === 'timer'
            ? 'timer-bg-flash 1s steps(1) infinite'
            : undefined
      }}
    >
      {state.displayMode === 'clock' ? (
        <div className="flex h-full flex-col items-center justify-center">
          <div
            className="font-bold leading-none"
            style={{ fontSize: mainFs, color: '#fff', fontVariantNumeric: 'tabular-nums' }}
          >
            {mainText}
          </div>
          <div className="mt-[2%] text-neutral-400" style={{ fontSize: smallFs * 1.3 }}>
            {now.toLocaleDateString('de-AT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>
      ) : (
        <>
          {/* Kopfzeile: Abschnitt links, Uhrzeit rechts */}
          <div className="absolute left-0 right-0 top-0 flex items-start justify-between p-[2.5%]">
            <span className="font-semibold text-neutral-300" style={{ fontSize: smallFs * 1.25 }}>
              {seg?.label ?? 'Kein Abschnitt'}
            </span>
            {state.showClockInTimer && (
              <span className="text-neutral-500" style={{ fontSize: smallFs * 1.25, fontVariantNumeric: 'tabular-nums' }}>
                {fmtClock(now)}
              </span>
            )}
          </div>

          {/* Hauptziffern */}
          <div className="flex h-full items-center justify-center">
            <span
              className="font-bold leading-none"
              style={{ fontSize: mainFs, color, fontVariantNumeric: 'tabular-nums' }}
            >
              {mainText}
            </span>
          </div>

          {/* Fußzeile: nächster Abschnitt + Fortschritt */}
          <div className="absolute bottom-0 left-0 right-0">
            {!state.message &&
              nextSeg &&
              state.current < state.segments.length - (state.current >= 0 ? 1 : 0) && (
                <p className="px-[2.5%] pb-[1%] text-neutral-500" style={{ fontSize: smallFs }}>
                  Danach: {nextSeg.label} ({fmtTimer(nextSeg.durationSec)})
                </p>
              )}
            <div className="h-[1.2%] min-h-[3px] w-full bg-neutral-900">
              <div
                className="h-full transition-[width] duration-200 ease-linear"
                style={{ width: `${progress * 100}%`, background: color }}
              />
            </div>
          </div>
        </>
      )}

      {/* Nachricht an die Bühne – sitzt ganz unten (über dem Fortschrittsbalken),
          deckt nichts vom Timer ab; der „Danach“-Hinweis weicht ihr. */}
      {state.message && (
        <div
          key={state.message.seq}
          className="absolute inset-x-[3%] bottom-[3.5%] rounded-xl border-2 px-[3%] py-[1.8%] text-center"
          style={{
            background: 'rgba(234,179,8,0.97)',
            borderColor: '#fff',
            animation: state.message.flash ? 'timer-flash 0.8s steps(1) infinite' : undefined
          }}
        >
          <span className="font-bold text-black" style={{ fontSize: Math.max(14, Math.min(w / 18, h / 7)) }}>
            {state.message.text}
          </span>
        </div>
      )}
    </div>
  )
}
