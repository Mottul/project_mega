// Anordnung des Video-Players – rein und getestet (layout.test.ts): die Raster je Stufe der
// Arbeitsfläche (components/workAreaRaster.ts), die Gesamtdauer der Playlist, stabile
// Schlüssel für ihre Zeilen und „Danach“ der Bühne. Entwurf und Messungen:
// docs/PLAN-ARBEITSFLAECHE.md.

import type { Raster, Stufe } from '@renderer/components/workAreaRaster'
import { nextIndex } from '@shared/player'
import type { MediaItem, PlayerState } from '@shared/types'

/** Namen der drei Felder (CSS grid-template-areas) */
export type PlayerFeld = 'bibliothek' | 'playlist' | 'buehne'

/**
 * Drei Felder – Bibliothek (Material), Playlist (Abfolge), Bühne (was läuft):
 * - breit: nebeneinander; die Bühne bekommt 40 % der Breite, mindestens 420, höchstens 960 px
 * - mittel: links Playlist über Bibliothek (5 : 3 – die Playlist braucht in der Show mehr
 *   Zeilen als die Bibliothek: bei 1024 × 600 gerade fünf), rechts die Bühne über die ganze Höhe
 * - schmal: untereinander, Bühne zuerst; die Arbeitsfläche scrollt
 * Die Reihenfolge im DOM bleibt immer gleich, nur die Bereiche wandern: Sonst baute React beim
 * Wechsel der Stufe (Schublade auf, Fenster schmaler) die Wiedergabe-Engine neu auf, und das
 * laufende Video lüde neu.
 */
export const PLAYER_RASTER: Record<Stufe, Raster<PlayerFeld>> = {
  breit: {
    columns: 'minmax(280px, 1fr) minmax(280px, 1fr) clamp(420px, 40%, 960px)',
    rows: 'minmax(0, 1fr)',
    areas: [['bibliothek', 'playlist', 'buehne']]
  },
  mittel: {
    columns: 'minmax(300px, 1fr) minmax(380px, 1.2fr)',
    rows: 'minmax(0, 5fr) minmax(0, 3fr)',
    areas: [
      ['playlist', 'buehne'],
      ['bibliothek', 'buehne']
    ]
  },
  schmal: {
    columns: 'minmax(0, 1fr)',
    rows: 'auto auto auto',
    areas: [['buehne'], ['playlist'], ['bibliothek']]
  }
}

/** Gesamtdauer der Playlist in Sekunden: Videos mit ihrer Länge, Bilder mit der Standzeit. */
export function gesamtdauer(playlist: MediaItem[], bildSek: number): number {
  return playlist.reduce((sum, m) => sum + (m.durationSec ?? bildSek), 0)
}

/**
 * Schlüssel der Playlist-Zeilen: Kennung des Mediums und laufende Nummer JE MEDIUM – das dritte
 * Vorkommen von X heißt `X#3`. Dasselbe Medium darf mehrfach in der Liste stehen; ein Schlüssel
 * aus dem Platz in der Liste ließe React beim Umsortieren jede Zeile neu aufbauen (Skill
 * review-checkliste: „key von Listen mit Medien nicht aus der Position bilden“).
 */
export function zeilenSchluessel(playlist: Pick<MediaItem, 'id'>[]): string[] {
  const gesehen = new Map<string, number>()
  return playlist.map((m) => {
    const n = (gesehen.get(m.id) ?? 0) + 1
    gesehen.set(m.id, n)
    return `${m.id}#${n}`
  })
}

/**
 * Titel dessen, was nach dem laufenden Eintrag kommt („Danach: …“ in der Bühne): aus
 * `nextIndex` wie im main, also auch bei Zufall (vorab gewürfelt) und Loop „Eines“ (derselbe
 * Titel); „Ende“, wenn danach nichts mehr kommt. `null`, solange nichts läuft.
 */
export function danach(
  state: Pick<PlayerState, 'playlist' | 'index' | 'loop' | 'shuffle' | 'shuffleNext'>
): string | null {
  if (state.playlist.length === 0 || state.index < 0) return null
  const i = nextIndex(state)
  return i < 0 ? 'Ende' : state.playlist[i].title
}
