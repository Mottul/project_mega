// Zustand des Jingle-Players (zustand/persist): Bänke mit belegbaren Pads. Die
// Audiodateien liegen in userData/jingles (main); hier wird nur die Belegung
// gehalten. Nach jeder Änderung der Belegung werden verwaiste Dateien aufgeräumt.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api } from '@renderer/lib/api'

export type PadMode = 'oneshot' | 'toggle'

export interface Pad {
  id: string
  storedName: string | null // Dateiname in userData/jingles
  originalName: string | null
  label: string
  color: string
  volume: number // 0..1
  loop: boolean
  mode: PadMode
  fadeMs: number
  startSec: number // Abspiel-Start (0 = Anfang)
  endSec: number | null // Abspiel-Ende (null = Dateiende) -> nur Ausschnitt
}

export interface Bank {
  id: string
  name: string
  pads: Pad[]
}

export const PAD_COLORS = [
  '#64748b', '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#8b5cf6', '#ec4899', '#f43f5e'
]

/** Tastenbelegung nach Pad-Position (oben links beginnend). */
export const HOTKEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'q', 'w', 'e', 'r', 't', 'z', 'u', 'i', 'o', 'p']

function emptyPad(): Pad {
  return {
    id: crypto.randomUUID(),
    storedName: null,
    originalName: null,
    label: '',
    color: PAD_COLORS[0],
    volume: 1,
    loop: false,
    mode: 'oneshot',
    fadeMs: 400,
    startSec: 0,
    endSec: null
  }
}

function newBank(name: string, padCount = 8): Bank {
  return { id: crypto.randomUUID(), name, pads: Array.from({ length: padCount }, emptyPad) }
}

export type JingleMode = 'edit' | 'live'

interface JingleState {
  banks: Bank[]
  currentBankId: string
  columns: number
  outputDeviceId: string // '' = Standardgerät
  soloMode: boolean // nur ein Jingle gleichzeitig
  mode: JingleMode // edit = anklicken wählt aus (Panel), live = anklicken spielt

  set: (
    patch: Partial<Pick<JingleState, 'columns' | 'outputDeviceId' | 'soloMode' | 'currentBankId' | 'mode'>>
  ) => void
  currentBank: () => Bank
  addBank: () => void
  renameBank: (id: string, name: string) => void
  deleteBank: (id: string) => void
  addPad: () => void
  removePad: (padId: string) => void
  updatePad: (padId: string, patch: Partial<Pad>) => void
  assignJingle: (padId: string, storedName: string, originalName: string) => void
  clearPad: (padId: string) => void
}

function allStoredNames(banks: Bank[]): string[] {
  return banks.flatMap((b) => b.pads.map((p) => p.storedName).filter((n): n is string => n != null))
}

export const useJingles = create<JingleState>()(
  persist(
    (set, get) => {
      // Pads in der aktuellen Bank ändern + Ergebnis zurückgeben.
      const mapPads = (fn: (pads: Pad[]) => Pad[]): Bank[] =>
        get().banks.map((b) => (b.id === get().currentBankId ? { ...b, pads: fn(b.pads) } : b))
      const cleanup = (banks: Bank[]): void => void api.jingles.cleanup(allStoredNames(banks))
      const initialBank = newBank('Set 1')

      return {
        banks: [initialBank],
        currentBankId: initialBank.id,
        columns: 4,
        outputDeviceId: '',
        soloMode: false,
        mode: 'edit',

        set: (patch) => set(patch),
        currentBank: () => {
          const s = get()
          return s.banks.find((b) => b.id === s.currentBankId) ?? s.banks[0]
        },
        addBank: () => {
          const b = newBank(`Set ${get().banks.length + 1}`)
          set({ banks: [...get().banks, b], currentBankId: b.id })
        },
        renameBank: (id, name) => set({ banks: get().banks.map((b) => (b.id === id ? { ...b, name } : b)) }),
        deleteBank: (id) => {
          const rest = get().banks.filter((b) => b.id !== id)
          const banks = rest.length ? rest : [newBank('Set 1')]
          set({ banks, currentBankId: banks[0].id })
          cleanup(banks)
        },
        addPad: () => set({ banks: mapPads((pads) => [...pads, emptyPad()]) }),
        removePad: (padId) => {
          const banks = mapPads((pads) => pads.filter((p) => p.id !== padId))
          set({ banks })
          cleanup(banks)
        },
        updatePad: (padId, patch) =>
          set({ banks: mapPads((pads) => pads.map((p) => (p.id === padId ? { ...p, ...patch } : p))) }),
        assignJingle: (padId, storedName, originalName) => {
          const banks = mapPads((pads) =>
            pads.map((p) =>
              p.id === padId
                ? {
                    ...p,
                    storedName,
                    originalName,
                    label: p.label || originalName.replace(/\.[^.]+$/, ''),
                    // Marker gehören zur Datei -> bei neuem File auf vollen Bereich zurücksetzen.
                    startSec: 0,
                    endSec: null
                  }
                : p
            )
          )
          set({ banks })
          cleanup(banks)
        },
        clearPad: (padId) => {
          const banks = mapPads((pads) =>
            pads.map((p) => (p.id === padId ? { ...p, storedName: null, originalName: null, label: '' } : p))
          )
          set({ banks })
          cleanup(banks)
        }
      }
    },
    {
      name: 'jingle-player',
      onRehydrateStorage: () => (state) => {
        if (!state) return
        // currentBankId auf eine existierende Bank setzen.
        if (!state.banks.some((b) => b.id === state.currentBankId)) {
          state.currentBankId = state.banks[0]?.id ?? ''
        }
        if (state.mode !== 'edit' && state.mode !== 'live') state.mode = 'edit'
        // Pads aus älteren Versionen ergänzen (sonst sind z.B. startSec/endSec
        // undefined -> NaN-Marker in der Wellenform).
        for (const b of state.banks) {
          b.pads = b.pads.map((p) => ({
            id: p.id,
            storedName: p.storedName ?? null,
            originalName: p.originalName ?? null,
            label: p.label ?? '',
            color: p.color ?? PAD_COLORS[0],
            volume: p.volume ?? 1,
            loop: p.loop ?? false,
            mode: p.mode ?? 'oneshot',
            fadeMs: p.fadeMs ?? 400,
            startSec: p.startSec ?? 0,
            endSec: p.endSec ?? null
          }))
        }
      }
    }
  )
)
