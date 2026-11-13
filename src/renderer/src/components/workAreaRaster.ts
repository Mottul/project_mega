// Aufbau einer Arbeitsfläche aus Feldern – rein und getestet (workAreaRaster.test.ts), genutzt
// von WorkArea.tsx: die Stufe aus der gemessenen Größe und das CSS-Raster je Stufe.
// Gemessen wird die Arbeitsfläche selbst, nicht das Fenster: So stimmt es auch mit angehefteter
// Schublade und im eigenen Fenster (Tailwinds sm:/lg: richten sich nach dem Fenster).

/**
 * - `breit`: genug Platz, um alle Felder nebeneinander zu stellen
 * - `mittel`: zwei Spalten
 * - `schmal`: eine Spalte, die Arbeitsfläche scrollt – auch, wenn sie zu niedrig ist
 */
export type Stufe = 'breit' | 'mittel' | 'schmal'

export interface Grenzen {
  /** ab dieser Breite `breit` */
  breit: number
  /** ab dieser Breite `mittel` */
  mittel: number
  /** darunter immer `schmal`: Felder, die in sich scrollen, brauchen etwas Höhe */
  hoehe: number
}

/** Vorgabe, nachgerechnet für den Video-Player (docs/PLAN-ARBEITSFLAECHE.md, „Platzregeln“) */
export const GRENZEN: Grenzen = { breit: 1180, mittel: 760, hoehe: 420 }

export function stufe(breite: number, hoehe: number, g: Grenzen = GRENZEN): Stufe {
  if (hoehe < g.hoehe || breite < g.mittel) return 'schmal'
  return breite >= g.breit ? 'breit' : 'mittel'
}

/** CSS-Raster einer Stufe; `areas` je Zeile die Namen der Felder (grid-template-areas). */
export interface Raster<F extends string = string> {
  columns: string
  rows: string
  areas: F[][]
}

/** Raster als Inline-Stil des Rasters */
export function rasterStil(r: Raster): {
  gridTemplateColumns: string
  gridTemplateRows: string
  gridTemplateAreas: string
} {
  return {
    gridTemplateColumns: r.columns,
    gridTemplateRows: r.rows,
    gridTemplateAreas: r.areas.map((zeile) => `"${zeile.join(' ')}"`).join(' ')
  }
}
