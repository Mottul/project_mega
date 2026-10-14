import { describe, expect, it } from 'vitest'
import {
  bandPowers,
  bandsFor,
  FFT_SIZES,
  levelAt,
  mapSubBands,
  msToDb,
  SUB_BANDS,
  subBandPowers,
  subPosition,
  weightingDb
} from './bands'
import { analyserSpectra, pink, sine, white } from './testSignals'

const FS = 48000
const map = mapSubBands(FS)
const level = (signal: Float64Array): Float64Array =>
  subBandPowers(analyserSpectra(signal, FFT_SIZES), map)

/** Mittel der Leistungen mehrerer unabhängiger Rauschabschnitte (wie „Mittelung unendlich“) */
function averaged(make: (seed: number) => Float64Array, frames: number): Float64Array {
  const sum = new Float64Array(SUB_BANDS.length)
  for (let s = 1; s <= frames; s++) {
    const p = level(make(s))
    for (let i = 0; i < sum.length; i++) sum[i] += p[i] / frames
  }
  return sum
}

describe('Bänder nach IEC 61260', () => {
  it('Terzen: 31 Bänder 20 Hz … 20 kHz mit den normierten Bezeichnungen', () => {
    const b = bandsFor(3)
    expect(b).toHaveLength(31)
    expect(b.map((x) => x.label).slice(0, 4)).toEqual(['20', '25', '31,5', '40'])
    expect(b.map((x) => x.label).slice(-3)).toEqual(['12,5k', '16k', '20k'])
    expect(b[17].fc).toBeCloseTo(1000, 6)
  })

  it('Oktaven 31,5 Hz … 16 kHz, feinere Auflösungen lückenlos', () => {
    expect(bandsFor(1).map((x) => x.label)).toEqual([
      '31,5',
      '63',
      '125',
      '250',
      '500',
      '1k',
      '2k',
      '4k',
      '8k',
      '16k'
    ])
    expect(bandsFor(6)).toHaveLength(62)
    expect(bandsFor(12)).toHaveLength(124)
    for (const r of [1, 3, 6, 12] as const) {
      const b = bandsFor(r)
      for (let i = 1; i < b.length; i++) expect(b[i].lo).toBeCloseTo(b[i - 1].hi, 6)
    }
  })

  it('Bewertung A und C an Prüfpunkten (IEC 61672, Tabelle, ±0,1 dB)', () => {
    // Die Tabelle gilt für die exakten Frequenzen 1000·10^(n/10): „31,5“ = 31,62 Hz, „8k“ = 7.943 Hz
    const exact = (n: number): number => 1000 * Math.pow(10, n / 10)
    const table: [Parameters<typeof weightingDb>[0], number, number][] = [
      ['A', exact(0), 0],
      ['A', exact(-10), -19.1],
      ['A', exact(-15), -39.4],
      ['A', exact(10), -2.5],
      ['C', exact(0), 0],
      ['C', exact(-15), -3.0],
      ['C', exact(9), -3.0]
    ]
    for (const [w, f, db] of table) {
      expect(Math.abs(weightingDb(w, f) - db), `${w} ${f.toFixed(1)} Hz`).toBeLessThan(0.1)
    }
    expect(weightingDb('Z', 50)).toBe(0)
  })

  it('jedes 1/24-Band hat Bins; tiefe aus dem langen, hohe aus kurzen Fenstern', () => {
    for (const m of map) expect(m.bins.length).toBeGreaterThan(0)
    expect(map[0].analyser).toBe(0) // 20 Hz: 32768
    expect(map[map.length - 1].analyser).toBe(FFT_SIZES.length - 1) // 20 kHz: 2048
  })
})

describe('Lage im 1/24-Raster (Wasserfall, Ablesung)', () => {
  it('Bandmitten liegen auf ganzen Indizes, 1 kHz zwischen dem 4. und 5. Teil seiner Terz', () => {
    expect(subPosition(SUB_BANDS[0].fc)).toBeCloseTo(0, 9)
    expect(subPosition(SUB_BANDS[100].fc)).toBeCloseTo(100, 9)
    expect(subPosition(1000)).toBeCloseTo(17 * 8 + 3.5, 9)
  })

  it('Pegel dazwischen linear, außerhalb und bei Stille −∞', () => {
    const c = [-60, -40, -Infinity]
    expect(levelAt(c, 0.5)).toBeCloseTo(-50, 9)
    expect(levelAt(c, 1.5)).toBe(-40)
    expect(levelAt(c, -1)).toBe(-Infinity)
    expect(levelAt(c, 5)).toBe(-Infinity)
  })
})

describe('Pegel aus den Spektren (Labor mit nachgebautem Analysator)', () => {
  it('Sinus 1 kHz bei −20 dBFS: Terz 1 kHz und Gesamtpegel −20 dB (±0,2), Nachbarn weit darunter', () => {
    const p = level(sine(1000, 0.1, FS, 32768))
    const thirds = bandPowers(p, bandsFor(3))
    expect(msToDb(thirds[17])).toBeCloseTo(-20, 0)
    expect(Math.abs(msToDb(thirds[17]) + 20)).toBeLessThan(0.2)
    const total = p.reduce((a, b) => a + b, 0)
    expect(Math.abs(msToDb(total) + 20)).toBeLessThan(0.2)
    expect(msToDb(thirds[15])).toBeLessThan(-60)
    expect(msToDb(thirds[19])).toBeLessThan(-60)
  })

  it('Sinus tief (40 Hz) und hoch (12,5 kHz) treffen ihr Band mit vollem Pegel', () => {
    for (const [f, idx] of [
      [40, 3],
      [12500, 28]
    ] as const) {
      const thirds = bandPowers(level(sine(f, 0.1, FS, 32768)), bandsFor(3))
      expect(Math.abs(msToDb(thirds[idx]) + 20), `${f} Hz`).toBeLessThan(0.3)
    }
  })

  it('weißes Rauschen steigt um 1 dB je Terz (3 dB/Oktave)', () => {
    const thirds = bandPowers(
      averaged((s) => white(0.1, 32768, s), 12),
      bandsFor(3)
    ).map(msToDb)
    // 100 Hz (Index 7) … 10 kHz (Index 27): Steigung über 20 Terzen
    const slope = (thirds[27] - thirds[7]) / 20
    expect(slope).toBeGreaterThan(0.9)
    expect(slope).toBeLessThan(1.1)
  })

  it('rosa Rauschen liegt in den Terzen 50 Hz … 10 kHz flach (±1,5 dB um den Mittelwert)', () => {
    const thirds = bandPowers(
      averaged((s) => pink(0.1, 32768, s), 12),
      bandsFor(3)
    ).map(msToDb)
    const mid = thirds.slice(4, 28)
    const mean = mid.reduce((a, b) => a + b, 0) / mid.length
    for (const v of mid) expect(Math.abs(v - mean)).toBeLessThan(1.5)
  })
})
