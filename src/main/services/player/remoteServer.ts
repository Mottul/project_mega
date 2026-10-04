// Eingebetteter Fernsteuerungs-Server (Tablet/Handy) – bewusst dependency-frei
// (nur node:http). Liefert eine mobile Steuerseite, eine kleine JSON-API
// (Zustand/Bibliothek/Befehle) und einen SSE-Stream für Live-Updates. Medien
// werden über /media/<datei> ausgeliefert; die media://-URLs im JSON werden
// dafür auf das RELATIVE media/ umgeschrieben (gilt so auch unter der
// Fernsteuer-App, wo die Seite unter /player/ liegt).
//
// Sicherheit: Bindet ans LAN (0.0.0.0) OHNE Authentifizierung – als bewusst
// einschaltbare Komfortfunktion fürs lokale Netz. Standardmäßig AUS.

import {
  createReadStream,
  createWriteStream,
  mkdirSync,
  rmSync,
  statSync,
  statfsSync
} from 'node:fs'
import { type IncomingMessage, type ServerResponse } from 'node:http'
import { extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { app } from 'electron'
import type { PlayerState, PlayerTick, RemoteStatus } from '@shared/types'
import { logLine } from '../log'
import { getSettings } from '../store'
import { createRemoteHost, readBody, sendJsonRaw } from '../remoteHttp'
import { ALLOWED_MEDIA_EXT, convertManager } from './convertManager'
import { listMedia, resolveMediaFile } from './mediaLibrary'
import { applyCommand, getPlayerState } from './playerState'
import { parsePlayerRemoteCommand } from './remoteCommand'
import { MOBILE_PAGE } from './remotePage'

const host = createRemoteHost('remote', 8088)

export const getRemoteStatus = host.status

// media://library/<x> -> media/<x>, damit das Tablet die Dateien per HTTP lädt.
function rewriteJson(value: unknown): string {
  return JSON.stringify(value).split('media://library/').join('media/')
}

// Zustand fürs Tablet: Player-State + gespeicherte Playlists (zum Umschalten) und
// die Default-Aufbereitung (Fit für Uploads). Beide liegen in den Einstellungen,
// nicht im Player-State -> hier zusammenführen. Die Upload-Grenze erfährt die Seite
// mit, damit sie zu große Dateien gar nicht erst schickt.
function stateForRemote(state?: PlayerState): PlayerState & {
  savedPlaylists: unknown
  defaultFit: string
  maxUploadBytes: number
} {
  const s = state ?? getPlayerState()
  const p = getSettings().player
  return {
    ...s,
    savedPlaylists: p.savedPlaylists ?? [],
    defaultFit: p.defaultFit,
    maxUploadBytes: UPLOAD_LIMITS.maxBytes
  }
}

function mediaType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case '.mp4':
      return 'video/mp4'
    case '.webm':
      return 'video/webm'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.png':
      return 'image/png'
    default:
      return 'application/octet-stream'
  }
}

function uploadsDir(): string {
  const d = join(app.getPath('userData'), 'player-uploads')
  mkdirSync(d, { recursive: true })
  return d
}

/** Freier Platz auf dem Laufwerk von `dir`; null, wenn das System es nicht verrät. */
function diskFree(dir: string): number | null {
  try {
    const s = statfsSync(dir)
    return s.bavail * s.bsize
  } catch {
    return null
  }
}

export interface UploadLimits {
  /** Größte Datei je Upload. */
  maxBytes: number
  /** So viel muss danach frei bleiben (System, Konvertierung, Aufzeichnungen). */
  minFreeBytes: number
  freeBytes: (dir: string) => number | null
}

// Ohne Passwort darf niemand im LAN das Laufwerk vollschreiben: 8 GiB fassen auch
// lange 4K-Handyvideos, 2 GiB Reserve halten System und Konvertierung am Leben.
export const UPLOAD_LIMITS: UploadLimits = {
  maxBytes: 8 * 1024 ** 3,
  minFreeBytes: 2 * 1024 ** 3,
  freeBytes: diskFree
}

