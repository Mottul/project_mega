// Serialisierung der Packliste als JSON-Datei (Export/Import). JSON, weil es die
// Struktur (Kategorien-Reihenfolge, Menge/Einheit/Notiz/Haken) verlustfrei
// abbildet – anders als eine reine Textliste. Import ist tolerant: fehlende
// Felder werden mit Standardwerten ergänzt, ungültige Dateien liefern null.

import { APP_SLUG } from '@shared/brand'
import type { PackItem } from './store'

export interface PackSnapshot {
  projectName: string
  categories: string[]
  items: PackItem[]
}

const FILE_TYPE = 'packing-list'

interface PackFile extends PackSnapshot {
  app: string // Marken-Kennung (informativ; beim Import nicht geprüft)
  type: typeof FILE_TYPE
  version: 1
}

/** Snapshot als hübsches JSON (mit Kopf zum Wiedererkennen). */
export function serialize(snap: PackSnapshot): string {
  const file: PackFile = { app: APP_SLUG, type: FILE_TYPE, version: 1, ...snap }
  return JSON.stringify(file, null, 2)
}

const str = (v: unknown, fb = ''): string => (typeof v === 'string' ? v : fb)
const num = (v: unknown, fb = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fb)

let seq = 0
const uid = (): string => `imp-${Date.now().toString(36)}-${seq++}`

/** JSON-Text einlesen und in einen sauberen Snapshot normalisieren. Ungültig ->
 *  null. IDs werden neu vergeben; Kategorien-Liste erhält alle Item-Kategorien. */
export function parse(text: string): PackSnapshot | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  // Nur unsere Packlisten-Dateien akzeptieren (aber tolerant bei fehlendem Typ,
  // solange ein items-Array vorhanden ist).
  if (o.type != null && o.type !== FILE_TYPE) return null
  if (!Array.isArray(o.items)) return null

  const items: PackItem[] = o.items.map((it) => {
    const r = (it ?? {}) as Record<string, unknown>
    return {
      id: uid(),
      category: str(r.category, 'Allgemein') || 'Allgemein',
      name: str(r.name),
      qty: Math.max(0, num(r.qty, 1)),
      unit: str(r.unit, 'Stk.'),
      checked: r.checked === true,
      note: str(r.note)
    }
  })

  const categories: string[] = Array.isArray(o.categories)
    ? o.categories.filter((c): c is string => typeof c === 'string')
    : []
  for (const it of items) if (!categories.includes(it.category)) categories.push(it.category)
  if (categories.length === 0) categories.push('Allgemein')

  return { projectName: str(o.projectName), categories, items }
}
