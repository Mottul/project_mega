// Packlisten-Zustand (zustand/persist): Positionen mit Menge/Einheit, gruppiert
// nach Kategorie, abhakbar. Lässt sich aus der LED-Wall-Konfiguration befüllen.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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
  items: PackItem[]
  set: (patch: Partial<Pick<PackState, 'projectName'>>) => void
  addItem: (category?: string) => void
  updateItem: (id: string, patch: Partial<PackItem>) => void
  removeItem: (id: string) => void
  clearChecked: () => void
  reset: () => void
  /** Positionen ergänzen; gleiche (Kategorie+Name) werden in der Menge ersetzt. */
  mergeItems: (items: Omit<PackItem, 'id' | 'checked'>[]) => void
}

let seq = 0
const uid = (): string => `${Date.now().toString(36)}-${seq++}`

export const usePacking = create<PackState>()(
  persist(
    (set, get) => ({
      projectName: '',
      items: [],
      set: (patch) => set(patch),
      addItem: (category = 'Allgemein') =>
        set({
          items: [...get().items, { id: uid(), category, name: '', qty: 1, unit: 'Stk.', checked: false, note: '' }]
        }),
      updateItem: (id, patch) =>
        set({ items: get().items.map((it) => (it.id === id ? { ...it, ...patch } : it)) }),
      removeItem: (id) => set({ items: get().items.filter((it) => it.id !== id) }),
      clearChecked: () => set({ items: get().items.filter((it) => !it.checked) }),
      reset: () => set({ items: [] }),
      mergeItems: (incoming) => {
        const items = [...get().items]
        for (const inc of incoming) {
          const i = items.findIndex((it) => it.category === inc.category && it.name === inc.name)
          if (i >= 0) items[i] = { ...items[i], qty: inc.qty, unit: inc.unit, note: inc.note }
          else items.push({ ...inc, id: uid(), checked: false })
        }
        set({ items })
      }
    }),
    { name: 'packing-list' }
  )
)
