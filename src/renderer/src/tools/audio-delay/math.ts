// Rechenkern von Audio-Delay & SPL: Laufzeit für Delay-Lautsprecher und Pegel über Distanz.
// Schallgeschwindigkeit temperaturabhängig: c = 331,3 + 0,606 · T (m/s).
// Pegel im Freifeld: −6 dB je Abstandsverdopplung (Abstandsgesetz).

/** Schallgeschwindigkeit (m/s) bei der Temperatur (°C); leer oder unlesbar rechnet mit 20 °C. */
export function speedOfSound(tempC: number | null): number {
  return 331.3 + 0.606 * (tempC == null ? 20 : tempC)
}

export type DelayField = 'dist' | 'delay'

export interface Delay {
  /** Distanz in m */
  dist: number | null
  /** Delay in ms */
  delayMs: number | null
  /** Delay in Samples bei 48 kHz (ungerundet) */
  samples48: number | null
}

/**
 * Distanz und Delay aus dem bearbeiteten der beiden bei der Schallgeschwindigkeit `c` (m/s).
 * Leer oder negativ: alles `null`.
 */
export function delayFrom(field: DelayField, value: number | null, c: number): Delay {
  let dist: number | null = null
  let delayMs: number | null = null
  if (value != null && value >= 0) {
    if (field === 'dist') {
      dist = value
      delayMs = (value / c) * 1000
    } else {
      delayMs = value
      dist = (value / 1000) * c
    }
  }
  const samples48 = delayMs == null ? null : (delayMs / 1000) * 48000
  return { dist, delayMs, samples48 }
}

/**
 * Pegel (dB) in der Ziel-Distanz aus dem Pegel in der Referenz-Distanz (beide in m, über 0):
 * L₂ = L₁ − 20 · log₁₀(d₂ ÷ d₁).
 */
export function splAtDistance(
  spl: number | null,
  refDist: number | null,
  targetDist: number | null
): number | null {
  return spl != null && refDist != null && refDist > 0 && targetDist != null && targetDist > 0
    ? spl - 20 * Math.log10(targetDist / refDist)
    : null
}
