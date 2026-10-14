import { describe, expect, it } from 'vitest'
import { RtaProcessor, type ProcessorSettings } from './analysis'
import { dbToMs, SUB_BANDS } from './bands'

const BASE: ProcessorSettings = {
  weighting: 'Z',
  averaging: 'off',
  peak: 'off',
  meter: 'F',
  resolution: 3
}
/** Gesamtpegel `db`, gleichmäßig auf alle 1/24-Bänder verteilt */
function flat(db: number): Float64Array {
  return new Float64Array(SUB_BANDS.length).fill(dbToMs(db) / SUB_BANDS.length)
}
/** Gesamtpegel `db` nur im 1/24-Band um 1 kHz */
function tone(db: number): Float64Array {
  const s = new Float64Array(SUB_BANDS.length)
  s[SUB_BANDS.findIndex((b) => b.lo <= 1000 && b.hi > 1000)] = dbToMs(db)
  return s
}
function run(p: RtaProcessor, sub: Float64Array, seconds: number, peak = 0, dt = 1 / 60): void {
  for (let t = 0; t < seconds - 1e-9; t += dt) p.push(sub, peak, dt)
}

describe('Pegelmesser', () => {
  it('Zeitbewertung F: nach einem Sprung von −60 auf −20 dB nach 125 ms bei −22 dB, nach 1 s bei −20', () => {
    const p = new RtaProcessor(BASE)
    run(p, flat(-60), 1)
    run(p, flat(-20), 0.125)
    // 10·log10(1 − e^−1) ≈ −2,0 dB
    expect(p.level).toBeGreaterThan(-22.3)
    expect(p.level).toBeLessThan(-21.7)
    run(p, flat(-20), 0.875)
    expect(p.level).toBeCloseTo(-20, 1)
  })

  it('Leq: 1 s bei −20 und 1 s bei −30 dB ergeben −22,6 dB; Lmax −20', () => {
    const p = new RtaProcessor({ ...BASE, meter: 'S' })
    run(p, flat(-20), 1)
    run(p, flat(-30), 1)
    expect(p.leq).toBeCloseTo(10 * Math.log10((Math.pow(10, -2) + Math.pow(10, -3)) / 2), 1)
    expect(p.lmax).toBeLessThanOrEqual(-20 + 1e-9)
    expect(p.lmax).toBeGreaterThan(-20.5)
  })

  it('Bewertung A: 1-kHz-Ton unverändert, Rauschen leiser als unbewertet; unbewerteter Pegel bleibt', () => {
    const a = new RtaProcessor({ ...BASE, weighting: 'A' })
    run(a, tone(-20), 0.5)
    expect(a.level).toBeCloseTo(-20, 0)
    const n = new RtaProcessor({ ...BASE, weighting: 'A' })
    run(n, flat(-20), 0.5)
    expect(n.level).toBeLessThan(-21)
    expect(n.levelZ).toBeCloseTo(-20, 1)
  })

  it('Abtastspitze in dBFS (Vollaussteuerung = 0), größte seit dem Zurücksetzen', () => {
    const p = new RtaProcessor(BASE)
    p.push(flat(-20), 0.5, 1 / 60)
    p.push(flat(-20), 0.1, 1 / 60)
    expect(p.peak).toBeCloseTo(-6.02, 1)
    expect(p.peakNow).toBeCloseTo(-20, 1)
    p.reset()
    expect(p.peak).toBe(-Infinity)
  })
})

describe('Mittelung und Spitzen', () => {
  it('„unendlich“ = Mittel der Leistungen aller Bilder', () => {
    const p = new RtaProcessor({ ...BASE, averaging: 'inf' })
    p.push(tone(-20), 0, 0.1)
    p.push(tone(-30), 0, 0.1)
    const band = p.bandLevels()[17] // Terz 1 kHz
    expect(band).toBeCloseTo(10 * Math.log10((Math.pow(10, -2) + Math.pow(10, -3)) / 2), 1)
  })

  it('„halten“ behält den Höchstwert, „fallend“ sinkt um 15 dB/s', () => {
    const hold = new RtaProcessor({ ...BASE, peak: 'hold' })
    hold.push(tone(-10), 0, 0.1)
    run(hold, tone(-40), 1)
    expect(hold.peakHolds()[17]).toBeCloseTo(-10, 1)
    const fall = new RtaProcessor({ ...BASE, peak: 'fall' })
    fall.push(tone(-10), 0, 0.1)
    run(fall, tone(-60), 1)
    expect(fall.peakHolds()[17]).toBeCloseTo(-25, 0)
  })

  it('andere Bewertung beginnt neu; andere Auflösung hat eigene Bänder', () => {
    const p = new RtaProcessor({ ...BASE, averaging: 'inf' })
    run(p, flat(-20), 1)
    p.configure({ ...BASE, averaging: 'inf', weighting: 'C' })
    expect(p.leq).toBe(-Infinity)
    p.configure({ ...BASE, averaging: 'inf', weighting: 'C', resolution: 1 })
    expect(p.bandLayout).toHaveLength(10)
  })
})
