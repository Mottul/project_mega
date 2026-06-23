// Gemeinsame Bausteine der eingebetteten Fernsteuer-Server (OSC, Jingle, Video-
// Player). Alle drei sind bewusst dependency-frei (nur node:http) und binden ans
// LAN (0.0.0.0) OHNE Authentifizierung – als bewusst einschaltbare Komfort-
// funktion fürs lokale Netz, standardmäßig AUS.
//
// Zwei Ebenen:
//   * createRemoteHost – Primitive + Lebenszyklus: LAN-URL-Ermittlung, SSE,
//     Client-Verwaltung, Start/Stopp, broadcast. Der Video-Player nutzt nur das
//     (er hat Sonderrouten für Medien/Upload und liest seinen Zustand selbst).
//   * createSnapshotServer – das Snapshot-Push-Muster: ein Renderer-Tab
//     veröffentlicht einen Zustand (publish), der per SSE an alle Clients gepusht
//     wird; ein /api/command-Endpunkt nimmt geprüfte Befehle entgegen. Genutzt
//     von OSC- und Jingle-Fernsteuerung.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { networkInterfaces } from 'node:os'
import type { RemoteStatus } from '@shared/types'
import { logLine } from './log'

/** 169.254.x.x = automatische Link-Local-Adresse (APIPA): wird vergeben, wenn
 *  eine (oft virtuelle oder getrennte) Schnittstelle keine DHCP-Adresse bekommt.
 *  Vom WLAN aus nicht erreichbar -> in den Remote-URLs nicht anzeigen. */
function isLinkLocal(addr: string): boolean {
  return addr.startsWith('169.254.')
}

/** Erreichbare IPv4-LAN-Adressen als http://host:port (Fallback localhost).
 *  Link-Local-/APIPA-Adressen (169.254.x.x) werden übersprungen – sie tauchen an
 *  getrennten/virtuellen Adaptern auf und sind vom Handy nicht erreichbar. */
export function lanUrls(port: number): string[] {
  const out: string[] = []
  const ifaces = networkInterfaces()
  for (const name of Object.keys(ifaces)) {
    for (const ni of ifaces[name] ?? []) {
      if (ni.family === 'IPv4' && !ni.internal && !isLinkLocal(ni.address)) {
        out.push(`http://${ni.address}:${port}`)
      }
    }
  }
  if (out.length === 0) out.push(`http://localhost:${port}`)
  return out
}

/** JSON-Antwort aus einem Wert (wird hier serialisiert). */
export function sendJson(res: ServerResponse, value: unknown): void {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(value))
}

/** JSON-Antwort aus einem bereits fertigen JSON-String (z. B. nach einer
 *  String-Ersetzung) – vermeidet doppeltes Kodieren. */
export function sendJsonRaw(res: ServerResponse, json: string): void {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(json)
}

/** Request-Body als String einlesen (mit harter Obergrenze gegen Überlauf). */
export function readBody(req: IncomingMessage, maxBytes = 100_000): Promise<string> {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (c) => {
      data += c
      if (data.length > maxBytes) data = data.slice(0, maxBytes)
    })
    req.on('end', () => resolve(data))
    req.on('error', () => resolve(''))
  })
}

export interface RemoteHost {
  readonly clients: Set<ServerResponse>
  isRunning(): boolean
  status(): RemoteStatus
  /** SSE öffnen und sofort einen 'state'-Event mit initial() senden. */
  openSse(req: IncomingMessage, res: ServerResponse, initial: () => unknown): void
  /** Event an alle verbundenen Clients pushen (no-op ohne Clients). */
  broadcast(type: string, payload: unknown): void
  start(
    port: number,
    handle: (req: IncomingMessage, res: ServerResponse) => void
  ): Promise<RemoteStatus>
  stop(): void
}

/** Lebenszyklus + Client-Verwaltung eines Fernsteuer-Servers. `logTag` erscheint
 *  im Log, `defaultPort` ist der gemeldete Port, solange nicht gestartet wurde. */
export function createRemoteHost(logTag: string, defaultPort = 0): RemoteHost {
  let server: Server | null = null
  let currentPort = defaultPort
  const clients = new Set<ServerResponse>()

  function status(): RemoteStatus {
    return { running: server !== null, port: currentPort, urls: server ? lanUrls(currentPort) : [] }
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

  function openSse(req: IncomingMessage, res: ServerResponse, initial: () => unknown): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    })
    res.write('retry: 2000\n\n')
    res.write(`data: ${JSON.stringify({ type: 'state', payload: initial() })}\n\n`)
    clients.add(res)
    req.on('close', () => clients.delete(res))
  }

  function start(
    port: number,
    handle: (req: IncomingMessage, res: ServerResponse) => void
  ): Promise<RemoteStatus> {
    return new Promise((resolve, reject) => {
      stop()
      currentPort = Math.max(1, Math.min(65535, Math.round(port)))
      const s = createServer(handle)
      s.on('error', (err) => {
        server = null
        logLine(`[${logTag}] Serverfehler:`, err.message)
        reject(err)
      })
      s.listen(currentPort, '0.0.0.0', () => {
        server = s
        logLine(`[${logTag}] läuft auf`, lanUrls(currentPort).join(', '))
        resolve(status())
      })
    })
  }

  function stop(): void {
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
      logLine(`[${logTag}] gestoppt`)
    }
  }

  return { clients, isRunning: () => server !== null, status, openSse, broadcast, start, stop }
}

/* ----------------------- Snapshot-Push-Server -------------------------- */

export interface SnapshotServer<Snap, Cmd> {
  getStatus(): RemoteStatus
  publish(snap: Snap): void
  start(port: number): Promise<RemoteStatus>
  stop(): void
  setCommandSink(sink: (cmd: Cmd) => void): void
}

/** Server für das verbreitete Muster: der Renderer-Tab veröffentlicht einen
 *  Zustand (publish), der per SSE an alle Clients gepusht wird; eingehende
 *  Befehle (/api/command) werden geprüft (parseCommand) und an den Command-Sink
 *  gereicht. Liefert außerdem die mobile Steuerseite unter '/'. */
export function createSnapshotServer<Snap, Cmd>(opts: {
  logTag: string
  page: string
  empty: Snap
  defaultPort: number
  parseCommand: (body: string) => Cmd | null
}): SnapshotServer<Snap, Cmd> {
  const host = createRemoteHost(opts.logTag, opts.defaultPort)
  let snapshot: Snap = opts.empty
  let commandSink: (cmd: Cmd) => void = () => {}

  function handle(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const path = url.pathname
    if (path === '/' || path === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(opts.page)
      return
    }
    if (path === '/api/state') return sendJson(res, snapshot)
    if (path === '/api/events') return host.openSse(req, res, () => snapshot)
    if (path === '/api/command' && req.method === 'POST') {
      void readBody(req).then((body) => {
        const cmd = opts.parseCommand(body)
        if (cmd) commandSink(cmd)
        sendJson(res, { ok: true })
      })
      return
    }
    res.writeHead(404)
    res.end('not found')
  }

  return {
    getStatus: host.status,
    start: (port) => host.start(port, handle),
    stop: host.stop,
    setCommandSink: (sink) => {
      commandSink = sink
    },
    publish: (snap) => {
      snapshot = snap
      host.broadcast('state', snap)
    }
  }
}
