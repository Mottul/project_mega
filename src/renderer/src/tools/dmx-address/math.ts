// Rechenkern des DMX-Dip-Schalters: Startadresse <-> Schalterstellungen. Wie an den Geräten
// üblich ist die Adresse die Summe der eingeschalteten Werte: Schalter 1 = Wert 1 (niedrigstes
// Bit) … Schalter 9 = Wert 256, Schalter 1 an = Adresse 1, alle neun an = 511. Alle aus ist keine
// DMX-Adresse. Bis 16.11.2026 rechnete der Rechner Summe + 1 (alle aus = Adresse 1) – das passte
// zur Beschriftung, aber nicht zu den Geräten.

/** Schalter, die zur Adresse zählen (ein zehnter steuert meist Sonderfunktionen). */
export const DMX_SWITCHES = 9

/** Höchste Adresse, die die neun Schalter darstellen (1 + 2 + … + 256). */
export const DMX_MAX_ADDRESS = (1 << DMX_SWITCHES) - 1

/** Wert eines Schalters: Schalter 1 (Index 0) = 1 … Schalter 9 (Index 8) = 256. */
export function switchValue(index: number): number {
  return 1 << index
}

/**
 * Eingabe -> Startadresse: auf eine ganze Zahl gerundet und auf 1 … 511 begrenzt – das Feld
 * übernimmt beim Tippen die begrenzte Zahl. Leer -> `null`.
 */
export function dmxAddress(n: number): number
export function dmxAddress(n: number | null): number | null
export function dmxAddress(n: number | null): number | null {
  return n == null ? null : Math.min(DMX_MAX_ADDRESS, Math.max(1, Math.round(n)))
}

/** Stellung je Schalter (1 = an), Schalter 1 zuerst; ohne Adresse alle aus. */
export function dmxSwitches(address: number | null): number[] {
  return Array.from({ length: DMX_SWITCHES }, (_, i) => (address != null ? (address >> i) & 1 : 0))
}

/** Die Schalter als Binärzahl, wie man sie liest: Schalter 9 links, Schalter 1 rechts. */
export function dmxBinary(address: number | null): string | null {
  return address == null ? null : dmxSwitches(address).reverse().join('')
}

/**
 * Adresse nach dem Umlegen eines Schalters (Index ab 0); ohne Adresse sind alle aus. Schaltet es
 * den letzten aus, gibt es keine Adresse (`null`) – das Feld bleibt dann leer.
 */
export function dmxToggle(address: number | null, index: number): number | null {
  const sum = (address ?? 0) ^ switchValue(index)
  return sum === 0 ? null : sum
}
