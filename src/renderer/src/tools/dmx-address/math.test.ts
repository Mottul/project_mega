import { describe, expect, it } from 'vitest'
import { DMX_SWITCHES, dmxAddress, dmxBinary, dmxSwitches, dmxToggle, switchValue } from './math'

describe('Schalter', () => {
  it('neun Schalter mit den Werten 1, 2, 4 … 256', () => {
    expect(DMX_SWITCHES).toBe(9)
    expect(Array.from({ length: DMX_SWITCHES }, (_, i) => switchValue(i))).toEqual([
      1, 2, 4, 8, 16, 32, 64, 128, 256
    ])
  })
})

describe('Adresse → Schalter', () => {
  it('Adresse 1 (Vorgabe): alle aus', () => {
    expect(dmxSwitches(1)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(dmxBinary(1)).toBe('000000000')
  })

  it('Adresse 10: Schalter 1 und 4 an (1 + 8 = 9 = Adresse − 1)', () => {
    expect(dmxSwitches(10)).toEqual([1, 0, 0, 1, 0, 0, 0, 0, 0])
    expect(dmxBinary(10)).toBe('000001001') // Schalter 9 links, Schalter 1 rechts
  })

  it('Adresse 512: alle neun an', () => {
    expect(dmxSwitches(512)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1])
    expect(dmxBinary(512)).toBe('111111111')
  })

  it('ohne Adresse (Feld leer): alle Schalter aus, keine Binärzahl', () => {
    expect(dmxSwitches(null)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(dmxBinary(null)).toBeNull()
  })
})

describe('Schalter → Adresse (und zurück)', () => {
  it('von Adresse 1: Schalter 1 und 4 umlegen → Adresse 10', () => {
    const a = dmxToggle(1, 0)
    expect(a).toBe(2)
    expect(dmxToggle(a, 3)).toBe(10)
  })

  it('von Adresse 1 alle neun umlegen → 512, und wieder zurück → 1', () => {
    let a = 1
    for (let i = 0; i < DMX_SWITCHES; i++) a = dmxToggle(a, i)
    expect(a).toBe(512)
    for (let i = 0; i < DMX_SWITCHES; i++) a = dmxToggle(a, i)
    expect(a).toBe(1)
  })

  it('jede Adresse 1 … 512: Summe der Schalter + 1 ergibt sie wieder; zweimal umlegen ändert nichts', () => {
    for (let addr = 1; addr <= 512; addr++) {
      const sum = dmxSwitches(addr).reduce((s, on, i) => s + on * switchValue(i), 0)
      expect(sum + 1).toBe(addr)
      for (let i = 0; i < DMX_SWITCHES; i++) {
        const b = dmxToggle(addr, i)
        expect(b).toBeGreaterThanOrEqual(1)
        expect(b).toBeLessThanOrEqual(512)
        expect(dmxToggle(b, i)).toBe(addr)
      }
    }
  })

  it('ohne Adresse zählen alle Schalter als aus: Schalter 3 umlegen → Adresse 5', () => {
    expect(dmxToggle(null, 2)).toBe(5)
  })
})

describe('dmxAddress – Eingabe begrenzen', () => {
  it.each([
    [1, 1],
    [10, 10],
    [512, 512],
    [0, 1], // unter 1 → 1
    [-5, 1],
    [513, 512], // über 512 → 512
    [1000, 512],
    [1.4, 1], // ganze Zahl, kaufmännisch gerundet
    [1.5, 2],
    [511.5, 512]
  ])('%s → %s', (n, addr) => {
    expect(dmxAddress(n)).toBe(addr)
  })

  it('leer → keine Adresse', () => {
    expect(dmxAddress(null)).toBeNull()
  })
})
