import { describe, expect, it } from 'vitest'
import {
  freierTitel,
  importZusammenfuehren,
  isBausteinId,
  namensgleiche,
  packBausteine,
  sanitizeEigenerBaustein,
  unpackBausteine
} from './bausteine'
import type { EigenerBaustein } from './types'

const bs = (
  id: string,
  titel: string,
  version = 1,
  p: Partial<EigenerBaustein> = {}
): EigenerBaustein => ({
  id,
  art: 'bloecke',
  titel,
  kapitel: 'einAus',
  daten: [],
  geaendertAm: '2026-10-18T10:00:00.000Z',
  geaendertVon: 'matthias',
  version,
  ...p
})

describe('eigene Bausteine – Namen, Weitergeben, Import', () => {
  it('gleicher Name: gleiche Art und gleiches Kapitel, Groß/klein und Leerzeichen egal', () => {
    const l = [
      bs('aaaaaaaa1', 'Einschalten'),
      bs('aaaaaaaa2', 'Einschalten', 1, { kapitel: 'software' })
    ]
    expect(namensgleiche(l, bs('neuneuneu', ' einschalten ')).map((x) => x.id)).toEqual([
      'aaaaaaaa1'
    ])
    expect(namensgleiche(l, bs('aaaaaaaa1', 'Einschalten'))).toEqual([]) // sich selbst nicht
    expect(freierTitel(l, bs('x', 'Einschalten'))).toBe('Einschalten (2)')
    expect(
      freierTitel([...l, bs('aaaaaaaa3', 'Einschalten (2)')], bs('x', 'Einschalten (2)'))
    ).toBe('Einschalten (3)')
  })

  it('Datei zum Weitergeben: runder Weg; fremdes, Neueres und Kaputtes wird abgewiesen', () => {
    const l = [bs('aaaaaaaa1', 'A'), bs('aaaaaaaa2', 'B')]
    expect(unpackBausteine(JSON.parse(packBausteine(l)))).toEqual(l)
    expect(
      unpackBausteine({ app: 'mottulbox', typ: 'projektdatei', version: 1, bausteine: [] })
    ).toBeNull()
    expect(
      unpackBausteine({ app: 'mottulbox', typ: 'bausteine', version: 9, bausteine: [] })
    ).toBeNull()
    expect(
      unpackBausteine({
        app: 'mottulbox',
        typ: 'bausteine',
        version: 1,
        bausteine: [{ id: '../../x', art: 'fall', daten: {} }, l[0], l[0]]
      })
    ).toEqual([l[0]])
  })

  it('Import: neu, neuere Version ersetzt, gleiche/ältere übersprungen, gleicher Name mit „(2)“', () => {
    const vorhanden = [bs('aaaaaaaa1', 'Einschalten', 3), bs('aaaaaaaa2', 'Ausschalten', 1)]
    const r = importZusammenfuehren(vorhanden, [
      bs('aaaaaaaa1', 'Einschalten', 2), // älter
      bs('aaaaaaaa2', 'Ausschalten neu', 4), // neuer
      bs('bbbbbbbb1', 'einschalten', 1), // anderer Baustein, gleicher Name
      bs('bbbbbbbb2', 'Stromausfall', 1)
    ])
    expect([r.neu, r.aktualisiert, r.uebersprungen, r.umbenannt]).toEqual([2, 1, 1, 1])
    expect(r.schreiben.map((b) => [b.id, b.titel, b.version])).toEqual([
      ['aaaaaaaa2', 'Ausschalten neu', 4],
      ['bbbbbbbb1', 'einschalten (2)', 1],
      ['bbbbbbbb2', 'Stromausfall', 1]
    ])
    // Autor und Datum bleiben wie in der Datei
    expect(r.schreiben[0].geaendertVon).toBe('matthias')
  })
})

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
