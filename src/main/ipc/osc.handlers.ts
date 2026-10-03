import { ipcMain } from 'electron'
import { Channels } from '@shared/ipc-contracts'
import {
  DEFAULT_OSC_SETTINGS,
  type OscLogEntry,
  type OscMessage,
  type OscRemoteSnapshot,
  type OscSettings
} from '@shared/types'
import { broadcast } from '../services/broadcast'
import { getSettings } from '../services/store'
import { initOsc, oscSend, oscSetConfig, oscStatus } from '../services/osc/oscService'
import {
  forgetOscSnapshot,
  getOscRemoteStatus,
  publishOscSnapshot,
  setOscCommandSink,
  startOscRemote,
  stopOscRemote
} from '../services/oscRemoteServer'
import { publishFrom, registerRemoteControl, sendToSource } from './remoteControls'

let wired = false

export function registerOscHandlers(): void {
  if (!wired) {
    wired = true
    // Steuerbefehle vom Handy an alle Fenster (der OSC-Tab wendet sie an + sendet OSC).
    setOscCommandSink((cmd, source) => sendToSource(Channels.oscRemoteCommand, cmd, source))
  }

  ipcMain.handle(Channels.oscSend, (_e, msg: OscMessage) => oscSend(msg))
  ipcMain.handle(Channels.oscSendMany, (_e, msgs: OscMessage[]) => {
    for (const m of msgs) oscSend(m)
  })
  ipcMain.handle(Channels.oscStatus, () => oscStatus())
  ipcMain.handle(Channels.oscConfig, () => getSettings().osc ?? DEFAULT_OSC_SETTINGS)
  ipcMain.handle(Channels.oscConfigSet, (_e, patch: Partial<OscSettings>) => oscSetConfig(patch))

  // Fernsteuerung (eingebetteter Webserver)
  ipcMain.handle(Channels.oscPublish, (e, snap: OscRemoteSnapshot) =>
    publishFrom(e.sender, snap, publishOscSnapshot, forgetOscSnapshot)
  )
  registerRemoteControl({
    id: 'osc',
    channels: {
      status: Channels.oscRemoteStatus,
      start: Channels.oscRemoteStart,
      stop: Channels.oscRemoteStop,
      changed: Channels.oscRemoteChanged
    },
    start: startOscRemote,
    stop: stopOscRemote,
    status: getOscRemoteStatus
  })

  // OSC-Monitor-Fenster: Aktivitäts-Log vom OSC-Tab an alle Fenster spiegeln.
  ipcMain.handle(Channels.oscMonitorPublish, (_e, entries: OscLogEntry[]) =>
    broadcast(Channels.oscMonitorLog, entries)
  )

  // Feedback-Listener starten, wenn in den Settings aktiviert.
  initOsc()
}
