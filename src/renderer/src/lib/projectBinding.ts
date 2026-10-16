// Bindung eines Werkzeugs an eine Projektdatei – Typ und Prüfung, ohne App-Brücke (api), damit
// Stores und ihre Tests sie ohne Electron importieren können. Ablauf: lib/projectFile.ts.

export interface ProjectBinding {
  path: string
  name: string
  /** sha256 des Abschnitts beim Öffnen/letzten Speichern (Konfliktprüfung in main) */
  baseSha: string
  rev: number
  /** digest() der Daten beim Öffnen/letzten Speichern („ungespeichert“) */
  savedDigest: string
}

const SHA = /^[0-9a-f]{64}$/

/** Gespeicherte Bindung prüfen (Store-Migration, fremde localStorage-Stände). */
export function sanitizeBinding(v: unknown): ProjectBinding | null {
  if (!v || typeof v !== 'object') return null
  const b = v as Record<string, unknown>
  if (typeof b.path !== 'string' || !b.path || b.path.length > 4096) return null
  if (typeof b.name !== 'string' || typeof b.baseSha !== 'string' || !SHA.test(b.baseSha)) {
    return null
  }
  if (typeof b.rev !== 'number' || !Number.isInteger(b.rev) || b.rev < 0) return null
  if (typeof b.savedDigest !== 'string') return null
  return {
    path: b.path,
    name: b.name.slice(0, 200),
    baseSha: b.baseSha,
    rev: b.rev,
    savedDigest: b.savedDigest
  }
}
