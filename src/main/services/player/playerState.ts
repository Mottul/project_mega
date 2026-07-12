// Autoritativer Player-Zustand im main-Prozess. Desktop-UI und (später) Tablet
// schicken Befehle hierher; das Ausgabefenster meldet Position/Ende zurück. Jede
// Änderung wird an ALLE Fenster gebroadcastet -> ein einziger, geteilter Zustand.

import { EMPTY_PLAYER_STATE, nextIndex, prevIndex, rollShuffleNext } from '@shared/player'
import type { MediaItem, PlayerCommand, PlayerState, PlayerTick } from '@shared/types'
import { getMedia } from './mediaLibrary'
import { getSettings, setSettings } from '../store'

type StateSink = (state: PlayerState) => void
type TickSink = (tick: PlayerTick) => void

let state: PlayerState = { ...EMPTY_PLAYER_STATE }
let stateSink: StateSink = () => {}
let tickSink: TickSink = () => {}
let initialized = false

function ensureInit(): void {
  if (initialized) return
  initialized = true
  const p = getSettings().player
  state = {
    ...EMPTY_PLAYER_STATE,
    imageDurationSec: p.imageDurationSec,
    transition: p.transition,
    transitionMs: p.transitionMs,
    idlePattern: p.idlePattern,
    idleMediaUrl: p.idleMediaUrl,
    idleMediaKind: p.idleMediaKind,
    wall: { width: p.wallWidth, height: p.wallHeight },
    ticker: {
      // enabled folgt dem aktiven Trailer-Preset (nicht separat persistiert)
      enabled: !!p.trailerPresets?.[p.trailerActivePreset]?.ticker,
      heightPx: p.tickerHeight,
      text: p.tickerText,
      speed: p.tickerSpeed,
      color: p.tickerColor,
      bg: p.tickerBg,
      logoUrl: p.tickerLogoUrl,
      logoMode: p.tickerLogoMode
    }
  }
}

export function setStateSink(sink: StateSink): void {
  stateSink = sink
}
export function setTickSink(sink: TickSink): void {
  tickSink = sink
}

export function getPlayerState(): PlayerState {
  ensureInit()
  return state
}

// Haelt den vorab gewuerfelten Shuffle-Index gueltig: nach Konsum (ended ->
// goToIndex), Playlist-Aenderungen oder Shuffle-Umschalten wird neu gewuerfelt.
// Ein noch gueltiger Wert (in Range, != aktueller) bleibt bewusst stehen, damit
// das bereits vorgeladene Medium nicht umsonst geladen wurde.
function normalizeShuffleNext(): void {
  if (!state.shuffle || state.loop === 'one') {
    state.shuffleNext = -1
    return
  }
  const n = state.playlist.length
  if (
    n <= 1 ||
    state.shuffleNext < 0 ||
    state.shuffleNext >= n ||
    state.shuffleNext === state.index
  ) {
    state.shuffleNext = rollShuffleNext(state)
  }
}

function emitState(): void {
  normalizeShuffleNext()
  stateSink({ ...state, playlist: [...state.playlist] })
}

function currentId(): string | null {
  return state.index >= 0 && state.index < state.playlist.length
    ? state.playlist[state.index].id
    : null
}

// Index neu auf das Medium mit gegebener id setzen (nach Reorder/Remove), sonst clampen.
function reindexTo(id: string | null): void {
  if (id) {
    const i = state.playlist.findIndex((m) => m.id === id)
    state.index = i >= 0 ? i : Math.min(state.index, state.playlist.length - 1)
  } else {
    state.index = state.playlist.length
      ? Math.min(Math.max(0, state.index), state.playlist.length - 1)
      : -1
  }
}

function goToIndex(i: number, play: boolean): void {
  state.index = i
  state.positionSec = 0
  state.durationSec = i >= 0 ? (state.playlist[i]?.durationSec ?? 0) : 0
  state.playing = i >= 0 ? play : false
  state.seekSeq++ // Ausgabefenster: neu laden + ggf. auf 0 setzen
}

