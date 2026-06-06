// Verwaltete Player-Bibliothek: konvertierte Medien liegen als Dateien in
// userData/player-media, die Metadaten in SQLite (media_items). Der renderer lädt
// die Dateien ausschließlich über das media://-Protocol (kein file://-Zugriff).

import { app } from 'electron'
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { MEDIA_PROTOCOL } from '@shared/ipc-contracts'
import type { FitMode, MediaItem, MediaKind } from '@shared/types'
import { getDb } from '../db'

interface MediaRow {
  id: string
  kind: MediaKind
  title: string
  original_name: string
  stored_name: string
  thumb_name: string | null
  width: number
  height: number
  duration_sec: number | null
  fit_mode: FitMode
  has_audio: number
  conv_key: string
  size_bytes: number
  added_at: number
}

// Nur die von uns vergebenen, sicheren Dateinamen zulassen (<uuid>.<ext>).
const SAFE_NAME_RE = /^[a-zA-Z0-9._-]+$/

export function mediaDir(): string {
  const dir = join(app.getPath('userData'), 'player-media')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function mediaFilePath(storedName: string): string {
  return join(mediaDir(), storedName)
}

/** Löst einen relativen media://-Pfad sicher in einen absoluten Dateipfad auf. */
export function resolveMediaFile(relative: string): string | null {
  const name = basename(decodeURIComponent(relative))
  if (!SAFE_NAME_RE.test(name)) return null
  const abs = join(mediaDir(), name)
  return existsSync(abs) ? abs : null
}

function rowToItem(r: MediaRow): MediaItem {
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    originalName: r.original_name,
    url: `${MEDIA_PROTOCOL}://library/${r.stored_name}`,
    thumbUrl: r.thumb_name ? `${MEDIA_PROTOCOL}://library/${r.thumb_name}` : null,
    width: r.width,
    height: r.height,
    durationSec: r.duration_sec,
    fitMode: r.fit_mode,
    hasAudio: r.has_audio === 1,
    sizeBytes: r.size_bytes,
    addedAt: r.added_at
  }
}

/**
 * Günstige Quell-Signatur ohne die (u.U. mehrere GB große) Datei zu lesen:
 * Größe + mtime + Name. Zusammen mit Fit-Modus und Zielauflösung ergibt das den
 * Dedup-Schlüssel -- dieselbe Quelle gleich konvertiert wird nicht doppelt abgelegt.
 */
export function convKeyFor(
  sourcePath: string,
  fit: FitMode,
  width: number,
  height: number
): string {
  let sig = basename(sourcePath)
  try {
    const st = statSync(sourcePath)
    sig = `${st.size}-${Math.round(st.mtimeMs)}-${basename(sourcePath)}`
  } catch {
    // Quelle nicht lesbar -> nur der Name, Konvertierung schlägt ohnehin sauber fehl
  }
  return `${sig}__${fit}__${width}x${height}`
}

export function findByConvKey(convKey: string): MediaItem | null {
  const row = getDb().prepare('SELECT * FROM media_items WHERE conv_key = ?').get(convKey) as
    | MediaRow
    | undefined
  return row ? rowToItem(row) : null
}

export interface NewMediaRecord {
  id: string
  kind: MediaKind
  title: string
  originalName: string
  storedName: string
  thumbName: string | null
  width: number
  height: number
  durationSec: number | null
  fitMode: FitMode
  hasAudio: boolean
  convKey: string
  sizeBytes: number
}

export function insertMedia(rec: NewMediaRecord): MediaItem {
  getDb()
    .prepare(
      `INSERT INTO media_items
         (id, kind, title, original_name, stored_name, thumb_name, width, height,
          duration_sec, fit_mode, has_audio, conv_key, size_bytes, added_at)
       VALUES
         (@id, @kind, @title, @original_name, @stored_name, @thumb_name, @width, @height,
          @duration_sec, @fit_mode, @has_audio, @conv_key, @size_bytes, @added_at)`
    )
    .run({
      id: rec.id,
      kind: rec.kind,
      title: rec.title,
      original_name: rec.originalName,
      stored_name: rec.storedName,
      thumb_name: rec.thumbName,
      width: rec.width,
      height: rec.height,
      duration_sec: rec.durationSec,
      fit_mode: rec.fitMode,
      has_audio: rec.hasAudio ? 1 : 0,
      conv_key: rec.convKey,
      size_bytes: rec.sizeBytes,
      added_at: Date.now()
    })
  return getMedia(rec.id)!
}

export function listMedia(): MediaItem[] {
  const rows = getDb()
    .prepare('SELECT * FROM media_items ORDER BY added_at DESC')
    .all() as MediaRow[]
  return rows.map(rowToItem)
}

export function getMedia(id: string): MediaItem | null {
  const row = getDb().prepare('SELECT * FROM media_items WHERE id = ?').get(id) as
    | MediaRow
    | undefined
  return row ? rowToItem(row) : null
}

export function deleteMedia(id: string): void {
  const row = getDb().prepare('SELECT stored_name, thumb_name FROM media_items WHERE id = ?').get(id) as
    | { stored_name: string; thumb_name: string | null }
    | undefined
  if (!row) return
  getDb().prepare('DELETE FROM media_items WHERE id = ?').run(id)
  for (const name of [row.stored_name, row.thumb_name]) {
    if (!name) continue
    try {
      const abs = mediaFilePath(name)
      if (existsSync(abs)) rmSync(abs)
    } catch {
      // Datei-Cleanup ist best effort
    }
  }
}

/** Endung der konvertierten Datei je Medienart (Bild -> jpg, sonst mp4). */
export function storedExtFor(kind: MediaKind): string {
  return kind === 'image' ? '.jpg' : '.mp4'
}

export function isImageExt(path: string): boolean {
  return ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tif', '.tiff'].includes(
    extname(path).toLowerCase()
  )
}

export function isGifExt(path: string): boolean {
  return extname(path).toLowerCase() === '.gif'
}
