// Kennung einer Version der Rechner-PWA aus dem Inhalt des Builds – nur im Build (Node), die Seite
// liest sie aus index.html (version.ts). Getrennt von version.ts, weil node:crypto nicht in den
// Browser gehört.
import { createHash } from 'node:crypto'

/** Datei des Builds: Pfad mit „/“ und Inhalt */
export type BuildDatei = readonly [name: string, inhalt: string | Uint8Array]

/**
 * Text mit LF-Zeilenenden. Für Dateien, die fast unverändert aus der Arbeitskopie in den Build
 * gehen (index.html): Unter Windows hat sie CRLF (Git mit autocrlf), in der CI LF – mit demselben
 * Inhalt ergäbe das eine andere Kennung (27. November 2026: 1536 gegen 1507 Bytes).
 */
export function lfText(inhalt: string | Uint8Array): string {
  const text = typeof inhalt === 'string' ? inhalt : new TextDecoder().decode(inhalt)
  return text.replace(/\r\n/g, '\n')
}

/** Nach Namen, Zeichen für Zeichen – nicht localeCompare, das hängt von der Sprache des Systems ab */
const nachName = ([a]: BuildDatei, [b]: BuildDatei): number => (a < b ? -1 : a > b ? 1 : 0)

/**
 * SHA-256 über Namen und Inhalt aller Dateien, gekürzt auf 12 Zeichen hex. Nach Namen sortiert:
 * Die Reihenfolge von Bundle und Ordnerliste hängt vom System ab (Windows liefert Ordner
 * sortiert, Linux nicht unbedingt) – so zählt nur der Inhalt. Name und Länge stehen mit
 * Trennzeichen davor, damit sich keine zwei Dateilisten zum selben Text verbinden.
 */
export function buildVersion(dateien: readonly BuildDatei[]): string {
  const hash = createHash('sha256')
  for (const [name, inhalt] of [...dateien].sort(nachName)) {
    const bytes = typeof inhalt === 'string' ? Buffer.from(inhalt, 'utf8') : inhalt
    hash.update(`${name}\0${bytes.byteLength}\0`).update(bytes)
  }
  return hash.digest('hex').slice(0, 12)
}
