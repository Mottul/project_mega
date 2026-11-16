import { describe, expect, it } from 'vitest'
import { DEFAULT_OWN, bridle, bridleLevel, kgToKn, trussLoads } from './math'

describe('Vorgabe des Rechners: Traverse 8 m, 120 kg bei 3 m, Eigengewicht 10 kg/m', () => {
  it('Punkt A 115 kg · Punkt B 85 kg', () => {
    expect(trussLoads(8, 3, 120, 10)).toEqual({ fA: 115, fB: 85, outside: false, invalid: [] })
  })

  it('in kN: 1,13 und 0,83', () => {
    expect(kgToKn(115)).toBeCloseTo(1.128, 3)
    expect(kgToKn(85)).toBeCloseTo(0.834, 3)
  })
})

describe('Vorgabe des Rechners: Bridle 200 kg, Höhe 2 m, Punktabstand 4 m', () => {
  it('45° · Faktor 1,414 · 141,4 kg je Strang · Stranglänge 2,828 m', () => {
    const b = bridle(200, 2, 4)
    expect(b.betaDeg).toBe(45)
    expect(b.spreadDeg).toBe(90)
    expect(b.factor).toBeCloseTo(Math.SQRT2, 12)
    expect(b.legForce).toBeCloseTo(141.42, 2)
    expect(b.legLen).toBeCloseTo(2.828, 3)
    expect(b.invalid).toEqual([])
  })

  it('Stufe „gelb“ – genau auf der Grenze von 45°', () => {
    expect(bridle(200, 2, 4).level).toBe('gelb')
  })
})

describe('trussLoads – Lastposition', () => {
  it('A und B tragen zusammen Punktlast und Eigengewicht', () => {
    const t = trussLoads(8, 3, 120, 10)
    expect(t.fA! + t.fB!).toBe(120 + 10 * 8)
  })

  it('Last direkt an A oder B: dieser Punkt trägt sie ganz', () => {
    expect(trussLoads(8, 0, 120, 10)).toEqual({ fA: 160, fB: 40, outside: false, invalid: [] })
    expect(trussLoads(8, 8, 120, 10)).toEqual({ fA: 40, fB: 160, outside: false, invalid: [] })
  })

  it('Last in der Mitte: beide gleich', () => {
    expect(trussLoads(8, 4, 120, 10)).toEqual({ fA: 100, fB: 100, outside: false, invalid: [] })
  })

  it('außerhalb der Spannweite (hinter B): kein Ergebnis, die Meldung, die Position ist rot', () => {
    expect(trussLoads(8, 9, 120, 10)).toEqual({
      fA: null,
      fB: null,
      outside: true,
      invalid: ['pos']
    })
  })

  it('negative Position (vor A): kein Ergebnis, keine Meldung, die Position ist rot', () => {
    expect(trussLoads(8, -1, 120, 10)).toEqual({
      fA: null,
      fB: null,
      outside: false,
      invalid: ['pos']
    })
  })
})

describe('trussLoads – Eigengewicht', () => {
  it('leer zählt als 0 – das Feld zeigt die 0 als Platzhalter', () => {
    expect(DEFAULT_OWN).toBe(0)
    expect(trussLoads(8, 3, 120, null)).toEqual({ fA: 75, fB: 45, outside: false, invalid: [] })
  })

  it('0 rechnet mit: nur die Punktlast', () => {
    expect(trussLoads(8, 3, 120, 0)).toEqual({ fA: 75, fB: 45, outside: false, invalid: [] })
  })

  it.each([-10, Number.NaN])(
    'Eigengewicht %s (negativ oder unlesbar) → kein Ergebnis, das Feld ist rot – es senkte früher die Kräfte',
    (own) => {
      expect(trussLoads(8, 3, 120, own)).toEqual({
        fA: null,
        fB: null,
        outside: false,
        invalid: ['ownPerM']
      })
    }
  )
})

