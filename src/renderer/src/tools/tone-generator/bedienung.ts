// Rechenteil der Bedienung des Testtongenerators (rein, getestet): Tempo aus Tipps, der
// Frequenz-Schieber (logarithmisch, 20 Hz bis 20 kHz) und wann die Leertaste den Ton schaltet.

export const BPM_MIN = 30
export const BPM_MAX = 300
/** Längere Pause zwischen zwei Tipps: neu zählen */
export const TAP_RESET_MS = 2000
/** So viele Tipps zählen höchstens (Mittel ihrer Abstände) */
export const TAP_KEEP = 5

/**
 * Tempo aus Tipps (Zeitpunkte in ms): Mittel der Abstände der letzten bis zu fünf Tipps; nach
 * einer Pause über 2 s beginnt die Zählung neu. Ein Tipp allein ergibt noch kein Tempo.
 */
export function tapTempo(
  taps: readonly number[],
  now: number
): { taps: number[]; bpm: number | null } {
  const last = taps[taps.length - 1]
  const keep = last !== undefined && now > last && now - last <= TAP_RESET_MS ? taps : []
  const next = [...keep, now].slice(-TAP_KEEP)
  if (next.length < 2) return { taps: next, bpm: null }
  const interval = (next[next.length - 1] - next[0]) / (next.length - 1)
  return {
    taps: next,
    bpm: Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(60000 / interval)))
  }
}

export const F_MIN = 20
export const F_MAX = 20000
/** Stufen des Frequenz-Schiebers: genug für ein Handy, fein genug für ein breites Fenster */
export const SLIDER_STEPS = 1000

/** Auf drei Stellen runden (439 Hz, 1,23 kHz, 12,3 kHz) – glatte Werte beim Ziehen */
function roundNice(f: number): number {
  const unit = Math.pow(10, Math.floor(Math.log10(f)) - 2)
  return Math.round(Math.round(f / unit) * unit)
}

/** Stellung des Schiebers (0 … SLIDER_STEPS) -> Frequenz in ganzen Hz, logarithmisch */
export function sliderToHz(pos: number): number {
  const p = Math.min(SLIDER_STEPS, Math.max(0, pos)) / SLIDER_STEPS
  const f = roundNice(F_MIN * Math.pow(F_MAX / F_MIN, p))
  return Math.min(F_MAX, Math.max(F_MIN, f))
}

/**
 * Frequenz -> Stellung des Schiebers, deren Frequenz am nächsten liegt. Die Nachbarn werden mit
 * geprüft: An Dekadengrenzen ändert das Runden die Auflösung (Stellung 566 ergibt 998 Hz, 567
 * dann 1000 Hz) – sonst spränge eine eingetippte Frequenz beim ersten Ziehen.
 */
export function hzToSlider(hz: number): number {
  const f = Math.min(F_MAX, Math.max(F_MIN, hz))
  const p = Math.round((Math.log(f / F_MIN) / Math.log(F_MAX / F_MIN)) * SLIDER_STEPS)
  let best = p
  let bestErr = Infinity
  for (const q of [p, p - 1, p + 1]) {
    if (q < 0 || q > SLIDER_STEPS) continue
    const err = Math.abs(sliderToHz(q) - f)
    if (err < bestErr) {
      best = q
      bestErr = err
    }
  }
  return best
}

/** Was eine Taste trifft – aus dem Element mit dem Fokus (null = die Seite selbst) */
export interface TastenZiel {
  tag: string
  /** bei <input>: sein type */
  type?: string | null
  editable: boolean
  role?: string | null
}

export interface Taste {
  code: string
  ctrlKey: boolean
  altKey: boolean
  metaKey: boolean
}

/**
 * Schaltet die Leertaste den Ton? Auf der Seite und am Schieber ja; nie beim Schreiben in einem
 * Feld, in einer Liste oder an einem Knopf, den die Tastatur angesteuert hat – dort gehört sie
 * ihm (nach einem Mausklick räumt die Seite den Fokus weg). Gehaltene Tasten prüft der Aufrufer.
 */
export function leertasteSchaltet(t: Taste, ziel: TastenZiel | null): boolean {
  if (t.code !== 'Space' || t.ctrlKey || t.altKey || t.metaKey) return false
  if (!ziel) return true
  if (ziel.editable) return false
  switch (ziel.tag.toUpperCase()) {
    case 'INPUT':
      return ziel.type === 'range'
    case 'TEXTAREA':
    case 'SELECT':
    case 'BUTTON':
    case 'A':
    case 'SUMMARY':
      return false
    default:
      return ziel.role !== 'button'
  }
}
