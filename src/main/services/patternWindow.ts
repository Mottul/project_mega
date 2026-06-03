// Verwaltet das rahmenlose Vollbild-Ausgabefenster fuer Testbilder.
// Bewusst KEIN fullscreen-Flag, sondern ein rahmenloses Fenster exakt auf den
// Bounds des gewaehlten Displays (alwaysOnTop) -> zielt zuverlaessig auf den
// richtigen Monitor und deckt ihn pixelgenau ab.

import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import { Channels } from '@shared/ipc-contracts'
import type { DisplayInfo, PatternConfig } from '@shared/types'
import { logLine } from './log'

let win: BrowserWindow | null = null
let currentConfig: PatternConfig | null = null

export function listDisplays(): DisplayInfo[] {
  const primary = screen.getPrimaryDisplay()
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id,
    label: `Monitor ${i + 1} – ${d.size.width}×${d.size.height}${d.id === primary.id ? ' (primär)' : ''}`,
    x: d.bounds.x,
    y: d.bounds.y,
    width: d.bounds.width,
    height: d.bounds.height,
    scaleFactor: d.scaleFactor,
    primary: d.id === primary.id
  }))
}

export function getCurrentConfig(): PatternConfig | null {
  return currentConfig
}

export function openPattern(config: PatternConfig, displayId: number): void {
  currentConfig = config
  const display =
    screen.getAllDisplays().find((d) => d.id === displayId) ?? screen.getPrimaryDisplay()
  const b = display.bounds

  if (win && !win.isDestroyed()) {
    win.setBounds(b)
    win.webContents.send(Channels.patternRender, config)
    win.focus()
    return
  }

  win = new BrowserWindow({
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    frame: false,
    fullscreen: false,
    alwaysOnTop: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    backgroundColor: '#000000',
    title: 'Testbild',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  logLine('[pattern] Ausgabefenster auf Display', display.id, JSON.stringify(b))

  win.on('closed', () => {
    win = null
  })
  // Esc schliesst das Ausgabefenster
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') closePattern()
  })
  win.webContents.on('did-finish-load', () => {
    win?.setBounds(b)
    win?.webContents.send(Channels.patternRender, currentConfig)
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) void win.loadURL(`${devUrl}#/output`)
  else void win.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/output' })
}

export function updatePattern(config: PatternConfig): void {
  currentConfig = config
  if (win && !win.isDestroyed()) win.webContents.send(Channels.patternRender, config)
}

export function closePattern(): void {
  if (win && !win.isDestroyed()) win.close()
  win = null
}
