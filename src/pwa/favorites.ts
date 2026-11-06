// Favoriten der Rechner-PWA: angeheftete Rechner stehen oben in eigener Reihenfolge, der Rest
// folgt in der Reihenfolge der App. Bewusst Favoriten statt freier Reihenfolge aller Rechner:
// Wer nur zwei, drei Rechner braucht, heftet sie an und muss den Rest nie anfassen – und ein neuer
// Rechner erscheint trotzdem von selbst (unten), statt in einer gemerkten Liste zu fehlen.
// Gemerkt als Bedien-Kleinigkeit (usePersistentState) – die PWA hat keine settings.json.
import type { Codec } from '@renderer/lib/usePersistentState'

export const FAVORITES_KEY = 'pwa:favoriten'

/** Liste der IDs als JSON; Fremdes (kein Array, keine Texte, doppelt) fällt beim Lesen heraus */
export const favoritesCodec: Codec<string[]> = {
  parse: (raw) => {
    try {
      const v: unknown = JSON.parse(raw)
      if (!Array.isArray(v)) return null
      return [...new Set(v.filter((x): x is string => typeof x === 'string'))]
    } catch {
      return null
    }
  },
  format: (ids) => JSON.stringify(ids)
}

/** An- bzw. abheften; neu Angeheftetes kommt ans Ende der Favoriten */
export function toggleFavorite(favs: string[], id: string): string[] {
  return favs.includes(id) ? favs.filter((f) => f !== id) : [...favs, id]
}

/** Favorit um einen Platz nach oben (-1) oder unten (+1); am Rand bleibt alles, wie es ist */
export function moveFavorite(favs: string[], id: string, dir: -1 | 1): string[] {
  const i = favs.indexOf(id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= favs.length) return favs
  const next = [...favs]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

/**
 * Rechner in Favoriten (gemerkte Reihenfolge) und übrige (Reihenfolge der App) teilen. IDs, die
 * es nicht mehr gibt (Rechner umbenannt/entfernt), fallen still heraus.
 */
export function splitFavorites<T extends { id: string }>(
  tools: T[],
  favs: string[]
): { favorites: T[]; rest: T[] } {
  const byId = new Map(tools.map((t) => [t.id, t]))
  const favorites = favs.map((id) => byId.get(id)).filter((t): t is T => t !== undefined)
  const pinned = new Set(favorites.map((t) => t.id))
  return { favorites, rest: tools.filter((t) => !pinned.has(t.id)) }
}
