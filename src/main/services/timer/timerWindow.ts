// Ausgabefenster des Stage-Timers (Referentenmonitor): Vollbild auf dem gewählten Monitor oder als
// Fenster (gemeinsamer Baustein windows/outputWindow.ts, wie Testbild und Player – auch ohne
// Drosselung, Uhr/Timer ticken weiter, wenn das Fenster nicht fokussiert ist).

import type { BrowserWindow } from 'electron'
import type { AusgabeZiel } from '@shared/types'
import { createOutputWindow } from '../windows/outputWindow'
import { setTimerOutputOpen } from './stageTimer'

let win: BrowserWindow | null = null

export function openTimerOutput(ziel: AusgabeZiel): void {
  closeTimerOutput(false)

  win = createOutputWindow({
    ziel,
    titel: 'Stage-Timer',
    route: '/timer-output',
    log: 'timer',
    onEsc: () => closeTimerOutput()
  })

  // Nur das AKTUELLE Fenster darf `win` leeren: Electron meldet 'closed' asynchron – beim
  // Monitorwechsel steht dann schon das neue Fenster in `win` und ginge sonst verloren.
  const self = win
  win.on('closed', () => {
    if (win !== self) return
    win = null
    setTimerOutputOpen(false)
  })

  setTimerOutputOpen(true)
}

/** Das Ausgabefenster (geht mit dem Hauptfenster zu – für „Wirklich beenden?“) */
export const timerOutputWindow = (): BrowserWindow | null => win

export function closeTimerOutput(emit = true): void {
  if (win && !win.isDestroyed()) win.close()
  win = null
  if (emit) setTimerOutputOpen(false)
}
