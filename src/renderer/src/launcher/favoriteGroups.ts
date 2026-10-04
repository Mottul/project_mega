// Favoriten-Kategorien des Startbildschirms: selbst benannte Gruppen mit eigener Breite
// (Anteil an einer 12er-Zeile -> ganze Breite, zwei, drei oder vier nebeneinander) und
// eigener Reihenfolge der Werkzeuge. Rein -> testbar. Gespeichert in settings.json
// (favoriteGroups); favoriteToolIds bleibt als flache Liste synchron.
//
// Werkzeug-IDs, die es (z.B. nach einem Update) nicht mehr gibt, bleiben gespeichert,
// werden aber übersprungen: verschoben wird immer zwischen sichtbaren Kacheln.

import type { FavoriteGroup } from '@shared/types'

export const SPAN_OPTIONS: { span: number; label: string }[] = [
  { span: 12, label: 'Ganze Breite' },
  { span: 9, label: '¾ Breite' },
  { span: 8, label: '⅔ Breite' },
  { span: 6, label: '½ Breite' },
  { span: 4, label: '⅓ Breite' },
  { span: 3, label: '¼ Breite' }
]
const SPANS = new Set(SPAN_OPTIONS.map((o) => o.span))

export const DEFAULT_GROUP_NAME = 'Favoriten'

export function newGroupId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `g${Date.now().toString(36)}${Math.random()}`
}

/**
 * Gespeichertes -> gültige Gruppen. Altbestand (nur die flache Favoritenliste) wird zur
 * Gruppe „Favoriten"; doppelte Werkzeuge zählen nur einmal; unbekannte Breite = ganze Zeile.
 */
export function normalizeGroups(
  groups: FavoriteGroup[] | undefined,
  flat: string[] | undefined
): FavoriteGroup[] {
  const seen = new Set<string>()
  const out: FavoriteGroup[] = []
  for (const g of groups ?? []) {
    if (!g || typeof g.id !== 'string') continue
    const toolIds: string[] = []
    for (const id of Array.isArray(g.toolIds) ? g.toolIds : []) {
      if (typeof id !== 'string' || seen.has(id)) continue
      seen.add(id)
      toolIds.push(id)
    }
    out.push({
      id: g.id,
      name: typeof g.name === 'string' && g.name.trim() ? g.name.trim() : DEFAULT_GROUP_NAME,
      span: SPANS.has(g.span) ? g.span : 12,
      toolIds
    })
  }
  // Favoriten ohne Gruppe (Altbestand oder ältere App-Version) -> in die erste Gruppe
  const loose = (flat ?? []).filter((id) => typeof id === 'string' && !seen.has(id))
  if (loose.length) {
    if (out.length) out[0] = { ...out[0], toolIds: [...out[0].toolIds, ...loose] }
    else out.push({ id: 'favoriten', name: DEFAULT_GROUP_NAME, span: 12, toolIds: loose })
  }
  return out
}

export const flatten = (groups: FavoriteGroup[]): string[] => groups.flatMap((g) => g.toolIds)

/** Stern: entfernen, falls Favorit – sonst ans Ende der ersten Kategorie (ggf. anlegen). */
export function toggleTool(groups: FavoriteGroup[], toolId: string): FavoriteGroup[] {
  if (groups.some((g) => g.toolIds.includes(toolId))) {
    return groups.map((g) => ({ ...g, toolIds: g.toolIds.filter((id) => id !== toolId) }))
  }
  if (!groups.length)
    return [{ id: newGroupId(), name: DEFAULT_GROUP_NAME, span: 12, toolIds: [toolId] }]
  return groups.map((g, i) => (i === 0 ? { ...g, toolIds: [...g.toolIds, toolId] } : g))
}

/** Neue (leere) Kategorie ans Ende; id vorab erzeugbar (Umbenennen direkt danach). */
export function addGroup(
  groups: FavoriteGroup[],
  name: string,
  span = 6,
  id = newGroupId()
): { groups: FavoriteGroup[]; id: string } {
  return { groups: [...groups, { id, name, span, toolIds: [] }], id }
}

export function renameGroup(groups: FavoriteGroup[], id: string, name: string): FavoriteGroup[] {
  const n = name.trim()
  if (!n) return groups
  return groups.map((g) => (g.id === id ? { ...g, name: n } : g))
}

export function setSpan(groups: FavoriteGroup[], id: string, span: number): FavoriteGroup[] {
  if (!SPANS.has(span)) return groups
  return groups.map((g) => (g.id === id ? { ...g, span } : g))
}

/**
 * Kategorie löschen. Ihre Werkzeuge bleiben Favoriten und wandern in die vorherige
 * (bzw. bei der ersten in die nächste) Kategorie. Die letzte Kategorie lässt sich nur
 * leer löschen – sonst gingen Favoriten verloren.
 */
