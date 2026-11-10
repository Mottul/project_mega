// Energiesparen aussetzen, solange etwas läuft: Ohne das schaltete Windows nach seiner Wartezeit
// den Bühnenmonitor mit dem Stage-Timer oder dem Testbild ab, und ein Auftrag über Nacht blieb
// im Standby stehen. Was als „läuft“ gilt, entscheidet wachBedarf.ts (dieselbe Regel wie bei
// „Wirklich beenden?“).
//
// Der Stand wird im Takt abgefragt statt je Dienst gemeldet: Ausgaben, NDI, Aufträge, Timer,
// Fernsteuerungen und Ton haben je eigene Lebensläufe; eine Stelle, die den Stand liest, kann
// keine Meldung verpassen und hinterlässt nach einem Fehler keine vergessene Sperre. Die
// Wartezeiten des Systems zählen in Minuten – drei Sekunden Verzug fallen nicht auf.

import { powerSaveBlocker } from 'electron'
import { laufendStand } from '../beenden/laufend'
import { laufendesAus } from '../beenden/laufendText'
import { logLine } from '../log'
import { wachBedarf, type WachBedarf } from './wachBedarf'

const TAKT_MS = 3000

const ART = {
  bildschirm: 'prevent-display-sleep',
  rechner: 'prevent-app-suspension'
} as const

let sperre: { bedarf: Exclude<WachBedarf, null>; id: number } | null = null
let takt: ReturnType<typeof setInterval> | null = null
let fehlerGemeldet = false

function abgleichen(): void {
  try {
    const stand = laufendStand()
    const bedarf = wachBedarf(stand)
    if (bedarf === (sperre?.bedarf ?? null)) return
    // erst die neue Sperre, dann die alte lösen: beim Wechsel der Art nie einen Moment ohne
    const alt = sperre
    sperre = bedarf ? { bedarf, id: powerSaveBlocker.start(ART[bedarf]) } : null
    if (alt) powerSaveBlocker.stop(alt.id)
    logLine(
      '[wach]',
      bedarf === 'bildschirm'
        ? 'Bildschirm bleibt an:'
        : bedarf === 'rechner'
          ? 'Rechner bleibt wach:'
          : 'Energiesparen wieder frei',
      bedarf ? laufendesAus(stand).join('; ') : ''
    )
  } catch (err) {
    // im Takt: nicht alle drei Sekunden dieselbe Zeile ins Protokoll
    if (!fehlerGemeldet) logLine('[wach] Abgleich fehlgeschlagen:', String(err))
    fehlerGemeldet = true
  }
}

/** Nach app.whenReady, sobald die Dienste stehen. */
export function starteWachhalten(): void {
  if (takt) return
  abgleichen()
  takt = setInterval(abgleichen, TAKT_MS)
  // hält die App beim Beenden nicht am Leben
  takt.unref?.()
}

/** Beim Beenden: Takt aus, Sperre lösen (das System täte es mit dem Prozessende ohnehin). */
export function beendeWachhalten(): void {
  if (takt) clearInterval(takt)
  takt = null
  if (sperre) powerSaveBlocker.stop(sperre.id)
  sperre = null
}
