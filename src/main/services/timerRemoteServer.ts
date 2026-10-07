// Eingebetteter Fernsteuer-Server für den Stage-Timer (Handy/Tablet). Der Timer
// tickt autoritativ im main-Prozess (stageTimer) – der Server liest den Zustand
// direkt, pusht Zustand + Ticks per SSE und wendet geprüfte Befehle direkt an.
// Das Werkzeug muss dafür nicht geöffnet bleiben. Abschnitte und Schwellen
// werden bewusst nur am Rechner bearbeitet; vom Handy kommen Bedienbefehle.

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { StageTimerState, StageTimerTick, TimerCommand } from '@shared/types'
import { createRemoteHost, readBody, sendJson } from './remoteHttp'
import { applyTimerCommand, getTimerState } from './stageTimer'
import { TIMER_DISPLAY_PAGE } from './timerDisplayPage'
import { TIMER_MOBILE_PAGE } from './timerRemotePage'

const host = createRemoteHost('timer-remote', 8092)

/** Plausibilitätsprüfung eingehender Befehle (fremde Eingaben). */
export function parseTimerCommand(body: string): TimerCommand | null {
  let raw: unknown
  try {
    raw = JSON.parse(body)
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object') return null
  const c = raw as Record<string, unknown>
  switch (c.type) {
    case 'start':
    case 'pause':
    case 'toggle':
    case 'reset':
    case 'resetAll':
    case 'next':
    case 'prev':
    case 'clearMessage':
      return { type: c.type }
    case 'goto':
      return typeof c.index === 'number' && Number.isInteger(c.index) && c.index >= 0
        ? { type: 'goto', index: c.index }
        : null
    case 'adjust':
      // Korrektur in vernünftigen Grenzen (±1 h je Befehl)
      return typeof c.deltaSec === 'number' && Number.isFinite(c.deltaSec)
        ? { type: 'adjust', deltaSec: Math.max(-3600, Math.min(3600, Math.round(c.deltaSec))) }
        : null
    case 'message': {
      const text = typeof c.text === 'string' ? c.text.trim().slice(0, 200) : ''
      return text ? { type: 'message', text, flash: c.flash === true } : null
    }
    case 'setDisplayMode':
      return c.mode === 'timer' || c.mode === 'clock'
        ? { type: 'setDisplayMode', mode: c.mode }
        : null
    default:
      return null
  }
}

/** Request-Handler (auch von der Fernsteuer-App unter /timer/ genutzt). */
export function handleTimerRemote(req: IncomingMessage, res: ServerResponse): void {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname
  if (path === '/' || path === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(TIMER_MOBILE_PAGE)
    return
  }
  // Bühnen-Anzeige im Browser (nur Anzeige) für Geräte ohne NDI
  if (path === '/anzeige') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' })
    res.end(TIMER_DISPLAY_PAGE)
    return
  }
  // Mit Schrägstrich zeigten die relativen API-Pfade auf /anzeige/api/… -> umleiten
  // (relativ, damit es auch unter /timer/ der Fernsteuer-App stimmt)
  if (path === '/anzeige/') {
    res.writeHead(301, { Location: '../anzeige' })
    res.end()
    return
  }
  // Uhrzeit des Rechners samt Zeitzone (Minuten östlich von UTC): Die Anzeige zeigt die
  // Wanduhr des Rechners, nicht die oft falsch gestellte Uhr oder Zone des Fernsehers
  if (path === '/api/time') {
    return sendJson(res, { now: Date.now(), tz: -new Date().getTimezoneOffset() })
  }
  if (path === '/api/state') return sendJson(res, getTimerState())
  if (path === '/api/events') return host.openSse(req, res, getTimerState)
  if (path === '/api/command' && req.method === 'POST') {
    void readBody(req).then((body) => {
      const cmd = parseTimerCommand(body)
      if (cmd) applyTimerCommand(cmd)
      sendJson(res, { ok: true })
    })
    return
  }
  res.writeHead(404)
  res.end('not found')
}

export function pushTimerRemoteState(state: StageTimerState): void {
  if (host.isRunning()) host.broadcast('state', state)
}
export function pushTimerRemoteTick(tick: StageTimerTick): void {
  if (host.isRunning()) host.broadcast('tick', tick)
}

// Lebenszeichen bei stehendem Timer (sonst kämen keine Ticks): Die Bühnen-Anzeige erkennt
// einen still gestorbenen Strom daran, dass höchstens drei Sekunden lang nichts ankommt.
// Läuft der Timer, tickt er ohnehin fünfmal je Sekunde.
let heartbeat: ReturnType<typeof setInterval> | null = null
function startHeartbeat(): void {
  if (heartbeat) return
  heartbeat = setInterval(() => {
    const s = getTimerState()
    if (!host.isRunning() || s.running) return
    host.broadcast('tick', { remainingSec: s.remainingSec, running: s.running, current: s.current })
  }, 1000)
  heartbeat.unref?.()
}

export const getTimerRemoteStatus = host.status
export const isTimerRemoteRunning = host.isRunning
export const startTimerRemote = (port: number): ReturnType<typeof host.start> => {
  startHeartbeat()
  return host.start(port, handleTimerRemote)
}
export const stopTimerRemote = host.stop
