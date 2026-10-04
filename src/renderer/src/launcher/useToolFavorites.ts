import { useCallback, useEffect, useState } from 'react'
import { api } from '@renderer/lib/api'

// Favoriten-Werkzeuge (Tool-IDs) für den Startbildschirm: eigene Reihe oben bzw. die
// Ansicht „Nur Favoriten". Persistiert in settings.json (main, Quelle der Wahrheit)
// statt localStorage. Die Reihenfolge im Array ist die eigene Sortierung des Nutzers
// (Ziehen/Pfeile/A–Z); neu markierte Werkzeuge kommen ans Ende.
export interface ToolFavorites {
  favorites: string[]
  isFavorite: (id: string) => boolean
  toggle: (id: string) => void
  /** neue Reihenfolge übernehmen und speichern */
  reorder: (next: string[]) => void
  favoritesOnly: boolean
  setFavoritesOnly: (on: boolean) => void
}

export function useToolFavorites(): ToolFavorites {
  const [favorites, setFavorites] = useState<string[]>([])
  const [favoritesOnly, setOnly] = useState(false)

  useEffect(() => {
    let alive = true
    void api.getSettings().then((s) => {
      if (!alive) return
      setFavorites(s.favoriteToolIds ?? [])
      setOnly(s.launcherFavoritesOnly ?? false)
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

  const reorder = useCallback((next: string[]): void => {
    setFavorites(next)
    void api.setSettings({ favoriteToolIds: next })
  }, [])

  const setFavoritesOnly = useCallback((on: boolean): void => {
    setOnly(on)
    void api.setSettings({ launcherFavoritesOnly: on })
  }, [])

  const isFavorite = useCallback((id: string): boolean => favorites.includes(id), [favorites])

  return { favorites, isFavorite, toggle, reorder, favoritesOnly, setFavoritesOnly }
}
