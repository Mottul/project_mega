// Eingebetteter Fernsteuer-Server für den Jingle-Player (Handy/Tablet). Nutzt das
// gemeinsame Snapshot-Push-Muster (siehe remoteHttp): die Audio-Wiedergabe läuft
// im RENDERER – der Jingle-Tab veröffentlicht einen Schnappschuss
// (publishSnapshot), hereinkommende Trigger werden über den Command-Sink an den
// Renderer gereicht (der spielt das Audio).

import type { JingleRemoteCommand, JingleRemoteSnapshot } from '@shared/types'
import { createSnapshotServer } from './remoteHttp'
import { JINGLE_MOBILE_PAGE } from './jingleRemotePage'

const EMPTY: JingleRemoteSnapshot = {
  connected: false,
  bankName: '',
  columns: 4,
  pads: [],
  playing: []
}

/**
 * Eingehende Befehle feldweise prüfen (fremde Eingaben aus dem LAN, ohne Passwort): nur
 * Trigger/Stopp-Alle, nur die erwarteten Felder. Die Pad-Kennung ist eine kurze ID
 * (UUID) – alles andere wird verworfen, statt ungeprüft an den Renderer zu gehen.
 */
export function parseJingleCommand(body: string): JingleRemoteCommand | null {
  let raw: unknown
  try {
    raw = JSON.parse(body)
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object') return null
  const c = raw as Record<string, unknown>
  switch (c.type) {
    case 'trigger':
      return typeof c.padId === 'string' && /^[\w-]{1,64}$/.test(c.padId)
        ? { type: 'trigger', padId: c.padId }
        : null
    case 'stopAll':
      return { type: 'stopAll' }
    default:
      return null
  }
}

const srv = createSnapshotServer<JingleRemoteSnapshot, JingleRemoteCommand>({
  logTag: 'jingle-remote',
  page: JINGLE_MOBILE_PAGE,
  empty: EMPTY,
  defaultPort: 8089,
  parseCommand: parseJingleCommand
})

export const setJingleCommandSink = srv.setCommandSink
export const getJingleRemoteStatus = srv.getStatus
export const publishSnapshot = srv.publish
export const forgetJingleSnapshot = srv.forget
export const startJingleRemote = srv.start
export const stopJingleRemote = srv.stop
export const isJingleRemoteRunning = srv.isRunning
export const handleJingleRemote = srv.handle
