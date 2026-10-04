// Reine Helfer rund um yt-dlp-Aufrufe: Adressen prüfen, Argumente bauen, die flache
// Playlist-Analyse auswerten. Ohne Prozess/Netz -> testbar. Die Adresse kommt immer
// nach `--`: eine Eingabe, die mit „-“ beginnt, darf nie als Option gelesen werden.

import { join } from 'node:path'
import type { YtEnqueueRequest, YtPlaylistEntry, YtProbeResult } from '@shared/types'

/** So viele Einträge analysiert die Playlist-Erkennung höchstens (Kanäle haben Tausende). */
export const PROBE_LIMIT = 500

/** Nur http(s)-Adressen; Leerraum außen weg. Wirft mit lesbarer Meldung. */
export function normalizeUrl(raw: string): string {
  const text = typeof raw === 'string' ? raw.trim() : ''
  let u: URL
  try {
    u = new URL(text)
  } catch {
    throw new Error('Keine gültige Adresse – bitte mit https:// einfügen.')
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    throw new Error('Nur http(s)-Adressen werden unterstützt.')
  }
  return text
}

const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i

/** Ordnername aus beliebigem Text (Playlist-Titel) – gültig unter Windows, macOS, Linux. */
export function safeFolderName(name: string): string {
  let s = (name ?? '')
    .replace(/[\\/:*?"<>|\p{Cc}]/gu, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .replace(/[. ]+$/, '') // Windows: kein Punkt/Leerzeichen am Ende
  if (RESERVED.test(s)) s = `${s}_`
  return s || 'Playlist'
}

/** Argumente für die flache Analyse: Playlist-Einträge ohne die Videos selbst abzurufen. */
export function buildProbeArgs(url: string, limit = PROBE_LIMIT): string[] {
  return [
    '--flat-playlist',
    '--dump-single-json',
    '--no-warnings',
    '--playlist-items',
    `1:${limit}`,
    '--',
    url
  ]
}

/** Argumente für einen Download. Verzeichnis über -P (kein Ausgabe-Template: ein „%“ im
 *  Pfad bliebe sonst nicht erhalten), Dateiname über -o; Playlists optional im Unterordner. */
export function buildDownloadArgs(req: YtEnqueueRequest, ffmpeg: string): string[] {
  const dir = req.subfolder ? join(req.outputDir, safeFolderName(req.subfolder)) : req.outputDir
  const args = ['--newline', '--no-playlist', '--ffmpeg-location', ffmpeg]
  if (req.format === 'video') {
    const cap = req.maxHeight
    args.push('-f', cap ? `bv*[height<=${cap}]+ba/b[height<=${cap}]/b` : 'bv*+ba/b')
    args.push('--merge-output-format', 'mp4')
  } else {
    args.push('-x', '--audio-format', req.format === 'audio-mp3' ? 'mp3' : 'm4a')
  }
  const n = req.number
  const prefix = n ? `${String(n.index).padStart(n.digits, '0')} - ` : ''
  args.push('-P', dir, '-o', `${prefix}%(title)s.%(ext)s`)
  args.push('--', req.url)
  return args
}

/** Anfrage aus dem Renderer prüfen und auf erlaubte Werte bringen (wirft bei Unsinn). */
export function sanitizeRequest(req: YtEnqueueRequest): YtEnqueueRequest {
  if (!req || typeof req !== 'object') throw new Error('Ungültige Anfrage')
  const url = normalizeUrl(req.url)
  if (typeof req.outputDir !== 'string' || !req.outputDir.trim()) {
    throw new Error('Kein Zielordner gewählt')
  }
  const format = (['video', 'audio-mp3', 'audio-m4a'] as const).includes(req.format)
    ? req.format
    : 'video'
  const maxHeight =
    typeof req.maxHeight === 'number' && Number.isInteger(req.maxHeight) && req.maxHeight > 0
      ? Math.min(req.maxHeight, 8640)
      : null
  const out: YtEnqueueRequest = { url, format, maxHeight, outputDir: req.outputDir }
  if (typeof req.title === 'string' && req.title.trim()) out.title = req.title.trim().slice(0, 300)
  if (typeof req.subfolder === 'string' && req.subfolder.trim()) {
    out.subfolder = safeFolderName(req.subfolder)
  }
  const n = req.number
  if (
    n &&
    Number.isInteger(n.index) &&
    Number.isInteger(n.digits) &&
    n.index >= 1 &&
    n.index <= 99_999 &&
    n.digits >= 1 &&
    n.digits <= 5
  ) {
    out.number = { index: n.index, digits: n.digits }
  }
  return out
}

/** Stellenzahl für die Nummerierung: mindestens zwei („01“), sonst so viele wie nötig. */
export function numberDigits(total: number): number {
  return Math.max(2, String(Math.max(1, Math.floor(total))).length)
}

/** Video-ID, wenn eine YouTube-Adresse zusätzlich auf ein einzelnes Video zeigt
 *  (watch?v=…&list=…, youtu.be/…?list=…). */
export function videoIdInPlaylistUrl(url: string): string | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (!u.searchParams.get('list')) return null
  const host = u.hostname.replace(/^(www|m|music)\./, '')
  let id: string | null = null
  if (host === 'youtube.com') id = u.searchParams.get('v')
  else if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0] || null
  return id && /^[\w-]{6,20}$/.test(id) ? id : null
}

