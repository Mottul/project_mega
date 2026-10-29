// Ausgabefenster des Players: Vollbild auf dem gewählten Monitor oder als Fenster (gemeinsamer
// Baustein windows/outputWindow.ts, wie Testbild und Timer). Der Fensterinhalt
// (#/player-output) treibt das HTML5-Video.

import type { BrowserWindow } from 'electron'
import type { AusgabeZiel } from '@shared/types'
import { createOutputWindow } from '../windows/outputWindow'
import { setOutputOpen } from './playerState'

let win: BrowserWindow | null = null

export function openPlayerOutput(ziel: AusgabeZiel): void {
  // Bestehendes Fenster schließen -> sauberer Monitorwechsel.
  closePlayerOutput(false)

  win = createOutputWindow({
    ziel,
    titel: 'Player-Ausgabe',
    route: '/player-output',
    log: 'player',
    // Wie alle Ausgaben erst beim zweiten Esc – ein versehentlicher Tastendruck nimmt das
    // Live-Bild nicht weg
    onEsc: () => closePlayerOutput(),
    // programmatischer play() (nahtloser Wechsel, entstummt) darf ohne Nutzergeste laufen
    webPreferences: { autoplayPolicy: 'no-user-gesture-required' }
  })

  // Nur das AKTUELLE Fenster darf `win` leeren: Electron meldet 'closed' asynchron – beim
  // Monitorwechsel steht dann schon das neue Fenster in `win` und ginge sonst verloren.
  const self = win
  win.on('closed', () => {
    if (win !== self) return
    win = null
    setOutputOpen(false)
  })

  setOutputOpen(true)
}

/** Das Ausgabefenster (geht mit dem Hauptfenster zu – für „Wirklich beenden?“) */
export const playerOutputWindow = (): BrowserWindow | null => win

export function closePlayerOutput(emit = true): void {
  if (win && !win.isDestroyed()) {
    win.close()
  }
  win = null
  if (emit) setOutputOpen(false)
}
