// Fenster der Werkzeuge außerhalb des Hauptfensters. Große Werkzeuge: ein weiteres normales
// Fenster. Kleine Werkzeuge (shared/toolWindows): immer ein eigenes, passend kleines Fenster.
import { BrowserWindow, screen, type WebContents } from 'electron'
import {
  fitHeight,
  isSmallTool,
  OWN_WINDOW_PARAM,
  restoreBounds,
  toolWindowSize
} from '@shared/toolWindows'
import { createWindow } from './appWindows'
import { logLine } from './log'
import { getSettings, setSettings } from './store'

// Fenster der kleinen Werkzeuge: je Werkzeug höchstens eines (ein zweiter Klick holt es nach
// vorn), Lage und Breite gemerkt (settings.json, toolWindowBounds), die Höhe folgt dem Inhalt
// (fitToolWindow). Sichtbar erst mit passender Höhe – sonst spränge es beim Öffnen.
const smallToolWindows = new Map<string, BrowserWindow>()
const awaitingShow = new Set<BrowserWindow>()
/** Meldet die Seite ihre Höhe nicht (Fehler beim Laden), erscheint das Fenster trotzdem. */
const SHOW_FALLBACK_MS = 1500

function showWhenFitted(win: BrowserWindow): void {
  if (!awaitingShow.delete(win) || win.isDestroyed()) return
  win.show()
}

/** Öffnet ein Tool in einem EIGENEN Fenster (parallel zum Hauptfenster). */
export function openToolWindow(id: unknown): void {
  // kommt aus dem Renderer -> nur eine schlichte Werkzeug-Kennung
  if (typeof id !== 'string' || !/^[a-z0-9-]{1,40}$/.test(id)) return
  const hash = `/tool/${id}?${OWN_WINDOW_PARAM}=1`
  if (!isSmallTool(id)) {
    createWindow({ hash })
    return
  }
  const open = smallToolWindows.get(id)
  if (open && !open.isDestroyed()) {
    if (open.isMinimized()) open.restore()
    open.show()
    open.focus()
    return
  }
  const size = toolWindowSize(id)
  const areas = screen.getAllDisplays().map((d) => d.workArea)
  const win = createWindow({
    hash,
    size,
    bounds: restoreBounds(getSettings().toolWindowBounds[id], areas, size),
    // Maße meinen den Inhalt (gemessen an der Seite), nicht den Rahmen
    useContentSize: true,
    deferShow: true
  })
  smallToolWindows.set(id, win)
  awaitingShow.add(win)
  win.once('ready-to-show', () =>
    setTimeout(() => {
      // im Log, damit ein Sprung beim Öffnen auffällt (e2e/layout.mjs prüft darauf)
      if (awaitingShow.has(win)) logLine('[fenster] keine Höhe gemeldet, zeige ungemessen:', id)
      showWhenFitted(win)
    }, SHOW_FALLBACK_MS)
  )
  // 'closed' kommt erst später: Ein Klick in dieser Zeit holte sonst ein sterbendes Fenster
  // nach vorn, statt ein neues zu öffnen -> schon bei 'close' austragen.
  const release = (): void => {
    if (smallToolWindows.get(id) === win) smallToolWindows.delete(id)
  }
  win.on('close', () => {
    release()
    // minimiert (Windows meldet dann -32000), maximiert oder Vollbild stimmt die Lage nicht
    // -> die zuletzt gemerkte normale behalten
    if (win.isMinimized() || win.isMaximized() || win.isFullScreen()) return
    const [x, y] = win.getPosition()
    const [width, height] = win.getContentSize()
    setSettings({ toolWindowBounds: { [id]: { x, y, width, height } } })
  })
  win.on('closed', () => {
    release()
    awaitingShow.delete(win)
  })
}

/**
 * Kleines Werkzeugfenster auf die gemeldete Inhaltshöhe bringen: passt sich Schrift (Linux,
 * macOS), Kompaktmodus und Breite an, statt einer festen, auf einem Rechner gemessenen Höhe.
 * Höher als der Bildschirm wird es nie (dann scrollt die Seite); wächst es über den unteren
 * Rand, rückt es nach oben. Maximiert oder im Vollbild bleibt die Größe, wie sie ist.
 */
export function fitToolWindow(sender: WebContents, requested: unknown): void {
  const win = BrowserWindow.fromWebContents(sender)
  const id = win && [...smallToolWindows].find(([, w]) => w === win)?.[0]
  if (!win || !id || win.isDestroyed()) return
  if (!win.isMaximized() && !win.isFullScreen()) {
    const area = screen.getDisplayMatching(win.getBounds()).workArea
    const [contentWidth, contentHeight] = win.getContentSize()
    const frame = win.getSize()[1] - contentHeight
    const height = fitHeight(requested, area.height - frame, toolWindowSize(id).minHeight)
    if (height != null && height !== contentHeight) {
      win.setContentSize(contentWidth, height)
      const b = win.getBounds()
      const bottom = area.y + area.height
      if (b.y + b.height > bottom) win.setPosition(b.x, Math.max(area.y, bottom - b.height))
    }
  }
  showWhenFitted(win)
}

export function closeSmallToolWindows(): void {
  for (const win of [...smallToolWindows.values()]) if (!win.isDestroyed()) win.close()
}
