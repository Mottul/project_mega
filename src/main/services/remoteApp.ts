// Fernsteuer-App: gemeinsame Startseite ALLER Fernsteuerungen unter einer festen
// Adresse. Die laufenden Fernsteuerungen werden unter /<id>/ eingebunden – auf
// demselben Ursprung (Host+Port) wie die Startseite. Das ist der Kern: Eine auf
// dem Home-Bildschirm abgelegte Web-App bleibt nur auf ihrem eigenen Ursprung im
// Vollbild; ein Link auf einen anderen Port würde iOS im Browser öffnen.
//
// Anfragen werden im Prozess an den Handler der jeweiligen Fernsteuerung
// weitergereicht (Pfad ohne Präfix) – SSE-Clients, Befehle und Uploads laufen
// also genau wie über deren eigenen Port, der weiterhin funktioniert. Die App
// läuft nur, solange mindestens eine Fernsteuerung eingeschaltet ist, und gibt
// ausgeschaltete nicht frei (gleiche Sicherheitslage wie bisher: LAN, kein
// Passwort, bewusst einzuschalten).

import type { ServerResponse } from 'node:http'
import type { RemoteAppLink } from '@shared/types'
import { createRemoteHost, lanUrls, sendJson, type RemoteHandler } from './remoteHttp'
import { REMOTE_APP_PAGE } from './remoteAppPage'

export interface AppRemote {
  /** URL-Präfix der Steuerseite (/<id>/). */
  id: string
  name: string
  /** Werkzeug am Rechner, in dem man die Fernsteuerung einschaltet. */
  tool: string
  description: string
  /** Innere SVG-Elemente des Symbols (viewBox 24, Strich-Icons). */
  icon: string
  /** Weitere Seiten der Fernsteuerung (Pfad relativ zu /<id>/), z. B. eine Anzeige */
  links?: { label: string; path: string }[]
  isRunning(): boolean
  handle: RemoteHandler
}

export interface RemoteApp {
  readonly port: number
  isRunning(): boolean
  /** Startet bzw. stoppt die App passend dazu, ob eine Fernsteuerung läuft, und
   *  aktualisiert offene Startseiten. Nach jedem Start/Stopp aufrufen. */
  sync(): Promise<void>
  /** Adressen einer Steuerseite in der App (für die Anzeige am Rechner). */
  link(id: string): RemoteAppLink
  /** Adressen der Startseite – läuft sie nicht, die künftigen (für den QR-Code). */
  info(): { running: boolean; urls: string[]; error?: string }
  stop(): void
  handle: RemoteHandler
}

export function createRemoteApp(remotes: AppRemote[], port: number): RemoteApp {
  const host = createRemoteHost('remote-app', port)
  let lastError: string | undefined
  let queue: Promise<void> = Promise.resolve()

  function state(): { remotes: unknown[] } {
    return {
      remotes: remotes.map((r) => ({
        id: r.id,
        name: r.name,
        tool: r.tool,
        description: r.description,
        icon: r.icon,
        links: r.links ?? [],
        running: r.isRunning()
      }))
    }
  }

  function redirect(res: ServerResponse, location: string): void {
    res.writeHead(302, { Location: location })
    res.end()
  }

  const handle: RemoteHandler = (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const path = url.pathname
    if (path === '/' || path === '/index.html') {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache'
      })
      res.end(REMOTE_APP_PAGE)
      return
    }
    if (path === '/api/remotes') return sendJson(res, state())
    if (path === '/api/events') return host.openSse(req, res, state)

    const m = /^\/([a-z0-9-]+)(\/.*)?$/.exec(path)
    const remote = m ? remotes.find((r) => r.id === m[1]) : undefined
    if (!m || !remote) {
      res.writeHead(404)
      res.end('not found')
      return
    }
    const rest = m[2]
    // /jingle -> /jingle/: relative Pfade der Steuerseite brauchen den Schrägstrich.
    if (!rest) return redirect(res, `/${remote.id}/${url.search}`)
    if (!remote.isRunning()) {
      if (rest === '/' || rest === '/index.html') return redirect(res, '/')
      // EventSource verbindet nur nach NETZWERK-Fehlern neu, nicht nach HTTP-
      // Fehlern -> Verbindung kappen, damit eine offene Steuerseite von selbst
      // weiterläuft, sobald die Fernsteuerung wieder eingeschaltet ist.
      if (rest === '/api/events') {
        req.socket.destroy()
        return
      }
      res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Fernsteuerung ist ausgeschaltet')
      return
    }
    req.url = rest + url.search
    remote.handle(req, res)
  }

  async function doSync(): Promise<void> {
    const wanted = remotes.some((r) => r.isRunning())
    if (wanted && !host.isRunning()) {
      try {
        await host.start(port, handle)
        lastError = undefined
      } catch (e) {
        const code = (e as NodeJS.ErrnoException | undefined)?.code
        lastError =
          code === 'EADDRINUSE'
            ? `Port ${port} ist belegt`
            : e instanceof Error
              ? e.message
              : String(e)
      }
    } else if (!wanted && host.isRunning()) {
      host.stop()
      lastError = undefined
    }
    host.broadcast('state', state())
  }

  return {
    port,
    isRunning: host.isRunning,
    // Hintereinander statt parallel: zwei gleichzeitige Starts würden sonst
    // beide listen() versuchen (Port-Konflikt mit sich selbst).
    sync: () => {
      queue = queue.then(doSync, doSync)
      return queue
    },
    link: (id) =>
      host.isRunning()
        ? { urls: host.status().urls.map((u) => `${u}/${id}/`) }
        : { urls: [], error: lastError },
    info: () =>
      host.isRunning()
        ? { running: true, urls: host.status().urls }
        : { running: false, urls: lanUrls(port), error: lastError },
    stop: host.stop,
    handle
  }
}
