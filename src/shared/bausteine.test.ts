import { describe, expect, it } from 'vitest'
import { isBausteinId, sanitizeEigenerBaustein } from './bausteine'

describe('eigene Bausteine – Hülle', () => {
  it('nimmt nur sichere Kennungen (Dateiname!)', () => {
    expect(isBausteinId('a1b2c3d4-0000')).toBe(true)
    expect(isBausteinId('../../etc')).toBe(false)
    expect(isBausteinId('ABC12345')).toBe(false)
    expect(isBausteinId('kurz')).toBe(false)
  })
  it('prüft Art und Felder, behält die Daten', () => {
    const b = sanitizeEigenerBaustein({
      id: 'abcdefgh1',
      art: 'bloecke',
      titel: 'x'.repeat(500),
      kapitel: 'einAus',
      daten: [{ typ: 'text' }],
      version: 3
    })
    expect(b).toMatchObject({ art: 'bloecke', kapitel: 'einAus', version: 3 })
    expect(b?.titel).toHaveLength(200)
    expect(b?.daten).toEqual([{ typ: 'text' }])
    expect(sanitizeEigenerBaustein({ id: 'abcdefgh1', art: 'skript', daten: 1 })).toBeNull()
    expect(sanitizeEigenerBaustein({ id: 'abcdefgh1', art: 'fall' })).toBeNull()
    expect(
      sanitizeEigenerBaustein({ id: 'abcdefgh1', art: 'fall', daten: {}, kapitel: '../x' })?.kapitel
    ).toBe('')
  })
})
