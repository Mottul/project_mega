// Fensterübergreifender Abgleich persistierter Stores. Simuliert wird „dieses“ Fenster
// mit echtem zustand-Store; das andere Fenster schreibt in den gemeinsamen localStorage
// und löst – wie im Browser – ein storage-Event aus.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  debouncedStorage,
  flushStore,
  setStorageErrorHandler,
  syncAcrossWindows
} from './persistStorage'

class MemoryStorage {
  private map = new Map<string, string>()
  get length(): number {
    return this.map.size
  }
  key(i: number): string | null {
    return [...this.map.keys()][i] ?? null
  }
  getItem(k: string): string | null {
    return this.map.get(k) ?? null
  }
  setItem(k: string, v: string): void {
    this.map.set(k, String(v))
  }
  removeItem(k: string): void {
    this.map.delete(k)
  }
  clear(): void {
    this.map.clear()
  }
}

const g = globalThis as unknown as { window: EventTarget; localStorage: MemoryStorage }
let ls: MemoryStorage
const NAME = 'test-store'

interface S {
  items: string[]
  add: (x: string) => void
}
function makeStore() {
  const store = create<S>()(
    persist((set, get) => ({ items: [], add: (x) => set({ items: [...get().items, x] }) }), {
      name: NAME,
      version: 1,
      storage: debouncedStorage<S>(400)
    })
  )
  syncAcrossWindows(store)
  return store
}

/** Das andere Fenster speichert seinen Stand (wie debouncedStorage es tut). */
function otherWindowWrites(items: string[], key = NAME): void {
  const value = JSON.stringify({ state: { items }, version: 1 })
  ls.setItem(key, value)
  g.window.dispatchEvent(
    Object.assign(new Event('storage'), { key, newValue: value, storageArea: ls })
  )
}
const stored = (): string[] => JSON.parse(ls.getItem(NAME) ?? '{"state":{"items":[]}}').state.items
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  ls = new MemoryStorage()
  g.localStorage = ls
  g.window = new EventTarget()
})
afterEach(() => {
  vi.useRealTimers()
  setStorageErrorHandler(null)
})

describe('Stores fensterübergreifend abgleichen', () => {
  it('übernimmt den Stand eines anderen Fensters, ohne ihn zurückzuschreiben', async () => {
    const store = makeStore()
    otherWindowWrites(['vom anderen Fenster'])
    await settle()
    expect(store.getState().items).toEqual(['vom anderen Fenster'])
    // kein Echo: dieses Fenster hat nichts Neues zu schreiben
    const storage = store.persist.getOptions().storage as unknown as {
      hasPending: (n: string) => boolean
    }
    expect(storage.hasPending(NAME)).toBe(false)
  })

  it('überschreibt danach nicht mehr mit altem Stand', async () => {
    vi.useFakeTimers()
    const store = makeStore()
    otherWindowWrites(['Modul A'])
    await vi.advanceTimersByTimeAsync(0)
    store.getState().add('Modul B')
    await vi.advanceTimersByTimeAsync(500)
    expect(stored()).toEqual(['Modul A', 'Modul B'])
  })

  it('lässt eine eigene, noch ungeschriebene Änderung gewinnen', async () => {
    vi.useFakeTimers()
    const store = makeStore()
    store.getState().add('getippt')
    otherWindowWrites(['fremd'])
    await vi.advanceTimersByTimeAsync(0)
    expect(store.getState().items).toEqual(['getippt'])
    await vi.advanceTimersByTimeAsync(500)
    expect(stored()).toEqual(['getippt'])
  })

  it('ignoriert andere Schlüssel und Löschungen', async () => {
    const store = makeStore()
    otherWindowWrites(['x'], 'anderer-store')
    g.window.dispatchEvent(
      Object.assign(new Event('storage'), { key: NAME, newValue: null, storageArea: ls })
    )
    await settle()
    expect(store.getState().items).toEqual([])
  })

  it('schreibt Ausstehendes auf Wunsch sofort', () => {
    vi.useFakeTimers()
    const store = makeStore()
    store.getState().add('sofort')
    expect(ls.getItem(NAME)).toBeNull()
    flushStore(store)
    expect(stored()).toEqual(['sofort'])
  })
})

