// Reine Helfer rund um yt-dlp-Aufrufe: Adressen prüfen, Argumente bauen, die flache
// Playlist-Analyse auswerten. Ohne Prozess/Netz -> testbar. Die Adresse kommt immer
// nach `--`: eine Eingabe, die mit „-“ beginnt, darf nie als Option gelesen werden.

import { join } from 'node:path'
import type {
  YoutubeSettings,
  YtCookieSource,
  YtEnqueueRequest,
  YtPlaylistEntry,
  YtProbeResult
} from '@shared/types'

/** So viele Einträge analysiert die Playlist-Erkennung höchstens (Kanäle haben Tausende). */
export const PROBE_LIMIT = 500

/** Unter Windows schreibt yt-dlp in eine Pipe sonst in der Systemkodierung: Aus „ä“ wird „�“, was
 *  sie nicht kennt (der Vollbreiten-„：“ aus Dateinamen), fällt ganz weg. */
const UTF8 = ['--encoding', 'utf-8']

/** Zeilenanfang, unter dem yt-dlp nach dem letzten Schritt Länge und fertige Datei nennt */
const FILE_LINE = 'MOTTULBOX-DATEI '

/** So weit dürfen die Längen abweichen: yt-dlp nennt die der Seite, die Datei misst sich genauer */
const SAME_LENGTH_SEC = 2

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

export interface YtFinishedFile {
  path: string
  durationSec: number | null
}

/** Argumente für die flache Analyse: Playlist-Einträge ohne die Videos selbst abzurufen. */
export function buildProbeArgs(url: string, extra: string[] = [], limit = PROBE_LIMIT): string[] {
  return [
    ...UTF8,
    '--flat-playlist',
    '--dump-single-json',
    '--no-warnings',
    '--playlist-items',
    `1:${limit}`,
    ...extra,
    '--',
    url
  ]
}

/** Argumente für einen Download. Verzeichnis über -P (kein Ausgabe-Template: ein „%“ im
 *  Pfad bliebe sonst nicht erhalten), Dateiname über -o; Playlists optional im Unterordner.
 *  Der Name trägt den zweiten Titel mit: Arte nennt jede Folge nur nach der Sendung („Tracks“),
 *  der Beitrag steht dort. `withId` macht ihn eindeutig (siehe YtManager.run). */
export function buildDownloadArgs(
  req: YtEnqueueRequest,
  ffmpeg: string,
  extra: string[] = [],
  withId = false
): string[] {
  const dir = req.subfolder ? join(req.outputDir, safeFolderName(req.subfolder)) : req.outputDir
  const args = [
    '--newline',
    '--no-playlist',
    ...UTF8,
    // der Pfad der fertigen Datei; --print allein schaltete den Fortschritt ab
    '--print',
    `after_move:${FILE_LINE}%(duration)s %(filepath)s`,
    '--no-quiet',
    '--ffmpeg-location',
    ffmpeg
  ]
  if (req.format === 'video') {
    const cap = req.maxHeight
    args.push('-f', cap ? `bv*[height<=${cap}]+ba/b[height<=${cap}]/b` : 'bv*+ba/b')
    args.push('--merge-output-format', 'mp4')
  } else {
    args.push('-x', '--audio-format', req.format === 'audio-mp3' ? 'mp3' : 'm4a')
  }
  const n = req.number
  const prefix = n ? `${String(n.index).padStart(n.digits, '0')} - ` : ''
  const id = withId ? ' [%(id)s]' : ''
  args.push('-P', dir, '-o', `${prefix}%(title)s%(alt_title& - {}|)s${id}.%(ext)s`)
  args.push(...extra, '--', req.url)
  return args
}

/** Die fertige Datei samt Länge laut yt-dlp, wenn die Ausgabezeile sie nennt */
export function finishedFile(line: string): YtFinishedFile | null {
  if (!line.startsWith(FILE_LINE)) return null
  const m = /^(\S+) (.+)$/.exec(line.slice(FILE_LINE.length).trim())
  if (!m) return null
  const sec = Number(m[1]) // „NA“, wenn die Seite keine Länge nennt
  return { path: m[2], durationSec: Number.isFinite(sec) ? sec : null }
}

/** Datei dieses Namens gibt es schon: yt-dlp lädt dann nichts und endet trotzdem mit Code 0. */
export function alreadyDownloaded(line: string): boolean {
  return /^\[download\] .+ has already been downloaded\s*$/.test(line)
}

/** Dasselbe Video? Der Name sagt das nicht (Folgen einer Sendung), die Länge fast immer.
 *  Unbekannt zählt als verschieden: lieber eine Kopie als ein fehlender Download. */
export function sameLength(a: number | null, b: number | null): boolean {
  return a !== null && b !== null && Math.abs(a - b) <= SAME_LENGTH_SEC
}

