// Eigene Bausteine des Mini-Manuals: eine JSON-Datei je Baustein (userData/Bausteine, ab
// Phase 5 auch ein geteilter Ordner – eine Datei je Baustein vermeidet Sync-Konflikte). Hier die
// Hülle und ihre Prüfung (rein, für main); den Inhalt (`daten`) prüft das Werkzeug mit seinem
// sanitize, bevor es ihn benutzt.

import type { EigenerBaustein } from './types'

export const BAUSTEIN_GRENZEN = {
  /** eine Datei */
  bytes: 1024 * 1024,
  /** so viele Dateien liest die Liste höchstens */
  anzahl: 2000
} as const

const ID = /^[a-z0-9-]{8,64}$/

export const isBausteinId = (v: unknown): v is string => typeof v === 'string' && ID.test(v)

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '')

/** Hülle prüfen; `null` = unbrauchbar. `daten` bleibt, wie es ist (Größe prüft der Aufrufer). */
export function sanitizeEigenerBaustein(v: unknown): EigenerBaustein | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const b = v as Record<string, unknown>
  if (!isBausteinId(b.id)) return null
  if (b.art !== 'bloecke' && b.art !== 'fall') return null
  if (!('daten' in b)) return null
  const kapitel = str(b.kapitel, 40)
  return {
    id: b.id,
    art: b.art,
    titel: str(b.titel, 200),
    kapitel: /^[a-zA-Z]*$/.test(kapitel) ? kapitel : '',
    daten: b.daten,
    geaendertAm: str(b.geaendertAm, 40),
    geaendertVon: str(b.geaendertVon, 100),
    version:
      typeof b.version === 'number' && Number.isInteger(b.version) && b.version > 0
        ? Math.min(b.version, 1_000_000)
        : 1
  }
}
