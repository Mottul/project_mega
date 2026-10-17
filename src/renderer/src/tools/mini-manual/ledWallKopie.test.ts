import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LED_WALL_CONFIG,
  FIRST_WALL_ID,
  ledWallFileData,
  ledWallSection,
  sanitizeLedWallConfig
} from '../led-wall/config'
import {
  kennzahlenAus,
  kopieAus,
  modulKeys,
  unterschiede,
  waendeAus,
  wandUnterschiede
} from './ledWallKopie'
import { sanitizeAnleitung } from './sanitize'

describe('LED-Wall-Kopie', () => {
  const wand = { ...ledWallSection(DEFAULT_LED_WALL_CONFIG), widthM: '4', heightM: '2,5' }
  const config = sanitizeLedWallConfig(wand)

  it('rechnet Kennzahlen aus der Wand (496-2,0, 4 × 2,5 m)', () => {
    const k = kennzahlenAus(config)
    expect(k.modul).toBe('496-2,0')
    expect(k.spalten * k.reihen).toBe(k.module)
    expect(k.aufloesungX).toBe(k.spalten * 240)
  })

  it('Abschnitt bis Version 2: eine Wand mit fester Kennung; Kopie unabhängig von der Quelle', () => {
    const src = structuredClone(wand)
    const kopie = kopieAus(src, { rev: 3, sha256: 'a'.repeat(64) }, new Date('2026-10-17'))!
    src.widthM = '9'
    expect(kopie.waende.map((w) => [w.id, w.name])).toEqual([[FIRST_WALL_ID, 'Wand 1']])
    expect((kopie.waende[0].daten as { widthM: string }).widthM).toBe('4')
    expect(kopie.uebernommen).toBe('2026-10-17T00:00:00.000Z')
  })

  it('Abschnitt ab Version 3: alle Wände in Reihenfolge, Module ohne Doppelte', () => {
    const data = ledWallFileData('Messe', '', [
      { id: 'a', name: 'Links', config: { ...config, moduleKey: 'uS2+' } },
      { id: 'b', name: 'Rechts', config },
      { id: 'c', name: 'Mitte', config }
    ])
    const k = kopieAus(data, null)!
    expect(k.waende.map((w) => w.name)).toEqual(['Links', 'Rechts', 'Mitte'])
    expect(k.waende[0].kennzahlen.projekt).toBe('Messe')
    expect(modulKeys(k)).toEqual(['uS2+', '496-2,0'])
    expect(kopieAus({ walls: [] }, null)).toBeNull()
  })

  it('zeigt Unterschiede mit Einheit', () => {
    const alt = kennzahlenAus(config)
    const neu = kennzahlenAus({ ...config, widthM: '6', projectName: 'Messe' })
    const u = unterschiede(alt, neu)
    expect(u.map((x) => x.feld)).toEqual(
      expect.arrayContaining(['Projekt', 'Spalten', 'Breite', 'Auflösung (Breite)'])
    )
    expect(u.find((x) => x.feld === 'Projekt')).toEqual({ feld: 'Projekt', alt: '', neu: 'Messe' })
    expect(unterschiede(alt, alt)).toEqual([])
  })

  it('Unterschiede über Wände: neu, entfernt, umbenannt, geändert (mit Namen)', () => {
    const alt = waendeAus(
      ledWallFileData('', '', [
        { id: 'a', name: 'Links', config },
        { id: 'b', name: 'Rechts', config }
      ])
    )!
    const neu = waendeAus(
      ledWallFileData('', '', [
        { id: 'a', name: 'Bühne links', config: { ...config, widthM: '6' } },
        { id: 'c', name: 'Bar', config }
      ])
    )!
    const u = wandUnterschiede(alt, neu)
    expect(u).toEqual(
      expect.arrayContaining([
        { feld: 'Name der Wand', alt: 'Links', neu: 'Bühne links' },
        { feld: 'Wand', alt: '', neu: 'Bar (neu)' },
        { feld: 'Wand', alt: 'Rechts', neu: 'entfernt' }
      ])
    )
    expect(u.some((x) => x.feld === 'Bühne links: Breite')).toBe(true)
    expect(wandUnterschiede(alt, alt)).toEqual([])
  })

  it('Anleitung mit Kopie in alter Form (eine Wand ohne Liste) wird zur Liste', () => {
    const k = kennzahlenAus(config)
    const a = sanitizeAnleitung({
      ledWall: { daten: wand, kennzahlen: k, quelle: null, uebernommen: '2026-10-16' }
    })
    expect(a.ledWall?.waende).toEqual([
      { id: FIRST_WALL_ID, name: 'Wand 1', daten: wand, kennzahlen: k }
    ])
    // und die neue Form übersteht die Prüfung unverändert
    expect(sanitizeAnleitung(structuredClone(a)).ledWall).toEqual(a.ledWall)
  })
})
