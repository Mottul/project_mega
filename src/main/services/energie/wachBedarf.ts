// Wann darf der Rechner nicht einschlafen? – rein und getestet (wachBedarf.test.ts); den Stand
// sammelt beenden/laufend.ts, angewendet wird es in wachhalten.ts.
//
// Eine Regel, dieselbe wie bei „Wirklich beenden?“: Was die Rückfrage nennen würde, hält den
// Rechner wach. Steht dazu ein Bild auf einem Ausgang, bleibt auch der Bildschirm an.

import { laufendesAus, type LaufendStand } from '../beenden/laufendText'

/** 'bildschirm' schließt den Rechner ein; null = Energiesparen wie vom System eingestellt */
export type WachBedarf = 'bildschirm' | 'rechner' | null

export function wachBedarf(s: LaufendStand): WachBedarf {
  // Ausgabefenster von Video-Player, Stage-Timer oder Testbild: Dahinter hängt ein Bühnenmonitor,
  // eine LED-Wand oder ein Beamer. Chromium hält den Bildschirm nur wach, solange ein Video
  // läuft – Timer, Testbild und ein pausierter Player gingen nach der Wartezeit des Systems aus.
  if (s.player.ausgabe || s.timer.ausgabe || s.testbild) return 'bildschirm'
  // Alles Übrige braucht den Rechner, aber keinen Bildschirm: NDI, laufender Timer (Anzeige im
  // Browser), Aufträge über Nacht, verbundene Fernsteuerungen, Ton. Bewusst über dieselben
  // Zeilen wie die Rückfrage – was dort dazukommt, hält von selbst auch wach.
  return laufendesAus(s).length > 0 ? 'rechner' : null
}
