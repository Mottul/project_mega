// Rahmenloses Vollbild-Ausgabefenster des Stage-Timers (Referentenmonitor).
// Gleiche Strategie wie Testbild/Player: echtes fullscreen auf den Bounds des
// Zielmonitors. backgroundThrottling aus -> Uhr/Timer ticken auch dann weiter,
// wenn das Fenster nicht fokussiert ist.

import { BrowserWindow, screen } from 'electron'
import { loadRoute, secureWebPreferences } from './appWindows'
import { logLine } from './log'
import { setTimerOutputOpen } from './stageTimer'

let win: BrowserWindow | null = null

export function openTimerOutput(displayId: number): void {
  const display =
    screen.getAllDisplays().find((d) => d.id === displayId) ?? screen.getPrimaryDisplay()
  const b = display.bounds

  closeTimerOutput(false)

  win = new BrowserWindow({
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    frame: false,
    fullscreen: true,
    backgroundColor: '#000000',
    skipTaskbar: true,
    title: 'Stage-Timer',
    webPreferences: secureWebPreferences({ backgroundThrottling: false })
  })
  logLine('[timer] Ausgabefenster auf Display', display.id, JSON.stringify(b))

  // Nur das AKTUELLE Fenster darf `win` leeren: Electron meldet 'closed' asynchron – beim
  // Monitorwechsel steht dann schon das neue Fenster in `win` und ginge sonst verloren.
  const self = win
  win.on('closed', () => {
    if (win !== self) return
    win = null
    setTimerOutputOpen(false)
  })
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') closeTimerOutput()
  })

  loadRoute(win, '/timer-output')

  setTimerOutputOpen(true)
}

export function closeTimerOutput(emit = true): void {
  if (win && !win.isDestroyed()) win.close()
  win = null
  if (emit) setTimerOutputOpen(false)
}
