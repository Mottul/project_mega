import { ipcMain } from 'electron'
import { Channels } from '@shared/ipc-contracts'
import { DEFAULT_OSC_SETTINGS, type OscMessage, type OscSettings } from '@shared/types'
import { getSettings } from '../services/store'
import { initOsc, oscSend, oscSetConfig, oscStatus } from '../services/osc/oscService'

export function registerOscHandlers(): void {
  ipcMain.handle(Channels.oscSend, (_e, msg: OscMessage) => oscSend(msg))
  ipcMain.handle(Channels.oscSendMany, (_e, msgs: OscMessage[]) => {
    for (const m of msgs) oscSend(m)
  })
  ipcMain.handle(Channels.oscStatus, () => oscStatus())
  ipcMain.handle(Channels.oscConfig, () => getSettings().osc ?? DEFAULT_OSC_SETTINGS)
  ipcMain.handle(Channels.oscConfigSet, (_e, patch: Partial<OscSettings>) => oscSetConfig(patch))

  // Feedback-Listener starten, wenn in den Settings aktiviert.
  initOsc()
}
