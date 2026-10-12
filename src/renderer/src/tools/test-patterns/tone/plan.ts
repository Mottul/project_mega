// Rechenteil der Testtöne (rein, getestet): Einstellungen begrenzen, Pegel umrechnen und die
// Zeitpläne, die die Engine vorausschauend in WebAudio einplant – Metronom-Schläge, Pausen der
// Kanal-Kennung, Sweep-Durchläufe, abwechselnde Kanäle und die AV-Sync-Piepe. Dazu die
// Rauschpuffer und der Polaritätspuls.
//
// Pegel = Spitzenpegel jedes Signals. Gedeckelt bei −6 dBFS: Ein vergessener Regler soll weder
// Ohren noch Hochtöner gefährden, und das Signal beginnt immer mit sanftem Einblenden.

import {
  DEFAULT_PATTERN_TONE,
  type PatternToneSettings,
  type ToneChannels,
  type ToneSignal
} from '@shared/types'

export const TONE_LEVEL_MIN = -60
export const TONE_LEVEL_MAX = -6
export const FREQ_PRESETS = [100, 1000, 10000]
/** Sweep: von – bis (Hz) und Pause zwischen zwei Durchläufen (s) */
export const SWEEP_FROM = 20
export const SWEEP_TO = 20000
export const SWEEP_PAUSE = 0.5
/** Kanal-Kennung (angelehnt an GLITS der BBC): 1 kHz, links eine Pause, rechts zwei je Zyklus */
export const IDENT_CYCLE = 4
export const IDENT_GAPS: Record<'left' | 'right', [number, number][]> = {
  left: [[0, 0.25]],
  right: [
    [0.5, 0.75],
    [1, 1.25]
  ]
}
/** AV-Sync: Blitz und Piep zu jeder vollen Sekunde der Wanduhr, je so lang */
export const SYNC_FLASH_MS = 40
/** Polaritätspuls: alle 0,5 s ein positiver Puls */
export const POLARITY_PERIOD = 0.5

export const SIGNAL_OPTIONS: { value: ToneSignal; label: string }[] = [
  { value: 'sine', label: 'Sinus' },
  { value: 'sweep', label: 'Sweep 20 Hz – 20 kHz' },
  { value: 'pink', label: 'Rosa Rauschen' },
  { value: 'white', label: 'Weißes Rauschen' },
  { value: 'metronome', label: 'Metronom' },
  { value: 'ident', label: 'Kanal-Kennung (1 kHz)' },
  { value: 'polarity', label: 'Polaritätspuls' },
  { value: 'avsync', label: 'AV-Sync (Piep zum Blitz)' }
]

export const CHANNEL_OPTIONS: { value: ToneChannels; label: string }[] = [
  { value: 'both', label: 'Beide' },
  { value: 'left', label: 'Links' },
  { value: 'right', label: 'Rechts' },
  { value: 'alternate', label: 'Abwechselnd (1 s)' }
]

const SIGNALS = new Set(SIGNAL_OPTIONS.map((o) => o.value))
const CHANNELS = new Set(CHANNEL_OPTIONS.map((o) => o.value))

function num(v: unknown, min: number, max: number, fallback: number, step = 1): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback
  return Math.min(max, Math.max(min, Math.round(n / step) * step))
}

/** Gespeicherte (oder fremde) Werte auf sichere Grenzen bringen */
export function normalizeTone(
  t: Partial<PatternToneSettings> | null | undefined
): PatternToneSettings {
  const d = DEFAULT_PATTERN_TONE
  const v = t ?? {}
  return {
    signal: v.signal && SIGNALS.has(v.signal) ? v.signal : d.signal,
    frequency: num(v.frequency, 20, 20000, d.frequency),
    levelDb: num(v.levelDb, TONE_LEVEL_MIN, TONE_LEVEL_MAX, d.levelDb, 0.5),
    channels: v.channels && CHANNELS.has(v.channels) ? v.channels : d.channels,
    sweepSeconds: num(v.sweepSeconds, 1, 60, d.sweepSeconds),
    bpm: num(v.bpm, 30, 300, d.bpm),
    beatsPerBar: num(v.beatsPerBar, 1, 12, d.beatsPerBar),
    accent: typeof v.accent === 'boolean' ? v.accent : d.accent,
    syncOffsetMs: num(v.syncOffsetMs, -500, 500, d.syncOffsetMs),
    deviceId: typeof v.deviceId === 'string' ? v.deviceId : d.deviceId
  }
}

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20)
}

/** „1 kHz“, „100 Hz“, „12,5 kHz“ */
export function formatHz(hz: number): string {
  if (hz < 1000) return `${Math.round(hz)} Hz`
  return `${(hz / 1000).toLocaleString('de-DE', { maximumFractionDigits: 2 })} kHz`
}

/** „−18 dBFS“ mit echtem Minuszeichen */
export function formatDb(db: number): string {
  return `${db < 0 ? '−' : ''}${Math.abs(db).toLocaleString('de-DE', { maximumFractionDigits: 1 })} dBFS`
}

/** Kurzbeschreibung für die Ausgabe-Leiste */
export function toneSummary(t: PatternToneSettings): string {
  const what =
    t.signal === 'sine'
      ? `Sinus ${formatHz(t.frequency)}`
      : t.signal === 'metronome'
        ? `Metronom ${t.bpm} BPM`
        : t.signal === 'sweep'
          ? `Sweep ${t.sweepSeconds} s`
          : (SIGNAL_OPTIONS.find((o) => o.value === t.signal)?.label ?? t.signal)
  return `${what} · ${formatDb(t.levelDb)}`
}

