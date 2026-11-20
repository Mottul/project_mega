// Stream fürs Heimnetz vom Stage-Timer: Der gemeinsame Stream-Sender (stream/streamSender.ts)
// rendert die Timer-Anzeige (#/timer-output) und verteilt sie als H.264 über HTTP. Hier nur, was
// den Timer betrifft: Konfiguration, Status, und dass der Timer weiß, ob der Stream läuft.

import { Channels } from '@shared/ipc-contracts'
import { DEFAULT_TIMER_STREAM, type StreamConfig, type StreamStatus } from '@shared/types'
import { broadcast } from '../broadcast'
import { clampStreamConfig } from '../stream/streamArgs'
import { OffscreenStreamSender } from '../stream/streamSender'
import { setTimerStreamActive } from './stageTimer'

let config: StreamConfig = { ...DEFAULT_TIMER_STREAM }

const stream = new OffscreenStreamSender('[timer-stream]', () => {
  const status = getTimerStreamStatus()
  broadcast(Channels.timer.onStreamChanged, status)
  setTimerStreamActive(status.running)
})

export function getTimerStreamStatus(): StreamStatus {
  return stream.status(config)
}

export const isTimerStreamRunning = (): boolean => stream.running

export async function startTimerStream(cfg: StreamConfig): Promise<StreamStatus> {
  config = clampStreamConfig(cfg, DEFAULT_TIMER_STREAM)
  await stream.start(config, '/timer-output')
  return getTimerStreamStatus()
}

export function stopTimerStream(emit = true): StreamStatus {
  stream.stop(emit)
  return getTimerStreamStatus()
}
