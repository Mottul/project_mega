// Rechenteil der Testtöne (rein, getestet) – für den Testbildgenerator und den
// Testtongenerator: Einstellungen begrenzen, Pegel umrechnen, Auswahllisten und Erklärtexte, und
// die Zeitpläne, die die Engine vorausschauend in WebAudio einplant – Metronom-Schläge, Pausen
// der Kanal-Kennung, Sweep-Durchläufe, abwechselnde Kanäle und die AV-Sync-Piepe. Dazu die
// Rauschpuffer und der Polaritätspuls.
//
// Pegel = Spitzenpegel jedes Signals. Gedeckelt bei −6 dBFS: Ein vergessener Regler soll weder
// Ohren noch Hochtöner gefährden. Dauersignale beginnen mit sanftem Einblenden.

import {
  DEFAULT_PATTERN_TONE,
  type PatternToneSettings,
  type ToneChannels,
  type ToneSignal
} from '@shared/testton'

export const TONE_LEVEL_MIN = -60
export const TONE_LEVEL_MAX = -6
/** Schnellwahl: Bass, tiefe Mitten, Kammerton a′, Bezugston, Höhen */
export const FREQ_PRESETS = [50, 100, 440, 1000, 10000]
/** Schnellwahl Pegel: −20 dBFS (SMPTE RP 155), −18 dBFS (EBU R 68), −12 dBFS */
export const LEVEL_PRESETS = [-20, -18, -12]
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

/** `label` für Listen, `short` für Knöpfe (Testtongenerator) */
export const SIGNAL_OPTIONS: { value: ToneSignal; label: string; short: string }[] = [
  { value: 'sine', label: 'Sinus', short: 'Sinus' },
  { value: 'sweep', label: 'Sweep 20 Hz – 20 kHz', short: 'Sweep' },
  { value: 'pink', label: 'Rosa Rauschen', short: 'Rosa' },
  { value: 'white', label: 'Weißes Rauschen', short: 'Weiß' },
  { value: 'metronome', label: 'Metronom', short: 'Metronom' },
  { value: 'ident', label: 'Kanal-Kennung (1 kHz)', short: 'Kennung' },
  { value: 'polarity', label: 'Polaritätspuls', short: 'Polarität' },
  { value: 'avsync', label: 'AV-Sync (Piep zum Blitz)', short: 'AV-Sync' }
]

export const CHANNEL_OPTIONS: { value: ToneChannels; label: string; short: string }[] = [
  { value: 'both', label: 'Beide', short: 'Beide' },
  { value: 'left', label: 'Links', short: 'Links' },
  { value: 'right', label: 'Rechts', short: 'Rechts' },
  { value: 'alternate', label: 'Abwechselnd (1 s)', short: 'Wechsel' },
  { value: 'antiphase', label: 'Gegenphase', short: 'Gegenphase' }
]

/** Erklärung je Signal (hinter dem ⓘ) – dieselbe in beiden Werkzeugen */
export const SIGNAL_HINTS: Record<ToneSignal, string> = {
  sine: 'Dauerton. 1 kHz bei −18 dBFS ist der übliche Bezugspegel (EBU R 68).',
  sweep:
    'Gleitender Sinus von 20 Hz bis 20 kHz (logarithmisch), danach 0,5 s Pause – findet Resonanzen, Klirren und Lücken im Frequenzgang.',
  pink: 'Gleiche Energie je Oktave – zum Einmessen von Lautsprechern und für den Analyzer (RTA).',
  white: 'Gleiche Energie je Frequenz, klingt hell – für Messungen mit FFT.',
  metronome: 'Klick im Tempo, die Eins auf Wunsch höher.',
  ident:
    '1 kHz auf beiden Kanälen; links setzt der Ton einmal aus, rechts zweimal je 4 s (angelehnt an GLITS der BBC) – vertauschte Kanäle hört man sofort.',
  polarity:
    'Positiver Puls alle 0,5 s für Polaritätsprüfer. Am Lautsprecher bewegt sich die Membran dabei nach vorn.',
  avsync:
    'Piept zu jeder vollen Sekunde, wenn das Testbild „AV-Sync“ blitzt. Ein Messgerät oder eine Zeitlupen-Aufnahme vor der Wand zeigt den Abstand – die Verzögerung des Bildwegs.'
}

/** Erklärung der Kanalwahl (hinter dem ⓘ) */
export const CHANNEL_HINT =
  'Wechsel: jede Sekunde der andere Kanal. Gegenphase: rechts mit gedrehter Polarität – mittig vor einem richtig verkabelten Paar klingt es dann dünn und ortlos, der Bass fehlt. Klingt es schon bei „Beide“ so, ist ein Lautsprecher verpolt. Die Kanal-Kennung nutzt immer beide Kanäle.'

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

