// Prüfung der Befehle, die von der Handy-/Tablet-Seite des Video-Players kommen – fremde
// Eingaben aus dem LAN, ohne Passwort. Durch kommt nur, was die Steuerseite braucht, Feld
// für Feld geprüft und auf sinnvolle Bereiche begrenzt. Das Idle-Bild (beliebige Adressen),
// „Playlist leeren“ und das „ended“-Signal des Ausgabefensters bleiben dem Rechner
// vorbehalten. Rein -> testbar.

import type { FitMode, LoopMode, PlayerCommand, TransitionMode } from '@shared/types'

const LOOP: readonly LoopMode[] = ['none', 'one', 'all']
const FIT: readonly FitMode[] = ['blur', 'bars', 'stretch']
const TRANSITION: readonly TransitionMode[] = ['cut', 'crossfade']
/** Medien-IDs sind UUIDs; nie beliebiger Text. */
const MEDIA_ID = /^[\w-]{1,64}$/
/** Obergrenze je Befehl (eine ganze Playlist vom Handy). */
const MAX_IDS = 1000

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))
const index = (v: unknown): number | null => (isInt(v) && v >= 0 ? v : null)

function oneOf<T extends string>(list: readonly T[], v: unknown): T | null {
  return typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : null
}

function mediaIds(v: unknown): string[] | null {
  if (!Array.isArray(v) || v.length > MAX_IDS) return null
  return v.every((x) => typeof x === 'string' && MEDIA_ID.test(x)) ? (v as string[]) : null
}

export function parsePlayerRemoteCommand(body: string): PlayerCommand | null {
  let raw: unknown
  try {
    raw = JSON.parse(body)
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const c = raw as Record<string, unknown>
  const type = c.type
  switch (type) {
    case 'play':
    case 'pause':
    case 'toggle':
    case 'next':
    case 'prev':
      return { type }
    case 'goto': {
      const i = index(c.index)
      return i === null ? null : { type, index: i }
    }
    case 'remove': {
      const i = index(c.index)
      return i === null ? null : { type, index: i }
    }
    case 'move': {
      const from = index(c.from)
      const to = index(c.to)
      return from === null || to === null ? null : { type, from, to }
    }
    case 'seek':
      // eine Tagesdauer reicht für jedes Medium
      return isNum(c.positionSec) ? { type, positionSec: clamp(c.positionSec, 0, 86_400) } : null
    case 'add': {
      const ids = mediaIds(c.mediaIds)
      if (!ids) return null
      const at = index(c.at)
      return at === null ? { type, mediaIds: ids } : { type, mediaIds: ids, at }
    }
    case 'replace': {
      const ids = mediaIds(c.mediaIds)
      return ids ? { type, mediaIds: ids } : null
    }
    case 'setLoop': {
      const loop = oneOf(LOOP, c.loop)
      return loop ? { type, loop } : null
    }
    case 'setShuffle':
      return typeof c.shuffle === 'boolean' ? { type, shuffle: c.shuffle } : null
    case 'setMuted':
      return typeof c.muted === 'boolean' ? { type, muted: c.muted } : null
    case 'setVolume':
      return isNum(c.volume) ? { type, volume: clamp(c.volume, 0, 1) } : null
    case 'setImageDuration':
      return isNum(c.seconds) ? { type, seconds: clamp(Math.round(c.seconds), 1, 3600) } : null
    case 'setTransition': {
      const transition = oneOf(TRANSITION, c.transition)
      if (!transition) return null
      return isNum(c.transitionMs)
        ? { type, transition, transitionMs: clamp(Math.round(c.transitionMs), 100, 5000) }
        : { type, transition }
    }
    case 'setDefaultFit': {
      const fit = oneOf(FIT, c.fit)
      return fit ? { type, fit } : null
    }
    default:
      return null
  }
}
