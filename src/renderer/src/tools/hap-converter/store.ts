// Zustand des Video-Konverters. Eingabeliste (nicht persistiert) übersteht den Wechsel
// zur Medien-Info und zurück; Zielsystem, Format-Einstellungen und Parallelität werden
// gemerkt (debouncedStorage, Projekt-Konvention). Der Ausgabeordner steht in
// settings.json (lastHapOutputDir); die Aufträge selbst leben im main.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ConvertOptions, HapFormat, MediaInfoResult } from '@shared/types'
import { dotted, VIDEO_EXTENSIONS } from '@shared/mediaExtensions'
import { api } from '@renderer/lib/api'
import { debouncedStorage } from '@renderer/lib/persistStorage'
import { DEFAULT_OPTIONS, presetOptions, type ConverterTarget } from './presets'

interface PrefsState {
  target: ConverterTarget
  options: ConvertOptions
  concurrency: number
  /** einmalige Übernahme des zuletzt genutzten HAP-Formats (vor dem Umbau) */
  migrated: boolean
  /** Zielsystem wählen -> Vorgabe anwenden */
  applyTarget: (target: ConverterTarget) => void
  /** Einstellungen ändern; preset=true: zählt zur Vorgabe -> Zielsystem „Eigene" */
  setOptions: (patch: Partial<ConvertOptions>, preset?: boolean) => void
  setConcurrency: (n: number) => void
  migrateFrom: (lastHapFormat: HapFormat) => void
}

export const useConverterPrefs = create<PrefsState>()(
  persist(
    (set) => ({
      target: 'mediaserver',
      options: DEFAULT_OPTIONS,
      concurrency: 1,
      migrated: false,
      applyTarget: (target) => set((s) => ({ target, options: presetOptions(target, s.options) })),
      setOptions: (patch, preset = false) =>
        set((s) => ({
          options: { ...s.options, ...patch },
          target: preset ? 'custom' : s.target
        })),
      setConcurrency: (concurrency) => set({ concurrency }),
      // Nur eine bewusst geänderte frühere Wahl übernehmen: HAP Q war der Standard und
      // darf eine inzwischen gewählte Vorgabe (z.B. aus der Medien-Info) nicht überschreiben
      migrateFrom: (fmt) =>
        set((s) =>
          s.migrated
            ? s
            : fmt === 'hap_q'
              ? { migrated: true }
              : { migrated: true, options: { ...s.options, format: fmt }, target: 'custom' }
        )
    }),
    {
      name: 'converter-prefs',
      storage: debouncedStorage(),
      version: 1,
      migrate: (persisted) => persisted as PrefsState,
      partialize: (s) =>
        ({
          target: s.target,
          options: s.options,
          concurrency: s.concurrency,
          migrated: s.migrated
        }) as PrefsState,
      // neue Optionsfelder späterer Versionen mit Standardwerten auffüllen
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<PrefsState>
        return {
          ...current,
          ...p,
          options: { ...DEFAULT_OPTIONS, ...(p.options ?? {}) }
        }
      }
    }
  )
)

interface InputsState {
  inputs: string[]
  add: (paths: string[]) => void
  remove: (path: string) => void
  clear: () => void
}

export const useConverterInputs = create<InputsState>((set) => ({
  inputs: [],
  add: (paths) => {
    // Erneut hinzugefügt = Eckdaten neu lesen (Datei kann neu gerendert, der Stick
    // wieder eingesteckt sein); unveränderte Dateien liefert der Cache im main sofort.
    useInputMeta.getState().forget(paths)
    set((s) => ({ inputs: [...new Set([...s.inputs, ...paths])] }))
  },
  remove: (path) => {
    useInputMeta.getState().forget([path])
    set((s) => ({ inputs: s.inputs.filter((p) => p !== path) }))
  },
  clear: () =>
    set((s) => {
      useInputMeta.getState().forget(s.inputs)
      return { inputs: [] }
    })
}))

/** Eckdaten einer Eingabe: Datei (Analyse) oder Ordner (Anzahl Videos). */
export type InputMeta =
  | { kind: 'loading' }
  | { kind: 'file'; result: MediaInfoResult }
  | { kind: 'folder'; videos: number }
  | { kind: 'error'; message: string }

interface MetaState {
  meta: Record<string, InputMeta>
  load: (path: string) => void
  forget: (paths: string[]) => void
}

const VIDEO_EXT = new Set(dotted(VIDEO_EXTENSIONS))
const isVideo = (p: string): boolean => {
  const i = p.lastIndexOf('.')
  return i >= 0 && VIDEO_EXT.has(p.slice(i).toLowerCase())
}

export const useInputMeta = create<MetaState>((set, get) => ({
  meta: {},
  forget: (paths) =>
    set((s) => {
      const meta = { ...s.meta }
      for (const p of paths) delete meta[p]
      return { meta }
    }),
  load: (path) => {
    if (get().meta[path]) return
    set((s) => ({ meta: { ...s.meta, [path]: { kind: 'loading' } } }))
    const put = (m: InputMeta): void => set((s) => ({ meta: { ...s.meta, [path]: m } }))
    void (async () => {
      try {
        const col = await api.mediaInfo.collect([path])
        if (col.unreadable.includes(path)) {
          put({ kind: 'error', message: 'Pfad nicht lesbar (verschoben oder Laufwerk getrennt?)' })
          return
        }
        const isFile = col.files.length === 1 && col.files[0] === path
        if (!isFile) {
          // Ordner: dieselben Regeln wie die Aufträge im main (collectConvertInputs)
          put({ kind: 'folder', videos: col.files.filter(isVideo).length })
          return
        }
        // Tiefenanalyse wie im Auftrag: erkennt Halbbilder/variable Bildrate für die
        // Vorschau – und füllt den Cache, den der Auftrag danach nutzt
        put({ kind: 'file', result: await api.mediaInfo.probe(path, { deep: true }) })
      } catch (e) {
        put({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
      }
    })()
  }
}))
