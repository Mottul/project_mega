// Vorschau: dieselbe HTML-Seite wie im PDF (seiten.ts), verkleinert auf die Breite des Platzes.
// Im Shadow DOM – eigene Styles, die der App nicht in die Quere kommen; Skripte gibt es in den
// Seiten ohnehin nicht (alles escaped). Kein iframe: die App-CSP bliebe sonst außen vor.

import { useEffect, useRef } from 'react'
import { useElementWidth } from '@renderer/lib/useElementWidth'

/** A4-Breite in CSS-Pixeln (210 mm bei 96 dpi) */
const A4_PX = 794

export function Vorschau({ css, html }: { css: string; html: string }): JSX.Element {
  const [measure, width] = useElementWidth<HTMLDivElement>()
  const host = useRef<HTMLDivElement | null>(null)
  const zoom = width > 0 ? Math.min(1, width / A4_PX) : 0.5

  useEffect(() => {
    const el = host.current
    if (!el) return
    const root = el.shadowRoot ?? el.attachShadow({ mode: 'open' })
    root.innerHTML = `<style>${css}
:host{display:block}
.blatt{width:${A4_PX}px;min-height:300px;padding:42px 44px;background:#fff;color:#1a1a1e;box-shadow:0 8px 24px -14px rgba(0,0,0,.6);border:1px solid #cfd3d8;zoom:${zoom}}
.blatt .kapitel+.kapitel{break-before:auto}
.blatt .deckblatt{min-height:0}
</style><div class="blatt">${html}</div>`
  }, [css, html, zoom])

  return (
    <div ref={measure} className="w-full">
      <div ref={host} data-testid="mini-manual-vorschau" />
    </div>
  )
}
