import { afterEach, describe, expect, it } from 'vitest'
import { meldeAktiv, setAktivMelder } from './aktivMelden'

describe('„läuft“ an main melden', () => {
  afterEach(() => setAktivMelder(null))

  it('reicht Kennung und Zustand an den gesetzten Melder', () => {
    const got: [string, boolean][] = []
    setAktivMelder((key, an) => got.push([key, an]))
    meldeAktiv('testton', true)
    meldeAktiv('testton', false)
    expect(got).toEqual([
      ['testton', true],
      ['testton', false]
    ])
  })

  it('ohne Melder (Rechner-PWA) und bei einem Fehler darin: still', () => {
    expect(() => meldeAktiv('jingle', true)).not.toThrow()
    setAktivMelder(() => {
      throw new Error('Brücke weg')
    })
    expect(() => meldeAktiv('jingle', true)).not.toThrow()
  })
})
