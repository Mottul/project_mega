// Zustand des LED-Wall-Konfigurators – per zustand/persist in localStorage,
// damit eine angefangene Planung Tool-Wechsel UND App-Neustart übersteht.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { digest } from '@shared/projectFile'
import { debouncedStorage, syncAcrossWindows } from '@renderer/lib/persistStorage'
import { sanitizeBinding, type ProjectBinding } from '@renderer/lib/projectBinding'
import {
  DEFAULT_LED_WALL_CONFIG,
  ledWallSection,
  pickConfig,
  sanitizeLedWallConfig,
  type LedWallConfig
} from './config'
import { resizeGrid } from './math'

export type { BuildMode, CurveMode, LedWallConfig } from './config'

/** Benannte, gespeicherte Konfiguration. */
export interface LedWallPreset {
  id: string
  name: string
  savedAt: number
  data: LedWallConfig
}

interface LedWallState extends LedWallConfig {
  presets: LedWallPreset[]
  /** Projektdatei, an die die Planung gebunden ist (null = ohne Datei). Steht NEBEN der
   *  Konfiguration, damit Vorlagen sie nicht mitnehmen (lib/projectFile). */
  file: ProjectBinding | null

  set: (patch: Partial<LedWallState>) => void
  /** Grids an neue Modulzahl anpassen (Zuordnungen im Überlapp bleiben erhalten). */
  ensureGridSize: (rows: number, cols: number) => void
  setCell: (grid: 'sig' | 'pwr', row: number, col: number) => void
  fillLine: (grid: 'sig' | 'pwr', kind: 'row' | 'col', index: number) => void
  resetGrid: (grid: 'sig' | 'pwr') => void
  /** Aktuelle Konfiguration als Vorlage sichern (gleicher Name -> überschreiben). */
  savePreset: (name: string) => void
  /** Vorlage laden – wie „Neu aus Vorlage“: löst die Bindung an eine Projektdatei. */
  loadPreset: (id: string) => void
  deletePreset: (id: string) => void
  setFile: (file: ProjectBinding | null) => void
  /** Planung ersetzen (Projektdatei, „Neu“); Bedienzustand (PDF-Format) bleibt. */
  replaceConfig: (config: LedWallConfig) => void
}

/** Hat die gebundene Planung Änderungen, die noch nicht in der Datei stehen? */
export function ledWallDirty(s: LedWallConfig & { file: ProjectBinding | null }): boolean {
  return !!s.file && digest(ledWallSection(s)) !== s.file.savedDigest
}

/**
 * Gespeicherten Stand auf die aktuelle Version bringen. Version 2 ergänzt die Felder für den
 * Kabelverlauf – in der Planung UND in jeder Vorlage (zustand ergänzt nur oberste Felder).
 * Rein, getestet in store.test.ts.
 */
export function migrateLedWall(persisted: unknown, version: number): unknown {
  if (version >= 2 || !persisted || typeof persisted !== 'object') return persisted
  const p = persisted as Record<string, unknown>
  const presets = Array.isArray(p.presets)
    ? p.presets
        .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
        .filter((x) => typeof x.id === 'string' && typeof x.name === 'string')
        .map((x) => ({
          id: x.id as string,
          name: (x.name as string).slice(0, 200),
          savedAt: typeof x.savedAt === 'number' ? x.savedAt : 0,
          data: sanitizeLedWallConfig(x.data)
        }))
    : []
  return { ...sanitizeLedWallConfig(p), presets, file: sanitizeBinding(p.file) }
}

/**
 * Beim Verkleinern abgeschnittene Zuordnungen, für diese Sitzung gemerkt: Wer kurz Modul, Curving
 * oder Maße umschaltet (oder das Höhenfeld leert), bekommt beim Zurückschalten seine Verkabelung
 * wieder – und eine gebundene Datei gilt dann wieder als gespeichert. Gespeichert wird weiter nur
 * das passende Raster. Gilt nur für die aktuelle Planung (andere Planung oder Stand aus einem
 * anderen Fenster -> vergessen).
 */
let shadow: { sig: number[][]; pwr: number[][] } | null = null