function fmtBytes(n: number): string {
  const gb = n / 1024 ** 3
  return gb >= 1
    ? `${gb.toLocaleString('de-DE', { maximumFractionDigits: 1 })} GB`
    : `${Math.round(n / 1024 ** 2)} MB`
}
/** Zwischen zwei Platzprüfungen beim Streamen (ohne Content-Length). */
const FREE_CHECK_EVERY = 256 * 1024 ** 2

// Datei-Upload vom Tablet/Handy: roher Body -> Datei -> Konvertierungs-Queue
// (gleicher Weg wie der Desktop-Import). Header x-filename trägt den Namen.
// Größe und freier Platz werden vorab (Content-Length) UND beim Schreiben geprüft –
// der Header kann fehlen oder lügen. Abgebrochene oder abgewiesene Uploads hinterlassen
// keine halben Dateien.
export function receiveUpload(
  req: IncomingMessage,
  res: ServerResponse,
  limits: UploadLimits = UPLOAD_LIMITS
): void {
  const hdr = req.headers['x-filename']
  const rawName = Array.isArray(hdr) ? hdr[0] : hdr
  let fname: string
  try {
    fname = decodeURIComponent(rawName || 'upload')
  } catch {
    fname = rawName || 'upload'
  }
  // Pfadanteile/heikle Zeichen entfernen
  fname =
    fname
      .replace(/[/\\]/g, '_')
      .replace(/[^\w.\- ]+/g, '_')
      .slice(0, 120) || 'upload'

  const reject = (status: number, error: string): void => {
    if (!res.headersSent) {
      // Verbindung schließen: der Rest des Bodys soll nicht mehr gelesen werden.
      res.writeHead(status, { 'Content-Type': 'application/json', Connection: 'close' })
      res.end(JSON.stringify({ ok: false, error }))
    }
  }

  const ext = extname(fname).toLowerCase()
  if (!ALLOWED_MEDIA_EXT.has(ext)) {
    reject(415, 'Dateityp nicht unterstützt')
    req.resume() // Body verwerfen
    return
  }

  const base = uploadsDir()
  const lenHeader = Number(req.headers['content-length'])
  const declared = Number.isFinite(lenHeader) && lenHeader >= 0 ? lenHeader : null
  const tooBig = `Datei zu groß (höchstens ${fmtBytes(limits.maxBytes)})`
  const noSpace = 'Zu wenig freier Speicher auf dem Rechner'
  if (declared !== null && declared > limits.maxBytes) {
    logLine('[remote] Upload abgewiesen (zu groß):', fname, declared)
    reject(413, tooBig)
    return
  }
  const free = limits.freeBytes(base)
  if (free !== null && free - (declared ?? 0) < limits.minFreeBytes) {
    logLine('[remote] Upload abgewiesen (zu wenig Platz):', fname, declared, free)
    reject(507, noSpace)
    return
  }

  // UUID-Unterordner -> kein Namenspräfix nötig, Titel bleibt der Originalname.
  const dir = join(base, randomUUID())
  mkdirSync(dir, { recursive: true })
  const dest = join(dir, fname)
  const ws = createWriteStream(dest)
  let failed = false
  const cleanup = (): void => {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch (e) {
      logLine('[remote] Upload-Rest nicht entfernt:', e instanceof Error ? e.message : String(e))
    }
  }
  const fail = (status: number, error: string, log: string): void => {
    if (failed) return
    failed = true
    logLine('[remote] Upload abgebrochen:', fname, log)
    req.unpipe(ws)
    ws.destroy()
    // erst nach dem Schließen löschen: Windows entfernt keine noch geöffneten Dateien
    if (ws.closed) cleanup()
    else ws.once('close', cleanup)
    reject(status, error)
    // Den Rest des Bodys nicht mehr annehmen: nach der Antwort die Verbindung trennen.
    if (res.writableFinished) req.destroy()
    else res.once('finish', () => req.destroy())
  }

  let received = 0
  let checkedAt = 0
  req.on('data', (chunk: Buffer) => {
    received += chunk.length
    if (received > limits.maxBytes) {
      fail(413, tooBig, `über ${limits.maxBytes} Bytes`)
    } else if (received - checkedAt >= FREE_CHECK_EVERY) {
      checkedAt = received
      const now = limits.freeBytes(base)
      if (now !== null && now < limits.minFreeBytes) fail(507, noSpace, `nur ${now} Bytes frei`)
    }
  })
  // Verbindung weg, bevor alles da war (Handy gesperrt, WLAN weg) -> Rest wegräumen.
  req.on('close', () => {
    if (!req.complete) fail(400, 'Upload unvollständig', 'Verbindung abgebrochen')
  })
  req.pipe(ws)
  ws.on('finish', () => {
    if (failed) return
    try {
      const p = getSettings().player
      convertManager.enqueue({
        sources: [dest],
        fitMode: p.defaultFit,
        wall: { width: p.wallWidth, height: p.wallHeight }
      })
      sendJsonRaw(res, '{"ok":true}')
    } catch (e) {
      logLine(
        '[remote] Upload-Konvertierung fehlgeschlagen:',
        e instanceof Error ? e.message : String(e)
      )
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end('{"ok":false}')
    }
  })
  ws.on('error', (e) => fail(500, 'Datei konnte nicht gespeichert werden', e.message))
}