/** Was gespielt wird, ohne Pegel: „Sinus 1 kHz“, „Metronom 120 BPM“ */
export function toneWhat(t: PatternToneSettings): string {
  return t.signal === 'sine'
    ? `Sinus ${formatHz(t.frequency)}`
    : t.signal === 'metronome'
      ? `Metronom ${t.bpm} BPM`
      : t.signal === 'sweep'
        ? `Sweep ${t.sweepSeconds} s`
        : (SIGNAL_OPTIONS.find((o) => o.value === t.signal)?.label ?? t.signal)
}

/** Kurzbeschreibung für die Ausgabe-Leiste */
export function toneSummary(t: PatternToneSettings): string {
  return `${toneWhat(t)} · ${formatDb(t.levelDb)}`
}

/** Kanäle als Zusatz zur Kurzbeschreibung; beide (oder Kennung) = leer */
export function channelText(t: PatternToneSettings): string {
  if (!usesChannelChoice(t.signal)) return ''
  switch (t.channels) {
    case 'left':
      return 'nur links'
    case 'right':
      return 'nur rechts'
    case 'alternate':
      return 'Kanäle im Wechsel'
    case 'antiphase':
      return 'gegenphasig'
    default:
      return ''
  }
}

/** Wirken die Kanäle? Kennung und AV-Sync legen sie selbst fest (Kennung: beide, eigene Pausen). */
export function usesChannelChoice(signal: ToneSignal): boolean {
  return signal !== 'ident'
}

/**
 * Klicks und Pulse: kurze Ereignisse im eingestellten Pegel, kein Dauerton. Sie beginnen ohne
 * das lange Einblenden – sonst wäre der erste Schlag kaum zu hören.
 */
export function isImpulse(signal: ToneSignal): boolean {
  return signal === 'metronome' || signal === 'polarity'
}

export interface Beat {
  /** Sekunden ab Start */
  at: number
  /** Schlag im Takt (0 = die Eins) */
  beat: number
}

/**
 * Stand des Metronoms: der nächste noch nicht eingeplante Schlag. Fortlaufend statt auf einem
 * festen Raster ab dem Start – so ändern sich Tempo und Takt im Betrieb, ohne neu bei der Eins
 * anzufangen.
 */
export interface MetroState {
  /** Zeit des nächsten Schlags (s ab Start) */
  next: number
  /** sein Schlag im Takt (0 = die Eins) */
  inBar: number
  /** Zeit des zuletzt eingeplanten Schlags; null = noch keiner */
  last: number | null
}

/** Metronom, dessen erster Schlag (die Eins) bei `at` liegt */
export function startMetronome(at: number): MetroState {
  return { next: at, inBar: 0, last: null }
}

/**
 * Schläge mit Zeit vor `to` einplanen, im Abstand des aktuellen Tempos. Schläge vor `past` (der
 * Takt kam zu spät, die Seite hing) entfallen und das Raster bleibt – nachgeholt klängen sie alle
 * zugleich. Schrumpft der Takt unter den nächsten Schlag, kommt als Nächstes die Eins.
 */
export function planMetronome(
  s: MetroState,
  bpm: number,
  beatsPerBar: number,
  past: number,
  to: number
): { beats: Beat[]; state: MetroState } {
  const step = 60 / bpm
  let { next, inBar, last } = s
  if (inBar >= beatsPerBar) inBar = 0
  if (next < past) {
    // Verpasstes überspringen, ohne jeden Schlag einzeln abzuzählen (nach Stunden im Ruhezustand)
    const missed = Math.ceil((past - next) / step - 1e-9)
    last = next + (missed - 1) * step
    next += missed * step
    inBar = (inBar + missed) % beatsPerBar
  }
  const beats: Beat[] = []
  while (next < to) {
    beats.push({ at: next, beat: inBar })
    last = next
    next += step
    inBar = (inBar + 1) % beatsPerBar
  }
  return { beats, state: { next, inBar, last } }
}

/**
 * Neues Tempo: Der nächste Schlag folgt im neuen Abstand auf den zuletzt eingeplanten – schon
 * Eingeplantes bleibt, wie es ist. Läge er in der Vergangenheit, kommt er sofort (`now`).
 */
export function retimeMetronome(s: MetroState, bpm: number, now: number): MetroState {
  if (s.last == null) return s
  return { ...s, next: Math.max(now, s.last + 60 / bpm) }
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

/** Positiver Puls (angehobene Kosinus-Form, 1 ms): Polaritätsprüfer werten die Richtung aus */
export function polarityPulse(sampleRate: number): Float32Array<ArrayBuffer> {
  const n = Math.max(8, Math.round(sampleRate / 1000))
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1))
  return out
}
