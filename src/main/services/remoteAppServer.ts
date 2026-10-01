// Die Fernsteuer-App dieser Mottulbox: bindet Video-Player-, Jingle- und OSC-
// Fernsteuerung unter EINER Adresse (http://<ip>:8090) ein. Der Port ist bewusst
// fest – die als Web-App abgelegte Adresse muss von Show zu Show gleich bleiben.
// Die IPC-Handler rufen nach jedem Start/Stopp einer Fernsteuerung syncRemoteApp().

import type { RemoteStatus } from '@shared/types'
import { appIconPng } from './appIcon'
import { handleJingleRemote, isJingleRemoteRunning } from './jingleRemoteServer'
import { handleOscRemote, isOscRemoteRunning } from './oscRemoteServer'
import { handleRemote, isRemoteRunning } from './player/remoteServer'
import { createRemoteApp } from './remoteApp'
import { setPwaIconSource } from './remotePwa'

export const REMOTE_APP_PORT = 8090

export type RemoteAppId = 'player' | 'jingle' | 'osc'

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
    }
  ],
  REMOTE_APP_PORT
)

export const syncRemoteApp = remoteApp.sync
export const stopRemoteApp = remoteApp.stop

/** Ergänzt den Status einer Fernsteuerung um ihre Adressen in der App. */
export function withAppLink(id: RemoteAppId, status: RemoteStatus): RemoteStatus {
  return status.running ? { ...status, app: remoteApp.link(id) } : status
}

/** Nach Start/Stopp einer Fernsteuerung: App abgleichen (starten/stoppen) und
 *  den Status inklusive App-Adressen liefern. */
export async function syncedRemoteStatus(
  id: RemoteAppId,
  getStatus: () => RemoteStatus
): Promise<RemoteStatus> {
  await syncRemoteApp()
  return withAppLink(id, getStatus())
}
