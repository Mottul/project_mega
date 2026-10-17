import { describe, expect, it } from 'vitest'
import { DEFAULT_LED_WALL_CONFIG, ledWallSection } from '../led-wall/config'
import { kennzahlenAus, kopieAus, unterschiede } from './ledWallKopie'

describe('LED-Wall-Kopie', () => {
  const wand = { ...ledWallSection(DEFAULT_LED_WALL_CONFIG), widthM: '4', heightM: '2,5' }

  it('rechnet Kennzahlen aus dem Abschnitt (496-2,0, 4 × 2,5 m)', () => {
    const k = kennzahlenAus(wand)
    expect(k.modul).toBe('496-2,0')
    expect(k.spalten * k.reihen).toBe(k.module)
    expect(k.aufloesungX).toBe(k.spalten * 240)
  })

  it('Kopie ist unabhängig von der Quelle', () => {
    const src = structuredClone(wand)
    const kopie = kopieAus(src, { rev: 3, sha256: 'a'.repeat(64) }, new Date('2026-10-17'))
    src.projectName = 'geändert'
    expect((kopie.daten as { projectName: string }).projectName).toBe('')
    expect(kopie.uebernommen).toBe('2026-10-17T00:00:00.000Z')
  })

  it('zeigt Unterschiede mit Einheit', () => {
    const alt = kennzahlenAus(wand)
    const neu = kennzahlenAus({ ...wand, widthM: '6', projectName: 'Messe' })
    const u = unterschiede(alt, neu)
    expect(u.map((x) => x.feld)).toEqual(
      expect.arrayContaining(['Projekt', 'Spalten', 'Breite', 'Auflösung (Breite)'])
    )
    expect(u.find((x) => x.feld === 'Projekt')).toEqual({ feld: 'Projekt', alt: '', neu: 'Messe' })
    expect(unterschiede(alt, alt)).toEqual([])
  })
})
