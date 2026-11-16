// Rechenkern des Projektionsverhältnisses (Throw Ratio = Abstand ÷ Bildbreite): die Leinwandmaße
// aus Seitenverhältnis und einem Maß, dazu Throw Ratio <-> Projektionsabstand über die Bildbreite.

export const ASPECTS: { key: string; label: string; val: number }[] = [
  { key: '16:9', label: '16 : 9', val: 16 / 9 },
  { key: '16:10', label: '16 : 10', val: 16 / 10 },
  { key: '4:3', label: '4 : 3', val: 4 / 3 },
  { key: '1:1', label: '1 : 1', val: 1 },
  { key: '21:9', label: '21 : 9', val: 21 / 9 },
  { key: '2.35:1', label: '2,35 : 1 (Cinemascope)', val: 2.35 }
]

/** Seitenverhältnis (Breite ÷ Höhe) eines Eintrags aus `ASPECTS`; unbekannt -> 16 : 9. */
export function aspectRatio(key: string): number {
  return ASPECTS.find((a) => a.key === key)?.val ?? 16 / 9
}

export type SizeField = 'w' | 'h' | 'diag'
export type ThrowField = 'tr' | 'dist'

export interface ScreenSize {
  /** Bildbreite, -höhe und Diagonale in m */
  w: number | null
  h: number | null
  diag: number | null
  /** Bildfläche in m² */
  area: number | null
}

/** Leinwandmaße aus dem bearbeiteten Maß und dem Seitenverhältnis; nur Werte über 0 zählen. */
export function screenSize(field: SizeField, value: number | null, aspect: number): ScreenSize {
  let w: number | null = null
  let h: number | null = null
  let diag: number | null = null
  if (value != null && value > 0) {
    if (field === 'w') {
      w = value
      h = w / aspect
    } else if (field === 'h') {
      h = value
      w = h * aspect
    } else {
      diag = value
      w = (diag * aspect) / Math.sqrt(aspect * aspect + 1)
      h = w / aspect
    }
    if (diag == null && w != null && h != null) diag = Math.sqrt(w * w + h * h)
  }
  const area = w != null && h != null ? w * h : null
  return { w, h, diag, area }
}

/**
 * Throw Ratio und Projektionsabstand (m) aus dem bearbeiteten der beiden – verknüpft über die
 * Bildbreite (m). Ohne Bildbreite oder Wert über 0 beide `null`.
 */
export function throwFrom(
  field: ThrowField,
  value: number | null,
  width: number | null
): { tr: number | null; dist: number | null } {
  let tr: number | null = null
  let dist: number | null = null
  if (width != null && width > 0 && value != null && value > 0) {
    if (field === 'tr') {
      tr = value
      dist = tr * width
    } else {
      dist = value
      tr = dist / width
    }
  }
  return { tr, dist }
}
