import { beforeEach, describe, expect, it } from 'vitest'
import { sanitizeLedWallConfig } from '../led-wall/config'
import { useLedWall } from '../led-wall/store'
import { deriveFromLedWall } from './derive'

type Item = ReturnType<typeof deriveFromLedWall>[number]
const byName = (items: Item[], name: string): Item | undefined => items.find((i) => i.name === name)

// Sauberer Ausgangszustand vor jedem Test (Store ist ein modul-globaler Singleton).
beforeEach(() => {
  useLedWall.setState({
    moduleKey: '496-2,0', // dimW 496 mm, 7,5 kg, canCurve=false
    widthM: '4',
    heightM: '2,5',
    buildMode: 'stacked',
    curveMode: 'circle',
    selectedCircle: 0,
    sig: [],
    pwr: []
  })
})

describe('deriveFromLedWall – LED-Modul-Position', () => {
  it('Default 4 m × 2,5 m, 496-2,0: 8×5 = 40 Module, 300 kg', () => {
    // cols=round(4/0,496)=8, rows=round(2,5/0,496)=5, total=40, Gewicht=40·7,5=300
    const item = byName(deriveFromLedWall(), 'LED-Modul 496-2,0')
    expect(item).toBeDefined()
    expect(item?.qty).toBe(40)
    expect(item?.unit).toBe('Stk.')
    expect(item?.note).toContain('8×5') // "8×5"
    expect(item?.note).toContain('300')
  })
})

describe('deriveFromLedWall – Ground-Stack (stacked)', () => {
  it('Standfüße = ⌈footprintW⌉ und Ballast = Füße · kg(Höhe)', () => {
    // footprintW=actualW=3,968 -> 4 Füße; Höhe 2,48 m -> 38 kg/Fuß -> 152 kg
    const items = deriveFromLedWall()
    expect(byName(items, 'Ground-Stack-Fuß (LSU)')?.qty).toBe(4)
    const ballast = byName(items, 'Ballast')
    expect(ballast?.qty).toBe(152)
    expect(ballast?.unit).toBe('kg')
  })
})

describe('deriveFromLedWall – Kabel aus den Ketten', () => {
  it('leere Grids → Sammelposition statt Einzelkabel', () => {
    const items = deriveFromLedWall()
    const fallback = byName(items, 'Daten-/Stromkabel')
    expect(fallback?.qty).toBe(1)
    expect(fallback?.unit).toBe('Satz')
    expect(byName(items, 'Datenleitung (Einspeisung/Kette)')).toBeUndefined()
  })
  it('je Kette 1 Einspeisung + (Module−1) Brücken (Daten & Strom getrennt)', () => {
    useLedWall.setState({
      sig: [[0, 0, 0, -1]], // eine Kette über 3 Zellen -> 1 Einspeisung, 2 Brücken
      pwr: [[0, 0, 1, -1]] // zwei Ketten (2 + 1 Zelle) -> 2 Einspeisungen, 1 Brücke
    })
    const items = deriveFromLedWall()
    expect(byName(items, 'Datenleitung (Einspeisung/Kette)')?.qty).toBe(1)
    expect(byName(items, 'Daten-Brücke (Modul→Modul)')?.qty).toBe(2)
    expect(byName(items, 'Stromleitung (Einspeisung/Kette)')?.qty).toBe(2)
    expect(byName(items, 'Strom-Brücke (Modul→Modul)')?.qty).toBe(1)
  })
})

describe('deriveFromLedWall – Rigging (flying)', () => {
  it('gerade Wand (Default-Modul, kein Curving): Punkte = max(2, ⌈Breite/3⌉)', () => {
    useLedWall.setState({ buildMode: 'flying' })
    const items = deriveFromLedWall()
    expect(byName(items, 'Rigging-Punkt / Motor')?.qty).toBe(2)
    expect(byName(items, 'Ground-Stack-Fuß (LSU)')).toBeUndefined()
  })
})

describe('deriveFromLedWall – mehrere Wände', () => {
  it('je Wand eine Kategorie, gleiche Module mit Summe', () => {
    const base = sanitizeLedWallConfig({})
    const items = deriveFromLedWall([
      { id: 'a', name: 'Links', config: { ...base, widthM: '2', heightM: '1' } },
      { id: 'b', name: 'Rechts', config: { ...base, widthM: '4', heightM: '2,5' } },
      { id: 'c', name: 'Bar', config: { ...base, moduleKey: 'uS2+', widthM: '1', heightM: '1' } }
    ])
    const cats = [...new Set(items.map((i) => i.category))]
    expect(cats).toEqual(['LED-Wall · Links', 'LED-Wall · Rechts', 'LED-Wall · Bar'])
    const mods = items.filter((i) => i.name === 'LED-Modul 496-2,0')
    expect(mods.map((m) => m.qty)).toEqual([8, 40]) // 4 × 2 und 8 × 5
    expect(mods.every((m) => m.note.endsWith('alle Wände zusammen: 48 Stk.'))).toBe(true)
    // ein Modul nur in einer Wand: keine Summe
    expect(byName(items, 'LED-Modul uS2+')?.note).not.toContain('zusammen')
  })
})

