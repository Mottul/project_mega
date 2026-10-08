// Projekt des Video-Generators: Elemente, Ausgabe, Vorgaben, Musik. Persistiert nach
// Projektregel (debouncedStorage, version/migrate, fensterübergreifend). NICHT gespeichert:
// Auswahl, Analyse-Ergebnisse und Vorschaubilder (abgeleitet, siehe meta.ts/thumbs.ts).

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { VgenElement, VgenProject } from '@shared/types'
import { DEFAULT_VGEN_PROJECT, sanitizeVgenProject } from '@shared/videoGenProject'
import { debouncedStorage, syncAcrossWindows } from '@renderer/lib/persistStorage'
import { kindForPath } from './presets'

interface VgenState {
  project: VgenProject
  /** ausgewählte Element-ids (Mehrfachauswahl) */
  selected: string[]
  setProject: (patch: Partial<VgenProject>) => void
  setElements: (elements: VgenElement[]) => void
  /** Dateien als Elemente einfügen (Ordner vorher auflösen); at = Index, null = ans Ende */
  insertFiles: (paths: string[], at: number | null) => string[]
  updateElements: (ids: string[], patch: Partial<VgenElement>) => void
  remove: (ids: string[]) => void
  clearElements: () => void
  setOutput: (patch: Partial<VgenProject['output']>) => void
  setDefaults: (patch: Partial<VgenProject['defaults']>) => void
  select: (ids: string[]) => void
}

export function newElement(path: string): VgenElement | null {
  const kind = kindForPath(path)
  if (!kind) return null
  return {
    id: crypto.randomUUID(),
    path,
    kind,
    durationSec: null,
    inSec: null,
    outSec: null,
    kenBurns: null,
    fit: null,
    transition: null,
    audio: true
  }
}

export const useVideoGen = create<VgenState>()(
  persist(
    (set, get) => ({
      project: DEFAULT_VGEN_PROJECT,
      selected: [],
      setProject: (patch) => set((s) => ({ project: { ...s.project, ...patch } })),
      setElements: (elements) => set((s) => ({ project: { ...s.project, elements } })),
      insertFiles: (paths, at) => {
        const added = paths.map(newElement).filter((e): e is VgenElement => e !== null)
        if (!added.length) return []
        const list = get().project.elements
        const i = at === null ? list.length : Math.max(0, Math.min(list.length, at))
        set((s) => ({
          project: { ...s.project, elements: [...list.slice(0, i), ...added, ...list.slice(i)] }
        }))
        return added.map((e) => e.id)
      },
      updateElements: (ids, patch) => {
        const set_ = new Set(ids)
        set((s) => ({
          project: {
            ...s.project,
            elements: s.project.elements.map((e) => (set_.has(e.id) ? { ...e, ...patch } : e))
          }
        }))
      },
      remove: (ids) => {
        const set_ = new Set(ids)
        set((s) => ({
          project: { ...s.project, elements: s.project.elements.filter((e) => !set_.has(e.id)) },
          selected: s.selected.filter((id) => !set_.has(id))
        }))
      },
      clearElements: () => set((s) => ({ project: { ...s.project, elements: [] }, selected: [] })),
      setOutput: (patch) =>
        set((s) => ({ project: { ...s.project, output: { ...s.project.output, ...patch } } })),
      setDefaults: (patch) =>
        set((s) => ({ project: { ...s.project, defaults: { ...s.project.defaults, ...patch } } })),
      select: (ids) => set({ selected: ids })
    }),
    {
      name: 'video-generator',
      storage: debouncedStorage(),
      version: 1,
      // Gespeicherten Stand dieselbe Prüfung durchlaufen lassen wie im main – ein kaputter
      // oder veralteter Stand fällt auf die Vorgabe zurück statt das Werkzeug zu sprengen
      migrate: (persisted) => {
        const p = (persisted as { project?: unknown } | null)?.project
        return { project: sanitizeVgenProject(p) ?? DEFAULT_VGEN_PROJECT } as VgenState
      },
      merge: (persisted, current) => {
        const p = (persisted as { project?: unknown } | null)?.project
        return { ...current, project: sanitizeVgenProject(p) ?? current.project }
      },
      partialize: (s) => ({ project: s.project }) as VgenState
    }
  )
)

syncAcrossWindows(useVideoGen)
