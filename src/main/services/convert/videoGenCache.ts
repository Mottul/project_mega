// Zwischenspeicher des Video-Generators unter userData/vgen-cache:
//   pieces/    Element-Stücke (<schlüssel>.mov + .wav) und Übergänge (<schlüssel>.mov)
//   thumbs/    Vorschaubilder (über media://vgen/<datei> im Renderer)
//   previews/  gerechnete Vorschauen („Vorschau rechnen“, p_<schlüssel>.mp4, die neuesten 20)
//   jobs/      Arbeitsordner je Auftrag (Bildliste, Ton-Graph, Mix) – nach dem Lauf gelöscht
// Die Schlüssel kommen aus shared/videoGenPlan (Quelle + genau der ffmpeg-Befehl): Ändert man
// ein Element, ist nur dessen Stück neu; der Rest wird wiederverwendet. Platz begrenzt, die
// am längsten unbenutzten Stücke gehen zuerst.

import { app } from 'electron'
import { existsSync } from 'node:fs'
import { mkdir, readdir, rename, rm, stat, statfs, utimes } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { logLine } from '../log'

/** Obergrenze für pieces/ (Intra-Material ≈ 320 MB je Minute 1080p). */
export const VGEN_CACHE_MAX_BYTES = 20 * 1024 ** 3

const SAFE_NAME_RE = /^[a-zA-Z0-9._-]+$/

export function cacheRoot(): string {
  return join(app.getPath('userData'), 'vgen-cache')
}
export const piecesDir = (): string => join(cacheRoot(), 'pieces')
export const thumbsDir = (): string => join(cacheRoot(), 'thumbs')
export const previewsDir = (): string => join(cacheRoot(), 'previews')
export const jobDir = (jobId: string): string => join(cacheRoot(), 'jobs', jobId)

/** Gerechnete Vorschauen: so viele bleiben (je wenige MB). */
export const VGEN_PREVIEWS_KEEP = 20

export async function ensureDirs(...dirs: string[]): Promise<void> {
  for (const d of dirs) await mkdir(d, { recursive: true })
}

export function elementPaths(key: string): { video: string; audio: string } {
  return { video: join(piecesDir(), `e_${key}.mov`), audio: join(piecesDir(), `e_${key}.wav`) }
}

export function transitionFile(key: string): string {
  return join(piecesDir(), `t_${key}.mov`)
}

/** Alle Dateien vorhanden und nicht leer (ein abgebrochener Lauf hinterlässt nie das Ziel). */
export async function haveAll(paths: string[]): Promise<boolean> {
  for (const p of paths) {
    try {
      if ((await stat(p)).size <= 0) return false
    } catch {
      return false
    }
  }
  return true
}

/** Als benutzt markieren (Änderungszeit = jetzt) – fürs Aufräumen nach Alter. */
export async function touch(paths: string[]): Promise<void> {
  const now = new Date()
  await Promise.all(paths.map((p) => utimes(p, now, now).catch(() => {})))
}

/**
 * Temporärer Name im selben Ordner („…_tmp<id>.mov“: ffmpeg erkennt das Format an der
 * Endung); erst nach einem erfolgreichen Lauf umbenannt -> nie ein halbes Stück im Cache.
 */
export function tempName(path: string, id: string): string {
  return path.replace(/(\.[a-z0-9]+)$/i, `_tmp${id}$1`)
}

/**
 * Fertiges Stück an seinen Platz. Liegt es dort schon (ein paralleler Auftrag war schneller),
 * bleibt das vorhandene – gleicher Schlüssel, gleicher Inhalt; Überschreiben scheiterte unter
 * Windows, solange ein anderes ffmpeg die Datei liest.
 */
export async function commit(tmp: string, final: string): Promise<void> {
  if (await haveAll([final])) {
    await removeQuietly(tmp)
    return
  }
  await rename(tmp, final)
}

export async function removeQuietly(...paths: string[]): Promise<void> {
  await Promise.all(paths.map((p) => rm(p, { force: true, recursive: true }).catch(() => {})))
}

/** Freier Platz auf dem Laufwerk des Caches (Bytes) oder null, wenn nicht ermittelbar. */
export async function freeBytes(): Promise<number | null> {
  try {
    await ensureDirs(cacheRoot())
    const s = await statfs(cacheRoot())
    return Number(s.bavail) * Number(s.bsize)
  } catch {
    return null
  }
}

/**
 * Aufräumen: zuerst liegengebliebene Temporärdateien, dann die ältesten Stücke, bis pieces/
 * unter der Grenze liegt. `keep` (gerade gebrauchte Stücke) bleibt immer.
 */
export async function prune(
  maxBytes = VGEN_CACHE_MAX_BYTES,
  keep = new Set<string>()
): Promise<void> {
  const dir = piecesDir()
  if (!existsSync(dir)) return
  const files: { path: string; size: number; mtime: number }[] = []
  for (const name of await readdir(dir)) {
    const path = join(dir, name)
    try {
      const st = await stat(path)
      if (name.includes('_tmp')) {
        // älter als einen Tag: Rest eines abgestürzten Laufs
        if (Date.now() - st.mtimeMs > 24 * 3600 * 1000) await removeQuietly(path)
        continue
      }
      files.push({ path, size: st.size, mtime: st.mtimeMs })
    } catch {
      // gerade gelöscht – egal
    }
  }
  let total = files.reduce((s, f) => s + f.size, 0)
  if (total <= maxBytes) return
  files.sort((a, b) => a.mtime - b.mtime)
  for (const f of files) {
    if (total <= maxBytes) break
    if (keep.has(f.path)) continue
    await removeQuietly(f.path)
    total -= f.size
  }
  logLine('[vgen] Cache aufgeräumt, jetzt', Math.round(total / 1024 ** 2), 'MB')
}

/** Nur die neuesten gerechneten Vorschauen behalten. */
export async function prunePreviews(keep = VGEN_PREVIEWS_KEEP): Promise<void> {
  const dir = previewsDir()
  if (!existsSync(dir)) return
  const files: { path: string; mtime: number }[] = []
  for (const name of await readdir(dir)) {
    try {
      const path = join(dir, name)
      files.push({ path, mtime: (await stat(path)).mtimeMs })
    } catch {
      // gerade gelöscht – egal
    }
  }
  files.sort((a, b) => b.mtime - a.mtime)
  await removeQuietly(...files.slice(keep).map((f) => f.path))
}

/**
 * Gerechnete Stücke und Vorschauen löschen (Vorschaubilder bleiben – sie sind klein und
 * gerade sichtbar).
 */
export async function clearCache(): Promise<void> {
  await removeQuietly(piecesDir(), previewsDir())
}

const PREVIEW_NAME_RE = /^p_[0-9a-f]+\.mp4$/

/**
 * Datei für media://vgen/<name> aus dem eigenen Cache – nur Vorschaubilder (.jpg) und
 * gerechnete Vorschauen (p_….mp4), nur sichere Namen. Quelldateien laufen über
 * videoGenSources (media://vgen/src/…).
 */
export function resolveVgenFile(relative: string): string | null {
  const name = basename(decodeURIComponent(relative))
  if (!SAFE_NAME_RE.test(name)) return null
  const dir = name.endsWith('.jpg')
    ? thumbsDir()
    : PREVIEW_NAME_RE.test(name)
      ? previewsDir()
      : null
  if (!dir) return null
  const abs = join(dir, name)
  return existsSync(abs) ? abs : null
}
