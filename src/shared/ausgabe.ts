// Gemeinsame Regeln der Ausgabefenster (Testbild, Video-Player, Stage-Timer) – rein und getestet.
// Das Fenster selbst legt der main an (services/windows/outputWindow.ts).

import type { AusgabeZiel } from './types'

/** Ziel aus dem Renderer prüfen: eine Monitor-Id (ganze Zahl) oder 'fenster'; sonst null */
export function ausgabeZiel(v: unknown): AusgabeZiel | null {
  if (v === 'fenster') return v
  return typeof v === 'number' && Number.isSafeInteger(v) ? v : null
}

/** Zeitfenster für „zweimal Esc schließt“ */
export const DOPPEL_ESC_MS = 1000

/**
 * Esc schließt eine Ausgabe erst beim zweiten Druck innerhalb von `ms`: Ein versehentlicher
 * Tastendruck nimmt kein Live-Bild weg, und auf einem einzigen Monitor kommt man trotzdem schnell
 * heraus. Liefert eine Funktion, die je Druck (Zeitpunkt in ms) sagt, ob jetzt geschlossen wird;
 * danach zählt es von vorn.
 */
export function doppelEsc(ms = DOPPEL_ESC_MS): (jetzt: number) => boolean {
  let zuletzt = -Infinity
  return (jetzt) => {
    if (jetzt - zuletzt <= ms) {
      zuletzt = -Infinity
      return true
    }
    zuletzt = jetzt
    return false
  }
}
