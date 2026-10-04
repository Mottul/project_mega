import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FavoriteGroup, LauncherTileSize } from '@shared/types'
import { api } from '@renderer/lib/api'
import { flatten, normalizeGroups, toggleTool } from './favoriteGroups'

// Einstellungen des Startbildschirms: Favoriten in eigenen Kategorien, Ansicht „Nur
// Favoriten" und Kachelgröße. Persistiert in settings.json (main, Quelle der Wahrheit)
// statt localStorage; favoriteToolIds wird als flache Liste mitgeschrieben (ältere
// App-Versionen lesen nur diese).
export interface LauncherPrefs {
  groups: FavoriteGroup[]
  isFavorite: (id: string) => boolean
  toggle: (id: string) => void
  /** Kategorien ändern (Funktion bekommt den aktuellen Stand) und speichern */
  updateGroups: (fn: (groups: FavoriteGroup[]) => FavoriteGroup[]) => void
  favoritesOnly: boolean
  setFavoritesOnly: (on: boolean) => void
  tileSize: LauncherTileSize
  setTileSize: (size: LauncherTileSize) => void
}

export function useLauncherPrefs(): LauncherPrefs {
  const [groups, setGroups] = useState<FavoriteGroup[]>([])
  const [favoritesOnly, setOnly] = useState(false)
  const [tileSize, setSize] = useState<LauncherTileSize>('medium')

  useEffect(() => {
    let alive = true
    void api.getSettings().then((s) => {
      if (!alive) return
      setGroups(normalizeGroups(s.favoriteGroups, s.favoriteToolIds))
      setOnly(s.launcherFavoritesOnly ?? false)
      setSize(s.launcherTileSize ?? 'medium')
    })
    return () => {
      alive = false
    }
  }, [])

  const updateGroups = useCallback((fn: (g: FavoriteGroup[]) => FavoriteGroup[]): void => {
    setGroups((prev) => {
      const next = fn(prev)
      // Persistieren (fire-and-forget); der lokale State ist die Anzeigequelle.
      if (next !== prev) {
        void api.setSettings({ favoriteGroups: next, favoriteToolIds: flatten(next) })
      }
      return next
    })
  }, [])

  const toggle = useCallback(
    (id: string): void => updateGroups((g) => toggleTool(g, id)),
    [updateGroups]
  )

  const favoriteSet = useMemo(() => new Set(flatten(groups)), [groups])
  const isFavorite = useCallback((id: string): boolean => favoriteSet.has(id), [favoriteSet])

  const setFavoritesOnly = useCallback((on: boolean): void => {
    setOnly(on)
    void api.setSettings({ launcherFavoritesOnly: on })
  }, [])

  const setTileSize = useCallback((size: LauncherTileSize): void => {
    setSize(size)
    void api.setSettings({ launcherTileSize: size })
  }, [])

  return {
    groups,
    isFavorite,
    toggle,
    updateGroups,
    favoritesOnly,
    setFavoritesOnly,
    tileSize,
    setTileSize
  }
}
