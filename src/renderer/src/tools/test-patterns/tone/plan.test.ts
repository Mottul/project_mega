import { describe, expect, it } from 'vitest'
import { DEFAULT_PATTERN_TONE } from '@shared/types'
import {
  alternateSide,
  dbToGain,
  formatDb,
  formatHz,
  identGaps,
  metronomeBeats,
  noiseSamples,
  normalizeTone,
  polarityPulse,
  sweepStarts,
  syncBeeps,
  syncFlashOn,
  ticks,
  toneSummary
} from './plan'

/** Effektivwert eines Puffers in dB (bezogen auf 1 = Vollaussteuerung) */
function rmsDb(samples: Float32Array): number {
  let sum = 0
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
  return 10 * Math.log10(sum / samples.length)
}

/** reproduzierbarer Zufall für die Rauschtests */
function seeded(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

describe('Testton: Einstellungen', () => {
  it('Pegel gedeckelt bei −6 dBFS, Unbrauchbares wird zur Vorgabe', () => {
    expect(normalizeTone({ levelDb: 0 }).levelDb).toBe(-6)
    expect(normalizeTone({ levelDb: -200 }).levelDb).toBe(-60)
    expect(normalizeTone({ levelDb: -18.26 }).levelDb).toBe(-18.5)
    expect(normalizeTone({ frequency: 50000, bpm: 5, beatsPerBar: 0 })).toMatchObject({
      frequency: 20000,
      bpm: 30,
      beatsPerBar: 1
    })
    const odd = { signal: 'laser', channels: 'mitte', levelDb: NaN, accent: 'ja' } as never
    expect(normalizeTone(odd)).toEqual(DEFAULT_PATTERN_TONE)
    expect(normalizeTone(null)).toEqual(DEFAULT_PATTERN_TONE)
  })

  it('Anzeige: Hz/kHz mit Komma, dBFS mit echtem Minus', () => {
    expect(formatHz(100)).toBe('100 Hz')
    expect(formatHz(1000)).toBe('1 kHz')
    expect(formatHz(12500)).toBe('12,5 kHz')
    expect(formatDb(-18)).toBe('−18 dBFS')
    expect(formatDb(-6.5)).toBe('−6,5 dBFS')
    expect(toneSummary(DEFAULT_PATTERN_TONE)).toBe('Sinus 1 kHz · −18 dBFS')
    expect(toneSummary({ ...DEFAULT_PATTERN_TONE, signal: 'pink' })).toBe(
      'Rosa Rauschen · −18 dBFS'
    )
    expect(dbToGain(-6)).toBeCloseTo(0.501, 3)
  })
})

describe('Testton: Zeitpläne', () => {
  it('Metronom: Schläge im Fenster, die Eins je Takt', () => {
    // 120 BPM = alle 0,5 s; 3/4-Takt
    expect(metronomeBeats(120, 3, 0, 2)).toEqual([
      { at: 0, beat: 0 },
      { at: 0.5, beat: 1 },
      { at: 1, beat: 2 },
      { at: 1.5, beat: 0 }
    ])
    // Fenstergrenzen: Anfang enthalten, Ende nicht – nichts doppelt beim nächsten Fenster
    expect(metronomeBeats(120, 4, 0.5, 1).map((b) => b.at)).toEqual([0.5])
    expect(metronomeBeats(120, 4, 1, 1.5).map((b) => b.at)).toEqual([1])
  })

  it('Sweep: Durchläufe mit Pause, Kanalwechsel und Pulse im Takt', () => {
    expect(sweepStarts(10, 0, 25)).toEqual([0, 10.5, 21])
    expect(sweepStarts(10, 10.5, 12)).toEqual([10.5])
    expect(ticks(0.5, 0.2, 1.6)).toEqual([0.5, 1, 1.5])
    expect([0, 0.99, 1, 2.5, 3.2].map(alternateSide)).toEqual([
      'left',
      'left',
      'right',
      'left',
      'right'
    ])
  })

  it('Kanal-Kennung: links eine, rechts zwei Pausen je 4-s-Zyklus', () => {
    expect(identGaps(0, 4)).toEqual([
      { channel: 'left', start: 0, end: 0.25 },
      { channel: 'right', start: 0.5, end: 0.75 },
      { channel: 'right', start: 1, end: 1.25 }
    ])
    expect(identGaps(4, 4.6)).toEqual([
      { channel: 'left', start: 4, end: 4.25 },
      { channel: 'right', start: 4.5, end: 4.75 }
    ])
    expect(identGaps(4.6, 5.1)).toEqual([{ channel: 'right', start: 5, end: 5.25 }])
  })

  it('AV-Sync: Piep zur vollen Sekunde (+ Versatz), Blitz in denselben 40 ms', () => {
    expect(syncBeeps(1000, 3500, 0)).toEqual([1000, 2000, 3000])
    expect(syncBeeps(1001, 3000, 0)).toEqual([2000])
    expect(syncBeeps(1000, 3000, 80)).toEqual([1080, 2080])
    expect(syncBeeps(1000, 2500, -30)).toEqual([1970])
    expect(syncFlashOn(5000)).toBe(true)
    expect(syncFlashOn(5039)).toBe(true)
    expect(syncFlashOn(5040)).toBe(false)
    expect(syncFlashOn(5999)).toBe(false)
  })
})

describe('Testton: Signale', () => {
  it('Rauschen: Spitze 1, Effektivwert 12 dB darunter – rosa wie weiß', () => {
    for (const kind of ['pink', 'white'] as const) {
      const s = noiseSamples(kind, 48000, seeded(7))
      const peak = s.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
      expect(peak).toBeCloseTo(1, 5)
      expect(rmsDb(s)).toBeGreaterThan(-12.2)
      expect(rmsDb(s)).toBeLessThan(-11.9)
    }
  })

  it('Rosa Rauschen fällt zu hohen Frequenzen ab, weißes nicht', () => {
    // grob: Energie der Differenzen (Hochpass) im Verhältnis zur Gesamtenergie
    const hf = (s: Float32Array): number => {
      let d = 0
      let a = 0
      for (let i = 1; i < s.length; i++) {
        d += (s[i] - s[i - 1]) ** 2
        a += s[i] ** 2
      }
      return d / a
    }
    const pink = noiseSamples('pink', 48000, seeded(3))
    const white = noiseSamples('white', 48000, seeded(3))
    expect(hf(white)).toBeGreaterThan(1.5) // weiß: ≈ 2
    expect(hf(pink)).toBeLessThan(0.5)
  })

  it('Polaritätspuls: nur positiv, 1 ms, beginnt und endet bei null', () => {
    const p = polarityPulse(48000)
    expect(p.length).toBe(48)
    expect(Math.min(...p)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...p)).toBeCloseTo(1, 2)
    expect(p[0]).toBeCloseTo(0, 6)
    expect(p[p.length - 1]).toBeCloseTo(0, 6)
  })
})
