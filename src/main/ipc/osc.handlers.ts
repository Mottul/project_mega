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
} from '../services/osc/oscRemoteServer'
import { publishFrom, registerRemoteControl, sendToSource } from './remoteControls'
import { handle } from './kanal'

let wired = false

export function registerOscHandlers(): void {
  if (!wired) {
    wired = true
    // Steuerbefehle vom Handy an alle Fenster (der OSC-Tab wendet sie an + sendet OSC).
    setOscCommandSink((cmd, source) => sendToSource(Channels.osc.onRemoteCommand, cmd, source))
  }

  handle(Channels.osc.send, (_e, msg: OscMessage) => oscSend(msg))
  handle(Channels.osc.sendMany, (_e, msgs: OscMessage[]) => {
    for (const m of msgs) oscSend(m)
  })
  handle(Channels.osc.status, () => oscStatus())
  handle(Channels.osc.config, () => getSettings().osc ?? DEFAULT_OSC_SETTINGS)
  handle(Channels.osc.setConfig, (_e, patch: Partial<OscSettings>) => oscSetConfig(patch))

  // Fernsteuerung (eingebetteter Webserver)
  handle(Channels.osc.publish, (e, snap: OscRemoteSnapshot) =>
    publishFrom(e.sender, snap, publishOscSnapshot, forgetOscSnapshot)
  )
  registerRemoteControl({
    id: 'osc',
    channels: Channels.osc,
    start: startOscRemote,
    stop: stopOscRemote,
    status: getOscRemoteStatus
  })

  // OSC-Monitor-Fenster: Aktivitäts-Log vom OSC-Tab an alle Fenster spiegeln.
  handle(Channels.osc.publishMonitor, (_e, entries: OscLogEntry[]) =>
    broadcast(Channels.osc.onMonitor, entries)
  )

  // Feedback-Listener starten, wenn in den Settings aktiviert.
  initOsc()
}