/** `small` über `big` legen: in seinem Bereich gilt `small` (auch -1), außerhalb `big`. */
function overlay(big: number[][] | undefined, small: number[][]): number[][] {
  if (!big) return small
  const sRows = small.length
  const sCols = small[0]?.length ?? 0
  const rows = Math.max(big.length, sRows)
  const cols = Math.max(big[0]?.length ?? 0, sCols)
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) =>
      r < sRows && c < sCols ? small[r][c] : (big[r]?.[c] ?? -1)
    )
  )
}

export const useLedWall = create<LedWallState>()(
  persist(
    (set, get) => ({
      ...structuredClone(DEFAULT_LED_WALL_CONFIG),
      presets: [],
      file: null,

      set: (patch) => set(patch),

      ensureGridSize: (rows, cols) => {
        const { sig, pwr } = get()
        if (sig.length === rows && (sig[0]?.length ?? 0) === cols) return
        shadow = { sig: overlay(shadow?.sig, sig), pwr: overlay(shadow?.pwr, pwr) }
        set({ sig: resizeGrid(shadow.sig, rows, cols), pwr: resizeGrid(shadow.pwr, rows, cols) })
      },

      setCell: (grid, row, col) => {
        const s = get()
        const chain = grid === 'sig' ? s.sigChain : s.pwrChain
        const next = s[grid].map((r) => [...r])
        next[row][col] = next[row][col] === chain ? -1 : chain
        set({ [grid]: next } as Partial<LedWallState>)
      },

      fillLine: (grid, kind, index) => {
        const s = get()
        const chain = grid === 'sig' ? s.sigChain : s.pwrChain
        const next = s[grid].map((r) => [...r])
        const cells = kind === 'col' ? next.map((r) => r[index]) : (next[index] ?? [])
        const allSet = cells.length > 0 && cells.every((v) => v === chain)
        if (kind === 'col') for (const r of next) r[index] = allSet ? -1 : chain
        else next[index] = next[index].map(() => (allSet ? -1 : chain))
        set({ [grid]: next } as Partial<LedWallState>)
      },

      resetGrid: (grid) => {
        const s = get()
        if (shadow) shadow = { ...shadow, [grid]: [] }
        set({
          [grid]: s[grid].map((r) => r.map(() => -1)),
          [grid === 'sig' ? 'sigChain' : 'pwrChain']: 0
        } as Partial<LedWallState>)
      },

      savePreset: (name) => {
        const trimmed = name.trim()
        if (!trimmed) return
        const data = pickConfig(get())
        set((state) => {
          const idx = state.presets.findIndex((p) => p.name === trimmed)
          const entry: LedWallPreset = {
            id: idx >= 0 ? state.presets[idx].id : crypto.randomUUID(),
            name: trimmed,
            savedAt: Date.now(),
            data
          }
          return {
            presets:
              idx >= 0
                ? state.presets.map((p, i) => (i === idx ? entry : p))
                : [...state.presets, entry]
          }
        })
      },

      loadPreset: (id) => {
        const preset = get().presets.find((p) => p.id === id)
        // alle Felder setzen (fehlende aus der Vorgabe) – sonst blieben Felder der vorigen
        // Planung stehen, z. B. eine fremde Kabelreihenfolge
        if (!preset) return
        shadow = null
        set({ ...sanitizeLedWallConfig(preset.data), file: null })
      },

      deletePreset: (id) => set((state) => ({ presets: state.presets.filter((p) => p.id !== id) })),

      setFile: (file) => set({ file }),

      replaceConfig: (config) => {
        shadow = null
        set({ ...structuredClone(config), pdfLandscape: get().pdfLandscape })
      }
    }),
    {
      name: 'led-wall-konfigurator',
      storage: debouncedStorage(),
      // v0/v1: Planung ohne Kabelverlauf; v2 (Oktober 2026): Kabelverlauf-Felder, Datei-Bindung
      version: 2,
      migrate: (persisted, version) => migrateLedWall(persisted, version) as LedWallState
    }
  )
)

// Ein Werkzeug in mehreren Fenstern: Änderungen der anderen übernehmen, statt sie
// beim nächsten Speichern mit altem Stand zu überschreiben (siehe persistStorage.ts).
syncAcrossWindows(useLedWall)
useLedWall.persist.onFinishHydration(() => {
  shadow = null
})