export function applyCommand(cmd: PlayerCommand): void {
  ensureInit()
  switch (cmd.type) {
    case 'play':
      if (state.index >= 0) state.playing = true
      break
    case 'pause':
      state.playing = false
      break
    case 'toggle':
      if (state.index >= 0) state.playing = !state.playing
      break
    case 'next':
      goToIndex(nextIndex(state), state.playing)
      break
    case 'prev':
      goToIndex(prevIndex(state), state.playing)
      break
    case 'ended': {
      const ni = nextIndex(state)
      if (ni < 0) {
        state.playing = false // Ende ohne Loop -> stehen bleiben
      } else {
        goToIndex(ni, true)
      }
      break
    }
    case 'goto':
      if (cmd.index >= 0 && cmd.index < state.playlist.length) goToIndex(cmd.index, true)
      break
    case 'seek':
      state.positionSec = Math.max(0, cmd.positionSec)
      state.seekSeq++
      break
    case 'add': {
      const items = cmd.mediaIds.map(getMedia).filter((m): m is MediaItem => m !== null)
      if (items.length === 0) break
      const at =
        cmd.at == null
          ? state.playlist.length
          : Math.max(0, Math.min(cmd.at, state.playlist.length))
      const keepId = currentId()
      state.playlist.splice(at, 0, ...items)
      // Erstes Medium in eine leere Playlist -> sofort abspielen (kein manuelles Play nötig).
      if (state.index < 0) goToIndex(0, true)
      else reindexTo(keepId)
      break
    }
    case 'replace': {
      // Playlist in EINEM Zustandswechsel austauschen (nahtloser Playlist-Wechsel,
      // kein Zwischenschritt über eine leere Liste -> keine Idle-Blende, kein Pause).
      const items = cmd.mediaIds.map(getMedia).filter((m): m is MediaItem => m !== null)
      state.playlist = items
      goToIndex(items.length ? 0 : -1, items.length > 0)
      break
    }
    case 'remove': {
      if (cmd.index < 0 || cmd.index >= state.playlist.length) break
      const removingCurrent = cmd.index === state.index
      const keepId = removingCurrent ? null : currentId()
      state.playlist.splice(cmd.index, 1)
      if (state.playlist.length === 0) {
        goToIndex(-1, false)
      } else if (removingCurrent) {
        // auf das nun an dieser Stelle stehende Medium springen (oder ans Ende clampen)
        goToIndex(Math.min(cmd.index, state.playlist.length - 1), state.playing)
      } else {
        reindexTo(keepId)
      }
      break
    }
    case 'move': {
      const { from, to } = cmd
      if (from < 0 || from >= state.playlist.length || to < 0 || to >= state.playlist.length) break
      const keepId = currentId()
      const [m] = state.playlist.splice(from, 1)
      state.playlist.splice(to, 0, m)
      reindexTo(keepId)
      break
    }
    case 'clear':
      state.playlist = []
      goToIndex(-1, false)
      break
    case 'setLoop':
      state.loop = cmd.loop
      break
    case 'setShuffle':
      state.shuffle = cmd.shuffle
      break
    case 'setMuted':
      state.muted = cmd.muted
      break
    case 'setVolume':
      state.volume = Math.max(0, Math.min(1, cmd.volume))
      break
    case 'setImageDuration':
      state.imageDurationSec = Math.max(1, Math.min(3600, Math.round(cmd.seconds)))
      setSettings({ player: { ...getSettings().player, imageDurationSec: state.imageDurationSec } })
      break
    case 'setTransition':
      state.transition = cmd.transition
      if (cmd.transitionMs != null)
        state.transitionMs = Math.max(100, Math.min(5000, Math.round(cmd.transitionMs)))
      setSettings({
        player: {
          ...getSettings().player,
          transition: state.transition,
          transitionMs: state.transitionMs
        }
      })
      break
    case 'setDefaultFit':
      // Reine Einstellung (kein Wiedergabe-Zustand) – wirkt auf neue Importe/Uploads.
      setSettings({ player: { ...getSettings().player, defaultFit: cmd.fit } })
      break
    case 'setIdlePattern':
      state.idlePattern = cmd.pattern
      setSettings({ player: { ...getSettings().player, idlePattern: state.idlePattern } })
      break
    case 'applyPreset': {
      // LED-Trailer: Format umschalten. Wand-Auflösung + Laufschrift-Sichtbarkeit
      // folgen dem Preset; persistiert, damit Upload/Import dieselbe Zielgröße sehen.
      const p = getSettings().player
      const i = Math.max(0, Math.min(Math.round(cmd.index), p.trailerPresets.length - 1))
      const preset = p.trailerPresets[i]
      if (!preset) break
      state.wall = { width: preset.width, height: preset.height }
      state.ticker = { ...state.ticker, enabled: preset.ticker }
      setSettings({
        player: {
          ...p,
          trailerActivePreset: i,
          wallWidth: preset.width,
          wallHeight: preset.height
        }
      })
      break
    }
    case 'setTicker': {
      // enabled ist bewusst NICHT patchbar -- es folgt dem aktiven Preset.
      const patch = { ...cmd.patch }
      if (patch.heightPx != null)
        patch.heightPx = Math.max(8, Math.min(1024, Math.round(patch.heightPx)))
      if (patch.speed != null) patch.speed = Math.max(10, Math.min(1000, Math.round(patch.speed)))
      if (patch.text != null) patch.text = String(patch.text).slice(0, 500)
      state.ticker = { ...state.ticker, ...patch, enabled: state.ticker.enabled }
      const p = getSettings().player
      setSettings({
        player: {
          ...p,
          tickerHeight: state.ticker.heightPx,
          tickerText: state.ticker.text,
          tickerSpeed: state.ticker.speed,
          tickerColor: state.ticker.color,
          tickerBg: state.ticker.bg,
          tickerLogoUrl: state.ticker.logoUrl,
          tickerLogoMode: state.ticker.logoMode
        }
      })
      break
    }
    case 'setIdleMedia':
      if (cmd.url) {
        state.idlePattern = 'custom'
        state.idleMediaUrl = cmd.url
        state.idleMediaKind = cmd.kind
      } else {
        state.idlePattern = 'off'
        state.idleMediaUrl = null
        state.idleMediaKind = null
      }
      setSettings({
        player: {
          ...getSettings().player,
          idlePattern: state.idlePattern,
          idleMediaUrl: state.idleMediaUrl,
          idleMediaKind: state.idleMediaKind
        }
      })
      break
  }
  emitState()
}

