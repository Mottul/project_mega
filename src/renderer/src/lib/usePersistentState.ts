// Bedien-Kleinigkeiten pro Rechner merken: aufgeklappte Panels, Vorschau an/aus, FPS-Anzeige.
// Ihr Verlust tut nicht weh – deshalb schlicht im localStorage, aber an EINER Stelle mit
// Prüfung beim Lesen und abgefangenen Speicherfehlern (privater Modus, voll, gesperrt).
// Was nicht hierher gehört: App-Einstellungen (settings.json, lib/settings.ts) und
// Arbeitsdaten eines Werkzeugs (zustand-Store mit debouncedStorage).

import { useCallback, useState } from 'react'

/** Wie ein Wert als Text gespeichert und beim Lesen geprüft wird (null = ungültig). */
export interface Codec<T> {
  parse: (raw: string) => T | null
  format: (value: T) => string
}

/** An/Aus als '1'/'0' (so speicherte die App es schon immer). */
export const flag: Codec<boolean> = {
  parse: (raw) => (raw === '1' ? true : raw === '0' ? false : null),
  format: (v) => (v ? '1' : '0')
}

export function readStored<T>(key: string, fallback: T, codec: Codec<T>): T {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : (codec.parse(raw) ?? fallback)
  } catch {
    return fallback
  }
}

export function writeStored<T>(key: string, value: T, codec: Codec<T>): void {
  try {
    localStorage.setItem(key, codec.format(value))
  } catch {
    // nicht verfügbar -> gilt eben nur für diese Sitzung
  }
}

/** useState, der sich den Wert unter `key` merkt (gelesen einmal beim ersten Rendern). */
export function usePersistentState<T>(
  key: string,
  fallback: T,
  codec: Codec<T>
): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => readStored(key, fallback, codec))
  const set = useCallback(
    (next: T | ((prev: T) => T)) =>
      setValue((prev) => {
        const v = typeof next === 'function' ? (next as (p: T) => T)(prev) : next
        writeStored(key, v, codec)
        return v
      }),
    [key, codec]
  )
  return [value, set]
}