export function removeGroup(groups: FavoriteGroup[], id: string): FavoriteGroup[] {
  const i = groups.findIndex((g) => g.id === id)
  if (i < 0) return groups
  const g = groups[i]
  if (groups.length === 1) return g.toolIds.length ? groups : []
  const target = i > 0 ? i - 1 : 1
  return groups
    .map((x, k) => (k === target ? { ...x, toolIds: [...x.toolIds, ...g.toolIds] } : x))
    .filter((x) => x.id !== id)
}

/** Kategorie um einen Platz nach vorne (-1) bzw. hinten (+1). */
export function moveGroup(groups: FavoriteGroup[], id: string, delta: -1 | 1): FavoriteGroup[] {
  const i = groups.findIndex((g) => g.id === id)
  const j = i + delta
  if (i < 0 || j < 0 || j >= groups.length) return groups
  const next = [...groups]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

/** Kategorie vor bzw. hinter eine andere ziehen. */
export function dropGroup(
  groups: FavoriteGroup[],
  dragged: string,
  target: string,
  after: boolean
): FavoriteGroup[] {
  const g = groups.find((x) => x.id === dragged)
  if (!g || dragged === target || !groups.some((x) => x.id === target)) return groups
  const rest = groups.filter((x) => x.id !== dragged)
  const at = rest.findIndex((x) => x.id === target) + (after ? 1 : 0)
  return [...rest.slice(0, at), g, ...rest.slice(at)]
}

/**
 * Werkzeug in eine Kategorie legen: vor/hinter ein bestimmtes Werkzeug oder ans Ende.
 * Funktioniert auch für Werkzeuge, die noch keine Favoriten sind (Ziehen aus „Alle").
 */
export function dropTool(
  groups: FavoriteGroup[],
  toolId: string,
  groupId: string,
  near?: { toolId: string; after: boolean }
): FavoriteGroup[] {
  if (!groups.some((g) => g.id === groupId) || near?.toolId === toolId) return groups
  return groups.map((g) => {
    const ids = g.toolIds.filter((id) => id !== toolId)
    if (g.id !== groupId) return ids.length === g.toolIds.length ? g : { ...g, toolIds: ids }
    const at =
      near && ids.includes(near.toolId)
        ? ids.indexOf(near.toolId) + (near.after ? 1 : 0)
        : ids.length
    return { ...g, toolIds: [...ids.slice(0, at), toolId, ...ids.slice(at)] }
  })
}

/**
 * Pfeile: einen Platz weiter – an der Kategoriegrenze in die Nachbar-Kategorie (ans Ende
 * der vorherigen bzw. an den Anfang der nächsten). So geht alles auch ohne Maus.
 */
export function moveToolBy(
  groups: FavoriteGroup[],
  toolId: string,
  delta: -1 | 1,
  exists: (id: string) => boolean
): FavoriteGroup[] {
  const gi = groups.findIndex((g) => g.toolIds.includes(toolId))
  if (gi < 0) return groups
  const visible = groups[gi].toolIds.filter(exists)
  const pos = visible.indexOf(toolId)
  const neighbor = visible[pos + delta]
  if (neighbor !== undefined) {
    return dropTool(groups, toolId, groups[gi].id, { toolId: neighbor, after: delta > 0 })
  }
  const other = groups[gi + delta]
  if (!other) return groups
  const first = other.toolIds.filter(exists)[0]
  return delta > 0 && first !== undefined
    ? dropTool(groups, toolId, other.id, { toolId: first, after: false })
    : dropTool(groups, toolId, other.id)
}

/** Kann das Werkzeug per Pfeil in diese Richtung? (Knöpfe sperren) */
export function canMoveTool(
  groups: FavoriteGroup[],
  toolId: string,
  delta: -1 | 1,
  exists: (id: string) => boolean
): boolean {
  return moveToolBy(groups, toolId, delta, exists) !== groups
}

/** Werkzeuge einer Kategorie alphabetisch (deutsche Sortierung, unbekannte ans Ende). */
export function sortGroup(
  groups: FavoriteGroup[],
  id: string,
  name: (toolId: string) => string | undefined
): FavoriteGroup[] {
  const collator = new Intl.Collator('de', { sensitivity: 'base', numeric: true })
  return groups.map((g) => {
    if (g.id !== id) return g
    const known = g.toolIds.filter((t) => name(t) !== undefined)
    const unknown = g.toolIds.filter((t) => name(t) === undefined)
    known.sort((a, b) => collator.compare(name(a) as string, name(b) as string))
    return { ...g, toolIds: [...known, ...unknown] }
  })
}

/** Freier Name für eine neue Kategorie („Kategorie 2", „Kategorie 3" …). */
export function nextGroupName(groups: FavoriteGroup[]): string {
  const names = new Set(groups.map((g) => g.name))
  for (let n = groups.length + 1; ; n++) if (!names.has(`Kategorie ${n}`)) return `Kategorie ${n}`
}
