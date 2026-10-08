// Reihenfolge der Elemente: verschieben (auch mehrere zugleich), sortieren, mischen. Rein und
// getestet; die Liste ist immer genau das, was gerendert wird („Mischen“ würfelt sichtbar).

/** Natürlich sortieren wie collectMediaFiles: „2“ vor „10“, Groß/klein egal. */
export const collator = new Intl.Collator('de', { numeric: true, sensitivity: 'base' })

/** Ein Element von `from` nach `to` (Ziel-Index in der Liste VOR dem Entfernen). */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= list.length) return list
  const out = [...list]
  const [item] = out.splice(from, 1)
  const at = Math.max(0, Math.min(out.length, to > from ? to - 1 : to))
  out.splice(at, 0, item)
  return out
}

/**
 * Mehrere Elemente (ids) als Block an die Position vor `beforeId` setzen (null = ans Ende);
 * ihre Reihenfolge untereinander bleibt.
 */
export function moveMany<T extends { id: string }>(
  list: T[],
  ids: string[],
  beforeId: string | null
): T[] {
  const set = new Set(ids)
  if (beforeId !== null && set.has(beforeId)) return list
  const moving = list.filter((x) => set.has(x.id))
  const rest = list.filter((x) => !set.has(x.id))
  const at = beforeId === null ? rest.length : rest.findIndex((x) => x.id === beforeId)
  if (at < 0) return list
  return [...rest.slice(0, at), ...moving, ...rest.slice(at)]
}

/** Um eine Stelle nach vorn (-1) oder hinten (+1); ausgewählte als Block. */
export function nudge<T extends { id: string }>(list: T[], ids: string[], dir: -1 | 1): T[] {
  const set = new Set(ids)
  const idx = list.map((x, i) => (set.has(x.id) ? i : -1)).filter((i) => i >= 0)
  if (!idx.length) return list
  if (dir < 0 && idx[0] === 0) return list
  if (dir > 0 && idx[idx.length - 1] === list.length - 1) return list
  const out = [...list]
  const order = dir < 0 ? idx : [...idx].reverse()
  for (const i of order) {
    const j = i + dir
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export type SortKey = 'name' | 'date' | 'type'

const basename = (p: string): string => p.split(/[\\/]/).pop() ?? p

/**
 * Sortieren nach Name (natürlich), Aufnahmedatum (ohne Datum ans Ende, dann nach Name) oder
 * Typ (Bilder, GIFs, Videos; innerhalb nach Name). Stabil.
 */
export function sortItems<T extends { path: string; kind: string }>(
  list: T[],
  key: SortKey,
  dateOf: (item: T) => number | null = () => null
): T[] {
  const byName = (a: T, b: T): number => collator.compare(basename(a.path), basename(b.path))
  const rank: Record<string, number> = { image: 0, gif: 1, video: 2 }
  const cmp: Record<SortKey, (a: T, b: T) => number> = {
    name: byName,
    date: (a, b) => {
      const da = dateOf(a)
      const db = dateOf(b)
      if (da === null && db === null) return byName(a, b)
      if (da === null) return 1
      if (db === null) return -1
      return da - db || byName(a, b)
    },
    type: (a, b) => (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9) || byName(a, b)
  }
  return list
    .map((x, i) => ({ x, i }))
    .sort((a, b) => cmp[key](a.x, b.x) || a.i - b.i)
    .map((e) => e.x)
}

/** Deterministischer Zufall (mulberry32) – gleicher Startwert, gleiche Reihenfolge (Tests). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fisher-Yates; bei mehr als einem Element nie dieselbe Reihenfolge wie vorher. */
export function shuffle<T>(list: T[], seed: number): T[] {
  if (list.length < 2) return list
  const rnd = seededRandom(seed)
  for (let attempt = 0; attempt < 8; attempt++) {
    const out = [...list]
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1))
      ;[out[i], out[j]] = [out[j], out[i]]
    }
    if (out.some((x, i) => x !== list[i])) return out
  }
  return [...list.slice(1), list[0]]
}
