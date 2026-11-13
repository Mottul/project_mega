// Gemerkter Stand des Testtongenerators: Signal, Frequenz, Pegel, Kanäle, Sweep, Metronom und
// Ausgabegerät. Eigener Store, nicht settings.json: Das Werkzeug läuft auch in der Handy-PWA,
// die keine Einstellungen der App hat – und der Testbildgenerator behält seinen eigenen Stand.
// Der gemerkte Stand ist fremde Eingabe: Beim Laden prüft ihn normalizeTone, sonst hebelte ein
// kaputter Eintrag den Pegel-Deckel aus. AV-Sync gibt es hier nicht (braucht das Testbild).

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { debouncedStorage, syncAcrossWindows } from '@renderer/lib/persistStorage'
import { DEFAULT_PATTERN_TONE, type PatternToneSettings } from '@shared/testton'
import { normalizeTone } from '../_tone/plan'

/** Stand auf sichere Werte bringen – auch Unsinn aus dem Speicher */
export function normalizeGenerator(t: unknown): PatternToneSettings {
  const s = normalizeTone(
    t && typeof t === 'object' ? (t as Partial<PatternToneSettings>) : DEFAULT_PATTERN_TONE
  )
  return s.signal === 'avsync' ? { ...s, signal: 'sine' } : s
}

interface ToneGenState {
  tone: PatternToneSettings
  set: (patch: Partial<PatternToneSettings>) => void
}

export const useToneGen = create<ToneGenState>()(
  persist(
    (set) => ({
      tone: DEFAULT_PATTERN_TONE,
      set: (patch) => set((s) => ({ tone: normalizeGenerator({ ...s.tone, ...patch }) }))
    }),
    {
      name: 'tone-generator',
      storage: debouncedStorage(),
      version: 1,
      partialize: (s) => ({ tone: s.tone }) as ToneGenState,
      merge: (persisted, current) => ({
        ...current,
        tone: normalizeGenerator((persisted as { tone?: unknown } | undefined)?.tone)
      })
    }
  )
)
syncAcrossWindows(useToneGen)
