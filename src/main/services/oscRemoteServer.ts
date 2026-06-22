// Eingebetteter Fernsteuer-Server für die OSC-Steuerung (Handy/Tablet) – wie der
// Jingle-Server bewusst dependency-frei (nur node:http). Die Oberfläche lebt im
// RENDERER: der OSC-Tab veröffentlicht einen Schnappschuss (publishOscSnapshot),
// hereinkommende Steuerbefehle werden über `commandSink` an den Renderer
// weitergereicht (der wendet sie an und sendet OSC). Bindet ans LAN OHNE
// Authentifizierung (Komfort im lokalen Netz), standardmäßig AUS.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { networkInterfaces } from 'node:os'
import type { OscRemoteCommand, OscRemoteSnapshot, RemoteStatus } from '@shared/types'
import { logLine } from './log'
import { OSC_MOBILE_PAGE } from './oscRemotePage'

let server: Server | null = null
let currentPort = 8091
const clients = new Set<ServerResponse>()
let snapshot: OscRemoteSnapshot = {
  connected: false,
  setName: '',
  columns: 24,
  widgets: [],
  sets: [],
  currentSetId: ''
}
let commandSink: (cmd: OscRemoteCommand) => void = () => {}

export function setOscCommandSink(sink: (cmd: OscRemoteCommand) => void): void {
  commandSink = sink
}

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

export function getOscRemoteStatus(): RemoteStatus {
  return { running: server !== null, port: currentPort, urls: server ? lanUrls(currentPort) : [] }
}

function sendJson(res: ServerResponse, value: unknown): void {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(value))
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (c) => {
      data += c
      if (data.length > 100_000) data = data.slice(0, 100_000)
    })
    req.on('end', () => resolve(data))
    req.on('error', () => resolve(''))
  })
}

function openSse(req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  })
  res.write('retry: 2000\n\n')
  res.write(`data: ${JSON.stringify({ type: 'state', payload: snapshot })}\n\n`)
  clients.add(res)
  req.on('close', () => clients.delete(res))
}

/** Plausibilitätsprüfung eingehender Steuerbefehle (fremde Eingaben). */
function parseCommand(body: string): OscRemoteCommand | null {
  let raw: unknown
  try {
    raw = JSON.parse(body)
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object') return null
  const c = raw as Record<string, unknown>
  if (typeof c.id !== 'string') return null
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  switch (c.kind) {
    case 'fader':
      return { kind: 'fader', id: c.id, value: num(c.value) }
    case 'toggle':
      return { kind: 'toggle', id: c.id, on: !!c.on }
    case 'button':
      return { kind: 'button', id: c.id, down: !!c.down }
    case 'xy':
      return { kind: 'xy', id: c.id, x: num(c.x), y: num(c.y) }
    case 'color':
      return {
        kind: 'color',
        id: c.id,
        r: num(c.r),
        g: num(c.g),
        b: num(c.b),
        a: typeof c.a === 'number' ? num(c.a) : 1
      }
    case 'selectSet':
      return { kind: 'selectSet', id: c.id }
    default:
      return null
  }
}

function handle(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const path = url.pathname
  if (path === '/' || path === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(OSC_MOBILE_PAGE)
    return
  }
  if (path === '/api/state') return sendJson(res, snapshot)
  if (path === '/api/events') return openSse(req, res)
  if (path === '/api/command' && req.method === 'POST') {
    void readBody(req).then((body) => {
      const cmd = parseCommand(body)
      if (cmd) commandSink(cmd)
      sendJson(res, { ok: true })
    })
    return
  }
  res.writeHead(404)
  res.end('not found')
}

/** Neuen Schnappschuss übernehmen und an alle Clients pushen. */
export function publishOscSnapshot(snap: OscRemoteSnapshot): void {
  snapshot = snap
  if (clients.size === 0) return
  const data = `data: ${JSON.stringify({ type: 'state', payload: snap })}\n\n`
  for (const res of clients) {
    try {
      res.write(data)
    } catch {
      // tote Verbindung -> beim nächsten close entfernt
    }
  }
}

export function startOscRemote(port: number): Promise<RemoteStatus> {
  return new Promise((resolve, reject) => {
    stopOscRemote()
    currentPort = Math.max(1, Math.min(65535, Math.round(port)))
    const s = createServer(handle)
    s.on('error', (err) => {
      server = null
      logLine('[osc-remote] Serverfehler:', err.message)
      reject(err)
    })
    s.listen(currentPort, '0.0.0.0', () => {
      server = s
      logLine('[osc-remote] läuft auf', lanUrls(currentPort).join(', '))
      resolve(getOscRemoteStatus())
    })
  })
}

export function stopOscRemote(): void {
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
    logLine('[osc-remote] gestoppt')
  }
}
