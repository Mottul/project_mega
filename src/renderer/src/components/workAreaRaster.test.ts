import { describe, expect, it } from 'vitest'
import { GRENZEN, rasterStil, stufe } from './workAreaRaster'

describe('stufe – Aufbau der Arbeitsfläche nach ihrem Platz', () => {
  it('breit ab 1180 px, mittel ab 760 px, darunter schmal', () => {
    expect(stufe(1366, 666)).toBe('breit')
    expect(stufe(1180, 666)).toBe('breit')
    expect(stufe(1179, 666)).toBe('mittel')
    expect(stufe(760, 666)).toBe('mittel')
    expect(stufe(759, 666)).toBe('schmal')
  })

  it('zu niedrig ist immer schmal – auch bei viel Breite', () => {
    expect(stufe(1920, 419)).toBe('schmal')
    expect(stufe(1920, 420)).toBe('breit')
    expect(stufe(1000, 419)).toBe('schmal')
  })

  it('die gemessenen Fenster aus dem Plan', () => {
    expect(stufe(1024, 498)).toBe('mittel') // 1024 × 600, Schublade zu
    expect(stufe(1366, 666)).toBe('breit') // 1366 × 768, Schublade zu
    expect(stufe(1006, 666)).toBe('mittel') // 1366 × 768, Schublade angeheftet
    expect(stufe(1920, 978)).toBe('breit') // 1920 × 1080
    expect(stufe(664, 498)).toBe('schmal') // 1024 × 600, Schublade angeheftet
  })

  it('vor der ersten Messung (0 × 0) schmal', () => {
    expect(stufe(0, 0)).toBe('schmal')
  })

  it('eigene Grenzen je Werkzeug', () => {
    const g = { ...GRENZEN, breit: 900, mittel: 500, hoehe: 300 }
    expect(stufe(900, 300, g)).toBe('breit')
    expect(stufe(899, 300, g)).toBe('mittel')
    expect(stufe(499, 300, g)).toBe('schmal')
  })
})

describe('rasterStil', () => {
  it('schreibt Spalten, Zeilen und Bereiche wie CSS sie erwartet', () => {
    expect(
      rasterStil({
        columns: '1fr 2fr',
        rows: 'minmax(0, 3fr) minmax(0, 2fr)',
        areas: [
          ['a', 'b'],
          ['c', 'b']
        ]
      })
    ).toEqual({
      gridTemplateColumns: '1fr 2fr',
      gridTemplateRows: 'minmax(0, 3fr) minmax(0, 2fr)',
      gridTemplateAreas: '"a b" "c b"'
    })
  })

  it('eine Spalte: je Zeile ein Bereich', () => {
    expect(
      rasterStil({ columns: '1fr', rows: 'auto auto', areas: [['x'], ['y']] }).gridTemplateAreas
    ).toBe('"x" "y"')
  })
})
