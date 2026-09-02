import { describe, expect, it } from 'vitest'
import { Rng, seedFrom } from '../src/core/rng'

describe('Rng', () => {
  it('ist bei gleichem Seed reproduzierbar', () => {
    const a = new Rng(1234)
    const b = new Rng(1234)
    const first = Array.from({ length: 20 }, () => a.next())
    const second = Array.from({ length: 20 }, () => b.next())
    expect(first).toEqual(second)
  })

  it('liefert Werte in [0, 1)', () => {
    const rng = new Rng(7)
    for (let i = 0; i < 2000; i++) {
      const v = rng.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('hält int() innerhalb der Grenzen', () => {
    const rng = new Rng(99)
    for (let i = 0; i < 500; i++) {
      const v = rng.int(2, 5)
      expect(v).toBeGreaterThanOrEqual(2)
      expect(v).toBeLessThanOrEqual(5)
    }
  })

  it('erzeugt aus verschiedenen Namen verschiedene Seeds', () => {
    expect(seedFrom('wiese')).not.toBe(seedFrom('wueste'))
    expect(seedFrom('wiese')).toBe(seedFrom('wiese'))
  })
})
