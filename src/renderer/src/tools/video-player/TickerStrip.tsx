// Laufschrift-Streifen des LED-Trailers (unterste Modulreihe). Läuft in ALLEN
// Wiedergabe-Kontexten (Vorschau, Vollbild-Ausgabe), da er Teil der
// PlaybackEngine-Komposition ist. Tempo ist in WAND-Pixeln definiert und wird
// über das Größenverhältnis des Streifens umgerechnet -> auf dem LED läuft der
// Text exakt mit den eingestellten px/s, in der kleinen Vorschau entsprechend
// langsamer. Bewusst Inline-Styles (Farben kommen vom Nutzer, kein Theme).
//
// Robustheit des Endlos-Laufs: Die Periodenbreite wird JEDEN FRAME live am DOM
// gemessen (getBoundingClientRect, subpixelgenau) statt einmalig in den State
// -- das Logo-<img> lädt asynchron und ändert die Blockbreite nachträglich; mit
// einer veralteten Breite setzte der Lauf zu früh zurück (Logo überlappte den
// Text, und beim Auslaufen verschwand der Rest vor dem Bildrand). Zusätzlich:
// width:max-content + flexShrink:0 (Flex kann nichts stauchen) und ein echter
// Modulo-Wrap (while), damit auch ein Breitensprung sauber normalisiert.

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

  // Blockbreite in den State spiegeln -- NUR für die Anzahl der Wiederholungen
  // (Kachelung); der Lauf selbst liest die Breite live im RAF.
  useEffect(() => {
    if (!hasContent) {
      setBlockW(0)
      return
    }
    const el = blockRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setBlockW(el.getBoundingClientRect().width))
    ro.observe(el)
    setBlockW(el.getBoundingClientRect().width)
    return () => ro.disconnect()
  }, [hasContent])

  // Endlos-Marquee: ein RAF-Ticker verschiebt den Track; nach einer PERIODE
  // (= live gemessene Blockbreite) wird per Modulo zurückgesetzt -> nahtlos,
  // auch wenn die Breite sich mitten im Lauf ändert (Logo fertig geladen).
  useEffect(() => {
    if (!hasContent || size.w <= 0) return
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
      const w = blockRef.current?.getBoundingClientRect().width ?? 0
      if (w > 1) {
        offset -= v * dt
        while (offset <= -w) offset += w
        el.style.transform = `translate3d(${offset}px,0,0)`
      }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [hasContent, size.w, size.h, ticker.speed, ticker.heightPx])

  // Genug Wiederholungen, um das Sichtfenster in jeder Phase lückenlos zu
  // füllen (sichtbar ist [0 .. w + Sichtbreite] des Tracks).
  const repeats = blockW > 1 ? Math.min(40, Math.max(2, Math.ceil(size.w / blockW) + 1)) : 2

  // Abstand VOR dem Logo (paddingRight des Vorgänger-Blocks) und NACH dem Logo
  // (gap zum Text) bewusst identisch -> das Logo sitzt mittig zwischen den
  // Textwiederholungen. Ohne Logo etwas mehr Luft zwischen den Wiederholungen.
  const sep = Math.round(fontPx * (logoScrolls ? 0.9 : 1.4))

  const block = (withRef: boolean, key: number): JSX.Element => (
    <div
      key={key}
      ref={withRef ? blockRef : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        flexShrink: 0,
        gap: sep,
        paddingRight: sep
      }}
    >
      {logoScrolls && (
        <img
          src={ticker.logoUrl ?? undefined}
          alt=""
          style={{
            height: Math.round(size.h * 0.76),
            width: 'auto',
            display: 'block',
            flexShrink: 0
          }}
        />
      )}
      {text && <span style={{ whiteSpace: 'pre', flexShrink: 0 }}>{text}</span>}
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
        // '' = System-Standard; sonst der im Stil gewählte Font-Stack.
        fontFamily: ticker.fontFamily || "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
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
              // max-content: der Track nimmt IMMER seine volle Inhaltsbreite an --
              // kein Shrink-to-fit der absoluten Positionierung, kein Stauchen.
              width: 'max-content',
              display: 'flex',
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
