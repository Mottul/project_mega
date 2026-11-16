// Rechenkern von Stromlast & Absicherung. Einphasig: P = U·I·cos φ. Dreiphasig: P = √3·U·I·cos φ
// (U zwischen zwei Außenleitern, I je Leiter). Dazu: Wie viele gleiche Geräte passen auf einen
// Stromkreis (mit Reserve)? Dreiphasig wird dabei je Außenleiter gezählt.

const SQRT3 = Math.sqrt(3)

export type Phase = '1' | '3'
export type LoadField = 'p' | 'i'

/**
 * Anschluss, wie eingegeben: Phasen, Spannung U (V) und cos φ (`null` = leer; die Spannung auch
 * unlesbar, cos φ unlesbar als `NaN`, siehe `parseOptional`).
 */
export interface Supply {
  phase: Phase
  u: number | null
  pf: number | null
}

/** cos φ, mit dem ein leeres Feld rechnet (ohmsche Last) – das Feld zeigt ihn als Platzhalter */
export const DEFAULT_PF = 1

/**
 * cos φ, mit dem gerechnet wird: leer -> 1, sonst der Wert selbst, wenn er über 0 und bis 1
 * liegt. Außerhalb (und unlesbar) `null`: kein Ergebnis und ein rotes Feld – früher rechnete
 * über 1 still mit 1 und unter 0,01 mit 0,01.
 */
export function powerFactor(pf: number | null): number | null {
  const v = pf ?? DEFAULT_PF
  return v > 0 && v <= 1 ? v : null
}

function phaseFactor(phase: Phase): number {
  return phase === '3' ? SQRT3 : 1
}

/** Felder des Anschlusses, die rot sein können */
export type SupplyField = 'u' | 'pf'

/** Felder des Anschlusses mit einem lesbaren, aber unbrauchbaren Wert: U nicht über 0, cos φ */
function supplyInvalid({ u, pf }: Supply): SupplyField[] {
  const invalid: SupplyField[] = []
  if (u != null && !(u > 0)) invalid.push('u')
  if (powerFactor(pf) == null) invalid.push('pf')
  return invalid
}

/** Watt je Ampere: U · cos φ, dreiphasig mal √3. Ohne Spannung über 0 oder cos φ `null`. */
function wattsPerAmp({ phase, u, pf }: Supply): number | null {
  const cos = powerFactor(pf)
  return u != null && u > 0 && cos != null ? phaseFactor(phase) * u * cos : null
}

export interface Load {
  /** Leistung P in W */
  p: number | null
  /** Strom I in A */
  i: number | null
  /** Scheinleistung S in VA: U · I (dreiphasig · √3) */
  apparent: number | null
  /** Felder mit lesbarem, aber unbrauchbarem Wert – mit ihnen wird nicht gerechnet */
  invalid: (SupplyField | LoadField)[]
}

/**
 * Leistung und Strom aus dem bearbeiteten der beiden. Leer, negativ oder ohne brauchbaren
 * Anschluss: alles `null`.
 */
export function loadFrom(supply: Supply, field: LoadField, value: number | null): Load {
  const denom = wattsPerAmp(supply)
  const ok = value != null && value >= 0
  let p: number | null = null
  let i: number | null = null
  if (ok && denom != null) {
    if (field === 'p') {
      p = value
      i = p / denom
    } else {
      i = value
      p = i * denom
    }
  }
  const apparent = supply.u != null && i != null ? phaseFactor(supply.phase) * supply.u * i : null
  const invalid: Load['invalid'] = supplyInvalid(supply)
  if (value != null && !ok) invalid.push(field)
  return { p, i, apparent, invalid }
}

export interface Devices {
  /** Strom je Gerät in A – dreiphasig auf dem Außenleiter, an dem es hängt */
  iDev: number | null
  /** so viele Geräte passen höchstens auf den Stromkreis – dreiphasig 3 × Geräte je Leiter */
  maxDevices: number | null
  /** Leistung aller dieser Geräte in W */
  sumP: number | null
  /** Strom auf einem Leiter in A: einphasig der aller Geräte, dreiphasig der eines Außenleiters */
  sumI: number | null
  /** Felder mit lesbarem, aber unbrauchbarem Wert – mit ihnen wird nicht gerechnet */
  invalid: (SupplyField | 'pDev')[]
}

/**
 * Wie viele gleiche Geräte (`pDev` W je Gerät) verträgt eine Absicherung (`breakerA` A), belastet
 * bis zum Anteil `reserve` (1 = 100 %, 0,8 = Dauerbetrieb)?
 *
 * Dreiphasig zählt je Außenleiter: Einphasige Geräte – der Normalfall am CEE-Verteiler – hängen
 * je ganz an einem Leiter, also an U ÷ √3 (an 400 V rund 230 V), und die Absicherung gilt je
 * Leiter. Max. Geräte = 3 × ⌊Absicherung × Auslastung ÷ Strom je Gerät am Leiter⌋, „Summe Strom“
 * ist der Strom auf einem Leiter. Die Leistung frei auf die Leiter zu teilen, zählte bis zu zwei
 * Geräte zu viel (500 W an 32 A: 44 statt 42, zwei Leiter trügen 32,5 A). Für Drehstromgeräte,
 * die sich selbst auf die Leiter verteilen, sind es so höchstens zwei zu wenig, nie zu viele –
 * entschieden im Gesamtplan am 16. November 2026.
 */
export function devicesPerCircuit(
  supply: Supply,
  pDev: number | null,
  breakerA: number,
  reserve: number
): Devices {
  // Einphasig ist der eine Leiter der ganze Stromkreis: dieselbe Rechnung mit U und einem Leiter
  const three = supply.phase === '3'
  // Spannung am Gerät: dreiphasig die zwischen Außenleiter und N
  const uDev = supply.u != null && supply.u > 0 ? (three ? supply.u / SQRT3 : supply.u) : null
  const cos = powerFactor(supply.pf)
  const pDevOk = pDev != null && pDev > 0
  const iDev = pDevOk && uDev != null && cos != null ? pDev / (uDev * cos) : null
  const maxA = breakerA * reserve
  const perConductor = iDev != null && iDev > 0 ? Math.floor(maxA / iDev) : null
  const maxDevices = perConductor != null ? (three ? 3 : 1) * perConductor : null
  const sumP = maxDevices != null && pDev != null ? maxDevices * pDev : null
  const sumI = perConductor != null && iDev != null ? perConductor * iDev : null
  const invalid: Devices['invalid'] = supplyInvalid(supply)
  if (pDev != null && !pDevOk) invalid.push('pDev')
  return { iDev, maxDevices, sumP, sumI, invalid }
}
