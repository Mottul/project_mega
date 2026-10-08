// Quelldateien für die Live-Vorschau des Video-Generators (Videos, animierte GIFs, Musik): Der
// Renderer bekommt KEINEN Dateipfad-Zugriff, sondern je Datei ein zufälliges Zeichen
// (media://vgen/src/<zeichen>/<name>), das nur gilt, solange die App läuft. Nur Medien-
// Endungen, nur absolute Pfade ohne Protokolle (SICHERHEIT.md).

import { randomBytes } from 'node:crypto'
import { statSync } from 'node:fs'
import { extname } from 'node:path'
import { MEDIA_PROTOCOL } from '@shared/ipc-contracts'
import { AUDIO_EXTENSIONS, VIDEO_EXTENSIONS } from '@shared/mediaExtensions'
import { isSafeAbsolutePath } from '@shared/videoGenProject'

const ALLOWED = new Set([...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS, 'gif'])
/** Obergrenze, damit ein entgleister Renderer die Liste nicht endlos wachsen lässt. */
const MAX_TOKENS = 10_000

const byToken = new Map<string, string>()
const byPath = new Map<string, string>()

/** Adresse für eine Quelldatei; null = keine erlaubte, vorhandene Mediendatei. */
export function videoGenSourceUrl(path: unknown): string | null {
  if (!isSafeAbsolutePath(path)) return null
  const ext = extname(path).slice(1).toLowerCase()
  if (!ALLOWED.has(ext)) return null
  try {
    if (!statSync(path).isFile()) return null
  } catch {
    return null
  }
  let token = byPath.get(path)
  if (!token) {
    if (byToken.size >= MAX_TOKENS) return null
    token = randomBytes(16).toString('hex')
    byToken.set(token, path)
    byPath.set(path, token)
  }
  // der Name am Ende nur für den Inhaltstyp (Endung) – aufgelöst wird über das Zeichen
  return `${MEDIA_PROTOCOL}://vgen/src/${token}/${encodeURIComponent(`media.${ext}`)}`
}

/** Pfad zu „/src/<zeichen>/<name>“ oder null. */
export function resolveVgenSource(pathname: string): string | null {
  const m = /^\/src\/([0-9a-f]{32})\//.exec(pathname)
  return m ? (byToken.get(m[1]) ?? null) : null
}
