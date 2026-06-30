// Packlisten-Zustand (zustand/persist): Positionen mit Menge/Einheit/Notiz,
// gruppiert nach frei anlegbaren Kategorien (eigene Reihenfolge), abhakbar.
// Lässt sich aus der LED-Wall-Konfiguration befüllen.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { debouncedStorage } from '@renderer/lib/persistStorage'

export interface PackItem {
  id: string
  category: string
  name: string
  qty: number
  unit: string
  checked: boolean
  note: string
}

interface PackState {
  projectName: string
  /** Existenz + Reihenfolge der Kategorien (auch leere). */
  categories: string[]
  items: PackItem[]
  set: (patch: Partial<Pick<PackState, 'projectName'>>) => void
  addCategory: (name?: string) => void
  renameCategory: (oldName: string, newName: string) => void
  removeCategory: (name: string) => void
  addItem: (category?: string) => void
  updateItem: (id: string, patch: Partial<PackItem>) => void
  removeItem: (id: string) => void
  clearChecked: () => void
  reset: () => void
  /** Positionen ergänzen; gleiche (Kategorie+Name) werden in der Menge ersetzt.
   *  Vorkommende Kategorien werden angelegt. */
  mergeItems: (items: Omit<PackItem, 'id' | 'checked'>[]) => void
}

let seq = 0
const uid = (): string => `${Date.now().toString(36)}-${seq++}`

export const usePacking = create<PackState>()(
  persist(
    (set, get) => ({
      projectName: '',
      categories: ['Allgemein'],
      items: [],
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
        set({
          categories,
          items: s.items.map((it) => (it.category === oldName ? { ...it, category: n } : it))
        })
      },

      removeCategory: (name) => {
        const s = get()
        if (s.categories.length <= 1) return
        const categories = s.categories.filter((c) => c !== name)
        const fallback = categories[0]
        set({
          categories,
          items: s.items.map((it) => (it.category === name ? { ...it, category: fallback } : it))
        })
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
      clearChecked: () => set({ items: get().items.filter((it) => !it.checked) }),
      reset: () => set({ items: [] }),

      mergeItems: (incoming) => {
        const s = get()
        const items = [...s.items]
        const categories = [...s.categories]
        for (const inc of incoming) {
          if (!categories.includes(inc.category)) categories.push(inc.category)
          const i = items.findIndex((it) => it.category === inc.category && it.name === inc.name)
          if (i >= 0) items[i] = { ...items[i], qty: inc.qty, unit: inc.unit, note: inc.note }
          else items.push({ ...inc, id: uid(), checked: false })
        }
        set({ items, categories })
      }
    }),
    {
      name: 'packing-list',
      storage: debouncedStorage(),
      // Migration/Defensive: Kategorienliste muss alle Item-Kategorien enthalten.
      onRehydrateStorage: () => (state) => {
        if (!state) return
        const cats =
          Array.isArray(state.categories) && state.categories.length
            ? [...state.categories]
            : ['Allgemein']
        for (const it of state.items) if (!cats.includes(it.category)) cats.push(it.category)
        state.categories = cats
      }
    }
  )
)