describe('Speichern scheitert (Speicher voll oder Profil beschädigt)', () => {
  /** localStorage, der auf Wunsch jedes Schreiben abweist */
  function vollerSpeicher(): { voll: boolean } {
    const zustand = { voll: true }
    const echt = ls.setItem.bind(ls)
    ls.setItem = (k: string, v: string): void => {
      if (zustand.voll) throw new Error('QuotaExceededError')
      echt(k, v)
    }
    return zustand
  }

  it('behält den Stand und schreibt ihn, sobald es wieder geht – statt ihn zu vergessen', async () => {
    vi.useFakeTimers()
    const store = makeStore()
    const speicher = vollerSpeicher()
    store.getState().add('eins')
    await vi.advanceTimersByTimeAsync(500)
    expect(ls.getItem(NAME)).toBeNull()
    // Platz ist wieder da: der nächste Versuch schreibt, auch ohne neue Änderung
    speicher.voll = false
    flushStore(store)
    expect(stored()).toEqual(['eins'])
  })

  it('meldet den Ausfall einmal – nicht bei jedem Tastendruck – und nach einem Erfolg wieder', async () => {
    vi.useFakeTimers()
    const meldungen: [string, string][] = []
    setStorageErrorHandler((name, err) => meldungen.push([name, String(err)]))
    const store = makeStore()
    const speicher = vollerSpeicher()
    store.getState().add('eins')
    await vi.advanceTimersByTimeAsync(500)
    expect(meldungen).toEqual([[NAME, 'Error: QuotaExceededError']])
    // weitertippen, der Speicher bleibt voll: keine zweite Meldung, der Stand wächst trotzdem
    store.getState().add('zwei')
    await vi.advanceTimersByTimeAsync(500)
    store.getState().add('drei')
    await vi.advanceTimersByTimeAsync(500)
    expect(meldungen).toHaveLength(1)
    expect(store.getState().items).toEqual(['eins', 'zwei', 'drei'])
    // wieder Platz: alles kommt an
    speicher.voll = false
    store.getState().add('vier')
    await vi.advanceTimersByTimeAsync(500)
    expect(stored()).toEqual(['eins', 'zwei', 'drei', 'vier'])
    // ein neuer Ausfall danach wird wieder gemeldet
    speicher.voll = true
    store.getState().add('fünf')
    await vi.advanceTimersByTimeAsync(500)
    expect(meldungen).toHaveLength(2)
  })

  it('ein eigener, ungeschriebener Stand gewinnt weiter gegen ein anderes Fenster', async () => {
    vi.useFakeTimers()
    const store = makeStore()
    const speicher = vollerSpeicher()
    store.getState().add('nur hier')
    await vi.advanceTimersByTimeAsync(500)
    // das andere Fenster schreibt in denselben Speicher – dessen Schreiben klappt
    speicher.voll = false
    otherWindowWrites(['fremd'])
    speicher.voll = true
    await vi.advanceTimersByTimeAsync(0)
    expect(store.getState().items).toEqual(['nur hier'])
  })

  it('ein Melder, der selbst wirft, hält das Speichern nicht auf', async () => {
    vi.useFakeTimers()
    setStorageErrorHandler(() => {
      throw new Error('Toast kaputt')
    })
    const store = makeStore()
    const speicher = vollerSpeicher()
    store.getState().add('eins')
    await vi.advanceTimersByTimeAsync(500)
    speicher.voll = false
    flushStore(store)
    expect(stored()).toEqual(['eins'])
  })

  it('ohne Melder (Rechner-PWA) bleibt es still, der Stand aber erhalten', async () => {
    vi.useFakeTimers()
    setStorageErrorHandler(null)
    const store = makeStore()
    const speicher = vollerSpeicher()
    store.getState().add('eins')
    await vi.advanceTimersByTimeAsync(500)
    speicher.voll = false
    flushStore(store)
    expect(stored()).toEqual(['eins'])
  })
})
