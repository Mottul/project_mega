// NDI-Ausgabe des Video-Players (experimentell): Der gemeinsame Offscreen-Sender (ndiSender.ts)
// lädt #/player-ndi (passiver Spiegel der Wiedergabe-Engine, treibt NICHT -- keine doppelten
// ended-/Positionsmeldungen) in der gewählten Auflösung und schickt das Bild als NDI-Quelle ins
// Netz.
//
// Audio: das Spiegelfenster zapft die Wiedergabe per WebAudio an
// (MediaElementSource -> AudioWorklet, dadurch KEIN lokaler Ton aus dem
// Spiegel) und schickt planare Float32-PCM-Blöcke über IPC hierher; sie gehen
// als NDI-Audioframes (FLTp) an denselben Sender. Empfänger synchronisieren
// Bild/Ton über die vom SDK gestempelten Zeiten (clockVideo/clockAudio).

import { ipcMain } from 'electron'
import { Channels } from '@shared/ipc-contracts'
import { DEFAULT_PLAYER_NDI, type PlayerNdiConfig, type PlayerNdiStatus } from '@shared/types'
import { broadcast } from './broadcast'
import { logLine } from './log'
import { clampNdiSize, isAudioChunk } from './ndiFrames'
import { OffscreenNdiSender } from './ndiSender'

let config: PlayerNdiConfig = { ...DEFAULT_PLAYER_NDI }
let audioReceived = 0 // vom Spiegelfenster angekommene PCM-Blöcke (Diagnose)
let silenceWarned = false

const ndi = new OffscreenNdiSender('[player-ndi]', () =>
  broadcast(Channels.playerNdiChanged, getPlayerNdiStatus())
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

let audioIpcWired = false
function wireAudioIpc(): void {
  if (audioIpcWired) return
  audioIpcWired = true
  ipcMain.on(Channels.playerNdiAudio, (event, chunk: unknown) => {
    // nur gültige Blöcke aus UNSEREM Spiegelfenster annehmen
    if (!config.audio || !ndi.isOwnWindow(event.sender.id) || !isAudioChunk(chunk)) return
    audioReceived++
    if (audioReceived === 1) {
      // Diagnose-Anker: Tap im Spiegelfenster liefert -> Renderer-Seite ok.
      logLine(
        '[player-ndi] erster PCM-Block empfangen:',
        chunk.sampleRate,
        'Hz,',
        chunk.channels.length,
        'Kanäle,',
        chunk.channels[0].length,
        'Frames'
      )
    }
    ndi.pushAudio(chunk)
    // Stille trotz Blöcken: CORS-tainted media -> WebAudio liefert Nullen, oder keine Tonspur
    if (!silenceWarned && audioReceived > 90 && ndi.audioLevel < 0.0001) {
      silenceWarned = true
      logLine(
        '[player-ndi] WARNUNG: Audio-Tap liefert nur Stille (Pegel 0) --',
        'Medium ohne Tonspur? Sonst CORS-Kette prüfen (media://-Header + crossOrigin).'
      )
    }
  })
  // Fehler beim Aufbau des Audio-Taps (Worklet/WebAudio) sichtbar machen --
  // sonst gäbe es nur "0 Audio-Blöcke" ohne Erklärung.
  ipcMain.on(Channels.playerNdiTapError, (event, text: unknown) => {
    if (!ndi.isOwnWindow(event.sender.id)) return
    ndi.report(`Audio-Tap: ${String(text).slice(0, 400)}`)
  })
}

export async function startPlayerNdi(cfg: PlayerNdiConfig): Promise<PlayerNdiStatus> {
  if (!ndi.available) return getPlayerNdiStatus()
  wireAudioIpc()
  config = {
    ...clampNdiSize(cfg, DEFAULT_PLAYER_NDI),
    fit: cfg.fit === 'contain' ? 'contain' : 'fill',
    audio: !!cfg.audio
  }
  audioReceived = 0
  silenceWarned = false
  await ndi.start(config, {
    route: `/player-ndi?fit=${config.fit}&audio=${config.audio ? 1 : 0}`,
    audio: config.audio,
    autoplay: true,
    logInfo: [config.fit, config.audio ? 'mit Audio' : 'ohne Audio']
  })
  return getPlayerNdiStatus()
}

export function stopPlayerNdi(emit = true): PlayerNdiStatus {
  ndi.stop(emit)
  return getPlayerNdiStatus()
}
