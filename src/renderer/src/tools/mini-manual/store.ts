// Arbeitsstand des Mini-Manuals – zustand/persist mit debouncedStorage (Tipp-Lag), Version und
// Abgleich zwischen Fenstern. Die Bindung an die Projektdatei steht NEBEN der Anleitung (Skill
// projektdatei). Bedienzustand (Stufe der Vorschau, gewähltes Kapitel) liegt nicht hier, sondern
// per usePersistentState in der Oberfläche – er gehört nicht in die Datei.
// Fotos stehen nur als Hash in der Anleitung, nie als Bytes (debouncedStorage verschluckt
// „Speicher voll“).

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { digest } from '@shared/projectFile'
import { debouncedStorage, syncAcrossWindows } from '@renderer/lib/persistStorage'
import { sanitizeBinding, type ProjectBinding } from '@renderer/lib/projectBinding'
import type { Anleitung } from './model'
import { sanitizeAnleitung } from './sanitize'
import { neueAnleitung } from './vorlage'

interface MiniManualState {
  anleitung: Anleitung
  file: ProjectBinding | null
  /** Anleitung ändern (reine Funktion aus aktionen.ts) */
  update: (fn: (a: Anleitung) => Anleitung) => void
  /** ganz ersetzen (Projektdatei öffnen, „Neu“) */
  replace: (a: Anleitung) => void
  setFile: (b: ProjectBinding | null) => void
}

/**
 * Gespeicherten Stand prüfen – bei jedem Laden, auch aus einem anderen Fenster. Rein, getestet.
 * Bringt die Prüfung einen älteren Stand in neue Form (Version 2: LED-Wall-Kopie als Liste der
 * Wände), bleibt eine gespeicherte Bindung „gespeichert“: Die Prüfsumme wird mit umgerechnet.
 */
export function migrateMiniManual(persisted: unknown): Pick<MiniManualState, 'anleitung' | 'file'> {
  const p = persisted && typeof persisted === 'object' ? (persisted as Record<string, unknown>) : {}
  const anleitung =
    p.anleitung && typeof p.anleitung === 'object'
      ? sanitizeAnleitung(p.anleitung)
      : neueAnleitung()
  const file = sanitizeBinding(p.file)
  if (file && file.savedDigest === digest(p.anleitung)) file.savedDigest = digest(anleitung)
  return { anleitung, file }
}

export const useMiniManual = create<MiniManualState>()(
  persist(
    (set) => ({
      anleitung: neueAnleitung(),
      file: null,
      update: (fn) => set((s) => ({ anleitung: fn(s.anleitung) })),
      replace: (a) => set({ anleitung: structuredClone(a) }),
      setFile: (file) => set({ file })
    }),
    {
      name: 'mini-manual',
      storage: debouncedStorage(),
      // 2 (Oktober 2026): LED-Wall-Kopie mit mehreren Wänden; 3: Signalwege der Geräte;
      // 4: Kapitel Verkabelung, Antwort aus der Planung; 5: Online-Fassung; 6: Bedienfelder;
      // 7: Übernahme aus Jingle-Player und OSC-Steuerung; 8: Fläche der OSC-Vorlage – migrate ist
      // die Prüfung
      version: 8,
      partialize: (s) => ({ anleitung: s.anleitung, file: s.file }) as MiniManualState,
      migrate: (persisted) => migrateMiniManual(persisted) as MiniManualState,
      // auch ohne Versionswechsel prüfen: localStorage kann von Hand oder aus einem älteren
      // Fenster stammen – fremde Felder dürfen den Arbeitsstand nicht zerlegen
      merge: (persisted, current) => ({ ...current, ...migrateMiniManual(persisted) })
    }
  )
)

syncAcrossWindows(useMiniManual)
