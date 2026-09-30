// Marken-Logo der Mottulbox (Widderkopf, kräftige Variante). Aus der Zeichnung
// vektorisiert; Inkscape-Ballast und der eingebettete Foto-Scan sind entfernt.
// Die Pfaddaten liegen in mottulboxLogoData.ts (auch fürs Canvas-Zeichnen).
//
// Themetreu: Linien nutzen currentColor, folgen also der Textfarbe (hell/dunkel).
// Die Gesichtsfläche ist standardmäßig offen (transparent) und lässt sich über die
// CSS-Variable --logo-paper füllen. Feste Farben (z.B. Gold auf Dunkel fürs
// App-Icon) setzt der Aufrufer per color/--logo-paper.

import {
  LOGO_ASPECT,
  LOGO_HEAD_STROKE,
  LOGO_PARTS,
  LOGO_STROKE,
  LOGO_VIEWBOX
} from './mottulboxLogoData'

const VIEW_BOX = `${LOGO_VIEWBOX.x} ${LOGO_VIEWBOX.y} ${LOGO_VIEWBOX.width} ${LOGO_VIEWBOX.height}`

export function MottulboxLogo({
  height = 40,
  className,
  title = 'Mottulbox'
}: {
  /** Höhe in px; die Breite ergibt sich aus dem Seitenverhältnis. */
  height?: number
  className?: string
  /** Für Screenreader; leer lassen, wenn daneben schon der Name steht. */
  title?: string
}): JSX.Element {
  return (
    <svg
      viewBox={VIEW_BOX}
      height={height}
      width={Math.round(height * LOGO_ASPECT)}
      className={className}
      role={title ? 'img' : 'presentation'}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
    >
      <g fill="currentColor" stroke="currentColor" strokeWidth={LOGO_STROKE} strokeLinecap="round">
        {LOGO_PARTS.map((p, i) =>
          p.head ? (
            // Kopf: Fläche folgt --logo-paper (Standard: offen)
            <path key={i} d={p.d} fill="var(--logo-paper, none)" strokeWidth={LOGO_HEAD_STROKE} />
          ) : (
            <path key={i} d={p.d} />
          )
        )}
      </g>
    </svg>
  )
}
