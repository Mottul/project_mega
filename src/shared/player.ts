// Reine Wiedergabe-Logik ohne Seiteneffekte. Bewusst hier in shared, damit der
// main-Prozess (autoritativer Zustand) UND das Ausgabefenster (Vor-Pufferung des
// nächsten Mediums für nahtlose Übergänge) EXAKT dieselbe Reihenfolge berechnen.

import type { MediaItem, PlayerState, WallResolution } from './types'

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
  ticker: {
    enabled: false,
    heightPx: 104,
    text: '',
    speed: 120,
    color: '#ffffff',
    bg: '#000000',
    logoUrl: null,
    logoMode: 'scroll'
  },
  outputAudioDeviceId: '',
  seekSeq: 0,
  shuffleNext: -1
}

/** Auf die Laufschrift begrenzte Streifenhöhe in Wand-Pixeln (0 = keine). */
export function tickerStripPx(state: Pick<PlayerState, 'wall' | 'ticker'>): number {
  if (!state.ticker.enabled) return 0
  // Mindestens 16 px bleiben dem Video -> eine Fehleingabe kann das Bild nicht auf 0 drücken.
  return Math.max(0, Math.min(state.ticker.heightPx, state.wall.height - 16))
}

/** Inhalts-Auflösung für Import/Konvertierung: Wand minus Laufschriftzeile.
 *  main (Upload/Reconvert) und Renderer (Import/Stale-Prüfung) rechnen damit
 *  garantiert dieselbe Zielgröße. */
export function contentSize(state: Pick<PlayerState, 'wall' | 'ticker'>): WallResolution {
  return { width: state.wall.width, height: state.wall.height - tickerStripPx(state) }
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
