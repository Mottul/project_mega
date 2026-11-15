// Rechenkern des DMX-Dip-Schalters: Startadresse <-> Schalterstellungen. Konvention: Schalter 1
// bis 9 bilden die Adresse binär ab, der Binärwert ist Adresse − 1 (Adresse 1 = alle aus).
// Schalter 1 = Wert 1 (niedrigstes Bit) … Schalter 9 = Wert 256 -> Bereich 1 … 512.

/** Schalter, die zur Adresse zählen (ein zehnter steuert meist Sonderfunktionen). */
export const DMX_SWITCHES = 9

/** Wert eines Schalters: Schalter 1 (Index 0) = 1 … Schalter 9 (Index 8) = 256. */
export function switchValue(index: number): number {
  return 1 << index
}

/**
 * Eingabe -> Startadresse: auf eine ganze Zahl gerundet und auf 1 … 512 begrenzt – das Feld
 * übernimmt beim Tippen die begrenzte Zahl. Leer -> `null`.
 */
export function dmxAddress(n: number): number
export function dmxAddress(n: number | null): number | null
export function dmxAddress(n: number | null): number | null {
  return n == null ? null : Math.min(512, Math.max(1, Math.round(n)))
}

/** Stellung je Schalter (1 = an), Schalter 1 zuerst; ohne Adresse alle aus. */
export function dmxSwitches(address: number | null): number[] {
  const value = address == null ? null : address - 1 // 0 … 511
  return Array.from({ length: DMX_SWITCHES }, (_, i) => (value != null ? (value >> i) & 1 : 0))
}

/** Die Schalter als Binärzahl, wie man sie liest: Schalter 9 links, Schalter 1 rechts. */
export function dmxBinary(address: number | null): string | null {
  return address == null ? null : dmxSwitches(address).reverse().join('')
}

/** Adresse nach dem Umlegen eines Schalters (Index ab 0); ohne Adresse sind alle aus. */
export function dmxToggle(address: number | null, index: number): number {
  const value = address == null ? 0 : address - 1
  return (value ^ switchValue(index)) + 1
}
