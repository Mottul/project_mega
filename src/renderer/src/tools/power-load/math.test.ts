import { describe, expect, it } from 'vitest'
import { devicesPerCircuit, loadFrom, powerFactor, type Supply } from './math'

const EIN: Supply = { phase: '1', u: 230, pf: 1 } // Vorgabe des Rechners
const DREI: Supply = { phase: '3', u: 400, pf: 1 }

describe('Vorgabe des Rechners: Last', () => {
  it('einphasig 230 V, cos φ 1, 16 A → 3.680 W', () => {
    expect(loadFrom(EIN, 'i', 16)).toEqual({ p: 3680, i: 16, apparent: 3680 })
  })

  it('dreiphasig 400 V, 16 A → 11.085 W (√3 · 400 V · 16 A)', () => {
    const l = loadFrom(DREI, 'i', 16)
    expect(l.p).toBeCloseTo(11085.125, 3)
    expect(l.apparent).toBeCloseTo(11085.125, 3)
  })
})

describe('Vorgabe des Rechners: Geräte je Stromkreis, 500 W an 230 V, 16 A', () => {
  it('bei 100 %: 2,174 A je Gerät · 7 Geräte · 3.500 W · 15,22 A', () => {
    const g = devicesPerCircuit(EIN, 500, 16, 1)
    expect(g.iDev).toBeCloseTo(2.174, 3)
    expect(g.maxDevices).toBe(7)
    expect(g.sumP).toBe(3500)
    expect(g.sumI).toBeCloseTo(15.217, 3)
  })

  it('bei 80 % (Dauerbetrieb): 5 Geräte · 2.500 W · 10,87 A', () => {
    const g = devicesPerCircuit(EIN, 500, 16, 0.8)
    expect(g.maxDevices).toBe(5)
    expect(g.sumP).toBe(2500)
    expect(g.sumI).toBeCloseTo(10.87, 2)
  })
})

describe('loadFrom – Leistung oder Strom', () => {
  it('aus der Leistung: 3.680 W an 230 V → 16 A', () => {
    expect(loadFrom(EIN, 'p', 3680)).toEqual({ p: 3680, i: 16, apparent: 3680 })
  })

  it('cos φ 0,9: mehr Strom als P ÷ U, die Scheinleistung liegt über der Wirkleistung', () => {
    const l = loadFrom({ ...EIN, pf: 0.9 }, 'p', 3680)
    expect(l.i).toBeCloseTo(17.778, 3)
    expect(l.apparent).toBeCloseTo(4088.9, 1)
  })

  it('0 ist erlaubt', () => {
    expect(loadFrom(EIN, 'p', 0)).toEqual({ p: 0, i: 0, apparent: 0 })
  })

  it.each([null, -1])('Leistung oder Strom %s → kein Ergebnis', (v) => {
    const leer = { p: null, i: null, apparent: null }
    expect(loadFrom(EIN, 'p', v)).toEqual(leer)
    expect(loadFrom(EIN, 'i', v)).toEqual(leer)
  })

  it.each([null, 0, -230])('Spannung %s → kein Ergebnis', (u) => {
    expect(loadFrom({ ...EIN, u }, 'i', 16)).toEqual({ p: null, i: null, apparent: null })
  })
})

describe('powerFactor – womit gerechnet wird', () => {
  it('0,9 bleibt 0,9; leer → 1', () => {
    expect(powerFactor(0.9)).toBe(0.9)
    expect(powerFactor(null)).toBe(1)
  })

  it('über 1 rechnet heimlich mit 1 (Befund 2, ändert sich mit K3)', () => {
    expect(powerFactor(1.5)).toBe(1)
    expect(loadFrom({ ...EIN, pf: 1.5 }, 'i', 16).p).toBe(3680)
  })

  it('unter 0,01 rechnet heimlich mit 0,01 – auch 0 und negative Werte (Befund 2, K3)', () => {
    expect(powerFactor(0.005)).toBe(0.01)
    expect(powerFactor(0)).toBe(0.01)
    expect(powerFactor(-0.5)).toBe(0.01)
  })
})

describe('devicesPerCircuit – Ränder', () => {
  it('genau auf der Grenze zählt mit: 460 W = 2 A → 8 Geräte an 16 A', () => {
    expect(devicesPerCircuit(EIN, 460, 16, 1)).toEqual({
      iDev: 2,
      maxDevices: 8,
      sumP: 3680,
      sumI: 16
    })
  })

  it('ein Gerät, das allein zu viel zieht → 0 Geräte', () => {
    const g = devicesPerCircuit(EIN, 4000, 16, 1)
    expect(g.maxDevices).toBe(0)
    expect(g.sumP).toBe(0)
  })

  it('dreiphasig zählt der Strom je Leiter, als ließe sich die Leistung beliebig verteilen', () => {
    // 500 W an 400 V, 32 A: 44 Geräte. Einphasige Geräte gingen nur 3 × 14 = 42 – Paket K7.
    const g = devicesPerCircuit(DREI, 500, 32, 1)
    expect(g.iDev).toBeCloseTo(0.7217, 4)
    expect(g.maxDevices).toBe(44)
  })

  it.each([null, 0, -500])('Leistung je Gerät %s → kein Ergebnis', (pDev) => {
    expect(devicesPerCircuit(EIN, pDev, 16, 1)).toEqual({
      iDev: null,
      maxDevices: null,
      sumP: null,
      sumI: null
    })
  })

  it('ohne Spannung kein Ergebnis', () => {
    expect(devicesPerCircuit({ ...EIN, u: null }, 500, 16, 1).maxDevices).toBeNull()
  })
})
