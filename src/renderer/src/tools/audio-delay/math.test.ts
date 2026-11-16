import { describe, expect, it } from 'vitest'
import { DEFAULT_TEMP, delayFrom, speedOfSound, splAtDistance } from './math'

describe('Vorgabe des Rechners: 20 °C, 10 m', () => {
  it('343,42 m/s · 29,119 ms · 1.398 Samples bei 48 kHz', () => {
    const c = speedOfSound(20)
    expect(c).toBeCloseTo(343.42, 10)
    const d = delayFrom('dist', 10, c)
    expect(d.dist).toBe(10)
    expect(d.delayMs).toBeCloseTo(29.119, 3)
    expect(d.samples48).toBeCloseTo(1397.7, 1) // angezeigt gerundet: 1.398
    expect(d.invalid).toEqual([])
  })

  it('Pegel über Distanz: 100 dB in 1 m → 80 dB in 10 m', () => {
    expect(splAtDistance(100, 1, 10)).toEqual({ level: 80, invalid: [] })
  })
})

describe('speedOfSound – c = 331,3 + 0,606 · T', () => {
  it.each([
    [0, 331.3],
    [-10, 325.24], // negative Temperaturen rechnen mit
    [35, 352.51]
  ])('%s °C → %s m/s', (t, c) => {
    expect(speedOfSound(t)).toBeCloseTo(c, 10)
  })

  it('leer rechnet mit 20 °C – das Feld zeigt sie als Platzhalter', () => {
    expect(DEFAULT_TEMP).toBe(20)
    expect(speedOfSound(null)).toBe(speedOfSound(20))
  })

  it('unlesbar (NaN) rechnet gar nicht, statt still mit 20 °C', () => {
    expect(speedOfSound(Number.NaN)).toBeNull()
  })
})

describe('delayFrom – Distanz oder Delay', () => {
  const c = speedOfSound(20)

  it('aus dem Delay: 29,1189 ms → 10 m', () => {
    const d = delayFrom('delay', 29.118863199580687, c)
    expect(d.dist).toBeCloseTo(10, 12)
    expect(d.delayMs).toBe(29.118863199580687)
  })

  it('1 ms entspricht 48 Samples', () => {
    expect(delayFrom('delay', 1, c).samples48).toBe(48)
  })

  it('0 ist erlaubt', () => {
    expect(delayFrom('dist', 0, c)).toEqual({ dist: 0, delayMs: 0, samples48: 0, invalid: [] })
  })

  const leer = { dist: null, delayMs: null, samples48: null }

  it('leer → kein Ergebnis, nicht rot', () => {
    expect(delayFrom('dist', null, c)).toEqual({ ...leer, invalid: [] })
    expect(delayFrom('delay', null, c)).toEqual({ ...leer, invalid: [] })
  })

  it('negativ → kein Ergebnis, das Feld ist rot', () => {
    expect(delayFrom('dist', -1, c)).toEqual({ ...leer, invalid: ['dist'] })
    expect(delayFrom('delay', -1, c)).toEqual({ ...leer, invalid: ['delay'] })
  })

  it('ohne Schallgeschwindigkeit (Temperatur unlesbar) kein Ergebnis – die Distanz ist nicht schuld', () => {
    expect(delayFrom('dist', 10, null)).toEqual({ ...leer, invalid: [] })
  })
})

describe('splAtDistance – −6 dB je Abstandsverdopplung', () => {
  it('doppelte Distanz: −6,02 dB', () => {
    expect(splAtDistance(100, 5, 10).level).toBeCloseTo(93.98, 2)
  })

  it('näher heran wird es lauter: 10 m → 1 m = +20 dB', () => {
    expect(splAtDistance(80, 10, 1).level).toBe(100)
  })

  it('negativer Pegel rechnet mit', () => {
    expect(splAtDistance(-10, 1, 10).level).toBe(-30)
  })

  it.each<[number | null, number | null, number | null]>([
    [null, 1, 10],
    [100, null, 10],
    [100, 1, null]
  ])('Pegel %s, Referenz %s m, Ziel %s m (leer) → kein Ergebnis, nicht rot', (spl, ref, ziel) => {
    expect(splAtDistance(spl, ref, ziel)).toEqual({ level: null, invalid: [] })
  })

  it.each<[number, number, string[]]>([
    [0, 10, ['refDist']],
    [-1, 10, ['refDist']],
    [1, 0, ['targetDist']],
    [1, -10, ['targetDist']],
    [0, 0, ['refDist', 'targetDist']]
  ])('Referenz %s m, Ziel %s m → kein Ergebnis, rot: %j', (ref, ziel, invalid) => {
    expect(splAtDistance(100, ref, ziel)).toEqual({ level: null, invalid })
  })
})
