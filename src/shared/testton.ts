// Testton: Signale, Kanäle und Einstellungen – für den Testbildgenerator (Schalter „Ton“, gemerkt
// in settings.json als `patternTone`) und den Testtongenerator (kleines Werkzeug, eigener Store).
// Eine eigene Datei statt types.ts: Die Rechner-PWA bindet den Testton ein und soll dabei nicht
// die übrigen Vorgaben der App mitnehmen. types.ts reicht alles weiter.

/** Gespielt wird im Fenster (WebAudio) auf dem gewählten Ausgabegerät; AV-Sync piept im Takt
 *  des Blitz-Testbilds (gemeinsame Wanduhr) und gibt es nur im Testbildgenerator. */
export type ToneSignal =
  'sine' | 'sweep' | 'pink' | 'white' | 'metronome' | 'ident' | 'polarity' | 'avsync'

/**
 * Kanäle: beide gleich, nur einer, sekündlich abwechselnd – oder gegenphasig (rechts mit
 * gedrehter Polarität; ein richtig verkabeltes Paar klingt dann dünn und ortlos, der Bass fehlt)
 */
export type ToneChannels = 'both' | 'left' | 'right' | 'alternate' | 'antiphase'

export interface PatternToneSettings {
  signal: ToneSignal
  /** Sinus in Hz (20–20.000) */
  frequency: number
  /** Spitzenpegel in dBFS, gedeckelt (−60 bis −6) */
  levelDb: number
  channels: ToneChannels
  /** Dauer eines Sweeps 20 Hz → 20 kHz in Sekunden */
  sweepSeconds: number
  /** Metronom */
  bpm: number
  beatsPerBar: number
  /** Eins betonen (höherer Klick) */
  accent: boolean
  /** AV-Sync: Ton gegenüber dem Blitz verschieben (ms, + = später), zum Eichen */
  syncOffsetMs: number
  /** Ausgabegerät (leer = Standardgerät) */
  deviceId: string
}

export const DEFAULT_PATTERN_TONE: PatternToneSettings = {
  signal: 'sine',
  frequency: 1000,
  levelDb: -18,
  channels: 'both',
  sweepSeconds: 10,
  bpm: 120,
  beatsPerBar: 4,
  accent: true,
  syncOffsetMs: 0,
  deviceId: ''
}