const UNAVAILABLE_TITLE = /^\[(private|deleted|unavailable) video\]$/i
const UNAVAILABLE = new Set(['private', 'needs_auth', 'subscriber_only', 'premium_only'])

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null
const httpUrl = (v: unknown): string | null => {
  const s = str(v)
  return s && /^https?:\/\//i.test(s) ? s : null
}

function entryOf(raw: unknown, position: number): YtPlaylistEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const e = raw as Record<string, unknown>
  const id = str(e.id) ?? ''
  const ieKey = str(e.ie_key) ?? ''
  let url = httpUrl(e.url) ?? httpUrl(e.webpage_url)
  // YouTube liefert flach mal nur die ID
  if (!url && id && /^youtube$/i.test(ieKey)) url = `https://www.youtube.com/watch?v=${id}`
  const title = str(e.title) ?? (id || `Eintrag ${position}`)
  const nested = e._type === 'playlist' || /(tab|playlist)$/i.test(ieKey)
  const availability = str(e.availability)
  const unavailable =
    !url ||
    UNAVAILABLE_TITLE.test(title) ||
    (availability !== null && UNAVAILABLE.has(availability))
  const index = num(e.playlist_index) ?? position
  return {
    index: Math.round(index),
    id: id || String(position),
    url,
    title,
    durationSec: num(e.duration),
    unavailable: unavailable && !nested,
    nested
  }
}

/** JSON von `--flat-playlist --dump-single-json` auswerten. */
export function parseProbeJson(json: unknown, requestedUrl: string): YtProbeResult {
  if (!json || typeof json !== 'object') throw new Error('Antwort von yt-dlp nicht lesbar')
  const j = json as Record<string, unknown>
  const isList = j._type === 'playlist' || j._type === 'multi_video' || Array.isArray(j.entries)
  if (!isList) {
    return {
      kind: 'video',
      url: httpUrl(j.webpage_url) ?? requestedUrl,
      title: str(j.title),
      durationSec: num(j.duration)
    }
  }
  const raw = Array.isArray(j.entries) ? j.entries : []
  const entries = raw
    .map((e, i) => entryOf(e, i + 1))
    .filter((e): e is YtPlaylistEntry => e !== null)
  const total = num(j.playlist_count)
  const currentId = videoIdInPlaylistUrl(requestedUrl)
  return {
    kind: 'playlist',
    url: httpUrl(j.webpage_url) ?? requestedUrl,
    title: str(j.title) ?? 'Playlist',
    uploader: str(j.uploader) ?? str(j.channel),
    entries,
    total: total === null ? null : Math.round(total),
    truncated: total !== null ? total > entries.length : entries.length >= PROBE_LIMIT,
    currentId,
    // die eingegebene Adresse lädt mit --no-playlist genau dieses Video
    videoUrl: currentId ? requestedUrl : null
  }
}

/** Letzte Fehlerzeile von yt-dlp, ohne „ERROR:“-Präfix. */
export function ytErrorText(stderr: string): string | null {
  const lines = stderr
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  const err = [...lines].reverse().find((l) => /^ERROR:/i.test(l)) ?? lines[lines.length - 1]
  return err ? err.replace(/^ERROR:\s*/i, '') : null
}
