// Feedback-Finder des RTA (rein, getestet): schmale Spitzen, die deutlich über ihrer Umgebung
// stehen und an derselben Frequenz bleiben – so klingt eine Rückkopplung, bevor sie kippt. Ein
// einzelnes Bild genügt nicht (Rauschen hat auch Spitzen); erst wer über eine Mindestzeit stabil
// bleibt, wird gemeldet. Je Frequenz: genaue Lage (Parabel über drei Bins), Note mit Cent und ein
// Vorschlag für einen Glocken-Filter.

/** Rohtreffer eines Bildes */
export interface PeakCandidate {
  f: number
  /** Pegel der Spitze (Sinus-Äquivalent, dBFS) */
  db: number
  /** dB über der Umgebung (±1/6 Oktave ohne die Spitze selbst) */
  prominence: number
}

export interface PeakOptions {
  fMin: number
  fMax: number
  minProminence: number
  /** darunter wird nichts gemeldet (dBFS) */
  floorDb: number
  max?: number
}

/** Blackman-Hauptkeule: ±3 Bins gehören zur Spitze */
const LOBE = 3
/** mindestens so viele Bins je Seite für die Umgebung */
const MIN_SIDE = 8
/** Leistungsfaktor 2/m2 des Blackman-Fensters (siehe bands.ts) */
const SCALE = 2 / (0.42 * 0.42 + 0.125 + 0.0032)

/**
 * Spitzen eines dB-Spektrums (Web Audio, Bins bei k·df), stärkste zuerst. Die Umgebung ist der
 * Leistungsmittelwert über ±1/6 Oktave ohne die Hauptkeule – breite Hügel (Raummoden, Tonalität)
 * haben so kaum Prominenz, ein schmaler Ton viel.
 */
export function findPeaks(db: ArrayLike<number>, df: number, opts: PeakOptions): PeakCandidate[] {
  const n = db.length
  const p = new Float64Array(n)
  for (let k = 0; k < n; k++) p[k] = db[k] > -400 ? Math.pow(10, db[k] / 10) : 0
  const sum = new Float64Array(n + 1)
  for (let k = 0; k < n; k++) sum[k + 1] = sum[k] + p[k]
  const range = (a: number, b: number): number => sum[Math.min(n, b + 1)] - sum[Math.max(0, a)]

  const out: PeakCandidate[] = []
  const k0 = Math.max(LOBE + 1, Math.ceil(opts.fMin / df))
  const k1 = Math.min(n - LOBE - 2, Math.floor(opts.fMax / df))
  for (let k = k0; k <= k1; k++) {
    if (!(db[k] > db[k - 1] && db[k] >= db[k + 1])) continue
    const f0 = k * df
    const lo = Math.min(Math.floor(f0 / Math.pow(2, 1 / 6) / df), k - LOBE - MIN_SIDE)
    const hi = Math.max(Math.ceil((f0 * Math.pow(2, 1 / 6)) / df), k + LOBE + MIN_SIDE)
    const count = hi - lo + 1 - (2 * LOBE + 1)
    const env = (range(lo, hi) - range(k - LOBE, k + LOBE)) / count
    const main = range(k - LOBE, k + LOBE)
    if (!(env > 0) || !(main > 0)) continue
    const prominence = 10 * Math.log10(p[k] / env)
    // Pegel als Sinus: ganze Hauptkeule, Fenster herausgerechnet (wie die Bänder)
    const level = 10 * Math.log10(2 * main * SCALE)
    if (prominence < opts.minProminence || level < opts.floorDb) continue
    // Parabel durch drei Bins (dB) -> Lage zwischen den Bins
    const a = db[k - 1]
    const b = db[k]
    const c = db[k + 1]
    const den = a - 2 * b + c
    const delta = den !== 0 ? (0.5 * (a - c)) / den : 0
    out.push({ f: (k + Math.max(-0.5, Math.min(0.5, delta))) * df, db: level, prominence })
  }
  out.sort((x, y) => y.prominence - x.prominence)
  return out.slice(0, opts.max ?? 8)
}

/* ------------------------------ Verfolgen -------------------------------- */

export type Sensitivity = 'low' | 'mid' | 'high'

