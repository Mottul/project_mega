// Gemeinsames Ausgabefenster für Testbild, Video-Player und Stage-Timer – eine Stelle statt drei
// Kopien, damit sich alle Ausgaben gleich verhalten:
// - Ziel Monitor: rahmenlos, echtes fullscreen auf den Bounds des Monitors (keine Win11-Rundung,
//   kein Rand, pixelgenau). Ein Vollbildfenster lässt sich nicht zuverlässig verschieben – ein
//   Monitorwechsel schließt es und legt ein neues an (Aufrufer).
// - Ziel 'fenster': normales Fenster mit Rahmen auf dem Bildschirm der App (dort steht die Maus
//   nach dem Klick), halb so groß wie der Monitor und mit seinem Seitenverhältnis – der Inhalt
//   (useContentSize), damit der Player („fill“) nichts verzerrt.
// - Beide in der Taskleiste (wiederfinden, nach vorn holen), schwarz und nie gedrosselt: Eine
//   Ausgabe darf nicht einschlafen, auch wenn sie nicht im Vordergrund ist.
// - Esc schließt erst beim zweiten Druck (shared/ausgabe.ts). NUR hier, nicht zusätzlich im
//   Renderer – sonst zählte ein Druck doppelt. Den Knopf zeichnet der Renderer
//   (components/OutputControl.tsx, nur bei Mausbewegung sichtbar).

import { BrowserWindow, screen, type WebPreferences } from 'electron'
import { doppelEsc } from '@shared/ausgabe'
import type { AusgabeZiel } from '@shared/types'
import { logLine } from '../log'
import { appIconPath } from './appIcon'
import { loadRoute, secureWebPreferences } from './appWindows'

export interface OutputWindowOptions {
  ziel: AusgabeZiel
  titel: string
  /** App-Route des Inhalts, z. B. '/timer-output' */
  route: string
  /** Kürzel fürs Log, z. B. 'timer' */
  log: string
  /** zweimal Esc im Fenster */
  onEsc: () => void
  webPreferences?: Parameters<typeof secureWebPreferences>[0]
}

export function createOutputWindow(o: OutputWindowOptions): BrowserWindow {
  const fenster = o.ziel === 'fenster'
  const display = fenster
    ? screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    : (screen.getAllDisplays().find((d) => d.id === o.ziel) ?? screen.getPrimaryDisplay())
  const b = display.bounds
  const lage = fenster ? fensterLage(b, display.workArea) : b

  const win = new BrowserWindow({
    ...lage,
    useContentSize: fenster,
    frame: fenster,
    fullscreen: !fenster,
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    icon: appIconPath(),
    title: o.titel,
    webPreferences: secureWebPreferences({
      backgroundThrottling: false,
      ...o.webPreferences
    } satisfies WebPreferences)
  })
  logLine(
    `[${o.log}] Ausgabefenster`,
    fenster ? 'als Fenster' : 'im Vollbild',
    'auf Display',
    display.id,
    JSON.stringify(lage)
  )

  const esc = doppelEsc()
  win.webContents.on('before-input-event', (_e, input) => {
    // gehaltene Taste zählt einmal
    if (input.type !== 'keyDown' || input.key !== 'Escape' || input.isAutoRepeat) return
    if (esc(Date.now())) o.onEsc()
  })

  loadRoute(win, o.route)
  return win
}

type Rechteck = { x: number; y: number; width: number; height: number }

/** Halbe Monitorgröße, mittig im nutzbaren Bereich (ohne Taskleiste) */
function fensterLage(monitor: Rechteck, nutzbar: Rechteck): Rechteck {
  const width = Math.round(monitor.width / 2)
  const height = Math.round(monitor.height / 2)
  return {
    x: Math.round(nutzbar.x + (nutzbar.width - width) / 2),
    y: Math.round(nutzbar.y + (nutzbar.height - height) / 2),
    width,
    height
  }
}
