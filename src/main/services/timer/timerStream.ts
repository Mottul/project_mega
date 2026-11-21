// Stream fürs Heimnetz vom Stage-Timer: Der gemeinsame Stream-Sender (stream/streamSender.ts)
// kodiert die Timer-Anzeige aus der Offscreen-Erfassung des Timers (timerErfassung.ts, geteilt
// mit NDI) und verteilt sie als H.264 über HTTP. Hier nur, was den Timer betrifft:
// Konfiguration, Status, und dass der Timer weiß, ob der Stream läuft.

import { Channels } from '@shared/ipc-contracts'
import { DEFAULT_TIMER_STREAM, type StreamConfig, type StreamStatus } from '@shared/types'
import { broadcast } from '../broadcast'
import { clampStreamConfig } from '../stream/streamArgs'
import { StreamSender } from '../stream/streamSender'
import { setTimerStreamActive } from './stageTimer'
import { timerErfassung } from './timerErfassung'

let config: StreamConfig = { ...DEFAULT_TIMER_STREAM }

const stream = new StreamSender(
  '[timer-stream]',
  () => {
    const status = getTimerStreamStatus()
    broadcast(Channels.timer.onStreamChanged, status)
    setTimerStreamActive(status.running)
  },
  timerErfassung
)

export function getTimerStreamStatus(): StreamStatus {
  return stream.status(config)
}

export const isTimerStreamRunning = (): boolean => stream.running

export async function startTimerStream(cfg: StreamConfig): Promise<StreamStatus> {
  config = clampStreamConfig(cfg, DEFAULT_TIMER_STREAM)
  await stream.start(config)
  return getTimerStreamStatus()
}

export function stopTimerStream(emit = true): StreamStatus {
  stream.stop(emit)
  return getTimerStreamStatus()
}
