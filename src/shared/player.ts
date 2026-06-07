// Reine Wiedergabe-Logik ohne Seiteneffekte. Bewusst hier in shared, damit der
// main-Prozess (autoritativer Zustand) UND das Ausgabefenster (Vor-Pufferung des
// nächsten Mediums für nahtlose Übergänge) EXAKT dieselbe Reihenfolge berechnen.

import type { MediaItem, PlayerState } from './types'

export const EMPTY_PLAYER_STATE: PlayerState = {
  playlist: [],
  index: -1,
  playing: false,
  loop: 'all',
  shuffle: false,
  muted: true,
  volume: 1,
  positionSec: 0,
  durationSec: 0,
  imageDurationSec: 10,
  transition: 'cut',
  transitionMs: 500,
  outputOpen: false,
  wall: { width: 1920, height: 1080 },
  seekSeq: 0
}

/** Index des nächsten Mediums (−1 = nichts mehr / gestoppt). */
export function nextIndex(state: Pick<PlayerState, 'playlist' | 'index' | 'loop' | 'shuffle'>): number {
  const n = state.playlist.length
  if (n === 0) return -1
  if (state.loop === 'one') return state.index < 0 ? 0 : state.index
  if (state.shuffle) {
    if (n === 1) return state.loop === 'all' ? 0 : -1
    // zufälligen Index ungleich dem aktuellen wählen
    let r = state.index
    while (r === state.index) r = Math.floor(Math.random() * n)
    return r
  }
  const next = state.index + 1
  if (next < n) return next
  return state.loop === 'all' ? 0 : -1
}

/** Index des vorherigen Mediums (für die Zurück-Taste). */
export function prevIndex(state: Pick<PlayerState, 'playlist' | 'index' | 'loop'>): number {
  const n = state.playlist.length
  if (n === 0) return -1
  const prev = state.index - 1
  if (prev >= 0) return prev
  return state.loop === 'all' ? n - 1 : 0
}

/** Aktuell gewähltes Medium oder null. */
export function currentItem(state: Pick<PlayerState, 'playlist' | 'index'>): MediaItem | null {
  if (state.index < 0 || state.index >= state.playlist.length) return null
  return state.playlist[state.index]
}
