// Reine Optik-Helfer des Kameraobjektiv-Rechners (Lochkamera-Näherung) – von der
// UI getrennt, damit sie unit-testbar sind.

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
