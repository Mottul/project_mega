// Frontansicht der Wand (Vorschau in der Arbeitsfläche): wo die 16:9-Nutzfläche und die
// schwarzen Balken liegen, wo die Standfüße stehen und wie groß eine Rasterzelle der
// Verkabelung werden darf. Rein und getestet (front.test.ts) – die Komponente zeichnet nur.

import type { Fit169 } from './math'

/** Rechteck als Anteil der Wand (0..1), Ursprung oben links */
export interface Frac {
  x: number
  y: number
  w: number
  h: number
}

export interface FrontAreas {
  /** 16:9-Nutzfläche; null = keine Angabe (Wand ohne Pixel) */
  content: Frac | null
  /** schwarze Ränder neben bzw. über/unter der Nutzfläche */
  bars: Frac[]
  /** 16:9 füllt die Wand exakt */
  exact: boolean
}

/** Nutzfläche und Balken aus der 16:9-Einpassung (Pixel) als Anteile der Wand. */
export function frontAreas(resX: number, resY: number, fit: Fit169 | null): FrontAreas {
  if (!fit || !resX || !resY) return { content: null, bars: [], exact: false }
  if (fit.match) return { content: { x: 0, y: 0, w: 1, h: 1 }, bars: [], exact: true }
  const bar = fit.barPx ?? 0
  if (fit.side === 'lr') {
    const b = bar / resX
    return {
      content: { x: b, y: 0, w: (fit.cw ?? resX) / resX, h: 1 },
      bars:
        b > 0
          ? [
              { x: 0, y: 0, w: b, h: 1 },
              { x: 1 - b, y: 0, w: b, h: 1 }
            ]
          : [],
      exact: false
    }
  }
  const b = bar / resY
  return {
    content: { x: 0, y: b, w: 1, h: (fit.ch ?? resY) / resY },
    bars:
      b > 0
        ? [
            { x: 0, y: 0, w: 1, h: b },
            { x: 0, y: 1 - b, w: 1, h: b }
          ]
        : [],
    exact: false
  }
}

/** Mitten der Standfüße als Anteil der Wandbreite: gleichmäßig verteilt, je Fuß ein Feld. */
export function footPositions(count: number): number[] {
  const n = Math.max(0, Math.floor(count))
  return Array.from({ length: n }, (_, i) => (i + 0.5) / n)
}

/** Kopfzeile/-spalte des Verkabelungsrasters (S1 …, Z1 …) in px */
export const GRID_HEADER = 22
/** Abstand zwischen den Zellen in px */
export const GRID_GAP = 2

/**
 * Kantenlänge einer Rasterzelle (px): so groß, dass das ganze Raster samt Kopfzeile und
 * -spalte in die Fläche passt – begrenzt, damit kleine Wände nicht riesig und große Wände
 * noch anklickbar bleiben (dann scrollt das Raster). Höhe 0 = unbekannt, nur die Breite zählt.
 */
export function gridCellSize(
  availW: number,
  availH: number,
  cols: number,
  rows: number,
  min = 18,
  max = 64
): number {
  const c = Math.max(1, cols)
  const r = Math.max(1, rows)
  const fit = (avail: number, n: number): number =>
    Math.floor((avail - GRID_HEADER - GRID_GAP * (n + 1)) / n)
  const byW = availW > 0 ? fit(availW, c) : max
  const byH = availH > 0 ? fit(availH, r) : max
  return Math.max(min, Math.min(max, byW, byH))
}
