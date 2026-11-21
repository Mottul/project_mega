// Offscreen-Erfassung des Video-Players: EIN unsichtbares Spiegelfenster (#/player-ndi, ein
// passiver Spiegel der Wiedergabe-Engine – treibt nicht, meldet keine Position) für NDI und den
// Stream fürs Heimnetz. Laufen beide, dekodiert der Spiegel das Video nur einmal.
//
// Ton: Das Spiegelfenster zapft die Wiedergabe per WebAudio an (MediaElementSource ->
// AudioWorklet, dadurch KEIN lokaler Ton aus dem Spiegel) und schickt planare Float32-Blöcke mit
// ihrer Sample-Nummer über IPC hierher; die Erfassung reicht sie an die Ausgänge, die Ton wollen.

import { Channels } from '@shared/ipc-contracts'
import { OffscreenErfassung } from '../erfassung/offscreenErfassung'
import { logLine } from '../log'
import { isAudioChunk } from '../ndi/ndiFrames'
import { on } from '../../ipc/kanal'

export const playerErfassung = new OffscreenErfassung('[player-erfassung]', {
  route: (p) => `/player-ndi?fit=${p.fit}&audio=${p.ton ? 1 : 0}`,
  autoplay: true
})

let tonBloecke = 0
let verdrahtet = false

/** Ton-IPC des Spiegels anmelden (einmal, beim ersten Start von NDI oder Stream). */
export function verdrahteSpiegelTon(): void {
  if (verdrahtet) return
  verdrahtet = true
  on(Channels.player.ndiAudio, (event, chunk: unknown) => {
    // nur gültige Blöcke aus UNSEREM Spiegelfenster annehmen
    if (!playerErfassung.isOwnWindow(event.sender.id) || !isAudioChunk(chunk)) return
    tonBloecke++
    if (tonBloecke === 1) {
      // Diagnose-Anker: Tap im Spiegelfenster liefert -> Renderer-Seite ok.
      logLine(
        '[player-erfassung] erster PCM-Block empfangen:',
        chunk.sampleRate,
        'Hz,',
        chunk.channels.length,
        'Kanäle,',
        chunk.channels[0].length,
        'Frames, Sample-Nummer',
        chunk.frame ?? 'fehlt'
      )
    }
    playerErfassung.ton(chunk)
  })
  // Fehler beim Aufbau des Audio-Taps (Worklet/WebAudio) sichtbar machen --
  // sonst gäbe es nur "0 Audio-Blöcke" ohne Erklärung.
  on(Channels.player.ndiTapError, (event, text: unknown) => {
    if (!playerErfassung.isOwnWindow(event.sender.id)) return
    playerErfassung.tonFehler(String(text).slice(0, 400))
  })
}
