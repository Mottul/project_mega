import { describe, expect, it } from 'vitest'
import { DEFAULT_PF, devicesPerCircuit, loadFrom, powerFactor, type Supply } from './math'

const EIN: Supply = { phase: '1', u: 230, pf: 1 } // Vorgabe des Rechners
const DREI: Supply = { phase: '3', u: 400, pf: 1 }
/** Last ohne Ergebnis */
const leer = { p: null, i: null, apparent: null }

describe('Vorgabe des Rechners: Last', () => {
  it('einphasig 230 V, cos φ 1, 16 A → 3.680 W', () => {
    expect(loadFrom(EIN, 'i', 16)).toEqual({ p: 3680, i: 16, apparent: 3680, invalid: [] })
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

// Einphasige Geräte hängen je an einem Außenleiter (400 V ÷ √3 ≈ 230,9 V), die Absicherung gilt
// je Leiter. „Summe Strom“ ist der Strom auf einem Leiter, nicht Max. Geräte × Strom je Gerät.
describe('Geräte je Stromkreis dreiphasig, je Außenleiter: 500 W an 400 V', () => {
  it('32 A: 2,165 A je Gerät am Leiter · 3 × 14 = 42 Geräte · 21.000 W · 30,31 A je Leiter', () => {
    const g = devicesPerCircuit(DREI, 500, 32, 1)
    expect(g.iDev).toBeCloseTo(2.1651, 4)
    expect(g.maxDevices).toBe(42)
    expect(g.sumP).toBe(21000)
    expect(g.sumI).toBeCloseTo(30.311, 3)
  })

  it('16 A: 3 × 7 = 21 Geräte · 10.500 W · 15,16 A je Leiter', () => {
    const g = devicesPerCircuit(DREI, 500, 16, 1)
    expect(g.maxDevices).toBe(21)
    expect(g.sumP).toBe(10500)
    expect(g.sumI).toBeCloseTo(15.155, 3)
  })

  it('16 A bei 80 %: 3 × 5 = 15 Geräte · 7.500 W · 10,83 A je Leiter', () => {
    const g = devicesPerCircuit(DREI, 500, 16, 0.8)
    expect(g.maxDevices).toBe(15)
    expect(g.sumP).toBe(7500)
    expect(g.sumI).toBeCloseTo(10.825, 3)
  })

  it('cos φ 0,9: 2,406 A je Gerät am Leiter → 3 × 6 = 18 Geräte an 16 A · 14,43 A je Leiter', () => {
    const g = devicesPerCircuit({ ...DREI, pf: 0.9 }, 500, 16, 1)
    expect(g.iDev).toBeCloseTo(2.4056, 4)
    expect(g.maxDevices).toBe(18)
    expect(g.sumI).toBeCloseTo(14.434, 3)
  })
})

describe('devicesPerCircuit – nie über der Absicherung', () => {
  const FAELLE = [10, 16, 32, 63].flatMap((a) =>
    [1, 0.8].flatMap((r) => Array.from({ length: 100 }, (_, k) => [(k + 1) * 50, a, r] as const))
  )

  it.each<[string, Supply, number]>([
    ['einphasig', EIN, 1],
    ['dreiphasig', DREI, 3]
  ])(
    '%s: kein Leiter über Absicherung × Auslastung, ein Gerät mehr passte nicht',
    (_, supply, leiter) => {
      for (const [pDev, breakerA, reserve] of FAELLE) {
        const g = devicesPerCircuit(supply, pDev, breakerA, reserve)
        const maxA = breakerA * reserve
        const jeLeiter = g.maxDevices! / leiter
        expect(Number.isInteger(jeLeiter)).toBe(true)
        expect(g.sumI!).toBeLessThanOrEqual(maxA * (1 + 1e-12))
        expect((jeLeiter + 1) * g.iDev!).toBeGreaterThan(maxA)
      }
    }
  )

  it('Drehstromgeräte (je Leiter P ÷ (√3 · U · cos φ)): höchstens zwei zu wenig, nie zu viele', () => {
    for (const [pDev, breakerA, reserve] of FAELLE) {
      const passen = Math.floor((breakerA * reserve) / (pDev / (Math.sqrt(3) * 400)))
      const zuWenig = passen - devicesPerCircuit(DREI, pDev, breakerA, reserve).maxDevices!
      expect(zuWenig).toBeGreaterThanOrEqual(0)
      expect(zuWenig).toBeLessThanOrEqual(2)
    }
  })
})

describe('loadFrom – Leistung oder Strom', () => {
  it('aus der Leistung: 3.680 W an 230 V → 16 A', () => {
    expect(loadFrom(EIN, 'p', 3680)).toEqual({ p: 3680, i: 16, apparent: 3680, invalid: [] })
  })

  it('cos φ 0,9: mehr Strom als P ÷ U, die Scheinleistung liegt über der Wirkleistung', () => {
    const l = loadFrom({ ...EIN, pf: 0.9 }, 'p', 3680)
    expect(l.i).toBeCloseTo(17.778, 3)
    expect(l.apparent).toBeCloseTo(4088.9, 1)
  })

  it('0 ist erlaubt', () => {
    expect(loadFrom(EIN, 'p', 0)).toEqual({ p: 0, i: 0, apparent: 0, invalid: [] })
  })

  it('Leistung oder Strom leer → kein Ergebnis, nicht rot', () => {
    expect(loadFrom(EIN, 'p', null)).toEqual({ ...leer, invalid: [] })
    expect(loadFrom(EIN, 'i', null)).toEqual({ ...leer, invalid: [] })
  })

  it('Leistung oder Strom negativ → kein Ergebnis, das Feld ist rot', () => {
    expect(loadFrom(EIN, 'p', -1)).toEqual({ ...leer, invalid: ['p'] })
    expect(loadFrom(EIN, 'i', -1)).toEqual({ ...leer, invalid: ['i'] })
  })

  it('Spannung leer → kein Ergebnis, nicht rot', () => {
    expect(loadFrom({ ...EIN, u: null }, 'i', 16)).toEqual({ ...leer, invalid: [] })
  })

  it.each([0, -230])('Spannung %s → kein Ergebnis, das Feld ist rot', (u) => {
    expect(loadFrom({ ...EIN, u }, 'i', 16)).toEqual({ ...leer, invalid: ['u'] })
  })
})

describe('powerFactor – womit gerechnet wird', () => {
  it('0,9 bleibt 0,9, 1 bleibt 1', () => {
    expect(powerFactor(0.9)).toBe(0.9)
    expect(powerFactor(1)).toBe(1)
  })

  it('leer → 1 (ohmsche Last) – das Feld zeigt die 1 als Platzhalter', () => {
    expect(DEFAULT_PF).toBe(1)
    expect(powerFactor(null)).toBe(1)
  })

  it('knapp über 0 rechnet mit dem Wert selbst, nicht mehr mit 0,01', () => {
    expect(powerFactor(0.005)).toBe(0.005)
  })

  it.each([1.5, 0, -0.5, Number.NaN])(
    'cos φ %s (außerhalb von 0 bis 1 oder unlesbar) → nicht rechenbar, statt still begrenzt',
    (pf) => {
      expect(powerFactor(pf)).toBeNull()
    }
  )

  it('cos φ über 1: weder Last noch Geräte je Stromkreis, das Feld ist rot', () => {
    expect(loadFrom({ ...EIN, pf: 1.5 }, 'i', 16)).toEqual({ ...leer, invalid: ['pf'] })
    const g = devicesPerCircuit({ ...EIN, pf: 1.5 }, 500, 16, 1)
    expect(g.maxDevices).toBeNull()
    expect(g.invalid).toEqual(['pf'])
  })

  it('Spannung und cos φ zugleich unbrauchbar: beide rot', () => {
    expect(loadFrom({ phase: '3', u: -400, pf: 0 }, 'p', 1000).invalid).toEqual(['u', 'pf'])
  })
})

describe('devicesPerCircuit – Ränder', () => {
  it('genau auf der Grenze zählt mit: 460 W = 2 A → 8 Geräte an 16 A', () => {
    expect(devicesPerCircuit(EIN, 460, 16, 1)).toEqual({
      iDev: 2,
      maxDevices: 8,
      sumP: 3680,
      sumI: 16,
      invalid: []
    })
  })

  it('ein Gerät, das allein zu viel zieht → 0 Geräte', () => {
    const g = devicesPerCircuit(EIN, 4000, 16, 1)
    expect(g.maxDevices).toBe(0)
    expect(g.sumP).toBe(0)
  })

  const keine = { iDev: null, maxDevices: null, sumP: null, sumI: null }

  it('Leistung je Gerät leer → kein Ergebnis, nicht rot', () => {
    expect(devicesPerCircuit(EIN, null, 16, 1)).toEqual({ ...keine, invalid: [] })
  })

  it.each([0, -500])('Leistung je Gerät %s → kein Ergebnis, das Feld ist rot', (pDev) => {
    expect(devicesPerCircuit(EIN, pDev, 16, 1)).toEqual({ ...keine, invalid: ['pDev'] })
  })

  it.each<[string, Supply]>([
    ['einphasig', EIN],
    ['dreiphasig', DREI]
  ])('%s ohne Spannung kein Ergebnis', (_, supply) => {
    expect(devicesPerCircuit({ ...supply, u: null }, 500, 16, 1).maxDevices).toBeNull()
    const ohne = devicesPerCircuit({ ...supply, u: 0 }, 500, 16, 1)
    expect(ohne.maxDevices).toBeNull()
    expect(ohne.invalid).toEqual(['u'])
  })
})
