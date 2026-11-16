// Rechenkern von Audio-Delay & SPL: Laufzeit für Delay-Lautsprecher und Pegel über Distanz.
// Schallgeschwindigkeit temperaturabhängig: c = 331,3 + 0,606 · T (m/s).
// Pegel im Freifeld: −6 dB je Abstandsverdopplung (Abstandsgesetz).

/** Temperatur (°C), mit der ein leeres Feld rechnet – das Feld zeigt sie als Platzhalter */
export const DEFAULT_TEMP = 20

/**
 * Schallgeschwindigkeit (m/s) bei der Temperatur (°C); leer (`null`) rechnet mit 20 °C. Unlesbar
 * (`NaN`, siehe `parseOptional`) gibt es keine – statt still mit 20 °C zu rechnen.
 */
export function speedOfSound(tempC: number | null): number | null {
  const t = tempC ?? DEFAULT_TEMP
  return Number.isFinite(t) ? 331.3 + 0.606 * t : null
}

export type DelayField = 'dist' | 'delay'

export interface Delay {
  /** Distanz in m */
  dist: number | null
  /** Delay in ms */
  delayMs: number | null
  /** Delay in Samples bei 48 kHz (ungerundet) */
  samples48: number | null
  /** das bearbeitete Feld, wenn sein Wert lesbar, aber negativ ist (das Feld ist rot) */
  invalid: DelayField[]
}

/**
 * Distanz und Delay aus dem bearbeiteten der beiden bei der Schallgeschwindigkeit `c` (m/s).
 * Leer, negativ oder ohne Schallgeschwindigkeit: alles `null`.
 */
export function delayFrom(field: DelayField, value: number | null, c: number | null): Delay {
  let dist: number | null = null
  let delayMs: number | null = null
  const ok = value != null && value >= 0
  if (ok && c != null) {
    if (field === 'dist') {
      dist = value
      delayMs = (value / c) * 1000
    } else {
      delayMs = value
      dist = (value / 1000) * c
    }
  }
  const samples48 = delayMs == null ? null : (delayMs / 1000) * 48000
  return { dist, delayMs, samples48, invalid: value != null && !ok ? [field] : [] }
}

/** Distanzen des Pegels, die rot sein können – der Pegel selbst darf jeden Wert haben */
export type SplField = 'refDist' | 'targetDist'

/**
 * Pegel (dB) in der Ziel-Distanz aus dem Pegel in der Referenz-Distanz (beide in m, über 0):
 * L₂ = L₁ − 20 · log₁₀(d₂ ÷ d₁). `invalid`: Distanzen, die lesbar, aber nicht über 0 sind.
 */
export function splAtDistance(
  spl: number | null,
  refDist: number | null,
  targetDist: number | null
): { level: number | null; invalid: SplField[] } {
  const refOk = refDist != null && refDist > 0
  const targetOk = targetDist != null && targetDist > 0
  const invalid: SplField[] = []
  if (refDist != null && !refOk) invalid.push('refDist')
  if (targetDist != null && !targetOk) invalid.push('targetDist')
  return {
    level: spl != null && refOk && targetOk ? spl - 20 * Math.log10(targetDist / refDist) : null,
    invalid
  }
}
