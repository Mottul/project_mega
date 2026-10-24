// Packlisten-Zustand (zustand/persist): Positionen mit Menge/Einheit/Notiz,
// gruppiert nach frei anlegbaren Kategorien (eigene Reihenfolge), abhakbar.
// Lässt sich aus der LED-Wall-Konfiguration befüllen.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { debouncedStorage, syncAcrossWindows } from '@renderer/lib/persistStorage'

export interface PackItem {
  id: string
  category: string
  name: string
  qty: number
  unit: string
  checked: boolean
  note: string
}

/** Gespeicherter Job (wiederkehrende Packliste) – Schnappschuss der Liste. */
export interface SavedJob {
  id: string
  name: string
  savedAt: number
  projectName: string
  categories: string[]
  items: PackItem[]
  /** Farbe je Kategorie (seit Version 2; ältere Jobs haben keine) */
  colors?: Record<string, string>
}

/** Farben für Blöcke – kräftig genug für einen Rand, hell genug als Tönung hinter dem Titel */
export const BLOCK_FARBEN = [
  '#3b82f6',
  '#22c55e',
  '#f97316',
  '#a855f7',
  '#ef4444',
  '#14b8a6',
  '#eab308',
  '#ec4899'
]

const HEX = /^#[0-9a-f]{6}$/i

/** Nur gültige Farben bekannter Kategorien (Import, ältere Stände) */
export function farbenPruefen(v: unknown, categories: string[]): Record<string, string> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  const out: Record<string, string> = {}
  for (const [k, c] of Object.entries(v))
    if (categories.includes(k) && typeof c === 'string' && HEX.test(c)) out[k] = c.toLowerCase()
  return out
}

interface PackState {
  projectName: string
  /** Existenz + Reihenfolge der Kategorien (auch leere). */
  categories: string[]
  items: PackItem[]
  /** Farbe je Kategorie (#rrggbb); fehlt = ohne Farbe */
  colors: Record<string, string>
  /** Gespeicherte Jobs (im Store persistiert). */
  saved: SavedJob[]
  set: (patch: Partial<Pick<PackState, 'projectName'>>) => void
  addCategory: (name?: string) => void
  renameCategory: (oldName: string, newName: string) => void
  removeCategory: (name: string) => void
  /** Farbe einer Kategorie setzen ('' = keine) */
  setColor: (category: string, color: string) => void
  /** Kategorie in der Reihenfolge verschieben (dir = -1 vor, +1 zurück). */
  moveCategory: (name: string, dir: -1 | 1) => void
  addItem: (category?: string) => void
  updateItem: (id: string, patch: Partial<PackItem>) => void
  removeItem: (id: string) => void
  /** Position innerhalb ihrer Kategorie verschieben (dir = -1 hoch, +1 runter). */
  moveItem: (id: string, dir: -1 | 1) => void
  clearChecked: () => void
  reset: () => void
  /** Positionen ergänzen; gleiche (Kategorie+Name) werden in der Menge ersetzt.
   *  Vorkommende Kategorien werden angelegt. */
  mergeItems: (items: Omit<PackItem, 'id' | 'checked'>[]) => void
  /** Aktuelle Liste komplett ersetzen (z.B. beim Import/Laden). */
  replaceAll: (snap: {
    projectName: string
    categories: string[]
    items: PackItem[]
    colors?: Record<string, string>
  }) => void
  /** Aktuelle Liste als Job unter `name` speichern (gleicher Name überschreibt). */
  saveJob: (name: string) => void
  /** Gespeicherten Job laden (ersetzt die aktuelle Liste). */
  loadJob: (id: string) => void
  /** Gespeicherten Job löschen. */
  deleteJob: (id: string) => void
}

let seq = 0
const uid = (): string => `${Date.now().toString(36)}-${seq++}`

