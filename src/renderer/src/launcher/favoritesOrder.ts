// Reihenfolge der Favoriten (Tool-IDs) ändern – rein, damit testbar. Die gespeicherte
// Liste kann IDs enthalten, die es (z.B. nach einem Update) nicht mehr gibt; sie bleiben
// unangetastet, verschoben wird nur zwischen sichtbaren Einträgen.

/** `dragged` vor bzw. hinter `target` einsortieren (Ziehen & Ablegen). */
export function dropOn(list: string[], dragged: string, target: string, after: boolean): string[] {
  if (dragged === target || !list.includes(dragged) || !list.includes(target)) return list
  const rest = list.filter((id) => id !== dragged)
  const at = rest.indexOf(target) + (after ? 1 : 0)
  return [...rest.slice(0, at), dragged, ...rest.slice(at)]
}

/** Um einen Platz nach vorne (-1) bzw. hinten (+1) – bezogen auf die sichtbaren IDs. */
export function moveBy(list: string[], visible: string[], id: string, delta: -1 | 1): string[] {
  const i = visible.indexOf(id)
  const neighbor = visible[i + delta]
  if (i < 0 || neighbor === undefined) return list
  return dropOn(list, id, neighbor, delta > 0)
}

/** Alphabetisch nach Anzeigename (deutsche Sortierung); unbekannte IDs ans Ende. */
export function sortByName(list: string[], name: (id: string) => string | undefined): string[] {
  const collator = new Intl.Collator('de', { sensitivity: 'base', numeric: true })
  const known = list.filter((id) => name(id) !== undefined)
  const unknown = list.filter((id) => name(id) === undefined)
  known.sort((a, b) => collator.compare(name(a) as string, name(b) as string))
  return [...known, ...unknown]
}
