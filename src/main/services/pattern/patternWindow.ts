// Verwaltet das Ausgabefenster fuer Testbilder (Vollbild pixelgenau auf dem gewaehlten Monitor
// oder als Fenster – gemeinsamer Baustein windows/outputWindow.ts).

import { BrowserWindow, screen } from 'electron'
import { createOutputWindow } from '../windows/outputWindow'
import { sendeAn } from '../broadcast'
import { Channels } from '@shared/ipc-contracts'
import type { AusgabeZiel, DisplayInfo, PatternConfig } from '@shared/types'

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

/** Das Ausgabefenster (geht mit dem Hauptfenster zu – für „Wirklich beenden?“) */
export const patternWindow = (): BrowserWindow | null => win

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

export function openPattern(config: PatternConfig, ziel: AusgabeZiel): void {
  currentConfig = config

  // Bestehendes Ausgabefenster schliessen -> sauberer (Monitor-)Wechsel, da ein
  // Vollbildfenster sich nicht zuverlaessig verschieben laesst.
  closeWindow()

  const w = createOutputWindow({
    ziel,
    titel: 'Testbild',
    route: '/output',
    log: 'pattern',
    onEsc: closePattern
  })
  win = w

  // Nur das AKTUELLE Fenster darf `win` leeren: Beim Monitorwechsel schließt das alte Fenster
  // erst, wenn schon das neue in `win` steht – vorher verlor die App damit das neue Fenster.
  w.on('closed', () => {
    if (win !== w) return
    win = null
    outputSink(false)
  })
  w.webContents.on('did-finish-load', () => {
    if (currentConfig && !w.isDestroyed()) {
      sendeAn(w.webContents, Channels.patterns.onRender, currentConfig)
    }
  })

  outputSink(true)
}

export function updatePattern(config: PatternConfig): void {
  currentConfig = config
  if (win && !win.isDestroyed()) sendeAn(win.webContents, Channels.patterns.onRender, config)
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
