import { formatTime } from '../core/math'
import type { Kart } from './kart'
import { displayLap } from './progress'
import type { Mode } from './world'

export interface ResultRow {
  place: number
  name: string
  detail: string
  /** Wahr für lokale Spieler - wird in der Liste hervorgehoben. */
  highlight: boolean
}

/**
 * Baut die Ergebnisliste. Bewusst frei von Canvas und Zustand, damit die
 * Reihenfolge (der fehleranfällige Teil) testbar bleibt.
 */
export function buildResultRows(mode: Mode, karts: readonly Kart[], laps = 3): ResultRow[] {
  return [...karts]
    .sort((a, b) => a.rank - b.rank)
    .map((kart) => ({
      place: kart.rank,
      name: `${kart.driver.name}${kart.player >= 0 ? ` (P${kart.player + 1})` : ''}`,
      detail:
        mode === 'race'
          ? kart.finished
            ? formatTime(kart.finishTime)
            : // Das Rennen endet kurz nach dem letzten Spieler - wer dann noch
              // fährt, bekommt statt einer Zeit seinen Rundenstand.
              `Runde ${displayLap(kart.lap, laps)}/${laps}`
          : `${kart.balloons} Ballons · ${kart.score} Treffer`,
      highlight: kart.player >= 0,
    }))
}
