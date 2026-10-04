// Eingabeliste + Einstellungen des HAP-Konverters in einem (nicht persistierten)
// Store: beides soll den Wechsel zur Medien-Info und zurück überstehen („Details
// ansehen" darf weder die vorbereitete Auswahl noch Kompressor/Parallelität/Chunks
// verwerfen). Format und Ausgabeordner stehen zusätzlich in settings.json; die Jobs
// selbst leben im main. Dazu ein kleiner Analyse-Cache für die Eckdaten je Eingabe.

import { create } from 'zustand'
import type { HapCompressor, MediaInfoResult } from '@shared/types'
import { dotted, VIDEO_EXTENSIONS } from '@shared/mediaExtensions'
import { api } from '@renderer/lib/api'

interface HapInputsState {
  inputs: string[]
  compressor: HapCompressor
  concurrency: number
  autoChunks: boolean
  manualChunks: number
  add: (paths: string[]) => void
  remove: (path: string) => void
  clear: () => void
  setOptions: (
    p: Partial<Pick<HapInputsState, 'compressor' | 'concurrency' | 'autoChunks' | 'manualChunks'>>
  ) => void
}

export const useHapInputs = create<HapInputsState>((set) => ({
  inputs: [],
  compressor: 'snappy',
  concurrency: 1,
  autoChunks: true,
  manualChunks: 4,
  add: (paths) => {
    // Erneut hinzugefügt = Eckdaten neu lesen (Datei kann neu gerendert, der Stick
    // wieder eingesteckt sein); unveränderte Dateien liefert der Cache im main sofort.
    useHapInputMeta.getState().forget(paths)
    set((s) => ({ inputs: [...new Set([...s.inputs, ...paths])] }))
  },
  remove: (path) => {
    useHapInputMeta.getState().forget([path])
    set((s) => ({ inputs: s.inputs.filter((p) => p !== path) }))
  },
  clear: () =>
    set((s) => {
      useHapInputMeta.getState().forget(s.inputs)
      return { inputs: [] }
    }),
  setOptions: (p) => set(p)
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

export const useHapInputMeta = create<MetaState>((set, get) => ({
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
          // Ordner: dieselben Regeln wie die Warteschlange (collectVideoInputs im main)
          put({ kind: 'folder', videos: col.files.filter(isVideo).length })
          return
        }
        put({ kind: 'file', result: await api.mediaInfo.probe(path) })
      } catch (e) {
        put({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
      }
    })()
  }
}))