describe('trussLoads – Ränder', () => {
  it('Punktlast 0: nur das Eigengewicht', () => {
    expect(trussLoads(8, 3, 0, 10)).toEqual({ fA: 40, fB: 40, outside: false, invalid: [] })
  })

  it.each<[number | null, number | null, number | null]>([
    [null, 3, 120],
    [8, null, 120],
    [8, 3, null]
  ])(
    'Spannweite %s, Position %s, Punktlast %s (leer) → kein Ergebnis, nicht rot',
    (span, pos, load) => {
      expect(trussLoads(span, pos, load, 10)).toEqual({
        fA: null,
        fB: null,
        outside: false,
        invalid: []
      })
    }
  )

  it.each<[number, number, number, string[]]>([
    [0, 0, 120, ['span']],
    [8, 3, -120, ['load']],
    // Position hinter einer Spannweite von 0 oder darunter: auch die Meldung, beide rot
    [0, 3, 120, ['span', 'pos']],
    [-8, 3, 120, ['span', 'pos']]
  ])(
    'Spannweite %s, Position %s, Punktlast %s → kein Ergebnis, rot: %j',
    (span, pos, load, invalid) => {
      const t = trussLoads(span, pos, load, 10)
      expect(t.fA).toBeNull()
      expect(t.fB).toBeNull()
      expect(t.invalid).toEqual(invalid)
    }
  )

  it('Spannweite 0 oder negativ mit Position dahinter: auch die Meldung', () => {
    expect(trussLoads(0, 3, 120, 10).outside).toBe(true)
    expect(trussLoads(-8, 3, 120, 10).outside).toBe(true)
  })
})

describe('bridleLevel – Warnstufen nach dem Winkel zur Senkrechten', () => {
  it.each([
    [0, 'ok'],
    [44.99, 'ok'],
    [45, 'gelb'],
    [59.99, 'gelb'],
    [60, 'rot'],
    [80, 'rot']
  ])('%s° → %s', (deg, level) => {
    expect(bridleLevel(deg)).toBe(level)
  })

  it('ohne Winkel keine Stufe', () => {
    expect(bridleLevel(null)).toBeNull()
  })
})

describe('bridle – Ränder', () => {
  it('ab 60° rot: jeder Strang trägt mehr als die ganze Last', () => {
    const b = bridle(200, 1, 3.5) // β = atan(1,75) ≈ 60,3°
    expect(b.betaDeg).toBeCloseTo(60.26, 2)
    expect(b.level).toBe('rot')
    expect(b.factor).toBeGreaterThan(2)
    expect(b.legForce).toBeGreaterThan(200)
  })

  it('knapp unter 60° noch gelb', () => {
    const b = bridle(200, 1, 3.4) // β = atan(1,7) ≈ 59,5°
    expect(b.betaDeg).toBeCloseTo(59.53, 2)
    expect(b.level).toBe('gelb')
  })

  it('Punktabstand 0: senkrechte Stränge, je die halbe Last', () => {
    expect(bridle(200, 2, 0)).toEqual({
      betaDeg: 0,
      spreadDeg: 0,
      factor: 1,
      legForce: 100,
      legLen: 2,
      level: 'ok',
      invalid: []
    })
  })

  const keins = {
    betaDeg: null,
    spreadDeg: null,
    factor: null,
    legForce: null,
    legLen: null,
    level: null
  }

  it.each<[number | null, number | null, number | null]>([
    [null, 2, 4],
    [200, null, 4],
    [200, 2, null]
  ])(
    'Last %s, Höhe %s, Punktabstand %s (leer) → kein Ergebnis, nicht rot',
    (load, height, width) => {
      expect(bridle(load, height, width)).toEqual({ ...keins, invalid: [] })
    }
  )

  it.each<[number, number, number, string[]]>([
    [0, 2, 4, ['load']],
    [-200, 2, 4, ['load']],
    [200, 0, 4, ['height']],
    [200, -2, 4, ['height']],
    [200, 2, -4, ['width']],
    [0, 0, -4, ['load', 'height', 'width']]
  ])(
    'Last %s, Höhe %s, Punktabstand %s → kein Ergebnis, rot: %j',
    (load, height, width, invalid) => {
      expect(bridle(load, height, width)).toEqual({ ...keins, invalid })
    }
  )
})
