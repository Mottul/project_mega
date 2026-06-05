// Rahmenloses Vollbild-Ausgabefenster des Players auf dem gewählten Monitor.
// Gleiche Strategie wie der Testbildgenerator (echtes fullscreen, pixelgenau auf
// den Display-Bounds). Der Fensterinhalt (#/player-output) treibt das HTML5-Video.

import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import { logLine } from '../log'
import { setOutputOpen } from './playerState'

let win: BrowserWindow | null = null

export function openPlayerOutput(displayId: number): void {
  const display = screen.getAllDisplays().find((d) => d.id === displayId) ?? screen.getPrimaryDisplay()
  const b = display.bounds

  // Bestehendes Fenster schließen -> sauberer Monitorwechsel.
  closePlayerOutput(false)

  win = new BrowserWindow({
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    frame: false,
    fullscreen: true,
    backgroundColor: '#000000',
    skipTaskbar: true,
    title: 'Player-Ausgabe',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      // programmatischer play() (nahtloser Wechsel, entstummt) darf ohne Nutzergeste
      // laufen; Throttling im Hintergrund aus -> Ausgabe darf nie einschlafen.
      autoplayPolicy: 'no-user-gesture-required',
      backgroundThrottling: false
    }
  })
  logLine('[player] Ausgabefenster auf Display', display.id, JSON.stringify(b))

  win.on('closed', () => {
    win = null
    setOutputOpen(false)
  })
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') closePlayerOutput()
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) void win.loadURL(`${devUrl}#/player-output`)
  else void win.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/player-output' })

  setOutputOpen(true)
}

export function closePlayerOutput(emit = true): void {
  if (win && !win.isDestroyed()) {
    win.close()
  }
  win = null
  if (emit) setOutputOpen(false)
}

export function isPlayerOutputOpen(): boolean {
  return win !== null && !win.isDestroyed()
}
