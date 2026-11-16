import { describe, expect, it } from 'vitest'
import { parseDecimal } from '@renderer/components/ui/decimal-field'
import { parseNum, parseOptional, trimNum } from './ui'

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
    for (let i = 0; i < 4000; i++) {
      // Größenordnungen von 10⁻⁶ bis 10³⁰, beide Vorzeichen – auch über 10²¹, wo JavaScript
      // von selbst einen Exponenten schreibt
      const x = (rnd() < 0.5 ? -1 : 1) * rnd() * 10 ** Math.floor(rnd() * 36 - 6)
      const text = trimNum(x)
      expect(parseNum(text), text).toBe(Number(x.toFixed(4)) || 0)
    }
  })
})

describe('trimNum', () => {
  it('kürzt auf die Stellen, mit Komma, ohne Tausenderpunkte', () => {
    expect(trimNum(2.5)).toBe('2,5')
    expect(trimNum(Math.PI)).toBe('3,1416')
    expect(trimNum(Math.PI, 2)).toBe('3,14')
    expect(trimNum(1234567.5)).toBe('1234567,5')
    expect(trimNum(-0.00001)).toBe('0')
    expect(trimNum(null)).toBe('')
    expect(trimNum(Number.POSITIVE_INFINITY)).toBe('')
  })

  it('schreibt auch ab 10²¹ ohne Exponent – den läse parseNum nicht, das Feld wäre rot', () => {
    expect(trimNum(1e21)).toBe('1000000000000000000000')
    expect(trimNum(-1.2345e25)).toBe('-12345000000000000000000000')
    // Kreisrechner, Durchmesser 10¹¹: Die Fläche liegt darüber
    const flaeche = trimNum((Math.PI / 4) * 1e22)
    expect(flaeche).toMatch(/^\d+$/)
    expect(parseNum(flaeche)).toBe((Math.PI / 4) * 1e22)
  })
})

describe('parseOptional – Felder, die leer mit einer Vorgabe rechnen', () => {
  it('leer -> null: Der Rechenkern nimmt die Vorgabe', () => {
    expect(parseOptional('')).toBeNull()
    expect(parseOptional('   ')).toBeNull()
  })

  it('Zahlen wie parseNum', () => {
    expect(parseOptional('2,5')).toBe(2.5)
    expect(parseOptional('-5')).toBe(-5)
    expect(parseOptional('0')).toBe(0)
  })

  it('unlesbar -> NaN: damit rechnet kein Kern, statt still mit der Vorgabe', () => {
    for (const t of ['abc', '-', '1,2,3', '1e3']) {
      expect(parseOptional(t), JSON.stringify(t)).toBeNaN()
    }
  })
})
