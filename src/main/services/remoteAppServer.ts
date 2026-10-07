// Die Fernsteuer-App dieser Mottulbox: bindet Video-Player-, Jingle-, OSC- und
// Timer-Fernsteuerung unter EINER Adresse (http://<ip>:8090) ein. Der Port ist bewusst
// fest – die als Web-App abgelegte Adresse muss von Show zu Show gleich bleiben.
// Start/Stopp laufen über ipc/remoteControls (gleicht danach syncRemoteApp() ab).

import type { RemoteAppStatus, RemoteControlId, RemoteStatus } from '@shared/types'
import { appIconPng } from './appIcon'
import { handleJingleRemote, isJingleRemoteRunning } from './jingleRemoteServer'
import { handleOscRemote, isOscRemoteRunning } from './oscRemoteServer'
import { handleRemote, isRemoteRunning } from './player/remoteServer'
import { createRemoteApp } from './remoteApp'
import { setPwaIconSource } from './remotePwa'
import { handleTimerRemote, isTimerRemoteRunning } from './timerRemoteServer'

export const REMOTE_APP_PORT = 8090

export type RemoteAppId = RemoteControlId

// Alle Fernsteuer-Server (auch die eigenen Ports) liefern das App-Icon aus.
setPwaIconSource(appIconPng)

const remoteApp = createRemoteApp(
  [
    {
      id: 'player',
      name: 'Video-Player',
      tool: 'Video-Player',
      description: 'Wiedergabe, Playlist, Bibliothek und Uploads',
      icon: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="m9 8 6 4-6 4Z"/>',
      isRunning: isRemoteRunning,
      handle: handleRemote
    },
    {
      id: 'jingle',
      name: 'Jingles',
      tool: 'Jingle-Player',
      description: 'Pads abfeuern, alles stoppen',
      icon: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
      isRunning: isJingleRemoteRunning,
      handle: handleJingleRemote
    },
    {
      id: 'osc',
      name: 'OSC-Steuerung',
      tool: 'OSC-Steuerung',
      description: 'Fader, Taster und Sets des Steuerpults',
      icon:
        '<line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/>' +
        '<line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/>' +
        '<line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/>' +
        '<line x1="2" x2="6" y1="14" y2="14"/><line x1="10" x2="14" y1="8" y2="8"/>' +
        '<line x1="18" x2="22" y1="16" y2="16"/>',
      isRunning: isOscRemoteRunning,
      handle: handleOscRemote
    },
    {
      id: 'timer',
      name: 'Stage-Timer',
      tool: 'Stage-Timer & Uhr',
      description: 'Sprechzeit starten/pausieren, Abschnitte, Nachrichten an die Bühne',
      icon:
        '<line x1="10" x2="14" y1="2" y2="2"/><line x1="12" x2="15" y1="14" y2="11"/>' +
        '<circle cx="12" cy="14" r="8"/>',
      // Bühnen-Anzeige für Fernseher/Tablets ohne NDI (nur Anzeige)
      links: [{ label: 'Bühnen-Anzeige (nur Anzeige)', path: 'anzeige' }],
      isRunning: isTimerRemoteRunning,
      handle: handleTimerRemote
    }
  ],
  REMOTE_APP_PORT
)

export const syncRemoteApp = remoteApp.sync

/** Startseite + welche Fernsteuerungen laufen (Homescreen-Kacheln, QR-Code). */
export function getRemoteAppStatus(): RemoteAppStatus {
  return {
    ...remoteApp.info(),
    port: REMOTE_APP_PORT,
    remotes: {
      player: isRemoteRunning(),
      jingle: isJingleRemoteRunning(),
      osc: isOscRemoteRunning(),
      timer: isTimerRemoteRunning()
    }
  }
}
export const stopRemoteApp = remoteApp.stop

/** Ergänzt den Status einer Fernsteuerung um ihre Adressen in der App. */
export function withAppLink(id: RemoteAppId, status: RemoteStatus): RemoteStatus {
  return status.running ? { ...status, app: remoteApp.link(id) } : status
}
