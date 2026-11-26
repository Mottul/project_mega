// Rahmen für die Bilder im Feld „Vorschau“ (Live, Ken-Burns-Rahmen, gerechnete Vorschau) – wie die
// Bühne des Video-Players: so breit wie das Feld und so hoch, wie das Seitenverhältnis verlangt.
// Fehlt im Feld die Höhe (Aufträge darunter, Ausschnitt eines Videos), schrumpft der Rahmen, und
// der Kasten darin passt sich ein (Container-Einheiten, keine Messung) – Transport und Ausschnitt
// darunter bleiben ganz sichtbar, freier Platz bleibt unten im Feld. Freie Höhe bekommt der
// Rahmen nie: Sonst schwebte das Bild in großen Fenstern mitten im Feld (Skill review-checkliste,
// „Raster und SVG“). Nie höher als 60 % des Fensters – ein Hochkant-Video füllte in der Stufe
// schmal sonst den ganzen Bildschirm.

import type { CSSProperties, ReactNode } from 'react'

export function Rahmen({
  verhaeltnis,
  children
}: {
  verhaeltnis: number
  children: ReactNode
}): JSX.Element {
  return (
    <div
      className="flex max-h-[60vh] min-h-20 w-full shrink items-center justify-center [container-type:size]"
      style={{ aspectRatio: verhaeltnis }}
    >
      {children}
    </div>
  )
}

/** Kasten im Rahmen: so groß, wie Breite und Höhe des Rahmens im Seitenverhältnis erlauben */
export function kastenStil(verhaeltnis: number): CSSProperties {
  return { aspectRatio: verhaeltnis, width: `min(100cqw, calc(100cqh * ${verhaeltnis}))` }
}

/** Seitenverhältnis aus Breite und Höhe; kaputte Werte ergeben 16 : 9 */
export function verhaeltnisAus(breite: number, hoehe: number): number {
  return breite > 0 && hoehe > 0 ? breite / hoehe : 16 / 9
}
