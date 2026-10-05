// Lautheit nach EBU R128 (ffmpeg loudnorm) in zwei Durchgängen: erst messen, dann mit den
// Messwerten anwenden. Einstufig regelt loudnorm laufend nach – bei Musik hörbares „Pumpen“.
// Mit Messung verstärkt es gleichmäßig und erhält die Dynamik; dynamisch geregelt wird nur
// noch, wenn die Spitzen sonst über den True-Peak-Grenzwert gingen. Rein (main + Tests).

/** Zielwerte: integrierte Lautheit (LUFS), True Peak (dBTP), Lautheitsbereich (LU). */
export interface LoudnessTarget {
  i: number
  tp: number
  lra: number
}

/** Messwerte des ersten Durchgangs (loudnorm print_format=json). */
export interface LoudnessMeasurement {
  i: number
  tp: number
  lra: number
  thresh: number
  offset: number
}

export type LoudnessOutcome =
  /** gemessen; linear = gleichmäßig verstärkt, sonst dynamisch mit Spitzenbegrenzung */
  | { kind: 'measured'; m: LoudnessMeasurement; linear: boolean }
  /** (nahezu) still: Ton bleibt unverändert – 50 dB Verstärkung hülfen niemandem */
  | { kind: 'silent' }
  /** Messung fehlgeschlagen: einstufig wie früher */
  | { kind: 'unmeasured' }

/** Zielwerte zur Auswahl (Player und Video-Konverter). */
export const LOUDNESS_CHOICES: { i: number; label: string }[] = [
  { i: -23, label: '−23 LUFS (Broadcast)' },
  { i: -16, label: '−16 LUFS (Streaming)' },
  { i: -14, label: '−14 LUFS (laut)' }
]

/** Vorgabe beim Einschalten: Streaming-Lautheit, Spitzen mit Reserve für AAC. */
export const DEFAULT_LOUDNESS: LoudnessTarget = { i: -16, tp: -1.5, lra: 11 }

/** Absolutes Gate nach ITU-R BS.1770: leiser gilt als Stille. */
const SILENT_LUFS = -70

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))
const fix = (n: number): string => n.toFixed(2)

// dual_mono: eine Mono-Spur läuft bei Shows über beide Lautsprecher und klingt dann 3 LU
// lauter, als sie als Mono gemessen wird (Stereo und mehr bleiben unberührt)
function base(t: LoudnessTarget, lra = t.lra): string {
  return `loudnorm=I=${t.i}:TP=${t.tp}:LRA=${clamp(lra, 1, 50)}:dual_mono=true`
}

/** Erster Durchgang: misst nur und schreibt die Werte als JSON ans Ende der ffmpeg-Ausgabe. */
export function loudnormMeasureFilter(t: LoudnessTarget): string {
  return `${base(t)}:print_format=json`
}

/** Messwerte aus der ffmpeg-Ausgabe (letzter JSON-Block von loudnorm); null = keiner. */
export function parseLoudnormOutput(text: string): LoudnessMeasurement | null {
  const key = text.lastIndexOf('"input_i"')
  if (key < 0) return null
  const open = text.lastIndexOf('{', key)
  const close = text.indexOf('}', key)
  if (open < 0 || close < 0) return null
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(text.slice(open, close + 1)) as Record<string, unknown>
  } catch {
    return null
  }
  const num = (k: string): number => {
    const v = raw[k]
    if (v === '-inf') return -Infinity
    if (v === 'inf') return Infinity
    return typeof v === 'string' || typeof v === 'number' ? Number(v) : NaN
  }
  return {
    i: num('input_i'),
    tp: num('input_tp'),
    lra: num('input_lra'),
    thresh: num('input_thresh'),
    offset: num('target_offset')
  }
}

/**
 * Messwerte im Wertebereich von loudnorm. Achtung: loudnorm hält I = 0, LRA = 0 und
 * thresh = −70 für „nicht angegeben“ und regelt dann dynamisch – ein gleichmäßiger Testton
 * (LRA genau 0) bekäme so nie die gleichmäßige Verstärkung. Deshalb knapp daneben.
 */
function usable(m: LoudnessMeasurement): LoudnessMeasurement {
  return {
    i: clamp(m.i, -99, -0.01),
    tp: clamp(m.tp, -99, 98.99),
    lra: clamp(m.lra, 0.01, 99),
    thresh: clamp(m.thresh, -99, 0),
    offset: clamp(m.offset, -99, 99)
  }
}

/**
 * Bereich, den der zweite Durchgang höchstens zulässt: nie unter dem gemessenen – angleichen
 * soll die Lautheit, nicht die Dynamik zusammendrücken (sonst fiele jeder Trailer mit großem
 * Lautheitsbereich in die dynamische Regelung und verfehlte das Ziel).
 */
function applyLra(t: LoudnessTarget, m: LoudnessMeasurement): number {
  return clamp(Math.max(t.lra, Math.ceil(m.lra * 10) / 10), 1, 50)
}

/** Messung einordnen – mit derselben Bedingung, nach der loudnorm linear arbeitet. */
export function loudnessOutcome(
  t: LoudnessTarget,
  measured: LoudnessMeasurement | null
): LoudnessOutcome {
  if (!measured || Object.values(measured).some(Number.isNaN)) return { kind: 'unmeasured' }
  if (!(measured.i > SILENT_LUFS)) return { kind: 'silent' }
  const m = usable(measured)
  const linear = m.thresh !== SILENT_LUFS && m.tp + (t.i - m.i) <= t.tp && m.lra <= applyLra(t, m)
  return { kind: 'measured', m, linear }
}

/** Zweiter Durchgang; null = nichts anwenden (stille Spur). */
export function loudnormApplyFilter(t: LoudnessTarget, o: LoudnessOutcome): string | null {
  if (o.kind === 'silent') return null
  if (o.kind === 'unmeasured') return base(t)
  const m = o.m
  return (
    `${base(t, applyLra(t, m))}:measured_I=${fix(m.i)}:measured_TP=${fix(m.tp)}` +
    `:measured_LRA=${fix(m.lra)}:measured_thresh=${fix(m.thresh)}:offset=${fix(m.offset)}` +
    ':linear=true'
  )
}

/** „−16“, „−27,6“ – wie in der Oberfläche mit echtem Minuszeichen. */
export function lufsText(n: number): string {
  const abs = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(Math.abs(n))
  return n < 0 ? `−${abs}` : abs
}

/** Schritt im Plan (vor der Messung). */
export function loudnessPlanStep(t: LoudnessTarget): string {
  return `Lautheit auf ${lufsText(t.i)} LUFS (EBU R128)`
}

/** Schritt nach der Messung: was tatsächlich passiert. */
export function loudnessResultStep(t: LoudnessTarget, o: LoudnessOutcome): string {
  if (o.kind === 'silent') return 'Ton still – Lautheit unverändert'
  if (o.kind === 'unmeasured') return `Lautheit auf ${lufsText(t.i)} LUFS (ohne Messung)`
  const from = `Lautheit ${lufsText(o.m.i)} → ${lufsText(t.i)} LUFS`
  return o.linear ? `${from}, gleichmäßig` : `${from}, Spitzen begrenzt`
}

/** Plan-Schritt durch das Messergebnis ersetzen. */
export function withLoudnessResult(
  steps: string[],
  t: LoudnessTarget,
  o: LoudnessOutcome
): string[] {
  const plan = loudnessPlanStep(t)
  const result = loudnessResultStep(t, o)
  return steps.includes(plan) ? steps.map((s) => (s === plan ? result : s)) : [...steps, result]
}