export const usePacking = create<PackState>()(
  persist(
    (set, get) => ({
      projectName: '',
      categories: ['Allgemein'],
      items: [],
      colors: {},
      saved: [],
      set: (patch) => set(patch),

      addCategory: (name) => {
        const cats = get().categories
        let n = (name ?? '').trim()
        if (!n) {
          let i = cats.length + 1
          while (cats.includes(`Kategorie ${i}`)) i++
          n = `Kategorie ${i}`
        }
        if (!cats.includes(n)) set({ categories: [...cats, n] })
      },

      renameCategory: (oldName, newName) => {
        const n = newName.trim()
        if (!n || n === oldName) return
        const s = get()
        // Liste: oldName -> n, Duplikate entfernen (Reihenfolge wahren).
        const categories: string[] = []
        for (const c of s.categories) {
          const mapped = c === oldName ? n : c
          if (!categories.includes(mapped)) categories.push(mapped)
        }
        // die Farbe zieht mit; trägt schon die neue Kategorie eine, bleibt deren
        const colors = { ...s.colors }
        if (colors[oldName] && !colors[n]) colors[n] = colors[oldName]
        delete colors[oldName]
        set({
          categories,
          items: s.items.map((it) => (it.category === oldName ? { ...it, category: n } : it)),
          colors
        })
      },

      removeCategory: (name) => {
        const s = get()
        if (s.categories.length <= 1) return
        const categories = s.categories.filter((c) => c !== name)
        const fallback = categories[0]
        const colors = { ...s.colors }
        delete colors[name]
        set({
          categories,
          items: s.items.map((it) => (it.category === name ? { ...it, category: fallback } : it)),
          colors
        })
      },
      setColor: (category, color) => {
        const colors = { ...get().colors }
        if (HEX.test(color)) colors[category] = color.toLowerCase()
        else delete colors[category]
        set({ colors })
      },

      moveCategory: (name, dir) => {
        const cats = [...get().categories]
        const i = cats.indexOf(name)
        const j = i + dir
        if (i < 0 || j < 0 || j >= cats.length) return
        ;[cats[i], cats[j]] = [cats[j], cats[i]]
        set({ categories: cats })
      },

      addItem: (category) => {
        const s = get()
        const cat = category ?? s.categories[0] ?? 'Allgemein'
        const categories = s.categories.includes(cat) ? s.categories : [...s.categories, cat]
        set({
          categories,
          items: [
            ...s.items,
            { id: uid(), category: cat, name: '', qty: 1, unit: 'Stk.', checked: false, note: '' }
          ]
        })
      },

      updateItem: (id, patch) =>
        set({ items: get().items.map((it) => (it.id === id ? { ...it, ...patch } : it)) }),
      removeItem: (id) => set({ items: get().items.filter((it) => it.id !== id) }),

      moveItem: (id, dir) => {
        const items = [...get().items]
        const idx = items.findIndex((it) => it.id === id)
        if (idx < 0) return
        // Nur unter Geschwistern derselben Kategorie tauschen (in Array-Reihenfolge).
        const cat = items[idx].category
        const siblings = items.map((it, k) => ({ it, k })).filter((x) => x.it.category === cat)
        const pos = siblings.findIndex((x) => x.k === idx)
        const target = siblings[pos + dir]
        if (!target) return
        ;[items[idx], items[target.k]] = [items[target.k], items[idx]]
        set({ items })
      },
      clearChecked: () => set({ items: get().items.filter((it) => !it.checked) }),
      reset: () => set({ items: [] }),

      mergeItems: (incoming) => {
        const s = get()
        const items = [...s.items]
        const categories = [...s.categories]
        const colors = { ...s.colors }
        for (const inc of incoming) {
          if (!categories.includes(inc.category)) {
            categories.push(inc.category)
            // mehrere Wände aus dem LED-Wall-Konfigurator: je Wand eine Farbe, gleich beim Anlegen
            if (inc.category.startsWith('LED-Wall · ') && !colors[inc.category]) {
              const frei = BLOCK_FARBEN.find((f) => !Object.values(colors).includes(f))
              colors[inc.category] =
                frei ?? BLOCK_FARBEN[Object.keys(colors).length % BLOCK_FARBEN.length]
            }
          }
          const i = items.findIndex((it) => it.category === inc.category && it.name === inc.name)
          if (i >= 0) items[i] = { ...items[i], qty: inc.qty, unit: inc.unit, note: inc.note }
          else items.push({ ...inc, id: uid(), checked: false })
        }
        set({ items, categories, colors })
      },

      replaceAll: (snap) =>
        set({
          projectName: snap.projectName,
          categories: snap.categories.length ? [...snap.categories] : ['Allgemein'],
          items: snap.items.map((it) => ({ ...it })),
          colors: farbenPruefen(snap.colors, snap.categories)
        }),

      saveJob: (name) => {
        const s = get()
        const n = name.trim() || `Job ${new Date().toLocaleDateString('de-DE')}`
        const snapshot = {
          projectName: s.projectName,
          categories: [...s.categories],
          items: s.items.map((it) => ({ ...it })),
          colors: { ...s.colors }
        }
        const existing = s.saved.find((j) => j.name === n)
        const job: SavedJob = {
          id: existing?.id ?? uid(),
          name: n,
          savedAt: Date.now(),
          ...snapshot
        }
        // Gleicher Name -> ersetzen, sonst anhängen. Nach Name sortiert halten.
        const saved = [...s.saved.filter((j) => j.id !== job.id), job].sort((a, b) =>
          a.name.localeCompare(b.name, 'de')
        )
        set({ saved })
      },

      loadJob: (id) => {
        const job = get().saved.find((j) => j.id === id)
        if (!job) return
        get().replaceAll({
          projectName: job.projectName,
          categories: job.categories,
          items: job.items,
          colors: job.colors
        })
      },

      deleteJob: (id) => set({ saved: get().saved.filter((j) => j.id !== id) })
    }),
    {
      name: 'packing-list',
      storage: debouncedStorage(),
      // Basisversion: v0 (unversioniert) und v1 haben dieselbe Form -> durchreichen
      // (Feld-Absicherung erledigt onRehydrateStorage). 2: Farben je Kategorie (fehlen = keine).
      version: 2,
      migrate: (persisted) => persisted as PackState,
      // Migration/Defensive: Kategorienliste muss alle Item-Kategorien enthalten.
      onRehydrateStorage: () => (state) => {
        if (!state) return
        const cats =
          Array.isArray(state.categories) && state.categories.length
            ? [...state.categories]
            : ['Allgemein']
        for (const it of state.items) if (!cats.includes(it.category)) cats.push(it.category)
        state.categories = cats
        state.colors = farbenPruefen(state.colors, cats)
        if (!Array.isArray(state.saved)) state.saved = []
      }
    }
  )
)

// Ein Werkzeug in mehreren Fenstern: Änderungen der anderen übernehmen, statt sie
// beim nächsten Speichern mit altem Stand zu überschreiben (siehe persistStorage.ts).
syncAcrossWindows(usePacking)
