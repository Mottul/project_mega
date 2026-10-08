// Ein Element als Ebene der Vorschau-Bühne – mit DENSELBEN reinen Funktionen wie die Datei:
// Zeichenfläche (Deckfläche beim Füllen von Fotos, sonst die Ausgabe), Ken-Burns-Ausschnitt je
// Bild (kenBurnsRect), Einpassen mit Rändern/Blur-Rand in der Hintergrundfarbe. Videos laufen
// als <video> auf die Uhr der Vorschau synchronisiert; was Chromium nicht abspielen kann
// (ProRes, HAP …), zeigt das Vorschaubild am Startpunkt.

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { cn } from '@renderer/lib/utils'
import type { VgenElement } from '@shared/types'
import { baseWindow, kenBurnsRect, type VgenElementPlan, type VgenPlan } from '@shared/videoGenPlan'
import { useSourceUrl, useThumb } from './meta'

type Rect = { x: number; y: number; w: number; h: number }

/**
 * Lage der Zeichenfläche in der Bühne, damit genau `rect` (Anteile der Fläche) die Bühne füllt.
 * Grundgröße = Fläche beim Grundfenster, dann gleichmäßig skaliert (der Ausschnitt hat immer
 * das Seitenverhältnis der Ausgabe) – per transform, damit langsame Fahrten subpixelgenau laufen.
 */
export function canvasStyle(
  canvas: { width: number; height: number },
  out: { width: number; height: number },
  rect: Rect
): CSSProperties {
  const base = baseWindow(canvas, out)
  const s = base.w / rect.w
  return {
    position: 'absolute',
    left: 0,
    top: 0,
    width: `${100 / base.w}%`,
    height: `${100 / base.h}%`,
    transformOrigin: '0 0',
    transform: `translate(${-s * rect.x * 100}%, ${-s * rect.y * 100}%) scale(${s})`
  }
}

/** Ausschnitt eines Elements im Bild `local` (ohne Ken Burns: das Grundfenster). */
export function rectAt(ep: VgenElementPlan, plan: VgenPlan, local: number): Rect {
  if (ep.kenBurns) return kenBurnsRect(ep.kenBurns, ep.frames > 1 ? local / (ep.frames - 1) : 0)
  return baseWindow(ep.canvas, { width: plan.width, height: plan.height })
}

export function ElementLayer({
  el,
  ep,
  plan,
  local,
  playing,
  volume,
  style,
  sourceTime
}: {
  el: VgenElement
  ep: VgenElementPlan
  plan: VgenPlan
  /** Bild im Element */
  local: number
  playing: boolean
  /** Originalton 0..1 (0 = stumm) */
  volume: number
  /** Übergang (Deckkraft, Verschiebung, Maske) */
  style?: CSSProperties
  /** statt der Zeitachse: Zeitpunkt in der Quelle (Bereichsregler) */
  sourceTime?: number
}): JSX.Element {
  const out = { width: plan.width, height: plan.height }
  const rect = rectAt(ep, plan, local)
  const bg = plan.background.replace(/^0x/, '#')
  const time = sourceTime ?? ep.inSec + local / plan.fps
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: bg, ...style }}>
      <div style={canvasStyle(ep.canvas, out, rect)}>
        <CanvasContent
          el={el}
          ep={ep}
          time={time}
          playing={playing && sourceTime === undefined}
          volume={volume}
        />
      </div>
    </div>
  )
}

/**
 * Inhalt der Zeichenfläche (füllt ihren Behälter): beim Füllen eines Fotos das Foto selbst,
 * sonst das Ausgabebild mit eingepasstem Inhalt (Ränder bzw. Blur-Rand, Hintergrund außen).
 */
export function CanvasContent({
  el,
  ep,
  time,
  playing,
  volume
}: {
  el: VgenElement
  ep: VgenElementPlan
  time: number
  playing: boolean
  volume: number
}): JSX.Element {
  if (ep.fit === 'crop' && ep.kind === 'image') return <Picture el={el} className="size-full" />
  return (
    <>
      {ep.fit === 'blur' && (
        // Blur-Rand: Vorschaubild genügt (die Datei rechnet ihn aus dem verkleinerten Bild)
        <Picture
          el={el}
          still
          className="absolute inset-0 size-full scale-110 object-cover blur-md"
        />
      )}
      {el.kind === 'video' ? (
        <VideoPicture
          el={el}
          time={time}
          playing={playing}
          volume={volume}
          className={ep.fit === 'crop' ? 'object-cover' : 'object-contain'}
        />
      ) : (
        <Picture
          el={el}
          className={cn(
            'absolute inset-0 size-full',
            ep.fit === 'crop' ? 'object-cover' : 'object-contain'
          )}
        />
      )}
    </>
  )
}

/** Bild bzw. GIF (animiert über die Quelle); `still`: immer das Vorschaubild. */
function Picture({
  el,
  className,
  still = false
}: {
  el: VgenElement
  className: string
  still?: boolean
}): JSX.Element {
  const { ref, url } = useThumb(el.path, el.kind === 'video' ? (el.inSec ?? 0) : null, 960)
  const gif = useSourceUrl(el.kind === 'gif' && !still ? el.path : null)
  const src = gif || url
  return (
    <div ref={ref} className={cn('absolute inset-0', still && 'overflow-hidden')}>
      {src && <img src={src} alt="" draggable={false} className={className} />}
    </div>
  )
}

/**
 * Video der Bühne: folgt der Uhr der Vorschau (springt erst ab 0,3 s Abweichung, sonst ruckelt
 * es); bis das erste Bild da ist bzw. wenn Chromium die Datei nicht abspielt, das Vorschaubild.
 */
function VideoPicture({
  el,
  time,
  playing,
  volume,
  className
}: {
  el: VgenElement
  time: number
  playing: boolean
  volume: number
  className: string
}): JSX.Element {
  const src = useSourceUrl(el.path)
  const ref = useRef<HTMLVideoElement>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  // Vorschaubild auf halbe Sekunden gerundet: sonst ein neues Bild je Ruckbewegung
  const stillAt = playing || !failed ? (el.inSec ?? 0) : Math.round(time * 2) / 2
  const { ref: thumbRef, url } = useThumb(el.path, stillAt, 960)

  useEffect(() => {
    const v = ref.current
    if (!v) return
    v.volume = Math.min(1, Math.max(0, volume))
    v.muted = volume <= 0
  }, [volume])

  useEffect(() => {
    const v = ref.current
    if (!v || !ready) return
    if (playing) {
      if (Math.abs(v.currentTime - time) > 0.3) v.currentTime = time
      if (v.paused) void v.play().catch(() => {})
    } else {
      if (!v.paused) v.pause()
      if (Math.abs(v.currentTime - time) > 0.02) v.currentTime = time
    }
  }, [time, playing, ready])

  return (
    <div ref={thumbRef} className="absolute inset-0">
      {url && (!ready || failed) && (
        <img
          src={url}
          alt=""
          draggable={false}
          className={cn('absolute inset-0 size-full', className)}
        />
      )}
      {src && !failed && (
        <video
          ref={ref}
          src={src}
          preload="auto"
          playsInline
          onLoadedData={() => setReady(true)}
          onError={() => setFailed(true)}
          className={cn('absolute inset-0 size-full', className)}
          style={{ opacity: ready ? 1 : 0 }}
        />
      )}
    </div>
  )
}