/** Prominenz (dB) und Mindestdauer (s) je Empfindlichkeit */
export const SENSITIVITY: Record<Sensitivity, { prominence: number; minAge: number }> = {
  low: { prominence: 14, minAge: 0.8 },
  mid: { prominence: 10, minAge: 0.5 },
  high: { prominence: 7, minAge: 0.3 }
}

export interface FeedbackTrack {
  id: number
  f: number
  db: number
  prominence: number
  /** seit wann (s) */
  since: number
  /** zuletzt gesehen (s) */
  last: number
  hits: number
  frames: number
}

/** Eintrag im Protokoll: erstmals stabil gemeldete Frequenz */
export interface FeedbackLogEntry {
  f: number
  db: number
  at: number
}

/**
 * Gleiche Frequenz = innerhalb von ±0,2 % (mindestens 1,5 Hz). Eine Rückkopplung steht auf
 * wenige Hertz genau; eine Toleranz in Oktaven (±1/24 = ±440 Hz bei 15 kHz) fasste dort zufällige
 * Rauschspitzen aus Hunderten Bins zu einer scheinbar stabilen Spitze zusammen (Labortest).
 */
function same(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(1.5, 0.002 * a)
}
/** so lange (s) darf eine Spitze fehlen, bevor sie vergessen wird */
const GRACE = 0.4

export class FeedbackTracker {
  private tracks: FeedbackTrack[] = []
  private seq = 0
  private reported = new Set<number>()
  readonly log: FeedbackLogEntry[] = []

  constructor(private sens: Sensitivity = 'mid') {}

  setSensitivity(s: Sensitivity): void {
    this.sens = s
  }

  reset(): void {
    this.tracks = []
    this.reported.clear()
    this.log.length = 0
  }

  update(cands: PeakCandidate[], t: number): void {
    for (const tr of this.tracks) tr.frames++
    for (const c of cands) {
      const tr = this.tracks.find((x) => same(x.f, c.f))
      if (tr) {
        // geglättet: die Lage wandert nicht mit jedem Bild
        tr.f += 0.3 * (c.f - tr.f)
        tr.db = c.db
        tr.prominence = c.prominence
        tr.last = t
        tr.hits++
      } else {
        this.tracks.push({ id: ++this.seq, ...c, since: t, last: t, hits: 1, frames: 1 })
      }
    }
    this.tracks = this.tracks.filter((x) => t - x.last <= GRACE)
    for (const tr of this.active(t)) {
      if (this.reported.has(tr.id)) continue
      this.reported.add(tr.id)
      this.log.unshift({ f: tr.f, db: tr.db, at: t })
      if (this.log.length > 12) this.log.length = 12
    }
  }

  /** stabile Spitzen: lange genug da, fast in jedem Bild gesehen, gerade noch vorhanden */
  active(t: number): FeedbackTrack[] {
    const { minAge } = SENSITIVITY[this.sens]
    return this.tracks
      .filter((x) => x.last - x.since >= minAge && x.hits / x.frames >= 0.7 && t - x.last <= 0.25)
      .sort((a, b) => b.db - a.db)
  }
}

/* ------------------------------ Hilfen ----------------------------------- */

const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'H']

/** Nächste Note (A4 = 440 Hz, deutsche Schreibweise H) mit Abweichung in Cent */
export function noteOf(f: number): { name: string; cents: number } {
  const midi = 69 + 12 * Math.log2(f / 440)
  const n = Math.round(midi)
  const octave = Math.floor(n / 12) - 1
  return { name: `${NAMES[((n % 12) + 12) % 12]}${octave}`, cents: Math.round((midi - n) * 100) }
}

/**
 * Vorschlag für einen Glocken-Filter: Absenkung in 3-dB-Schritten (Prominenz − 3, 3 … 12 dB),
 * Güte für 1/10 Oktave – schmal genug für Feedback, breit genug, dass es nicht vorbeizieht.
 */
export function notchSuggestion(prominence: number): { gainDb: number; q: number } {
  const g = Math.min(12, Math.max(3, Math.round((prominence - 3) / 3) * 3))
  const bw = 1 / 10
  const q = Math.sqrt(Math.pow(2, bw)) / (Math.pow(2, bw) - 1)
  return { gainDb: -g, q: Math.round(q * 10) / 10 }
}
