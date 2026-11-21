// NDI-Ausgabe des Stage-Timers (experimentell): Der gemeinsame NDI-Sender (ndiSender.ts) schickt
// die Timer-Anzeige aus der Offscreen-Erfassung des Timers (timerErfassung.ts, geteilt mit dem
// Stream) in der gewünschten Auflösung als NDI-Quelle ins Netz. Hier nur, was den Timer
// betrifft: Konfiguration, Status, und dass der Timer weiß, ob NDI läuft (Startbildschirm).
//
// Einrichtung des optionalen Bindings: `npm run ndi:setup` (siehe ndi.ts und docs/NDI.md).

import { Channels } from '@shared/ipc-contracts'
import { DEFAULT_TIMER_NDI, type TimerNdiConfig, type TimerNdiStatus } from '@shared/types'
import { broadcast } from '../broadcast'
import { clampNdiSize } from '../ndi/ndiFrames'
import { NdiSender } from '../ndi/ndiSender'
import { setTimerNdiActive } from './stageTimer'
import { timerErfassung } from './timerErfassung'

let config: TimerNdiConfig = { ...DEFAULT_TIMER_NDI }

const ndi = new NdiSender(
  '[timer-ndi]',
  () => {
    const status = getTimerNdiStatus()
    broadcast(Channels.timer.onNdiChanged, status)
    setTimerNdiActive(status.running)
  },
  timerErfassung
)

export function getTimerNdiStatus(): TimerNdiStatus {
  return {
    available: ndi.available,
    running: ndi.running,
    config,
    framesSent: ndi.framesSent,
    error: ndi.error
  }
}

/** Sendet NDI gerade? Anders als der Status lädt das nicht das NDI-Modul (`available`). */
export const isTimerNdiRunning = (): boolean => ndi.running

export async function startTimerNdi(cfg: TimerNdiConfig): Promise<TimerNdiStatus> {
  if (!ndi.available) return getTimerNdiStatus()
  config = clampNdiSize(cfg, DEFAULT_TIMER_NDI)
  await ndi.start(config)
  return getTimerNdiStatus()
}

export function stopTimerNdi(emit = true): TimerNdiStatus {
  ndi.stop(emit)
  return getTimerNdiStatus()
}
