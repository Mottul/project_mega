// Rechenkern von Stromlast & Absicherung. Einphasig: P = U·I·cos φ. Dreiphasig: P = √3·U·I·cos φ
// (U zwischen zwei Außenleitern, I je Leiter). Dazu: Wie viele gleiche Geräte passen auf einen
// Stromkreis (mit Reserve)?

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
  /** Strom je Gerät in A */
  iDev: number | null
  /** so viele Geräte passen höchstens auf den Stromkreis */
  maxDevices: number | null
  /** Leistung (W) und Strom (A) dieser Geräte zusammen */
  sumP: number | null
  sumI: number | null
}

/**
 * Wie viele gleiche Geräte (`pDev` W je Gerät) verträgt eine Absicherung (`breakerA` A), belastet
 * bis zum Anteil `reserve` (1 = 100 %, 0,8 = Dauerbetrieb)? Dreiphasig zählt der Strom je Leiter,
 * als ließe sich die Leistung beliebig auf die drei Außenleiter verteilen – für einphasige Geräte
 * bis zu zwei zu viel (Paket K7 im Gesamtplan).
 */
export function devicesPerCircuit(
  supply: Supply,
  pDev: number | null,
  breakerA: number,
  reserve: number
): Devices {
  const denom = wattsPerAmp(supply)
  const iDev = pDev != null && pDev > 0 && denom != null ? pDev / denom : null
  const maxA = breakerA * reserve
  const maxDevices = iDev != null && iDev > 0 ? Math.floor(maxA / iDev) : null
  const sumP = maxDevices != null && pDev != null ? maxDevices * pDev : null
  const sumI = maxDevices != null && iDev != null ? maxDevices * iDev : null
  return { iDev, maxDevices, sumP, sumI }
}
