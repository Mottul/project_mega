// Jingle-Bibliothek: kopiert Audiodateien nach userData/jingles und stellt sie
// dem Renderer ausschließlich über das jingle://-Protocol bereit (kein
// file://-Zugriff). Bewusst ohne DB – die Pad-Belegung lebt im Renderer-Store.

import { app } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { basename, extname, join } from 'node:path'
import type { JingleImportResult } from '@shared/types'

const SAFE_NAME_RE = /^[a-zA-Z0-9._-]+$/
const AUDIO_EXT = new Set([
  '.mp3',
  '.wav',
  '.m4a',
  '.aac',
  '.ogg',
  '.oga',
  '.opus',
  '.flac',
  '.weba',
  '.aif',
  '.aiff'
])

export function jingleDir(): string {
  const dir = join(app.getPath('userData'), 'jingles')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function importJingle(src: string): JingleImportResult | null {
  const ext = extname(src).toLowerCase()
  if (!AUDIO_EXT.has(ext)) return null
  const storedName = `${randomUUID()}${ext}`
  copyFileSync(src, join(jingleDir(), storedName))
  return { storedName, originalName: basename(src) }
}

/** Löst einen relativen jingle://-Pfad sicher in einen absoluten Dateipfad auf. */
export function resolveJingleFile(relative: string): string | null {
  const name = basename(decodeURIComponent(relative))
  if (!SAFE_NAME_RE.test(name)) return null
  const abs = join(jingleDir(), name)
  return existsSync(abs) ? abs : null
}

/** Roh-Bytes eines Jingles (für die Waveform-Analyse im Renderer via Web Audio).
 *  Bewusst per IPC statt fetch – fetch auf Custom-Protokolle scheitert (CORS). */
export async function readJingleBytes(storedName: string): Promise<Buffer | null> {
  const abs = resolveJingleFile(storedName)
  if (!abs) return null
  return readFile(abs)
}

/** Alle Dateien außer den noch belegten löschen (Aufräumen verwaister Jingles). */
export function cleanupJingles(keep: string[]): void {
  const keepSet = new Set(keep)
  for (const f of readdirSync(jingleDir())) {
    if (!keepSet.has(f)) {
      try {
        rmSync(join(jingleDir(), f))
      } catch {
        // in Benutzung/gesperrt -> beim nächsten Mal
      }
    }
  }
}

export function jingleContentType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case '.mp3':
      return 'audio/mpeg'
    case '.wav':
      return 'audio/wav'
    case '.m4a':
    case '.aac':
      return 'audio/mp4'
    case '.ogg':
    case '.oga':
    case '.opus':
      return 'audio/ogg'
    case '.flac':
      return 'audio/flac'
    case '.aif':
    case '.aiff':
      return 'audio/aiff'
    default:
      return 'application/octet-stream'
  }
}
