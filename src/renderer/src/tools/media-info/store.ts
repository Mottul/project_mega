// Zustand der Medien-Info. Die Dateiliste ist bewusst NICHT persistiert (sie soll
// nur den Toolwechsel im selben Fenster überstehen); Prüfprofil und Tiefenanalyse
// werden gemerkt (debouncedStorage, Projekt-Konvention).
// Die Analyse läuft als kleine Warteschlange im Renderer: höchstens PARALLEL
// gleichzeitige ffprobe-Aufrufe, damit „Liste leeren" bei 2.000 Dateien nicht
// noch hunderte Aufträge im main abarbeiten lässt.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { MediaInfo } from '@shared/types'
import { api } from '@renderer/lib/api'
import { debouncedStorage } from '@renderer/lib/persistStorage'
import { DEFAULT_PROFILE, type CheckProfile } from './hints'

export type EntryStatus = 'pending' | 'loading' | 'done' | 'error'

export interface MediaEntry {
  path: string
  status: EntryStatus
  info: MediaInfo | null
  error: string | null
  detail: string | null
  /** beim nächsten Lauf Cache im main ignorieren („Neu analysieren") */
  force: boolean
}

interface PrefsState {
  profile: CheckProfile
  deep: boolean
  setProfile: (p: Partial<CheckProfile>) => void
  setDeep: (deep: boolean) => void
}

export const useMediaInfoPrefs = create<PrefsState>()(
  persist(
    (set) => ({
      profile: DEFAULT_PROFILE,
      deep: true,
      setProfile: (p) => set((s) => ({ profile: { ...s.profile, ...p } })),
      setDeep: (deep) => set({ deep })
    }),
    {
      name: 'media-info-prefs',
      storage: debouncedStorage(),
      version: 1,
      migrate: (persisted) => persisted as PrefsState,
      // nur Daten speichern, keine Funktionen
      partialize: (s) => ({ profile: s.profile, deep: s.deep }) as PrefsState
    }
  )
)

interface MediaInfoState {
  entries: MediaEntry[]
  selected: string | null
  collecting: boolean
  notice: string | null
  /** Dateien/Ordner aufnehmen; selectFirst = erste übergebene Datei auswählen. */
  addInputs: (inputs: string[], selectFirst?: boolean) => Promise<void>
  remove: (path: string) => void
  clear: () => void
  select: (path: string | null) => void
  reanalyze: (paths?: string[], force?: boolean) => void
}

const PARALLEL = 3
let running = 0
// Erhöht bei „Liste leeren" -> Antworten älterer Aufträge werden verworfen.
let generation = 0

function patchEntry(path: string, patch: Partial<MediaEntry>): void {
  useMediaInfo.setState((s) => ({
    entries: s.entries.map((e) => (e.path === path ? { ...e, ...patch } : e))
  }))
}

function pump(): void {
  while (running < PARALLEL) {
    const next = useMediaInfo.getState().entries.find((e) => e.status === 'pending')
    if (!next) return
    running++
    const gen = generation
    patchEntry(next.path, { status: 'loading' })
    const deep = useMediaInfoPrefs.getState().deep
    api.mediaInfo
      .probe(next.path, { deep, force: next.force })
      .then((res) => {
        if (gen !== generation) return
        if (res.ok) {
          patchEntry(next.path, {
            status: 'done',
            info: res.info,
            error: null,
            detail: null,
            force: false
          })
        } else {
          patchEntry(next.path, {
            status: 'error',
            info: null,
            error: res.error,
            detail: res.detail,
            force: false
          })
        }
      })
      .catch((err: unknown) => {
        if (gen !== generation) return
        const msg = err instanceof Error ? err.message : String(err)
        // Electron-Präfix „Error invoking remote method …" ist für Nutzer nur Rauschen
        const clean = msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
        patchEntry(next.path, {
          status: 'error',
          info: null,
          error: 'Analyse fehlgeschlagen',
          detail: clean,
          force: false
        })
      })
      .finally(() => {
        running--
        pump()
      })
  }
}

export const useMediaInfo = create<MediaInfoState>((set, get) => ({
  entries: [],
  selected: null,
  collecting: false,
  notice: null,

  addInputs: async (inputs, selectFirst = false) => {
    if (!inputs.length) return
    set({ collecting: true, notice: null })
    try {
      const res = await api.mediaInfo.collect(inputs)
      const known = new Set(get().entries.map((e) => e.path))
      const fresh: MediaEntry[] = res.files
        .filter((p) => !known.has(p))
        .map((path) => ({
          path,
          status: 'pending',
          info: null,
          error: null,
          detail: null,
          force: false
        }))
      const notes: string[] = []
      if (!res.files.length) notes.push('Keine Mediendateien gefunden.')
      if (res.ignored) notes.push(`${res.ignored} System-/._-Dateien ignoriert.`)
      if (res.unreadable.length) notes.push(`${res.unreadable.length} Eingabe(n) nicht lesbar.`)
      if (res.limited) notes.push('Sehr viele Dateien – nur die ersten 5.000 übernommen.')
      set((s) => ({
        entries: [...s.entries, ...fresh],
        selected:
          selectFirst && res.files[0] ? res.files[0] : (s.selected ?? fresh[0]?.path ?? null),
        notice: notes.length ? notes.join(' ') : null
      }))
    } catch (err) {
      set({
        notice: `Einlesen fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`
      })
    } finally {
      set({ collecting: false })
    }
    pump()
  },

  remove: (path) =>
    set((s) => {
      const idx = s.entries.findIndex((e) => e.path === path)
      const entries = s.entries.filter((e) => e.path !== path)
      // Auswahl auf den Nachbarn weiterreichen statt ins Leere fallen
      const selected =
        s.selected === path
          ? (entries[Math.min(idx, entries.length - 1)]?.path ?? null)
          : s.selected
      return { entries, selected }
    }),

  clear: () => {
    generation++
    set({ entries: [], selected: null, notice: null })
  },

  select: (path) => set({ selected: path }),

  reanalyze: (paths, force = true) => {
    const want = paths ? new Set(paths) : null
    set((s) => ({
      entries: s.entries.map((e) =>
        (!want || want.has(e.path)) && e.status !== 'loading'
          ? { ...e, status: 'pending', force }
          : e
      )
    }))
    pump()
  }
}))
