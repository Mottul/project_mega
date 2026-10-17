// Anbindung des Mini-Manuals an die Projektdatei (Abschnitt „anleitung“): Optionen für
// useProjectFile. Fotos gehen als Hashes mit, main holt sie aus dem Foto-Speicher in die Datei.

import { digest } from '@shared/projectFile'
import type { ProjectFileOptions } from '@renderer/lib/projectFile'
import { fotosIn, type Anleitung } from './model'
import { ANLEITUNG_VERSION, sanitizeAnleitung } from './sanitize'
import { useMiniManual } from './store'
import { neueAnleitung } from './vorlage'

type State = ReturnType<typeof useMiniManual.getState>

export function beschreibe(data: unknown): string {
  const a = sanitizeAnleitung(data)
  const d = a.deckblatt
  return [d.projekt, d.kunde].filter((x) => x.trim()).join(' · ') || a.titel
}

const LEER = digest(neueAnleitung())

export const MINI_MANUAL_FILE: ProjectFileOptions<State> = {
  section: 'anleitung',
  version: ANLEITUNG_VERSION,
  label: 'Anleitung',
  store: useMiniManual,
  data: (s) => s.anleitung,
  binding: (s) => s.file,
  setBinding: (b) => useMiniManual.getState().setFile(b),
  apply: (data) => {
    if (!data || typeof data !== 'object') return false
    useMiniManual.getState().replace(sanitizeAnleitung(data))
    return true
  },
  reset: () => useMiniManual.getState().replace(neueAnleitung()),
  blank: () => neueAnleitung(),
  isEmpty: (s) => digest(s.anleitung) === LEER,
  suggestedName: (s) =>
    s.anleitung.deckblatt.projekt.trim() || s.anleitung.deckblatt.kunde.trim() || 'Anleitung',
  describe: beschreibe,
  fotos: (data) => fotosIn(data as Anleitung)
}
