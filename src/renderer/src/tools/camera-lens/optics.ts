// Rechenkern des Kameraobjektiv-Rechners (Lochkamera-Näherung) – von der UI getrennt, damit er
// sich ohne Fenster prüfen lässt. `lensView` rechnet alles, was der Rechner zeigt, und
// entscheidet, mit welchen Eingaben nicht gerechnet wird; die Komponente liest nur Text.

/** Vollformat-Diagonale (mm) als Bezug fürs Kleinbild-Äquivalent (≈ 43,27). */
export const FULL_FRAME_DIAG = Math.sqrt(36 * 36 + 24 * 24)

/** Diagonale aus Breite und Höhe. */
export function diag(w: number, h: number): number {
  return Math.sqrt(w * w + h * h)
}

/** Bildwinkel (Grad) für ein Sensormaß (mm) und eine Brennweite (mm). */
export function angleOfView(sensorMm: number, focalMm: number): number {
  return (2 * Math.atan(sensorMm / (2 * focalMm)) * 180) / Math.PI
}

/** Kleinbild-Äquivalent (mm) der effektiven Brennweite für eine Sensordiagonale. */
export function equiv35(focalEffMm: number, sensorDiagMm: number): number {
  return focalEffMm * (FULL_FRAME_DIAG / sensorDiagMm)
}

/** Sichtfeld (m) eines Sensormaßes (mm) bei Entfernung (m) und Brennweite (mm).
 *  Lochkamera-Näherung: Sichtfeld = Entfernung × Sensormaß ÷ Brennweite. */
export function fovAtDistance(distM: number, sensorMm: number, focalMm: number): number {
  return (distM * sensorMm) / focalMm
}

/** Eingaben, die rot sein können */
export type LensField = 'sensorW' | 'sensorH' | 'focal' | 'dist' | 'person'

export interface LensInput {
  /** Sensorbreite und -höhe in mm */
  sensorW: number | null
  sensorH: number | null
  /** Brennweite in mm */
  focal: number | null
  /** Faktor des Telekonverters (1 = keiner) */
  teleconverter: number
  /** Entfernung zur Person in m */
  dist: number | null
  /** Personengröße in m */
  person: number | null
}

export interface LensView {
  /** Brennweite mit Telekonverter in mm */
  focalEff: number | null
  /** Kleinbild-Äquivalent in mm */
  equiv: number | null
  /** Bildwinkel waagerecht und senkrecht in Grad */
  aovH: number | null
  aovV: number | null
  /** Sichtfeld in der Entfernung: Breite und Höhe in m */
  fovW: number | null
  fovH: number | null
  /** Rahmenhöhe in Personenhöhen (ab 1 passt die ganze Person) */
  ratio: number | null
  /** sichtbarer Anteil der Person in % (höchstens 100) */
  visiblePct: number | null
  /** Seitenverhältnis des Sensors (Breite ÷ Höhe), für die Zeichnung des Rahmens */
  aspect: number | null
  /** Eingaben, die lesbar, aber nicht über 0 sind – mit ihnen wird nicht gerechnet */
  invalid: LensField[]
}

/**
 * Alles, was der Rechner zeigt, aus Sensor, Brennweite, Telekonverter, Entfernung und
 * Personengröße. Jede Eingabe zählt nur über 0; ein Ergebnis fehlt, sobald eine seiner Eingaben
 * fehlt (früher ergab ein Sensormaß bis 0 noch ein Sichtfeld von 0 oder darunter).
 */
export function lensView(input: LensInput): LensView {
  const pos = (v: number | null): v is number => v != null && v > 0
  const { sensorW, sensorH, focal, teleconverter, dist, person } = input
  const invalid = (['sensorW', 'sensorH', 'focal', 'dist', 'person'] as const).filter(
    (k) => input[k] != null && !pos(input[k])
  )
  const focalEff = pos(focal) ? focal * teleconverter : null
  const w = pos(sensorW) ? sensorW : null
  const h = pos(sensorH) ? sensorH : null
  const d = pos(dist) ? dist : null
  const fovH = d != null && h != null && focalEff != null ? fovAtDistance(d, h, focalEff) : null
  const ratio = fovH != null && pos(person) ? fovH / person : null
  return {
    focalEff,
    equiv: focalEff != null && w != null && h != null ? equiv35(focalEff, diag(w, h)) : null,
    aovH: w != null && focalEff != null ? angleOfView(w, focalEff) : null,
    aovV: h != null && focalEff != null ? angleOfView(h, focalEff) : null,
    fovW: d != null && w != null && focalEff != null ? fovAtDistance(d, w, focalEff) : null,
    fovH,
    ratio,
    visiblePct: ratio != null ? Math.min(1, ratio) * 100 : null,
    aspect: w != null && h != null ? w / h : null,
    invalid
  }
}

/** Bezeichnung des Bildausschnitts danach, wie viele Personenhöhen der Rahmen
 *  hoch ist (≥1.25 Totale … <0.18 Detail). */
export function framingLabel(r: number): string {
  if (r >= 1.25) return 'Totale (ganze Person + Luft)'
  if (r >= 1.0) return 'Ganzkörper'
  if (r >= 0.75) return 'Amerikanisch (ab Knie)'
  if (r >= 0.55) return 'Halbnah (ab Hüfte)'
  if (r >= 0.35) return 'Halbnah/Nah (ab Brust)'
  if (r >= 0.18) return 'Großaufnahme (Kopf & Schultern)'
  return 'Detail (Gesicht)'
}
