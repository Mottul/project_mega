import { describe, expect, it } from 'vitest'
import { AMBIENT, DEFAULT_GAIN, ambientLux, projectorLumen, type LumenInput } from './math'

// Vorgabe des Rechners: 4 × 2,25 m, gedimmt, Gain 1, kein Beamer eingetragen
const VORGABE: LumenInput = { width: 4, height: 2.25, targetLux: 400, gain: 1, have: null }
const NICHTS = { area: null, needed: null, achievedLux: null, enough: null }

describe('Vorgabe des Rechners: 4 × 2,25 m, gedimmt (400 lx), Gain 1', () => {
  it('Bildfläche 9 m², Lumen-Bedarf 3.600 lm, ohne Beamer keine Bewertung', () => {
    expect(projectorLumen(VORGABE)).toEqual({
      area: 9,
      needed: 3600,
      achievedLux: null,
      enough: null,
      invalid: []
    })
  })

  it('vorhanden 6.500 lm → 722 lx, ausreichend', () => {
    const r = projectorLumen({ ...VORGABE, have: 6500 })
    expect(r.achievedLux).toBeCloseTo(722.2, 1)
    expect(r.enough).toBe(true)
  })
})

describe('ambientLux – Ziel je Umgebungslicht', () => {
  it('250 / 400 / 650 / 1.100 lx', () => {
    expect(AMBIENT.map((a) => ambientLux(a.key))).toEqual([250, 400, 650, 1100])
  })

  it('unbekannt → 400 lx (gedimmt)', () => {
    expect(ambientLux('nacht')).toBe(400)
  })
})

describe('projectorLumen – Gain und Bewertung', () => {
  it('Gain 1,5 senkt den Bedarf und hebt die Helligkeit', () => {
    const r = projectorLumen({ ...VORGABE, gain: 1.5, have: 6500 })
    expect(r.needed).toBe(2400)
    expect(r.achievedLux).toBeCloseTo(1083.3, 1)
  })

  it('leerer Gain rechnet mit 1 (mattweiß) – das Feld zeigt die 1 als Platzhalter', () => {
    expect(DEFAULT_GAIN).toBe(1)
    expect(projectorLumen({ ...VORGABE, gain: null, have: 6500 })).toEqual(
      projectorLumen({ ...VORGABE, gain: 1, have: 6500 })
    )
  })

  it.each([0, -1, Number.NaN])(
    'Gain %s (auch unlesbar) → kein Bedarf und keine Bewertung, das Feld ist rot – statt still mit 1',
    (gain) => {
      expect(projectorLumen({ ...VORGABE, gain, have: 6500 })).toEqual({
        area: 9,
        needed: null,
        achievedLux: null,
        enough: null,
        invalid: ['gain']
      })
    }
  )

  it('genau der Bedarf reicht aus, ein Lumen weniger nicht', () => {
    expect(projectorLumen({ ...VORGABE, have: 3600 }).enough).toBe(true)
    expect(projectorLumen({ ...VORGABE, have: 3599 }).enough).toBe(false)
  })

  it.each([0, -100])(
    'Lichtstrom %s → keine Helligkeit und keine Bewertung, das Feld ist rot',
    (have) => {
      const r = projectorLumen({ ...VORGABE, have })
      expect(r.achievedLux).toBeNull()
      expect(r.enough).toBeNull()
      expect(r.invalid).toEqual(['have'])
      expect(r.needed).toBe(3600)
    }
  )
})

describe('projectorLumen – Ränder der Bildgröße', () => {
  it.each<[number | null, number | null]>([
    [null, 2.25],
    [4, null]
  ])('Breite %s, Höhe %s (leer) → kein Bedarf und keine Bewertung, nicht rot', (width, height) => {
    expect(projectorLumen({ ...VORGABE, width, height, have: 6500 })).toEqual({
      ...NICHTS,
      invalid: []
    })
  })

  it.each<[number, number, string[]]>([
    [0, 2.25, ['width']],
    [4, -1, ['height']],
    [-4, 0, ['width', 'height']]
  ])('Breite %s, Höhe %s → kein Bedarf und keine Bewertung, rot: %j', (width, height, invalid) => {
    expect(projectorLumen({ ...VORGABE, width, height, have: 6500 })).toEqual({
      ...NICHTS,
      invalid
    })
  })
})
