// Debounced persist-Storage für zustand. Standardmäßig serialisiert zustand bei
// JEDER Store-Änderung den kompletten (u. U. großen) Store synchron und schreibt
// ihn nach localStorage. Tippt man in ein store-gebundenes Feld (Set-/Projekt-/
// Bank-Name) oder strömt OSC-Feedback, passiert das pro Tastendruck/Nachricht –
// das blockiert den Hauptthread, Eingabefelder ruckeln bzw. „klemmen".
//
// Diese Storage bündelt schnelle Schreibvorgänge zu EINEM verzögerten Write und
// sichert Ausstehendes beim Schließen (pagehide/beforeunload), sodass nichts
// verloren geht.
//
// Mehrere Fenster teilen sich localStorage. syncAcrossWindows() hält einen Store
// deshalb fensterübergreifend aktuell – sonst überschriebe ein Fenster mit altem
// Stand beim nächsten Speichern, was ein anderes inzwischen geändert hat.

import type { PersistStorage, StorageValue } from 'zustand/middleware'

export interface DebouncedStorage<S> extends PersistStorage<S> {
  /** Liegt für diesen Namen noch eine eigene, ungeschriebene Änderung vor? */
  hasPending: (name: string) => boolean
  /** Ausstehendes sofort schreiben (z. B. bevor ein anderes Fenster es lesen soll). */
  flush: () => void
}

export function debouncedStorage<S>(delay = 400): DebouncedStorage<S> {
  const pending = new Map<string, StorageValue<S>>()
  let timer: ReturnType<typeof setTimeout> | null = null

  const flush = (): void => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    for (const [name, value] of pending) {
      try {
        localStorage.setItem(name, JSON.stringify(value))
      } catch {
        // localStorage voll/nicht verfügbar -> ignorieren
      }
    }
    pending.clear()
  }

  // Ausstehende Schreibvorgänge beim Verlassen/Schließen sichern.
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', flush)
  }

  return {
    getItem: (name) => {
      if (pending.has(name)) return pending.get(name) ?? null
      try {
        const raw = localStorage.getItem(name)
        return raw ? (JSON.parse(raw) as StorageValue<S>) : null
      } catch {
        return null
      }
    },
    setItem: (name, value) => {
      pending.set(name, value)
      // Timer NICHT bei jedem Write neu starten -> auch bei Dauer-Last (Feedback)
      // wird spätestens alle `delay` ms geschrieben statt nie.
      if (!timer) timer = setTimeout(flush, delay)
    },
    removeItem: (name) => {
      pending.delete(name)
      try {
        localStorage.removeItem(name)
      } catch {
        // egal
      }
    },
    hasPending: (name) => pending.has(name),
    flush
  }
}

/** Was syncAcrossWindows/flushStore von einem persistierten zustand-Store brauchen. */
interface PersistedStore {
  persist: {
    getOptions: () => { name?: string; storage?: unknown }
    rehydrate: () => Promise<void> | void
  }
}

const debounced = (store: PersistedStore): Partial<DebouncedStorage<unknown>> =>
  (store.persist.getOptions().storage ?? {}) as Partial<DebouncedStorage<unknown>>

/**
 * Store fensterübergreifend aktuell halten: Schreibt ein anderes Fenster denselben Store
 * (storage-Event), übernimmt dieses Fenster den Stand. Ein Werkzeug in mehreren Fenstern
 * zeigt so überall dasselbe, und eine offene Packliste überschreibt die Übernahme aus der
 * LED-Wall nicht mehr mit ihrem alten Stand.
 * Hat dieses Fenster selbst eine noch ungeschriebene Änderung (jünger als die Verzögerung),
 * gewinnt diese – sie wird gleich geschrieben und das andere Fenster übernimmt sie. So
 * springt nichts unter den Fingern zurück. Das Übernehmen schreibt selbst nichts zurück
 * (kein Pingpong zwischen den Fenstern).
 */
export function syncAcrossWindows(store: PersistedStore): void {
  if (typeof window === 'undefined') return
  window.addEventListener('storage', (e: StorageEvent) => {
    const name = store.persist.getOptions().name
    if (!name || e.key !== name || e.newValue === null) return
    if (e.storageArea && e.storageArea !== localStorage) return
    if (debounced(store).hasPending?.(name)) return
    void store.persist.rehydrate()
  })
}

/** Ausstehende Änderungen eines Stores sofort schreiben (z. B. vor dem Öffnen eines
 *  Fensters, das ihn lesen soll). */
export function flushStore(store: PersistedStore): void {
  debounced(store).flush?.()
}
