import { ipcMain } from 'electron'
import { Channels } from '@shared/ipc-contracts'
import { DEFAULT_OSC_SETTINGS, type OscMessage, type OscRemoteSnapshot, type OscSettings } from '@shared/types'
import { broadcast } from '../services/broadcast'
import { getSettings } from '../services/store'
import { initOsc, oscSend, oscSetConfig, oscStatus } from '../services/osc/oscService'
import {
  getOscRemoteStatus,
  publishOscSnapshot,
  setOscCommandSink,
  startOscRemote,
  stopOscRemote
} from '../services/oscRemoteServer'

let wired = false

export function registerOscHandlers(): void {
  if (!wired) {
    wired = true
    // Steuerbefehle vom Handy an alle Fenster (der OSC-Tab wendet sie an + sendet OSC).
    setOscCommandSink((cmd) => broadcast(Channels.oscRemoteCommand, cmd))
  }

  ipcMain.handle(Channels.oscSend, (_e, msg: OscMessage) => oscSend(msg))
  ipcMain.handle(Channels.oscSendMany, (_e, msgs: OscMessage[]) => {
    for (const m of msgs) oscSend(m)
  })
  ipcMain.handle(Channels.oscStatus, () => oscStatus())
  ipcMain.handle(Channels.oscConfig, () => getSettings().osc ?? DEFAULT_OSC_SETTINGS)
  ipcMain.handle(Channels.oscConfigSet, (_e, patch: Partial<OscSettings>) => oscSetConfig(patch))

  // Fernsteuerung (eingebetteter Webserver)
  ipcMain.handle(Channels.oscPublish, (_e, snap: OscRemoteSnapshot) => publishOscSnapshot(snap))
  ipcMain.handle(Channels.oscRemoteStatus, () => getOscRemoteStatus())
  ipcMain.handle(Channels.oscRemoteStart, async (_e, port: number) => {
    const status = await startOscRemote(port)
    broadcast(Channels.oscRemoteChanged, status)
    return status
  })
  ipcMain.handle(Channels.oscRemoteStop, () => {
    stopOscRemote()
    const status = getOscRemoteStatus()
    broadcast(Channels.oscRemoteChanged, status)
    return status
  })

  // Feedback-Listener starten, wenn in den Settings aktiviert.
  initOsc()
}
