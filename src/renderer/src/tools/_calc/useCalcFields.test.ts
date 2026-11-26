import { describe, expect, it } from 'vitest'
import {
  MAX_TEXT,
  calcCodec,
  readCalcFields,
  vorgaben,
  weichtAb,
  type CalcSpec
} from './useCalcFields'

// Ein Rechner mit einem Textfeld, einer Auswahl und verknüpften Feldern (Quelle + Text)
const SPEC = {
  breite: '4',
  licht: { vorgabe: 'dim', erlaubt: ['dark', 'dim', 'bright'] },
  quelle: { vorgabe: 'd', erlaubt: ['d', 'r'] },
  eingabe: '1'
} satisfies CalcSpec<string>

const AB_WERK = { breite: '4', licht: 'dim', quelle: 'd', eingabe: '1' }

describe('vorgaben', () => {
  it('die Beispielwerte ab Werk, auch die der Auswahl', () => {
    expect(vorgaben(SPEC)).toEqual(AB_WERK)
  })
})

describe('readCalcFields – der gemerkte Stand wird geprüft wie fremde Eingabe', () => {
  it('ein vollständiger, gültiger Stand kommt zurück, wie er war', () => {
    const stand = { breite: '3,5', licht: 'bright', quelle: 'r', eingabe: '2' }
    expect(readCalcFields(JSON.stringify(stand), SPEC)).toEqual(stand)
  })

  it('auch leere Felder bleiben leer – leer ist eine Eingabe', () => {
    expect(readCalcFields(JSON.stringify({ breite: '' }), SPEC)).toEqual({ ...AB_WERK, breite: '' })
  })

  it('Unsinn ergibt null (dann gelten alle Vorgaben)', () => {
    for (const raw of ['', 'abc', '{', '[]', '["4"]', '42', '"4"', 'null', 'true']) {
      expect(readCalcFields(raw, SPEC), raw).toBeNull()
    }
  })

  it('fehlende Felder nehmen ihre Vorgabe', () => {
    expect(readCalcFields(JSON.stringify({ breite: '7' }), SPEC)).toEqual({
      ...AB_WERK,
      breite: '7'
    })
    expect(readCalcFields('{}', SPEC)).toEqual(AB_WERK)
  })

  it('fremde Felder fallen weg – auch „__proto__“ im JSON', () => {
    // roh geschrieben: In einem Objekt-Literal setzte „__proto__“ den Prototyp statt eines Felds
    const raw = '{"breite":"7","fremd":"x","__proto__":{"licht":"dark"}}'
    const out = readCalcFields(raw, SPEC)
    expect(out).toEqual({ ...AB_WERK, breite: '7' })
    expect(Object.keys(out ?? {})).toEqual(['breite', 'licht', 'quelle', 'eingabe'])
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype)
  })

  it('kein Text: Zahl, null, Objekt oder Liste nehmen die Vorgabe', () => {
    for (const wert of [4, null, true, { a: 1 }, ['4']]) {
      expect(readCalcFields(JSON.stringify({ breite: wert }), SPEC)?.breite, String(wert)).toBe('4')
    }
  })

  it(`Text bis ${MAX_TEXT} Zeichen gilt, länger nimmt die Vorgabe`, () => {
    const genau = '1'.repeat(MAX_TEXT)
    expect(readCalcFields(JSON.stringify({ breite: genau }), SPEC)?.breite).toBe(genau)
    const zuLang = '1'.repeat(MAX_TEXT + 1)
    expect(readCalcFields(JSON.stringify({ breite: zuLang }), SPEC)?.breite).toBe('4')
  })

  it('eine Auswahl nimmt nur ihre Werte an – auch die Quelle verknüpfter Felder', () => {
    const raw = JSON.stringify({ licht: 'grell', quelle: 'u', eingabe: '5' })
    expect(readCalcFields(raw, SPEC)).toEqual({ ...AB_WERK, eingabe: '5' })
    // Groß- und Kleinschreibung zählt: „Dim“ ist kein Wert der Auswahl
    expect(readCalcFields(JSON.stringify({ licht: 'Dim' }), SPEC)?.licht).toBe('dim')
  })

  it('Felder wie „constructor“ kommen nie aus dem Prototyp', () => {
    const spec = { constructor: 'x', toString: 'y' } satisfies CalcSpec<string>
    expect(readCalcFields('{}', spec)).toEqual({ constructor: 'x', toString: 'y' })
  })
})

describe('weichtAb – nur dann zeigt der Rechner „Zurücksetzen“', () => {
  it('ab Werk nicht, mit einem geänderten Feld schon', () => {
    expect(weichtAb(AB_WERK, SPEC)).toBe(false)
    expect(weichtAb({ ...AB_WERK, licht: 'dark' }, SPEC)).toBe(true)
    expect(weichtAb({ ...AB_WERK, breite: '' }, SPEC)).toBe(true)
  })
})

describe('calcCodec', () => {
  it('gespeichert und wieder gelesen ist derselbe Stand', () => {
    const codec = calcCodec(SPEC)
    const stand = { breite: '01:02:03:04', licht: 'dark', quelle: 'r', eingabe: '-5' }
    expect(codec.parse(codec.format(stand))).toEqual(stand)
  })
})
