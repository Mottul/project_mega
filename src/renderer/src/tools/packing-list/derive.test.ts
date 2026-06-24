import { beforeEach, describe, expect, it } from 'vitest'
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

describe('deriveFromLedWall – Property', () => {
  it('Modul-Menge ist immer ≥ 1 (cols/rows mind. 1, auch bei leerer Eingabe)', () => {
    for (const dim of ['0', '0,1', '10']) {
      useLedWall.setState({ widthM: dim, heightM: dim })
      expect(deriveFromLedWall()[0].qty).toBeGreaterThanOrEqual(1)
    }
  })
})
