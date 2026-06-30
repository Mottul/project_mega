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
  idlePattern: 'off',
  idleMediaUrl: null,
  idleMediaKind: null,
  outputOpen: false,
  wall: { width: 1920, height: 1080 },
  seekSeq: 0,
  shuffleNext: -1
}

/** Index des nächsten Mediums (−1 = nichts mehr / gestoppt).
 *  Bewusst DETERMINISTISCH (auch bei Shuffle): main würfelt `shuffleNext` vorab,
 *  hier wird nur gelesen -> Engine-Preload und main wählen garantiert dasselbe
 *  Medium (gapless). */
export function nextIndex(
  state: Pick<PlayerState, 'playlist' | 'index' | 'loop' | 'shuffle' | 'shuffleNext'>
): number {
  const n = state.playlist.length
  if (n === 0) return -1
  if (state.loop === 'one') return state.index < 0 ? 0 : state.index
  if (state.shuffle) {
    if (n === 1) return state.loop === 'all' ? 0 : -1
    const sn = state.shuffleNext
    if (sn >= 0 && sn < n && sn !== state.index) return sn
    // Fallback ohne Zufall (falls main noch nicht gewürfelt hat) -> beide Seiten
    // kommen auch dann zum selben Ergebnis.
    return (state.index + 1) % n
  }
  const next = state.index + 1
  if (next < n) return next
  return state.loop === 'all' ? 0 : -1
}

/** Würfelt den nächsten Shuffle-Index (≠ aktueller). Nur der main-Prozess ruft
 *  das auf; das Ergebnis wandert als `shuffleNext` in den Zustand. */
export function rollShuffleNext(state: Pick<PlayerState, 'playlist' | 'index' | 'loop'>): number {
  const n = state.playlist.length
  if (n === 0) return -1
  if (n === 1) return state.loop === 'all' ? 0 : -1
  let r = state.index
  while (r === state.index) r = Math.floor(Math.random() * n)
  return r
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
