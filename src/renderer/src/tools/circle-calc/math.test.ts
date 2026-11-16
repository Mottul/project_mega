import { describe, expect, it } from 'vitest'
import { circleFrom, type CircleField } from './math'

describe('circleFrom – Vorgabe des Rechners', () => {
  it('Durchmesser 1 → Radius 0,5 · Umfang π · Fläche π ÷ 4', () => {
    expect(circleFrom('d', 1)).toEqual({
      d: 1,
      r: 0.5,
      c: Math.PI,
      a: Math.PI / 4,
      invalid: []
    })
  })
})

describe('circleFrom – jedes Feld kann die Quelle sein', () => {
  // Kreis mit Radius 2: d = 4, U = 4π, A = 4π
  it.each<[CircleField, number]>([
    ['d', 4],
    ['r', 2],
    ['c', 4 * Math.PI],
    ['a', 4 * Math.PI]
  ])('aus %s = %s → Radius 2', (field, value) => {
    const k = circleFrom(field, value)
    expect(k.r).toBeCloseTo(2, 12)
    expect(k.d).toBeCloseTo(4, 12)
    expect(k.c).toBeCloseTo(4 * Math.PI, 12)
    expect(k.a).toBeCloseTo(4 * Math.PI, 12)
  })

  it('die Quelle behält ihren Wert', () => {
    expect(circleFrom('c', 10).c).toBeCloseTo(10, 12)
    expect(circleFrom('a', 10).a).toBeCloseTo(10, 12)
  })
})

describe('circleFrom – Ränder', () => {
  const leer = { d: null, r: null, c: null, a: null }

  it('0 ist ein Kreis ohne Ausdehnung', () => {
    expect(circleFrom('a', 0)).toEqual({ d: 0, r: 0, c: 0, a: 0, invalid: [] })
  })

  it.each<CircleField>(['d', 'r', 'c', 'a'])(
    'leeres Feld %s → kein Ergebnis, nicht rot',
    (field) => {
      expect(circleFrom(field, null)).toEqual({ ...leer, invalid: [] })
    }
  )

  it.each<CircleField>(['d', 'r', 'c', 'a'])(
    'negativer Wert in %s → kein Ergebnis, das Feld ist rot',
    (field) => {
      expect(circleFrom(field, -1)).toEqual({ ...leer, invalid: [field] })
    }
  )
})
