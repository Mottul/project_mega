// Laufschrift-Streifen des LED-Trailers (unterste Modulreihe). Läuft in ALLEN
// Wiedergabe-Kontexten (Vorschau, Vollbild-Ausgabe, NDI-Spiegel), da er Teil der
// PlaybackEngine-Komposition ist. Tempo ist in WAND-Pixeln definiert und wird
// über das Größenverhältnis des Streifens umgerechnet -> auf dem LED läuft der
// Text exakt mit den eingestellten px/s, in der kleinen Vorschau entsprechend
// langsamer. Bewusst Inline-Styles (Farben kommen vom Nutzer, kein Theme).

import { useEffect, useRef, useState } from 'react'
import type { PlayerTickerState } from '@shared/types'

export function TickerStrip({ ticker }: { ticker: PlayerTickerState }): JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const trackRef = useRef<HTMLDivElement | null>(null)
  const blockRef = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [blockW, setBlockW] = useState(0)

  // Streifen- und Sichtfenstergröße beobachten (Ausgabe/Vorschau skalieren frei).
  useEffect(() => {
    const root = rootRef.current
    const vp = viewportRef.current
    if (!root || !vp) return
    const measure = (): void => setSize({ w: vp.clientWidth, h: root.clientHeight })
    const ro = new ResizeObserver(measure)
    ro.observe(root)
    ro.observe(vp)
    measure()
    return () => ro.disconnect()
  }, [])

  const fontPx = Math.max(8, Math.round(size.h * 0.68))
  const text = ticker.text.trim()
  const logoScrolls = ticker.logoMode === 'scroll' && !!ticker.logoUrl
  const logoFixed = ticker.logoMode === 'fixed' && !!ticker.logoUrl
  const hasContent = !!text || logoScrolls

  // Breite eines Inhaltsblocks messen (nach Text-/Logo-/Größenänderung).
  useEffect(() => {
    setBlockW(blockRef.current?.offsetWidth ?? 0)
  }, [text, ticker.logoUrl, ticker.logoMode, fontPx, size.w])

  // Endlos-Marquee: ein RAF-Ticker verschiebt den Track; nach einer Blockbreite
  // wird zurückgesetzt (die Blöcke wiederholen sich -> nahtlos).
  useEffect(() => {
    if (!hasContent || blockW <= 0 || size.w <= 0) return
    const el = trackRef.current
    if (!el) return
    // px/s auf dem LED -> px/s auf dem (skalierten) Streifen.
    const scale = ticker.heightPx > 0 ? size.h / ticker.heightPx : 1
    const v = Math.max(1, ticker.speed * scale)
    let raf = 0
    let last = performance.now()
    let offset = 0
    const step = (now: number): void => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      offset -= v * dt
      if (offset <= -blockW) offset += blockW
      el.style.transform = `translate3d(${offset}px,0,0)`
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [hasContent, blockW, size.w, size.h, ticker.speed, ticker.heightPx])

  // Genug Wiederholungen, um das Sichtfenster lückenlos zu füllen.
  const repeats = blockW > 0 ? Math.max(2, Math.ceil(size.w / blockW) + 1) : 2

  const block = (withRef: boolean, key: number): JSX.Element => (
    <div
      key={key}
      ref={withRef ? blockRef : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: Math.round(fontPx * 0.55),
        paddingRight: Math.round(fontPx * 1.4)
      }}
    >
      {logoScrolls && (
        <img
          src={ticker.logoUrl ?? undefined}
          alt=""
          style={{ height: Math.round(size.h * 0.76), width: 'auto', display: 'block' }}
        />
      )}
      {text && <span style={{ whiteSpace: 'pre' }}>{text}</span>}
    </div>
  )

  return (
    <div
      ref={rootRef}
      style={{
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: ticker.bg,
        color: ticker.color,
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        fontWeight: 700,
        fontSize: fontPx,
        lineHeight: 1
      }}
    >
      {logoFixed && (
        <img
          src={ticker.logoUrl ?? undefined}
          alt=""
          style={{
            height: Math.round(size.h * 0.76),
            width: 'auto',
            display: 'block',
            flex: '0 0 auto',
            margin: `0 ${Math.round(fontPx * 0.5)}px`
          }}
        />
      )}
      <div
        ref={viewportRef}
        style={{ position: 'relative', flex: '1 1 auto', height: '100%', overflow: 'hidden' }}
      >
        {hasContent && (
          <div
            ref={trackRef}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              height: '100%',
              display: 'inline-flex',
              alignItems: 'center',
              whiteSpace: 'nowrap',
              willChange: 'transform'
            }}
          >
            {Array.from({ length: repeats }, (_x, i) => block(i === 0, i))}
          </div>
        )}
      </div>
    </div>
  )
}
