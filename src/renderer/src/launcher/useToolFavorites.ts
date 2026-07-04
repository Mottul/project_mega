import { useCallback, useEffect, useState } from 'react'
import { api } from '@renderer/lib/api'

// Favoriten-Werkzeuge (Tool-IDs) für die Schnellzugriff-Reihe im Startbildschirm.
// Persistiert in settings.json (main, Quelle der Wahrheit) statt localStorage.
// Die Reihenfolge im Array = Reihenfolge des Markierens (neuer zuletzt).
export interface ToolFavorites {
  favorites: string[]
  isFavorite: (id: string) => boolean
  toggle: (id: string) => void
}

export function useToolFavorites(): ToolFavorites {
  const [favorites, setFavorites] = useState<string[]>([])

  useEffect(() => {
    let alive = true
    void api.getSettings().then((s) => {
      if (alive) setFavorites(s.favoriteToolIds ?? [])
    })
    return () => {
      alive = false
    }
  }, [])

  const toggle = useCallback((id: string): void => {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      // Persistieren (fire-and-forget); der lokale State ist die Anzeigequelle.
      void api.setSettings({ favoriteToolIds: next })
      return next
    })
  }, [])

  const isFavorite = useCallback((id: string): boolean => favorites.includes(id), [favorites])

  return { favorites, isFavorite, toggle }
}
