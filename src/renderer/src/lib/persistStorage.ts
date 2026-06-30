// Debounced persist-Storage für zustand. Standardmäßig serialisiert zustand bei
// JEDER Store-Änderung den kompletten (u. U. großen) Store synchron und schreibt
// ihn nach localStorage. Tippt man in ein store-gebundenes Feld (Set-/Projekt-/
// Bank-Name) oder strömt OSC-Feedback, passiert das pro Tastendruck/Nachricht –
// das blockiert den Hauptthread, Eingabefelder ruckeln bzw. „klemmen".
//
// Diese Storage bündelt schnelle Schreibvorgänge zu EINEM verzögerten Write und
// sichert Ausstehendes beim Schließen (pagehide/beforeunload), sodass nichts
// verloren geht.

import type { PersistStorage, StorageValue } from 'zustand/middleware'

export function debouncedStorage<S>(delay = 400): PersistStorage<S> {
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
    }
  }
}
