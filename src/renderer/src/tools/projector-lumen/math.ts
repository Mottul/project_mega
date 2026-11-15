// Rechenkern des Beamer-Lumen-Rechners: Wie viel ANSI-Lumen braucht die Projektion?
// Faustformel aus dem Verleih-Alltag: Ziel-Beleuchtungsstärke auf der Leinwand je nach
// Umgebungslicht, dann Lumen = Ziel-Lux × Bildfläche ÷ Gain.

export const AMBIENT: { key: string; label: string; lux: number }[] = [
  { key: 'dark', label: 'Dunkel (Kino, abgedunkelt)', lux: 250 },
  { key: 'dim', label: 'Gedimmt (Vortragssaal)', lux: 400 },
  { key: 'bright', label: 'Hell (Konferenzraum, Messe)', lux: 650 },
  { key: 'daylight', label: 'Tageslicht (Schaufenster, Zelt)', lux: 1100 }
]

/** Ziel-Beleuchtungsstärke (lx) einer Stufe aus `AMBIENT`; unbekannt -> 400 lx (gedimmt). */
export function ambientLux(key: string): number {
  return AMBIENT.find((a) => a.key === key)?.lux ?? 400
}

export interface LumenInput {
  /** Bildbreite und -höhe in m */
  width: number | null
  height: number | null
  /** Ziel-Beleuchtungsstärke in lx */
  targetLux: number
  /** Leinwand-Gain */
  gain: number | null
  /** Lichtstrom des vorhandenen Beamers in lm (optional) */
  have: number | null
}

export interface Lumen {
  /** Bildfläche in m² */
  area: number | null
  /** Lumen-Bedarf in lm */
  needed: number | null
  /** Helligkeit des vorhandenen Beamers auf der Leinwand in lx */
  achievedLux: number | null
  /** Reicht der vorhandene Beamer? `null` ohne Bedarf oder ohne Beamer */
  enough: boolean | null
}

/**
 * Lumen-Bedarf und – mit vorhandenem Beamer – die erreichte Helligkeit. Ein Gain bis 0 oder ein
 * leeres Feld rechnet mit 1, ohne dass man es sieht (Befund 2 im Gesamtplan, Paket K3).
 */
export function projectorLumen({ width, height, targetLux, gain, have }: LumenInput): Lumen {
  const g = gain != null && gain > 0 ? gain : 1
  const area = width != null && height != null && width > 0 && height > 0 ? width * height : null
  const needed = area != null ? (targetLux * area) / g : null
  const achievedLux = have != null && have > 0 && area != null ? (have * g) / area : null
  const enough = needed != null && have != null ? have >= needed : null
  return { area, needed, achievedLux, enough }
}
