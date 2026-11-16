// Rechenkern von Stromlast & Absicherung. Einphasig: P = U·I·cos φ. Dreiphasig: P = √3·U·I·cos φ
// (U zwischen zwei Außenleitern, I je Leiter). Dazu: Wie viele gleiche Geräte passen auf einen
// Stromkreis (mit Reserve)? Dreiphasig wird dabei je Außenleiter gezählt.

const SQRT3 = Math.sqrt(3)

export type Phase = '1' | '3'
export type LoadField = 'p' | 'i'

/** Anschluss, wie eingegeben: Phasen, Spannung U (V) und cos φ (`null` = leer oder unlesbar). */
export interface Supply {
  phase: Phase
  u: number | null
  pf: number | null
}

/**
 * cos φ, mit dem gerechnet wird: leer -> 1, sonst auf 0,01 … 1 begrenzt. Über 1 rechnet also mit 1
 * und unter 0,01 mit 0,01, ohne dass man es sieht (Befund 2 im Gesamtplan, Paket K3).
 */
export function powerFactor(pf: number | null): number {
  return pf == null ? 1 : Math.min(1, Math.max(0.01, pf))
}

function phaseFactor(phase: Phase): number {
  return phase === '3' ? SQRT3 : 1
}

/** Watt je Ampere: U · cos φ, dreiphasig mal √3. Ohne Spannung über 0 `null`. */
function wattsPerAmp({ phase, u, pf }: Supply): number | null {
  return u != null && u > 0 ? phaseFactor(phase) * u * powerFactor(pf) : null
}

export interface Load {
  /** Leistung P in W */
  p: number | null
  /** Strom I in A */
  i: number | null
  /** Scheinleistung S in VA: U · I (dreiphasig · √3) */
  apparent: number | null
}

/** Leistung und Strom aus dem bearbeiteten der beiden. Leer oder negativ: alles `null`. */
export function loadFrom(supply: Supply, field: LoadField, value: number | null): Load {
  const denom = wattsPerAmp(supply)
  let p: number | null = null
  let i: number | null = null
  if (value != null && value >= 0 && denom != null) {
    if (field === 'p') {
      p = value
      i = p / denom
    } else {
      i = value
      p = i * denom
    }
  }
  const apparent = supply.u != null && i != null ? phaseFactor(supply.phase) * supply.u * i : null
  return { p, i, apparent }
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
  const iDev =
    pDev != null && pDev > 0 && uDev != null ? pDev / (uDev * powerFactor(supply.pf)) : null
  const maxA = breakerA * reserve
  const perConductor = iDev != null && iDev > 0 ? Math.floor(maxA / iDev) : null
  const maxDevices = perConductor != null ? (three ? 3 : 1) * perConductor : null
  const sumP = maxDevices != null && pDev != null ? maxDevices * pDev : null
  const sumI = perConductor != null && iDev != null ? perConductor * iDev : null
  return { iDev, maxDevices, sumP, sumI }
}
