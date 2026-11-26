// Rechenkern des Projektionsverhältnisses (Throw Ratio = Abstand ÷ Bildbreite): die Leinwandmaße
// aus Seitenverhältnis und einem Maß, dazu Throw Ratio <-> Projektionsabstand über die Bildbreite.

export const ASPECTS: { key: string; label: string; val: number }[] = [
  { key: '16:9', label: '16 : 9', val: 16 / 9 },
  { key: '16:10', label: '16 : 10', val: 16 / 10 },
  { key: '4:3', label: '4 : 3', val: 4 / 3 },
  { key: '1:1', label: '1 : 1', val: 1 },
  { key: '21:9', label: '21 : 9', val: 21 / 9 },
  // „Cinemascope“ sagt das ⓘ: Der Knopf bleibt so kurz wie die übrigen
  { key: '2.35:1', label: '2,35 : 1', val: 2.35 }
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
  /** das bearbeitete Maß, wenn es lesbar, aber nicht über 0 ist (das Feld ist rot) */
  invalid: SizeField[]
}

/** Leinwandmaße aus dem bearbeiteten Maß und dem Seitenverhältnis; nur Werte über 0 zählen. */
export function screenSize(field: SizeField, value: number | null, aspect: number): ScreenSize {
  let w: number | null = null
  let h: number | null = null
  let diag: number | null = null
  const ok = value != null && value > 0
  if (ok) {
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
  return { w, h, diag, area, invalid: value != null && !ok ? [field] : [] }
}

/**
 * Throw Ratio und Projektionsabstand (m) aus dem bearbeiteten der beiden – verknüpft über die
 * Bildbreite (m). Ohne Bildbreite oder Wert über 0 beide `null`. `invalid` nennt das bearbeitete
 * Feld nur, wenn sein eigener Wert nicht über 0 ist – fehlt die Bildbreite, sagt das ein Hinweis.
 */
export function throwFrom(
  field: ThrowField,
  value: number | null,
  width: number | null
): { tr: number | null; dist: number | null; invalid: ThrowField[] } {
  let tr: number | null = null
  let dist: number | null = null
  const ok = value != null && value > 0
  const invalid: ThrowField[] = value != null && !ok ? [field] : []
  if (width != null && width > 0 && ok) {
    if (field === 'tr') {
      tr = value
      dist = tr * width
    } else {
      dist = value
      tr = dist / width
    }
  }
  return { tr, dist, invalid }
}
