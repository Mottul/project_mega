// Rahmenloses Vollbild-Ausgabefenster des Stage-Timers (Referentenmonitor).
// Gleiche Strategie wie Testbild/Player: echtes fullscreen auf den Bounds des
// Zielmonitors. backgroundThrottling aus -> Uhr/Timer ticken auch dann weiter,
// wenn das Fenster nicht fokussiert ist.

import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
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
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  })
  logLine('[timer] Ausgabefenster auf Display', display.id, JSON.stringify(b))

  win.on('closed', () => {
    win = null
    setTimerOutputOpen(false)
  })
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') closeTimerOutput()
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) void win.loadURL(`${devUrl}#/timer-output`)
  else void win.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/timer-output' })

  setTimerOutputOpen(true)
}

export function closeTimerOutput(emit = true): void {
  if (win && !win.isDestroyed()) win.close()
  win = null
  if (emit) setTimerOutputOpen(false)
}