describe('deriveFromLedWall – Prozessor und Backup', () => {
  it('Prozessor einmal je Gruppe (geteilt bei der Wand mit dem Prozessor), Backup-Leitungen je Wand', () => {
    const base = sanitizeLedWallConfig({})
    const items = deriveFromLedWall([
      {
        id: 'a',
        name: 'Links',
        config: { ...base, sig: [[0, 0, 1, 1]], sigMeta: { '1': { backup: {} } } }
      },
      {
        id: 'b',
        name: 'Rechts',
        config: { ...base, sig: [[0]], processor: { ...base.processor, shareWith: 'a' } }
      },
      { id: 'c', name: 'Bar', config: { ...base, moduleKey: 'uS2+' } }
    ])
    const procs = items.filter((i) => i.name.startsWith('Prozessor'))
    expect(procs.map((p) => [p.category, p.name, p.note])).toEqual([
      ['LED-Wall · Links', 'Prozessor NovaPro UHD Jr', 'für Links und Rechts'],
      ['LED-Wall · Bar', 'Prozessor Tessera S8', '']
    ])
    const b = items.filter((i) => i.name.startsWith('Datenleitung Backup'))
    expect(b.map((x) => [x.category, x.qty])).toEqual([['LED-Wall · Links', 1]])
  })
})

describe('deriveFromLedWall – Glasfaser-Strecke', () => {
  it('Boxen, Fasern und Stromkabel einmal beim Prozessor; Einspeisung von der CVT10', () => {
    const base = sanitizeLedWallConfig({})
    const items = deriveFromLedWall([
      {
        id: 'a',
        name: 'Wand 1',
        config: {
          ...base,
          sig: [[0, 0, 1, 1]],
          fiber: { box: 'cvt10', variant: 'S', redundancy: 'fiber', lengthM: 150 }
        }
      }
    ])
    expect(
      items.filter((i) => /CVT10|Glasfaser/.test(i.name)).map((i) => [i.name, i.qty, i.note])
    ).toEqual([
      ['NovaStar CVT10-S', 1, 'je Achtergruppe eine (Ports 1–8, 9–16)'],
      // 150 m aus dem Lager: 100 + 50 m mit Kupplung, je Box zwei Fasern (redundant)
      ['Glasfaser Singlemode LC-LC 100 m', 2, '150 m aus 100 + 50 m · mit Ersatzfaser je Box'],
      ['Glasfaser Singlemode LC-LC 50 m', 2, '150 m aus 100 + 50 m · mit Ersatzfaser je Box'],
      ['Netzkabel PowerCON (CVT10)', 1, '']
    ])
    expect(byName(items, 'LC-LC-Kupplung Singlemode')?.qty).toBe(2)
    expect(byName(items, 'Datenleitung (Einspeisung/Kette)')?.note).toBe(
      'CVT10 → erste Kachel je Kette (Patchkabel)'
    )
  })

  it('Hot-Backup: zweite Box, Backup-Leitungen von dort', () => {
    const base = sanitizeLedWallConfig({})
    const items = deriveFromLedWall([
      {
        id: 'a',
        name: 'Wand 1',
        config: {
          ...base,
          sig: [[0, 0, 1, 1]],
          fiber: { box: 'cvt10', variant: 'M', redundancy: 'hot-backup' }
        }
      }
    ])
    expect(byName(items, 'NovaStar CVT10-M')?.qty).toBe(2)
    expect(byName(items, 'Glasfaser Multimode (OM3/OM4), LC-LC')?.note).toBe(
      'Länge eintragen · nicht im Lager · mit Ersatzfaser je Box'
    )
    const b = byName(items, 'Datenleitung Backup (letztes Modul → Prozessor)')
    expect([b?.qty, b?.note]).toEqual([
      2,
      'Backup-Leitungen der Signalketten, von der zweiten CVT10'
    ])
  })
})

describe('deriveFromLedWall – Property', () => {
  it('Modul-Menge ist immer ≥ 1 (cols/rows mind. 1, auch bei leerer Eingabe)', () => {
    for (const dim of ['0', '0,1', '10']) {
      useLedWall.setState({ widthM: dim, heightM: dim })
      expect(deriveFromLedWall()[0].qty).toBeGreaterThanOrEqual(1)
    }
  })
})
