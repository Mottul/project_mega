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

/** Eingehende Befehle prüfen: nur Trigger/Stopp-Alle durchlassen. */
function parseCommand(body: string): JingleRemoteCommand | null {
  try {
    const cmd = JSON.parse(body) as JingleRemoteCommand
    if (cmd && (cmd.type === 'trigger' || cmd.type === 'stopAll')) return cmd
  } catch {
    // ungültige Befehle ignorieren
  }
  return null
}

const srv = createSnapshotServer<JingleRemoteSnapshot, JingleRemoteCommand>({
  logTag: 'jingle-remote',
  page: JINGLE_MOBILE_PAGE,
  empty: EMPTY,
  defaultPort: 8089,
  parseCommand
})

export const setJingleCommandSink = srv.setCommandSink
export const getJingleRemoteStatus = srv.getStatus
export const publishSnapshot = srv.publish
export const startJingleRemote = srv.start
export const stopJingleRemote = srv.stop