/* -------------------- Anmeldung, Browser-Nachahmung, Fehler -------------------- */

/** Browser, aus denen yt-dlp Cookies lesen kann (Namen wie bei --cookies-from-browser) */
export const COOKIE_BROWSERS: Exclude<YtCookieSource, 'none' | 'file'>[] = [
  'firefox',
  'chrome',
  'edge',
  'brave',
  'opera',
  'vivaldi',
  'chromium',
  'safari'
]

/**
 * Zusatz-Argumente vor dem `--` der Adresse: Cookies (aus dem Browser oder einer cookies.txt)
 * und auf Wunsch die Browser-Nachahmung. Nur bekannte Browser; eine Datei nur, wenn `fileOk`
 * sie bestätigt (absolut, vorhanden) – sonst liefe yt-dlp ohne Anmeldung los.
 */
export function authArgs(
  yt: Pick<YoutubeSettings, 'cookies' | 'cookiesFile'>,
  opts: { impersonate?: boolean; fileOk?: (path: string) => boolean } = {}
): string[] {
  const args: string[] = []
  const file = typeof yt.cookiesFile === 'string' ? yt.cookiesFile.trim() : ''
  if (yt.cookies === 'file') {
    if (file && (opts.fileOk?.(file) ?? false)) args.push('--cookies', file)
  } else if ((COOKIE_BROWSERS as string[]).includes(yt.cookies)) {
    args.push('--cookies-from-browser', yt.cookies)
  }
  // Seitenabruf UND Download wie ein Browser (generic:impersonate allein deckt nur den ersten
  // Abruf ab, der Download scheiterte danach mit 403 – im Labor nachgestellt)
  if (opts.impersonate) args.push('--impersonate', 'chrome')
  return args
}

/** Sperrt die Seite Programme aus (Cloudflare)? Dann einmal mit Browser-Nachahmung versuchen. */
export function needsImpersonation(stderr: string): boolean {
  return /Cloudflare anti-bot challenge|generic:impersonate/i.test(stderr)
}

/**
 * Verständliche Meldung zu bekannten yt-dlp-Fehlern (Anmeldung, Cookies, Seitenschutz),
 * sonst die letzte Fehlerzeile. `cookies`: was eingestellt war; `impersonated`: zweiter Versuch
 * mit Browser-Nachahmung lief schon.
 */
export function explainYtError(
  stderr: string,
  ctx: { cookies: YtCookieSource; impersonated: boolean }
): string | null {
  const t = stderr
  if (/impersonate target .*(not available|unavailable)|curl_cffi/i.test(t)) {
    return 'Die Seite blockt automatische Abrufe; diesem yt-dlp fehlt die Browser-Nachahmung. Im App-Menü das eigenständige yt-dlp laden.'
  }
  if (needsImpersonation(t)) {
    return 'Die Seite blockt automatische Abrufe (Cloudflare-Schutz) – auch mit Browser-Nachahmung. Im Browser öffnen und dort laden.'
  }
  if (/Failed to decrypt with DPAPI|app.?bound/i.test(t)) {
    return 'Chrome und Edge verschlüsseln ihre Cookies unter Windows so, dass andere Programme sie nicht lesen können. Unter „Anmeldung“ Firefox wählen oder eine cookies.txt nutzen.'
  }
  if (/could not copy .*cookie database|database is locked/i.test(t)) {
    return 'Der Browser sperrt seine Cookies, solange er läuft – Browser schließen und erneut versuchen.'
  }
  if (/could not find .*(cookies? database|profile)|failed to (find|load) .*cookies/i.test(t)) {
    return 'Im gewählten Browser wurden keine Cookies gefunden – ist er installiert und schon benutzt worden? Sonst unter „Anmeldung“ einen anderen wählen.'
  }
  if (
    /sign in to confirm|--cookies-from-browser or --cookies|use --cookies|login required|account (is )?required/i.test(
      t
    )
  ) {
    return ctx.cookies === 'none'
      ? 'Anmeldung nötig (Altersfreigabe oder Bot-Prüfung): Unter „Anmeldung“ den Browser wählen, der bei YouTube angemeldet ist.'
      : 'Die Seite verlangt trotz Cookies eine Anmeldung – im gewählten Browser anmelden (bei Altersfreigabe mit einem volljährigen Konto) und erneut versuchen.'
  }
  if (ctx.impersonated && /HTTP Error 403/i.test(t)) {
    return 'Die Seite verweigert den Abruf (HTTP 403), auch mit Browser-Nachahmung.'
  }
  return ytErrorText(t)
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
    const title = str(j.title)
    const alt = str(j.alt_title)
    return {
      kind: 'video',
      url: httpUrl(j.webpage_url) ?? requestedUrl,
      title: title && alt ? `${title} - ${alt}` : title, // wie der Dateiname
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
