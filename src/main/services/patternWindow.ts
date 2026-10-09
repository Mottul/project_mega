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
// Meldet „Ausgabe offen/zu“ an alle Fenster (Ausgabe-Leiste des Testbilds) – auch wenn das
// Ausgabefenster per Esc oder vom Betriebssystem geschlossen wird.
let outputSink: (open: boolean) => void = () => {}

export function setPatternOutputSink(fn: (open: boolean) => void): void {
  outputSink = fn
}

export function isPatternOpen(): boolean {
  return win !== null && !win.isDestroyed()
}

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

  // Bestehendes Ausgabefenster schliessen -> sauberer (Monitor-)Wechsel, da ein
  // Vollbildfenster sich nicht zuverlaessig verschieben laesst.
  closeWindow()

  const w = new BrowserWindow({
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    frame: false,
    // echtes Vollbild auf dem Zielmonitor -> keine Win11-Rundung, kein Rand,
    // randlos pixelgenau ueber den ganzen Schirm.
    fullscreen: true,
    backgroundColor: '#000000',
    skipTaskbar: true,
    title: 'Testbild',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  win = w
  logLine('[pattern] Ausgabefenster auf Display', display.id, JSON.stringify(b))

  // Nur das AKTUELLE Fenster darf `win` leeren: Beim Monitorwechsel schließt das alte Fenster
  // erst, wenn schon das neue in `win` steht – vorher verlor die App damit das neue Fenster.
  w.on('closed', () => {
    if (win !== w) return
    win = null
    outputSink(false)
  })
  // Esc schliesst das Ausgabefenster
  w.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') closePattern()
  })
  w.webContents.on('did-finish-load', () => {
    if (!w.isDestroyed()) w.webContents.send(Channels.patternRender, currentConfig)
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) void w.loadURL(`${devUrl}#/output`)
  else void w.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/output' })
  outputSink(true)
}

export function updatePattern(config: PatternConfig): void {
  currentConfig = config
  if (win && !win.isDestroyed()) win.webContents.send(Channels.patternRender, config)
}

/** Fenster schließen, ohne zu melden (beim Monitorwechsel folgt sofort das neue). */
function closeWindow(): void {
  const w = win
  win = null
  if (w && !w.isDestroyed()) w.close()
}

export function closePattern(): void {
  const wasOpen = isPatternOpen()
  closeWindow()
  if (wasOpen) outputSink(false)
}
