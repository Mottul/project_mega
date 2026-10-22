// Beenden mit Rückfrage: Läuft noch etwas (laufend.ts), fragt die App „Wirklich beenden?“ und
// nennt, was läuft – auf jedem Weg: Cmd+Q bzw. app.quit() (before-quit) und das Schließen des
// letzten Fensters (sonst wäre das Fenster schon weg, wenn before-quit kommt). Ohne Laufendes keine
// Frage; beim Herunterfahren oder Abmelden des Rechners nie (das System wartet nicht).

import { app, dialog, powerMonitor, type BrowserWindow } from 'electron'
import { logLine } from '../log'
import { laufendes } from './laufend'

/** Beenden ist freigegeben: bestätigt, nichts lief oder der Rechner fährt herunter */
let frei = false
/** Dialog offen – ein zweites Schließen fragt nicht noch einmal */
let fragt = false

/** Darf das Beenden weiterlaufen? Die übrigen before-quit-Schritte (NDI, Aufträge) erst danach. */
export const beendenFreigegeben = (): boolean => frei

async function frage(parent: BrowserWindow | null, was: string[]): Promise<boolean> {
  if (fragt) return false
  fragt = true
  try {
    const opts = {
      type: 'warning' as const,
      title: 'Mottulbox beenden?',
      message: 'Es läuft noch etwas – wirklich beenden?',
      detail: `${was.map((x) => `• ${x}`).join('\n')}\n\nAusgaben werden geschlossen, laufende Aufträge abgebrochen.`,
      buttons: ['Beenden', 'Abbrechen'],
      defaultId: 1,
      cancelId: 1,
      noLink: true
    }
    const r =
      parent && !parent.isDestroyed()
        ? await dialog.showMessageBox(parent, opts)
        : await dialog.showMessageBox(opts)
    const ok = r.response === 0
    logLine('[beenden] Rückfrage:', ok ? 'beenden' : 'abgebrochen', `(${was.join('; ')})`)
    return ok
  } finally {
    fragt = false
  }
}

/** Vor dem ersten anderen before-quit-Handler aufrufen (Reihenfolge der Handler zählt). */
export function installBeendenRueckfrage(hauptfenster: () => BrowserWindow | null): void {
  // Linux und macOS melden das Herunterfahren hier, Windows je Fenster (session-end)
  powerMonitor.on('shutdown', () => {
    frei = true
  })
  app.on('before-quit', (e) => {
    if (frei) return
    const was = laufendes()
    if (!was.length) {
      frei = true
      return
    }
    e.preventDefault()
    void frage(hauptfenster(), was).then((ok) => {
      if (!ok) return
      frei = true
      app.quit()
    })
  })
}

/**
 * Ein Fenster, dessen Schließen die App beendet (das letzte sichtbare bzw. das Hauptfenster, das
 * Ausgaben und kleine Werkzeuge mitnimmt): vorher fragen. `wuerdeBeenden` entscheidet im Moment
 * des Schließens – macOS beendet mit dem letzten Fenster ohnehin nicht.
 */
export function wacheBeimSchliessen(win: BrowserWindow, wuerdeBeenden: () => boolean): void {
  win.on('session-end', () => {
    frei = true
  })
  win.on('close', (e) => {
    if (frei || !wuerdeBeenden()) return
    const was = laufendes()
    if (!was.length) return
    e.preventDefault()
    void frage(win, was).then((ok) => {
      if (!ok || win.isDestroyed()) return
      frei = true
      win.close()
    })
  })
}
