/**
 * Rundenlogik als reine Funktionen - so lässt sie sich ohne Canvas und
 * Browser testen (genau hier schleichen sich Zählfehler ein).
 */

/**
 * Erkennt am Sprung des nächstgelegenen Wegpunkts, ob die Ziellinie vorwärts
 * (+1) oder rückwärts (-1) überfahren wurde.
 */
export function lapDelta(prevIndex: number, nextIndex: number, count: number): number {
  if (count <= 0) return 0
  const high = count * 0.75
  const low = count * 0.25
  if (prevIndex > high && nextIndex < low) return 1
  if (prevIndex < low && nextIndex > high) return -1
  return 0
}

/**
 * Anzeige-Runde. `crossings` ist die Zahl der Zieldurchfahrten; auf dem
 * Startfeld (0) läuft bereits Runde 1.
 */
export function displayLap(crossings: number, laps: number): number {
  return Math.min(Math.max(crossings, 1), laps)
}

/** Zieleinlauf ist erreicht, sobald die Linie einmal öfter als Runden gezählt wurde. */
export function isFinished(crossings: number, laps: number): boolean {
  return crossings > laps
}
