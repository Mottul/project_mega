// Gemerkter Stand des RTA: Anzeige, Eingang, Kalibrierung, Korrekturdatei und Referenzkurven.
// Läuft auch in der Handy-PWA (localStorage, keine Einstellungen der App).

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { debouncedStorage, syncAcrossWindows } from '@renderer/lib/persistStorage'
import type { Averaging, MeterSpeed, PeakMode } from './analysis'
import type { Resolution, Weighting } from './bands'
import type { MicCorrection } from './calibration'
import type { Channel } from './engine'
import type { Sensitivity } from './feedback'

export type ViewMode = 'bars' | 'curve' | 'both'
export type ScaleMode = 'auto' | 'fixed'

/** Referenzkurve: unbewertete 1/24-Pegel (dBFS, ohne Offset, mit Mikrofon-Korrektur) */
export interface RtaReference {
  id: string
  name: string
  /** Farbe aus der Palette (draw.ts) */
  color: number
  visible: boolean
  curve: number[]
  at: number
}

export interface RtaPrefs {
  resolution: Resolution
  weighting: Weighting
  averaging: Averaging
  peak: PeakMode
  meter: MeterSpeed
  view: ViewMode
  scale: ScaleMode
  spectrogram: boolean
  feedback: boolean
  sensitivity: Sensitivity
  deviceId: string | null
  channel: Channel
  /** dB, die zu dBFS addiert dB SPL ergeben; null = nicht kalibriert (Anzeige in dBFS) */
  offset: number | null
  calibratorDb: number
  correction: MicCorrection | null
  references: RtaReference[]
  /** Differenzansicht: live minus diese Referenz */
  diffRef: string | null
}

interface RtaState extends RtaPrefs {
  set: (patch: Partial<RtaPrefs>) => void
  addReference: (curve: number[]) => void
  updateReference: (id: string, patch: Partial<Pick<RtaReference, 'name' | 'visible'>>) => void
  removeReference: (id: string) => void
}

export const MAX_REFERENCES = 6

export const DEFAULT_RTA: RtaPrefs = {
  resolution: 3,
  weighting: 'Z',
  averaging: 'fast',
  peak: 'fall',
  meter: 'F',
  view: 'both',
  scale: 'auto',
  spectrogram: false,
  feedback: true,
  sensitivity: 'mid',
  deviceId: null,
  channel: 'mix',
  offset: null,
  calibratorDb: 94,
  correction: null,
  references: [],
  diffRef: null
}

export const useRta = create<RtaState>()(
  persist(
    (set) => ({
      ...DEFAULT_RTA,
      set: (patch) => set(patch),
      addReference: (curve) =>
        set((s) => {
          const used = new Set(s.references.map((r) => r.color))
          const color = [0, 1, 2, 3, 4, 5].find((c) => !used.has(c)) ?? s.references.length % 6
          let n = s.references.length + 1
          while (s.references.some((r) => r.name === `Referenz ${n}`)) n++
          const ref: RtaReference = {
            id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
            name: `Referenz ${n}`,
            color,
            visible: true,
            // −∞ (Stille) übersteht JSON nicht (wird null); auf 0,01 dB gerundet spart Platz
            curve: curve.map((v) =>
              Number.isFinite(v) ? Math.round(Math.max(-200, v) * 100) / 100 : -200
            ),
            at: Date.now()
          }
          return { references: [...s.references, ref].slice(-MAX_REFERENCES) }
        }),
      updateReference: (id, patch) =>
        set((s) => ({
          references: s.references.map((r) => (r.id === id ? { ...r, ...patch } : r))
        })),
      removeReference: (id) =>
        set((s) => ({
          references: s.references.filter((r) => r.id !== id),
          diffRef: s.diffRef === id ? null : s.diffRef
        }))
    }),
    {
      name: 'rta',
      storage: debouncedStorage(),
      version: 1,
      migrate: (persisted) => persisted as RtaState,
      // gespeicherte Werte über die Vorgabe legen: neue Felder späterer Versionen bekommen so
      // ihren Vorgabewert statt undefined
      merge: (persisted, current) => ({ ...current, ...(persisted as Partial<RtaPrefs>) }),
      partialize: (s) => {
        const {
          set: _set,
          addReference: _a,
          updateReference: _u,
          removeReference: _r,
          ...prefs
        } = s
        return prefs as RtaState
      }
    }
  )
)
syncAcrossWindows(useRta)
