// Eingebetteter Fernsteuer-Server für den Jingle-Player (Handy/Tablet) – bewusst
// dependency-frei (nur node:http). Anders als der Player läuft die Audio-Wiedergabe
// im RENDERER, daher: der Jingle-Tab veröffentlicht einen Schnappschuss
// (publishSnapshot), und hereinkommende Trigger werden über `commandSink` an den
// Renderer weitergereicht. Bindet ans LAN OHNE Authentifizierung (Komfort im
// lokalen Netz), standardmäßig AUS.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { networkInterfaces } from 'node:os'
import type { JingleRemoteCommand, JingleRemoteSnapshot, RemoteStatus } from '@shared/types'
import { logLine } from './log'
import { JINGLE_MOBILE_PAGE } from './jingleRemotePage'

let server: Server | null = null
let currentPort = 8089
const clients = new Set<ServerResponse>()
let snapshot: JingleRemoteSnapshot = { connected: false, bankName: '', columns: 4, pads: [], playing: [] }
let commandSink: (cmd: JingleRemoteCommand) => void = () => {}

export function setJingleCommandSink(sink: (cmd: JingleRemoteCommand) => void): void {
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

export function getJingleRemoteStatus(): RemoteStatus {
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

function handle(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const path = url.pathname
  if (path === '/' || path === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(JINGLE_MOBILE_PAGE)
    return
  }
  if (path === '/api/state') return sendJson(res, snapshot)
  if (path === '/api/events') return openSse(req, res)
  if (path === '/api/command' && req.method === 'POST') {
    void readBody(req).then((body) => {
      try {
        const cmd = JSON.parse(body) as JingleRemoteCommand
        if (cmd && (cmd.type === 'trigger' || cmd.type === 'stopAll')) commandSink(cmd)
      } catch {
        // ungültige Befehle ignorieren
      }
      sendJson(res, { ok: true })
    })
    return
  }
  res.writeHead(404)
  res.end('not found')
}

/** Neuen Schnappschuss übernehmen und an alle Clients pushen. */
export function publishSnapshot(snap: JingleRemoteSnapshot): void {
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

export function startJingleRemote(port: number): Promise<RemoteStatus> {
  return new Promise((resolve, reject) => {
    stopJingleRemote()
    currentPort = Math.max(1, Math.min(65535, Math.round(port)))
    const s = createServer(handle)
    s.on('error', (err) => {
      server = null
      logLine('[jingle-remote] Serverfehler:', err.message)
      reject(err)
    })
    s.listen(currentPort, '0.0.0.0', () => {
      server = s
      logLine('[jingle-remote] läuft auf', lanUrls(currentPort).join(', '))
      resolve(getJingleRemoteStatus())
    })
  })
}

export function stopJingleRemote(): void {
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
    logLine('[jingle-remote] gestoppt')
  }
}
