// Reine Helfer für die Playlist-Auswahl des YouTube-Downloaders: Vorauswahl,
// Bereichsauswahl (Umschalt-Klick) und die Download-Aufträge der gewählten Einträge.

import type { YtEnqueueRequest, YtFormatId, YtPlaylistEntry, YtProbeResult } from '@shared/types'

export type YtPlaylist = Extract<YtProbeResult, { kind: 'playlist' }>

export interface PlaylistOptions {
  /** In einen Unterordner mit dem Playlist-Namen laden. */
  folder: boolean
  /** Playlist-Position voranstellen („03 - Titel“), damit die Reihenfolge erhalten bleibt. */
  numbers: boolean
}

export const selectable = (e: YtPlaylistEntry): boolean => !e.unavailable && !e.nested && !!e.url

/** Dauer als m:ss bzw. h:mm:ss; leer, wenn unbekannt. */
export function fmtDuration(sec: number | null): string {
  if (sec == null || !Number.isFinite(sec)) return ''
  const t = Math.round(sec)
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const s = String(t % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

/**
 * Vorauswahl: Zeigt die Adresse auf ein Video in der Playlist (watch?v=…&list=…), ist
 * meist genau dieses gemeint -> nur das (oder nichts, wenn es nicht unter den Einträgen
 * ist – nie versehentlich Hunderte). Sonst alles, was sich laden lässt.
 */
export function initialSelection(p: YtPlaylist): Set<number> {
  if (p.currentId) {
    const current = p.entries.find((e) => e.id === p.currentId)
    return new Set(current && selectable(current) ? [current.index] : [])
  }
  return new Set(p.entries.filter(selectable).map((e) => e.index))
}

/** Umschalt-Klick: alle ladbaren Einträge zwischen zwei Positionen (Listenreihenfolge) setzen. */
export function selectRange(
  entries: YtPlaylistEntry[],
  selected: Set<number>,
  fromIndex: number,
  toIndex: number,
  on: boolean
): Set<number> {
  const a = entries.findIndex((e) => e.index === fromIndex)
  const b = entries.findIndex((e) => e.index === toIndex)
  if (a < 0 || b < 0) return selected
  const next = new Set(selected)
  for (const e of entries.slice(Math.min(a, b), Math.max(a, b) + 1)) {
    if (!selectable(e)) continue
    if (on) next.add(e.index)
    else next.delete(e.index)
  }
  return next
}

/** Stellenzahl der Nummerierung: mindestens zwei („01“), sonst so viele wie die Playlist braucht. */
export function numberDigits(p: YtPlaylist): number {
  const max = Math.max(p.total ?? 0, ...p.entries.map((e) => e.index), 1)
  return Math.max(2, String(max).length)
}

/** Ein Auftrag je gewähltem Eintrag, in Playlist-Reihenfolge. */
export function playlistRequests(
  p: YtPlaylist,
  selected: Set<number>,
  base: { format: YtFormatId; maxHeight: number | null; outputDir: string },
  opts: PlaylistOptions
): YtEnqueueRequest[] {
  const digits = numberDigits(p)
  return p.entries
    .filter((e) => selected.has(e.index) && selectable(e))
    .map((e) => ({
      ...base,
      url: e.url as string,
      title: e.title,
      ...(opts.folder ? { subfolder: p.title } : {}),
      ...(opts.numbers ? { number: { index: e.index, digits } } : {})
    }))
}

/** Nur http(s) – dieselbe Regel wie im main-Prozess, hier für eine sofortige Meldung. */
export function urlProblem(text: string): string | null {
  const t = text.trim()
  if (!t) return null
  try {
    const u = new URL(t)
    return u.protocol === 'https:' || u.protocol === 'http:'
      ? null
      : 'Nur http(s)-Adressen werden unterstützt.'
  } catch {
    return 'Keine gültige Adresse – bitte mit https:// einfügen.'
  }
}
