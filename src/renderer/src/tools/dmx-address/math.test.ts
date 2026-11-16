import { describe, expect, it } from 'vitest'
import {
  DMX_MAX_ADDRESS,
  DMX_SWITCHES,
  dmxAddress,
  dmxBinary,
  dmxSwitches,
  dmxToggle,
  switchValue
} from './math'

// Wie an den Geräten üblich: Die Adresse ist die Summe der eingeschalteten Werte – Schalter 1 an
// ist Adresse 1 (bis 16.11.2026 rechnete der Rechner Summe + 1, alle aus war Adresse 1).

describe('Schalter', () => {
  it('neun Schalter mit den Werten 1, 2, 4 … 256 – zusammen höchstens Adresse 511', () => {
    expect(DMX_SWITCHES).toBe(9)
    expect(Array.from({ length: DMX_SWITCHES }, (_, i) => switchValue(i))).toEqual([
      1, 2, 4, 8, 16, 32, 64, 128, 256
    ])
    expect(DMX_MAX_ADDRESS).toBe(511)
  })
})

describe('Adresse → Schalter', () => {
  it('Adresse 1 (Vorgabe): Schalter 1 an', () => {
    expect(dmxSwitches(1)).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(dmxBinary(1)).toBe('000000001')
  })

  it('Adresse 10: Schalter 2 und 4 an (2 + 8)', () => {
    expect(dmxSwitches(10)).toEqual([0, 1, 0, 1, 0, 0, 0, 0, 0])
    expect(dmxBinary(10)).toBe('000001010') // Schalter 9 links, Schalter 1 rechts
  })

  it('Adresse 256: nur Schalter 9; Adresse 511: alle neun an', () => {
    expect(dmxSwitches(256)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 1])
    expect(dmxSwitches(511)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1])
    expect(dmxBinary(511)).toBe('111111111')
  })

  it('ohne Adresse (Feld leer): alle Schalter aus, keine Binärzahl', () => {
    expect(dmxSwitches(null)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(dmxBinary(null)).toBeNull()
  })
})

describe('Schalter → Adresse (und zurück)', () => {
  it('von Adresse 1: Schalter 3 umlegen → Adresse 5 (1 + 4)', () => {
    expect(dmxToggle(1, 2)).toBe(5)
  })

  it('ohne Adresse: Schalter 2 und 4 umlegen → Adresse 10', () => {
    const a = dmxToggle(null, 1)
    expect(a).toBe(2)
    expect(dmxToggle(a, 3)).toBe(10)
  })

  it('den letzten Schalter ausschalten: keine Adresse (alle aus ist keine DMX-Adresse)', () => {
    expect(dmxToggle(1, 0)).toBeNull()
    expect(dmxToggle(256, 8)).toBeNull()
  })

  it('alle neun von „ohne Adresse“ einschalten → 511, und wieder aus → keine Adresse', () => {
    let a: number | null = null
    for (let i = 0; i < DMX_SWITCHES; i++) a = dmxToggle(a, i)
    expect(a).toBe(511)
    for (let i = 0; i < DMX_SWITCHES; i++) a = dmxToggle(a, i)
    expect(a).toBeNull()
  })

  it('jede Adresse 1 … 511: Summe der Schalter ergibt sie wieder; zweimal umlegen ändert nichts', () => {
    // fest bis 511 (nicht bis DMX_MAX_ADDRESS): Fehlte die Konstante, liefe die Schleife leer
    for (let addr = 1; addr <= 511; addr++) {
      const sum = dmxSwitches(addr).reduce((s, on, i) => s + on * switchValue(i), 0)
      expect(sum).toBe(addr)
      for (let i = 0; i < DMX_SWITCHES; i++) {
        const b = dmxToggle(addr, i)
        if (b != null) {
          expect(b).toBeGreaterThanOrEqual(1)
          expect(b).toBeLessThanOrEqual(DMX_MAX_ADDRESS)
        }
        expect(dmxToggle(b, i)).toBe(addr)
      }
    }
  })
})

describe('dmxAddress – Eingabe begrenzen', () => {
  it.each([
    [1, 1],
    [10, 10],
    [511, 511],
    [0, 1], // unter 1 → 1
    [-5, 1],
    [512, 511], // mit neun Schaltern höchstens 511
    [1000, 511],
    [1.4, 1], // ganze Zahl, kaufmännisch gerundet
    [1.5, 2],
    [510.5, 511]
  ])('%s → %s', (n, addr) => {
    expect(dmxAddress(n)).toBe(addr)
  })

  it('leer → keine Adresse', () => {
    expect(dmxAddress(null)).toBeNull()
  })
})
