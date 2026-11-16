import { describe, expect, it } from 'vitest'
import { ASPECTS, aspectRatio, screenSize, throwFrom, type SizeField } from './math'

const R16_9 = 16 / 9

describe('Vorgabe des Rechners: 16 : 9, Breite 5 m, Abstand 8 m', () => {
  it('Höhe 2,8125 m · Diagonale 5,737 m · Fläche 14,0625 m²', () => {
    const s = screenSize('w', 5, aspectRatio('16:9'))
    expect(s.w).toBe(5)
    expect(s.h).toBe(2.8125)
    expect(s.diag).toBeCloseTo(5.737, 3)
    expect(s.area).toBe(14.0625)
  })

  it('Throw Ratio 1,6', () => {
    expect(throwFrom('dist', 8, 5)).toEqual({ tr: 1.6, dist: 8 })
  })
})

describe('aspectRatio', () => {
  it('Breite ÷ Höhe je Eintrag', () => {
    expect(aspectRatio('16:9')).toBe(R16_9)
    expect(aspectRatio('4:3')).toBe(4 / 3)
    expect(aspectRatio('2.35:1')).toBe(2.35)
    expect(ASPECTS.map((a) => a.key)).toEqual(['16:9', '16:10', '4:3', '1:1', '21:9', '2.35:1'])
  })

  it('unbekannt → 16 : 9', () => {
    expect(aspectRatio('3:2')).toBe(R16_9)
  })
})

describe('screenSize – jedes Maß kann die Quelle sein', () => {
  it('aus der Höhe: 16 : 9, 2,8125 m → Breite 5 m', () => {
    const s = screenSize('h', 2.8125, R16_9)
    expect(s.w).toBeCloseTo(5, 12)
    expect(s.diag).toBeCloseTo(5.737, 3)
  })

  it('aus der Diagonale: 16 : 9, 5,7367 m → 5 × 2,8125 m', () => {
    const s = screenSize('diag', 5.736737422089319, R16_9)
    expect(s.w).toBeCloseTo(5, 12)
    expect(s.h).toBeCloseTo(2.8125, 12)
    expect(s.diag).toBe(5.736737422089319)
  })

  it('aus der Diagonale: 4 : 3, 5 m → 4 × 3 m (3-4-5-Dreieck)', () => {
    const s = screenSize('diag', 5, 4 / 3)
    expect(s.w).toBeCloseTo(4, 12)
    expect(s.h).toBeCloseTo(3, 12)
    expect(s.area).toBeCloseTo(12, 12)
  })
})

describe('throwFrom – Throw Ratio oder Abstand', () => {
  it('Throw Ratio 1,6 bei 5 m Bildbreite → 8 m Abstand', () => {
    expect(throwFrom('tr', 1.6, 5)).toEqual({ tr: 1.6, dist: 8 })
  })

  it('ohne Bildbreite kein Ergebnis', () => {
    expect(throwFrom('dist', 8, null)).toEqual({ tr: null, dist: null })
    expect(throwFrom('tr', 1.6, 0)).toEqual({ tr: null, dist: null })
  })

  it.each([null, 0, -1])('Throw Ratio oder Abstand %s → kein Ergebnis', (v) => {
    expect(throwFrom('tr', v, 5)).toEqual({ tr: null, dist: null })
    expect(throwFrom('dist', v, 5)).toEqual({ tr: null, dist: null })
  })
})

describe('screenSize – Ränder', () => {
  const leer = { w: null, h: null, diag: null, area: null }

  it.each<[SizeField, number | null]>([
    ['w', null],
    ['h', 0],
    ['diag', -2]
  ])('%s = %s → keine Leinwandmaße', (field, v) => {
    expect(screenSize(field, v, R16_9)).toEqual(leer)
  })
})
