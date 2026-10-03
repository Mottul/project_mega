// Eingabeliste des HAP-Konverters in einem (nicht persistierten) Store: sie soll den
// Wechsel zur Medien-Info und zurück überstehen („Details ansehen" darf die
// vorbereitete Auswahl nicht verwerfen). Die Jobs selbst leben ohnehin im main.
// Zusätzlich ein kleiner Analyse-Cache für die Eckdaten-Zeile je Eingabe.

import { create } from 'zustand'
import type { MediaInfoResult } from '@shared/types'
import { dotted, VIDEO_EXTENSIONS } from '@shared/mediaExtensions'
import { api } from '@renderer/lib/api'

interface HapInputsState {
  inputs: string[]
  add: (paths: string[]) => void
  remove: (path: string) => void
  clear: () => void
}

export const useHapInputs = create<HapInputsState>((set) => ({
  inputs: [],
  add: (paths) => set((s) => ({ inputs: [...new Set([...s.inputs, ...paths])] })),
  remove: (path) => set((s) => ({ inputs: s.inputs.filter((p) => p !== path) })),
  clear: () => set({ inputs: [] })
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
}

const VIDEO_EXT = new Set(dotted(VIDEO_EXTENSIONS))
const isVideo = (p: string): boolean => {
  const i = p.lastIndexOf('.')
  return i >= 0 && VIDEO_EXT.has(p.slice(i).toLowerCase())
}

export const useHapInputMeta = create<MetaState>((set, get) => ({
  meta: {},
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
          // Ordner: die Warteschlange nimmt nur Video-Endungen (wie collectVideos im main)
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