function serveMedia(req: IncomingMessage, res: ServerResponse, name: string): void {
  const abs = resolveMediaFile(name)
  if (!abs) {
    res.writeHead(404)
    res.end('not found')
    return
  }
  const total = statSync(abs).size
  const type = mediaType(abs)
  const range = req.headers.range
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range)
    let start = m && m[1] ? parseInt(m[1], 10) : 0
    let end = m && m[2] ? parseInt(m[2], 10) : total - 1
    if (!Number.isFinite(start) || start < 0) start = 0
    if (!Number.isFinite(end) || end >= total) end = total - 1
    if (start > end) {
      res.writeHead(416, { 'Content-Range': `bytes */${total}` })
      res.end()
      return
    }
    res.writeHead(206, {
      'Content-Type': type,
      'Content-Length': end - start + 1,
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Accept-Ranges': 'bytes'
    })
    createReadStream(abs, { start, end }).pipe(res)
    return
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': total, 'Accept-Ranges': 'bytes' })
  createReadStream(abs).pipe(res)
}

/** Request-Handler (auch von der Fernsteuer-App unter /player/ genutzt). */
export function handleRemote(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const path = url.pathname

  if (path === '/' || path === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(MOBILE_PAGE)
    return
  }
  if (path === '/api/state') return sendJsonRaw(res, rewriteJson(stateForRemote()))
  if (path === '/api/library') return sendJsonRaw(res, rewriteJson(listMedia()))
  if (path === '/api/events') {
    return host.openSse(req, res, () => JSON.parse(rewriteJson(stateForRemote())))
  }
  if (path === '/api/command' && req.method === 'POST') {
    void readBody(req, 1_000_000).then((body) => {
      // nur geprüfte, am Handy erlaubte Befehle (siehe remoteCommand.ts)
      const cmd = parsePlayerRemoteCommand(body)
      if (cmd) applyCommand(cmd)
      sendJsonRaw(res, cmd ? '{"ok":true}' : '{"ok":false}')
    })
    return
  }
  if (path === '/api/upload' && req.method === 'POST') return receiveUpload(req, res)
  if (path.startsWith('/media/')) {
    return serveMedia(req, res, decodeURIComponent(path.slice('/media/'.length)))
  }
  res.writeHead(404)
  res.end('not found')
}

export function pushRemoteState(state: PlayerState): void {
  if (!host.isRunning()) return
  host.broadcast('state', JSON.parse(rewriteJson(stateForRemote(state))))
}
export function pushRemoteTick(tick: PlayerTick): void {
  if (!host.isRunning()) return
  host.broadcast('tick', tick)
}
export function pushRemoteLibrary(): void {
  if (!host.isRunning()) return
  host.broadcast('library', null)
}

export function startRemote(port: number): Promise<RemoteStatus> {
  return host.start(port, handleRemote)
}

export const stopRemote = host.stop
export const isRemoteRunning = host.isRunning
