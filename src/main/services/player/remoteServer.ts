// Eingebetteter Fernsteuerungs-Server (Tablet/Handy) – bewusst dependency-frei
// (nur node:http). Liefert eine mobile Steuerseite, eine kleine JSON-API
// (Zustand/Bibliothek/Befehle) und einen SSE-Stream für Live-Updates. Medien
// werden über /media/<datei> ausgeliefert; die media://-URLs im JSON werden
// dafür auf /media/ umgeschrieben.
//
// Sicherheit: Bindet ans LAN (0.0.0.0) OHNE Authentifizierung – als bewusst
// einschaltbare Komfortfunktion fürs lokale Netz. Standardmäßig AUS.

import { createReadStream, statSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { networkInterfaces } from 'node:os'
import { extname } from 'node:path'
import type { PlayerCommand, PlayerState, PlayerTick, RemoteStatus } from '@shared/types'
import { logLine } from '../log'
import { listMedia, resolveMediaFile } from './mediaLibrary'
import { applyCommand, getPlayerState } from './playerState'
import { MOBILE_PAGE } from './remotePage'

let server: Server | null = null
let currentPort = 8088
const clients = new Set<ServerResponse>()

function lanUrls(port: number): string[] {
  const out: string[] = []
  const ifaces = networkInterfaces()
  for (const name of Object.keys(ifaces)) {
    for (const ni of ifaces[name] ?? []) {
      if (ni.family === 'IPv4' && !ni.internal) out.push(`http://${ni.address}:${port}`)
    }
  }
  if (out.length === 0) out.push(`http://localhost:${port}`)
  return out
}

export function getRemoteStatus(): RemoteStatus {
  return { running: server !== null, port: currentPort, urls: server ? lanUrls(currentPort) : [] }
}

// media://library/<x> -> /media/<x>, damit das Tablet die Dateien per HTTP lädt.
function rewriteJson(value: unknown): string {
  return JSON.stringify(value).split('media://library/').join('/media/')
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

function sendJson(res: ServerResponse, json: string): void {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(json)
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (c) => {
      data += c
      if (data.length > 1_000_000) data = data.slice(0, 1_000_000) // simpler Schutz
    })
    req.on('end', () => resolve(data))
    req.on('error', () => resolve(''))
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

function openSse(req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  })
  res.write('retry: 2000\n\n')
  res.write(`data: ${JSON.stringify({ type: 'state', payload: JSON.parse(rewriteJson(getPlayerState())) })}\n\n`)
  clients.add(res)
  req.on('close', () => {
    clients.delete(res)
  })
}

function handle(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const path = url.pathname

  if (path === '/' || path === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(MOBILE_PAGE)
    return
  }
  if (path === '/api/state') return sendJson(res, rewriteJson(getPlayerState()))
  if (path === '/api/library') return sendJson(res, rewriteJson(listMedia()))
  if (path === '/api/events') return openSse(req, res)
  if (path === '/api/command' && req.method === 'POST') {
    void readBody(req).then((body) => {
      try {
        const cmd = JSON.parse(body) as PlayerCommand
        if (cmd && typeof cmd.type === 'string') applyCommand(cmd)
      } catch {
        // ungültige Befehle ignorieren
      }
      sendJson(res, '{"ok":true}')
    })
    return
  }
  if (path.startsWith('/media/')) {
    return serveMedia(req, res, decodeURIComponent(path.slice('/media/'.length)))
  }
  res.writeHead(404)
  res.end('not found')
}

function broadcast(type: string, payload: unknown): void {
  if (clients.size === 0) return
  const data = `data: ${JSON.stringify({ type, payload })}\n\n`
  for (const res of clients) {
    try {
      res.write(data)
    } catch {
      // tote Verbindung -> beim nächsten close entfernt
    }
  }
}

export function pushRemoteState(state: PlayerState): void {
  if (!server) return
  broadcast('state', JSON.parse(rewriteJson(state)))
}
export function pushRemoteTick(tick: PlayerTick): void {
  if (!server) return
  broadcast('tick', tick)
}
export function pushRemoteLibrary(): void {
  if (!server) return
  broadcast('library', null)
}

export function startRemote(port: number): Promise<RemoteStatus> {
  return new Promise((resolve, reject) => {
    stopRemote()
    currentPort = Math.max(1, Math.min(65535, Math.round(port)))
    const s = createServer(handle)
    s.on('error', (err) => {
      server = null
      logLine('[remote] Serverfehler:', err.message)
      reject(err)
    })
    s.listen(currentPort, '0.0.0.0', () => {
      server = s
      logLine('[remote] läuft auf', lanUrls(currentPort).join(', '))
      resolve(getRemoteStatus())
    })
  })
}

export function stopRemote(): void {
  for (const res of clients) {
    try {
      res.end()
    } catch {
      // ignorieren
    }
  }
  clients.clear()
  if (server) {
    server.close()
    server = null
    logLine('[remote] gestoppt')
  }
}
