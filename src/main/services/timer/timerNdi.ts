// NDI-Ausgabe des Stage-Timers (experimentell): Der gemeinsame Offscreen-Sender (ndiSender.ts)
// rendert die Timer-Anzeige (#/timer-output) in der gewünschten Auflösung und schickt sie als
// NDI-Quelle ins Netz. Hier nur, was den Timer betrifft: Konfiguration, Status, und dass der
// Timer weiß, ob NDI läuft (Status auf dem Startbildschirm).
//
// Einrichtung des optionalen Bindings: `npm run ndi:setup` (siehe ndi.ts und docs/NDI.md).

import { Channels } from '@shared/ipc-contracts'
import { DEFAULT_TIMER_NDI, type TimerNdiConfig, type TimerNdiStatus } from '@shared/types'
import { broadcast } from '../broadcast'
import { clampNdiSize } from '../ndi/ndiFrames'
import { OffscreenNdiSender } from '../ndi/ndiSender'
import { setTimerNdiActive } from './stageTimer'

let config: TimerNdiConfig = { ...DEFAULT_TIMER_NDI }

const ndi = new OffscreenNdiSender('[timer-ndi]', () => {
  const status = getTimerNdiStatus()
  broadcast(Channels.timerNdiChanged, status)
  setTimerNdiActive(status.running)
})

export function getTimerNdiStatus(): TimerNdiStatus {
  return {
    available: ndi.available,
    running: ndi.running,
    config,
    framesSent: ndi.framesSent,
    error: ndi.error
  }
}

export async function startTimerNdi(cfg: TimerNdiConfig): Promise<TimerNdiStatus> {
  if (!ndi.available) return getTimerNdiStatus()
  config = clampNdiSize(cfg, DEFAULT_TIMER_NDI)
  await ndi.start(config, { route: '/timer-output' })
  return getTimerNdiStatus()
}

export function stopTimerNdi(emit = true): TimerNdiStatus {
  ndi.stop(emit)
  return getTimerNdiStatus()
}
