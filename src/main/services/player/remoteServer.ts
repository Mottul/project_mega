// Eingebetteter Fernsteuerungs-Server (Tablet/Handy) – bewusst dependency-frei
// (nur node:http). Liefert eine mobile Steuerseite, eine kleine JSON-API
// (Zustand/Bibliothek/Befehle) und einen SSE-Stream für Live-Updates. Medien
// werden über /media/<datei> ausgeliefert; die media://-URLs im JSON werden
// dafür auf /media/ umgeschrieben.
//
// Sicherheit: Bindet ans LAN (0.0.0.0) OHNE Authentifizierung – als bewusst
// einschaltbare Komfortfunktion fürs lokale Netz. Standardmäßig AUS.

import { createReadStream, createWriteStream, mkdirSync, statSync } from 'node:fs'
import { type IncomingMessage, type ServerResponse } from 'node:http'
import { extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { app } from 'electron'
import type { PlayerCommand, PlayerState, PlayerTick, RemoteStatus } from '@shared/types'
import { logLine } from '../log'
import { getSettings } from '../store'
import { createRemoteHost, readBody, sendJsonRaw } from '../remoteHttp'
import { ALLOWED_MEDIA_EXT, convertManager } from './convertManager'
import { listMedia, resolveMediaFile } from './mediaLibrary'
import { applyCommand, getPlayerState } from './playerState'
import { MOBILE_PAGE } from './remotePage'

const host = createRemoteHost('remote', 8088)

export const getRemoteStatus = host.status

// media://library/<x> -> /media/<x>, damit das Tablet die Dateien per HTTP lädt.
function rewriteJson(value: unknown): string {
  return JSON.stringify(value).split('media://library/').join('/media/')
}

// Zustand fürs Tablet: Player-State + gespeicherte Playlists (zum Umschalten) und
// die Default-Aufbereitung (Fit für Uploads). Beide liegen in den Einstellungen,
// nicht im Player-State -> hier zusammenführen.
function stateForRemote(state?: PlayerState): PlayerState & {
  savedPlaylists: unknown
  defaultFit: string
} {
  const s = state ?? getPlayerState()
  const p = getSettings().player
  return { ...s, savedPlaylists: p.savedPlaylists ?? [], defaultFit: p.defaultFit }
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

// Datei-Upload vom Tablet/Handy: roher Body -> Datei -> Konvertierungs-Queue
// (gleicher Weg wie der Desktop-Import). Header x-filename trägt den Namen.
function receiveUpload(req: IncomingMessage, res: ServerResponse): void {
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
  const ext = extname(fname).toLowerCase()
  if (!ALLOWED_MEDIA_EXT.has(ext)) {
    res.writeHead(415, { 'Content-Type': 'application/json' })
    res.end('{"ok":false,"error":"Dateityp nicht unterstützt"}')
    req.resume() // Body verwerfen
    return
  }
  // UUID-Unterordner -> kein Namenspräfix nötig, Titel bleibt der Originalname.
  const dir = join(uploadsDir(), randomUUID())
  mkdirSync(dir, { recursive: true })
  const dest = join(dir, fname)
  const ws = createWriteStream(dest)
  req.pipe(ws)
  ws.on('finish', () => {
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
  ws.on('error', (e) => {
    logLine('[remote] Upload-Schreibfehler:', e.message)
    try {
      res.writeHead(500)
      res.end('{"ok":false}')
    } catch {
      // Antwort evtl. schon gesendet
    }
  })
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

function handle(req: IncomingMessage, res: ServerResponse): void {
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
      try {
        const cmd = JSON.parse(body) as PlayerCommand
        if (cmd && typeof cmd.type === 'string') applyCommand(cmd)
      } catch {
        // ungültige Befehle ignorieren
      }
      sendJsonRaw(res, '{"ok":true}')
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
  return host.start(port, handle)
}

export const stopRemote = host.stop