/** Vom Ausgabefenster: aktuelle Position/Dauer. Nur leichter Tick (kein State). */
export function reportPlayback(positionSec: number, durationSec: number): void {
  ensureInit()
  state.positionSec = positionSec
  if (durationSec > 0) state.durationSec = durationSec
  tickSink({ positionSec, durationSec: state.durationSec })
}

export function setOutputOpen(open: boolean): void {
  ensureInit()
  if (open) {
    const p = getSettings().player
    state.wall = { width: p.wallWidth, height: p.wallHeight }
  }
  state.outputOpen = open
  emitState()
}

/** Playlist-Snapshots aus der Bibliothek auffrischen (nach Reconvert/Änderungen);
 *  entfernt zwischenzeitlich gelöschte Medien, behält Reihenfolge + aktuelles. */
export function refreshPlaylist(): void {
  ensureInit()
  if (state.playlist.length === 0) return
  const keepId = currentId()
  const refreshed = state.playlist
    .map((m) => getMedia(m.id))
    .filter((m): m is MediaItem => m !== null)
  // nur wirklich neu broadcasten, wenn sich etwas geändert hat
  const changed =
    refreshed.length !== state.playlist.length ||
    refreshed.some(
      (m, i) => m !== state.playlist[i] && JSON.stringify(m) !== JSON.stringify(state.playlist[i])
    )
  if (!changed) return
  state.playlist = refreshed
  reindexTo(keepId)
  emitState()
}

/** Aus der Bibliothek gelöschtes Medium aus der Playlist entfernen. */
export function dropMediaFromPlaylist(mediaId: string): void {
  ensureInit()
  if (!state.playlist.some((m) => m.id === mediaId)) return
  const keepId = currentId() === mediaId ? null : currentId()
  state.playlist = state.playlist.filter((m) => m.id !== mediaId)
  if (state.playlist.length === 0) goToIndex(-1, false)
  else reindexTo(keepId)
  emitState()
}
