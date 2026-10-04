import { afterEach, describe, expect, it } from 'vitest'
import { flag, readStored, writeStored, type Codec } from './usePersistentState'

const g = globalThis as unknown as { localStorage?: unknown }
function fakeStorage(init: Record<string, string> = {}, broken = false): Map<string, string> {
  const map = new Map(Object.entries(init))
  g.localStorage = {
    getItem: (k: string) => {
      if (broken) throw new Error('gesperrt')
      return map.get(k) ?? null
    },
    setItem: (k: string, v: string) => {
      if (broken) throw new Error('voll')
      map.set(k, v)
    }
  }
  return map
}
afterEach(() => {
  delete g.localStorage
})

describe('Bedien-Kleinigkeiten merken', () => {
  it('liest gespeicherte Schalter im bisherigen Format', () => {
    fakeStorage({ a: '1', b: '0', c: 'kaputt' })
    expect(readStored('a', false, flag)).toBe(true)
    expect(readStored('b', true, flag)).toBe(false)
    expect(readStored('c', true, flag)).toBe(true) // ungültig -> Vorgabe
    expect(readStored('fehlt', true, flag)).toBe(true)
  })

  it('schreibt im selben Format', () => {
    const map = fakeStorage()
    writeStored('a', true, flag)
    writeStored('b', false, flag)
    expect(Object.fromEntries(map)).toEqual({ a: '1', b: '0' })
  })

  it('übersteht gesperrten oder vollen Speicher', () => {
    fakeStorage({}, true)
    expect(readStored('a', true, flag)).toBe(true)
    expect(() => writeStored('a', false, flag)).not.toThrow()
    delete g.localStorage
    expect(readStored('a', false, flag)).toBe(false)
  })

  it('prüft eigene Formate beim Lesen', () => {
    const zoom: Codec<number> = {
      parse: (raw) => {
        const n = Number(raw)
        return Number.isFinite(n) && n >= 0.5 && n <= 4 ? n : null
      },
      format: String
    }
    fakeStorage({ ok: '1.5', zuGross: '99' })
    expect(readStored('ok', 1, zoom)).toBe(1.5)
    expect(readStored('zuGross', 1, zoom)).toBe(1)
  })
})
