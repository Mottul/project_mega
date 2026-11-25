// Rechenkern des Beamer-Lumen-Rechners: Wie viel ANSI-Lumen braucht die Projektion?
// Faustformel aus dem Verleih-Alltag: Ziel-Beleuchtungsstärke auf der Leinwand je nach
// Umgebungslicht, dann Lumen = Ziel-Lux × Bildfläche ÷ Gain.

/** Stufen des Umgebungslichts: `name` auf dem Knopf, `where` als Erklärung der gewählten Stufe */
export const AMBIENT: { key: string; name: string; where: string; lux: number }[] = [
  { key: 'dark', name: 'Dunkel', where: 'Kino, abgedunkelt', lux: 250 },
  { key: 'dim', name: 'Gedimmt', where: 'Vortragssaal', lux: 400 },
  { key: 'bright', name: 'Hell', where: 'Konferenzraum, Messe', lux: 650 },
  { key: 'daylight', name: 'Tageslicht', where: 'Schaufenster, Zelt', lux: 1100 }
]

/** Ziel-Beleuchtungsstärke (lx) einer Stufe aus `AMBIENT`; unbekannt -> 400 lx (gedimmt). */
export function ambientLux(key: string): number {
  return AMBIENT.find((a) => a.key === key)?.lux ?? 400
}

/** Gain, mit dem ein leeres Feld rechnet (mattweiß) – das Feld zeigt ihn als Platzhalter */
export const DEFAULT_GAIN = 1

export interface LumenInput {
  /** Bildbreite und -höhe in m */
  width: number | null
  height: number | null
  /** Ziel-Beleuchtungsstärke in lx */
  targetLux: number
  /** Leinwand-Gain: leer (`null`) rechnet mit 1, unlesbar (`NaN`) gar nicht */
  gain: number | null
  /** Lichtstrom des vorhandenen Beamers in lm (optional) */
  have: number | null
}

/** Eingaben, die rot sein können */
export type LumenField = 'width' | 'height' | 'gain' | 'have'

export interface Lumen {
  /** Bildfläche in m² */
  area: number | null
  /** Lumen-Bedarf in lm */
  needed: number | null
  /** Helligkeit des vorhandenen Beamers auf der Leinwand in lx */
  achievedLux: number | null
  /** Reicht der vorhandene Beamer? `null` ohne Bedarf oder ohne Beamer */
  enough: boolean | null
  /** Eingaben, die lesbar, aber nicht über 0 sind – mit ihnen wird nicht gerechnet */
  invalid: LumenField[]
}

/**
 * Lumen-Bedarf und – mit vorhandenem Beamer – die erreichte Helligkeit. Alle Eingaben zählen nur
 * über 0. Ein Gain bis 0 ergibt keinen Bedarf (früher rechnete er still mit 1); nur ein leeres
 * Feld rechnet mit 1.
 */
export function projectorLumen({ width, height, targetLux, gain, have }: LumenInput): Lumen {
  const g = gain ?? DEFAULT_GAIN
  const widthOk = width != null && width > 0
  const heightOk = height != null && height > 0
  const gainOk = g > 0 // auch NaN (unlesbar) nicht
  const haveOk = have != null && have > 0
  const area = widthOk && heightOk ? width * height : null
  const needed = area != null && gainOk ? (targetLux * area) / g : null
  const achievedLux = needed != null && area != null && haveOk ? (have * g) / area : null
  const enough = needed != null && haveOk ? have >= needed : null
  const invalid: LumenField[] = []
  if (width != null && !widthOk) invalid.push('width')
  if (height != null && !heightOk) invalid.push('height')
  if (!gainOk) invalid.push('gain')
  if (have != null && !haveOk) invalid.push('have')
  return { area, needed, achievedLux, enough, invalid }
}
