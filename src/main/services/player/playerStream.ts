// Stream fürs Heimnetz vom Video-Player (mit Ton): Der gemeinsame Stream-Sender
// (stream/streamSender.ts) kodiert das Bild der Player-Erfassung (playerErfassung.ts, geteilt
// mit NDI) samt Ton aus dem Spiegel und verteilt beides als H.264 + AAC über HTTP. Hier nur, was
// den Player betrifft: Konfiguration, Status, und dass der Player weiß, ob der Stream läuft.

import { Channels } from '@shared/ipc-contracts'
import { DEFAULT_PLAYER_STREAM, type StreamConfig, type StreamStatus } from '@shared/types'
import { broadcast } from '../broadcast'
import { clampStreamConfig } from '../stream/streamArgs'
import { StreamSender } from '../stream/streamSender'
import { playerErfassung, verdrahteSpiegelTon } from './playerErfassung'
import { setPlayerStreamActive } from './playerState'

let config: StreamConfig = { ...DEFAULT_PLAYER_STREAM }

const stream = new StreamSender(
  '[player-stream]',
  () => {
    const status = getPlayerStreamStatus()
    broadcast(Channels.player.onStreamChanged, status)
    setPlayerStreamActive(status.running)
  },
  playerErfassung
)

export function getPlayerStreamStatus(): StreamStatus {
  return stream.status(config)
}

export const isPlayerStreamRunning = (): boolean => stream.running

export async function startPlayerStream(cfg: StreamConfig): Promise<StreamStatus> {
  verdrahteSpiegelTon()
  config = clampStreamConfig(cfg, DEFAULT_PLAYER_STREAM)
  await stream.start(config, { ton: true })
  return getPlayerStreamStatus()
}

export function stopPlayerStream(emit = true): StreamStatus {
  stream.stop(emit)
  return getPlayerStreamStatus()
}