/** Wirken die Kanäle? Kennung und AV-Sync legen sie selbst fest (Kennung: beide, eigene Pausen). */
export function usesChannelChoice(signal: ToneSignal): boolean {
  return signal !== 'ident'
}

export interface Beat {
  /** Sekunden ab Start */
  at: number
  /** Schlag im Takt (0 = die Eins) */
  beat: number
}

/** Metronom-Schläge mit at in [from, to) */
export function metronomeBeats(bpm: number, beatsPerBar: number, from: number, to: number): Beat[] {
  const step = 60 / bpm
  const out: Beat[] = []
  for (let n = Math.max(0, Math.ceil(from / step - 1e-9)); n * step < to; n++) {
    out.push({ at: n * step, beat: n % beatsPerBar })
  }
  return out
}

/** Startzeiten der Sweep-Durchläufe in [from, to) */
export function sweepStarts(seconds: number, from: number, to: number): number[] {
  const period = seconds + SWEEP_PAUSE
  const out: number[] = []
  for (let n = Math.max(0, Math.ceil(from / period - 1e-9)); n * period < to; n++) {
    out.push(n * period)
  }
  return out
}

/** Gleichmäßige Zeitpunkte k·period in [from, to) – Polaritätspulse, Kanalwechsel */
export function ticks(period: number, from: number, to: number): number[] {
  const out: number[] = []
  for (let n = Math.max(0, Math.ceil(from / period - 1e-9)); n * period < to; n++) {
    out.push(n * period)
  }
  return out
}

/** Abwechselnde Kanäle: gerade Sekunden links, ungerade rechts */
export function alternateSide(t: number): 'left' | 'right' {
  return Math.floor(t + 1e-9) % 2 === 0 ? 'left' : 'right'
}

export interface Gap {
  channel: 'left' | 'right'
  start: number
  end: number
}

/** Pausen der Kanal-Kennung, die in [from, to) beginnen */
export function identGaps(from: number, to: number): Gap[] {
  const out: Gap[] = []
  const first = Math.max(0, Math.floor(from / IDENT_CYCLE))
  for (let c = first; c * IDENT_CYCLE < to; c++) {
    for (const channel of ['left', 'right'] as const) {
      for (const [s, e] of IDENT_GAPS[channel]) {
        const start = c * IDENT_CYCLE + s
        if (start >= from && start < to) out.push({ channel, start, end: c * IDENT_CYCLE + e })
      }
    }
  }
  return out.sort((a, b) => a.start - b.start)
}

/** AV-Sync: Piep-Zeitpunkte (Wanduhr, ms) in [fromMs, toMs): volle Sekunde + Versatz */
export function syncBeeps(fromMs: number, toMs: number, offsetMs: number): number[] {
  const out: number[] = []
  for (let k = Math.ceil((fromMs - offsetMs) / 1000); k * 1000 + offsetMs < toMs; k++) {
    out.push(k * 1000 + offsetMs)
  }
  return out
}

/** AV-Sync-Testbild: Blitz in den ersten SYNC_FLASH_MS jeder vollen Sekunde */
export function syncFlashOn(wallMs: number): boolean {
  return ((wallMs % 1000) + 1000) % 1000 < SYNC_FLASH_MS
}

/**
 * Rauschen, Spitze auf 1 normiert. Gaußverteilt und bei ±4σ begrenzt: So liegt der
 * Effektivwert bei beiden Arten 12 dB unter der Spitze, der Pegelregler meint dasselbe.
 * Rosa per Filter nach Paul Kellet (−3 dB/Oktave).
 */
export function noiseSamples(
  kind: 'pink' | 'white',
  length: number,
  rand: () => number = Math.random
): Float32Array<ArrayBuffer> {
  const out = new Float32Array(length)
  let b0 = 0
  let b1 = 0
  let b2 = 0
  let b3 = 0
  let b4 = 0
  let b5 = 0
  let b6 = 0
  for (let i = 0; i < length; i++) {
    // Box-Muller: gaußverteilt
    const u = Math.max(1e-12, rand())
    const white = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand())
    if (kind === 'white') {
      out[i] = white
      continue
    }
    b0 = 0.99886 * b0 + white * 0.0555179
    b1 = 0.99332 * b1 + white * 0.0750759
    b2 = 0.969 * b2 + white * 0.153852
    b3 = 0.8665 * b3 + white * 0.3104856
    b4 = 0.55 * b4 + white * 0.5329522
    b5 = -0.7616 * b5 - white * 0.016898
    out[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362
    b6 = white * 0.115926
  }
  let sum = 0
  for (let i = 0; i < length; i++) sum += out[i] * out[i]
  const rms = Math.sqrt(sum / length) || 1
  const limit = 4 * rms
  for (let i = 0; i < length; i++) out[i] = Math.max(-limit, Math.min(limit, out[i])) / limit
  return out
}

/** Effektivwert eines Puffers in dB (bezogen auf 1 = Vollaussteuerung) */
export function rmsDb(samples: Float32Array): number {
  let sum = 0
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
  return 10 * Math.log10(sum / samples.length)
}

/** Positiver Puls (angehobene Kosinus-Form, 1 ms): Polaritätsprüfer werten die Richtung aus */
export function polarityPulse(sampleRate: number): Float32Array<ArrayBuffer> {
  const n = Math.max(8, Math.round(sampleRate / 1000))
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1))
  return out
}
