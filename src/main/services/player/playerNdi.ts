// NDI-Ausgabe des Video-Players (experimentell): Der gemeinsame NDI-Sender (ndiSender.ts) schickt
// das Bild der Player-Erfassung (playerErfassung.ts: passiver Spiegel der Wiedergabe, geteilt
// mit dem Stream) in der gewählten Auflösung als NDI-Quelle ins Netz – auf Wunsch mit Ton als
// NDI-Audioframes (FLTp). Empfänger synchronisieren Bild/Ton über die vom SDK gestempelten
// Zeiten (clockVideo/clockAudio).

import { Channels } from '@shared/ipc-contracts'
import { DEFAULT_PLAYER_NDI, type PlayerNdiConfig, type PlayerNdiStatus } from '@shared/types'
import { broadcast } from '../broadcast'
import { clampNdiSize } from '../ndi/ndiFrames'
import { NdiSender } from '../ndi/ndiSender'
import { playerErfassung, verdrahteSpiegelTon } from './playerErfassung'

let config: PlayerNdiConfig = { ...DEFAULT_PLAYER_NDI }

const ndi = new NdiSender(
  '[player-ndi]',
  () => broadcast(Channels.player.onNdiChanged, getPlayerNdiStatus()),
  playerErfassung
)

export function getPlayerNdiStatus(): PlayerNdiStatus {
  return {
    available: ndi.available,
    running: ndi.running,
    config,
    framesSent: ndi.framesSent,
    audioChunks: ndi.audioChunks,
    audioLevel: ndi.audioLevel,
    error: ndi.error
  }
}

/** Sendet NDI gerade? Anders als der Status lädt das nicht das NDI-Modul (`available`). */
export const isPlayerNdiRunning = (): boolean => ndi.running

export async function startPlayerNdi(cfg: PlayerNdiConfig): Promise<PlayerNdiStatus> {
  if (!ndi.available) return getPlayerNdiStatus()
  verdrahteSpiegelTon()
  config = {
    ...clampNdiSize(cfg, DEFAULT_PLAYER_NDI),
    fit: cfg.fit === 'contain' ? 'contain' : 'fill',
    audio: !!cfg.audio
  }
  await ndi.start(config, {
    audio: config.audio,
    fit: config.fit,
    logInfo: [config.fit, config.audio ? 'mit Audio' : 'ohne Audio']
  })
  return getPlayerNdiStatus()
}

export function stopPlayerNdi(emit = true): PlayerNdiStatus {
  ndi.stop(emit)
  return getPlayerNdiStatus()
}
