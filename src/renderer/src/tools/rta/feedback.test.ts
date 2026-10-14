import { describe, expect, it } from 'vitest'
import { FeedbackTracker, findPeaks, notchSuggestion, noteOf, SENSITIVITY } from './feedback'
import { analyserDb, pink, sine } from './testSignals'

const FS = 48000
const N = 16384
const DF = FS / N
const OPTS = { fMin: 80, fMax: 16000, minProminence: SENSITIVITY.mid.prominence, floorDb: -90 }

function mix(a: Float64Array, b: Float64Array): Float64Array {
  return a.map((v, i) => v + b[i])
}

describe('Spitzen finden', () => {
  it('Ton 2 kHz (−26 dBFS) in rosa Rauschen: Lage auf ±1 Hz, Pegel ±0,5 dB, deutlich prominent', () => {
    const sig = mix(pink(0.05, N, 3), sine(2000, 0.05, FS, N))
    const [top] = findPeaks(analyserDb(sig, N), DF, OPTS)
    expect(Math.abs(top.f - 2000)).toBeLessThan(1)
    expect(Math.abs(top.db - 20 * Math.log10(0.05))).toBeLessThan(0.5)
    expect(top.prominence).toBeGreaterThan(15)
  })

  it('auch zwischen zwei Bins (1.234,5 Hz) auf ±1 Hz genau', () => {
    const sig = mix(pink(0.02, N, 4), sine(1234.5, 0.05, FS, N))
    const [top] = findPeaks(analyserDb(sig, N), DF, OPTS)
    expect(Math.abs(top.f - 1234.5)).toBeLessThan(1)
  })

  it('breiter Hügel (Raummode, ±1/6 Oktave) ist keine Rückkopplung', () => {
    const db = Float32Array.from({ length: N / 2 }, (_, k) => {
      const f = Math.max(1, k * DF)
      return -80 + 12 * Math.exp(-Math.pow(Math.log2(f / 500) / (1 / 6), 2))
    })
    expect(findPeaks(db, DF, { ...OPTS, minProminence: SENSITIVITY.high.prominence })).toEqual([])
  })
})

describe('Verfolgen über die Zeit', () => {
  it('stehender Ton wird nach der Mindestdauer gemeldet und einmal protokolliert', () => {
    const tr = new FeedbackTracker('mid')
    for (let i = 0; i < 30; i++) {
      const sig = mix(pink(0.02, N, 10 + i), sine(3150, 0.03, FS, N))
      tr.update(findPeaks(analyserDb(sig, N), DF, OPTS), i / 30)
    }
    const active = tr.active(29 / 30)
    expect(active).toHaveLength(1)
    expect(Math.abs(active[0].f - 3150)).toBeLessThan(1)
    expect(tr.log).toHaveLength(1)
  })

  it('reines rosa Rauschen meldet nichts, auch wenn einzelne Bilder Spitzen haben', () => {
    // höchste Empfindlichkeit, drei Rauschfolgen; früher meldete eine Toleranz von ±1/24 Oktave
    // hier „Rückkopplungen“ bei 15 kHz
    for (const base of [100, 500, 900]) {
      const tr = new FeedbackTracker('high')
      for (let i = 0; i < 40; i++) {
        const db = analyserDb(pink(0.05, N, base + i), N)
        tr.update(
          findPeaks(db, DF, { ...OPTS, minProminence: SENSITIVITY.high.prominence }),
          i / 30
        )
      }
      expect(tr.log, `Folge ${base}`).toEqual([])
    }
  })

  it('verschwundene Spitze fällt nach kurzer Zeit aus der Liste, das Protokoll bleibt', () => {
    const tr = new FeedbackTracker('mid')
    for (let i = 0; i < 30; i++) {
      tr.update([{ f: 800, db: -20, prominence: 20 }], i / 30)
    }
    expect(tr.active(1)).toHaveLength(1)
    tr.update([], 2)
    expect(tr.active(2)).toEqual([])
    expect(tr.log[0].f).toBeCloseTo(800, 0)
  })
})

describe('Note und Filter-Vorschlag', () => {
  it('Noten mit Cent (A4 = 440 Hz, deutsche Schreibweise)', () => {
    expect(noteOf(440)).toEqual({ name: 'A4', cents: 0 })
    expect(noteOf(261.63)).toEqual({ name: 'C4', cents: 0 })
    expect(noteOf(1000)).toEqual({ name: 'H5', cents: 21 })
  })

  it('Glocke: Absenkung in 3-dB-Schritten (3 … 12), Güte für 1/10 Oktave', () => {
    expect(notchSuggestion(10)).toEqual({ gainDb: -6, q: 14.4 })
    expect(notchSuggestion(5).gainDb).toBe(-3)
    expect(notchSuggestion(40).gainDb).toBe(-12)
  })
})
