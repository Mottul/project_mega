import { describe, expect, it } from 'vitest'
import { parseDecimal } from '@renderer/components/ui/decimal-field'
import { parseNum, trimNum } from './ui'

// parseNum ist die Grenze zwischen Zahl und Fehleingabe: Was es nicht liest, umrandet NumField
// rot. Dieselbe Funktion liest DecimalField (parseDecimal) – beide nehmen dasselbe an.
describe('parseNum', () => {
  it('liest Komma und Punkt, Minus und Leerraum außen', () => {
    expect(parseNum('2,5')).toBe(2.5)
    expect(parseNum('2.5')).toBe(2.5)
    expect(parseNum(' -3 ')).toBe(-3)
    expect(parseNum(',5')).toBe(0.5)
    expect(parseNum('5,')).toBe(5)
    expect(parseNum('0')).toBe(0)
  })

  it('leer oder unlesbar -> null', () => {
    const unlesbar = [
      '',
      '  ',
      '-',
      ',',
      '.',
      '-,',
      'abc',
      '1,2,3',
      '1 000',
      '1e3',
      '+5',
      '--5',
      '5-'
    ]
    for (const t of unlesbar) expect(parseNum(t), JSON.stringify(t)).toBeNull()
  })

  it('liest keine Tausenderpunkte: Felder bekommen trimNum, nicht fmt', () => {
    expect(parseNum('1.234,5')).toBeNull()
    expect(parseNum('1234,5')).toBe(1234.5)
  })

  it('reicht nur parseDecimal weiter', () => {
    for (const t of ['2,5', '-3', ' 7 ', '', '-', 'abc', '1.234,5']) {
      expect(parseNum(t), JSON.stringify(t)).toStrictEqual(parseDecimal(t))
    }
  })

  it('liest zurück, was trimNum schreibt – ein berechnetes Feld ist nie rot', () => {
    let seed = 1
    const rnd = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647
    for (let i = 0; i < 2000; i++) {
      // Größenordnungen von 10⁻⁶ bis 10¹², beide Vorzeichen
      const x = (rnd() < 0.5 ? -1 : 1) * rnd() * 10 ** Math.floor(rnd() * 18 - 6)
      const text = trimNum(x)
      expect(parseNum(text), text).toBe(Number(x.toFixed(4)) || 0)
    }
  })
})
