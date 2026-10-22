// App-Fenster mit sicheren Vorgaben: Haupt- und Werkzeugfenster (createWindow) und die Bausteine,
// die auch Ausgabe- und NDI-Fenster nutzen (secureWebPreferences, loadRoute). Was ein Fenster
// darüber hinaus tut, verdrahtet der Aufrufer – das Hauptfenster in index.ts, die kleinen
// Werkzeugfenster in smallToolWindows.ts. Für ALLE Fenster gelten außerdem die Wächter aus
// windowGuards.ts (keine neuen Fenster, keine fremde Navigation, Berechtigungen).
import { app, BrowserWindow, type WebPreferences } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { APP_NAME } from '@shared/brand'
import { TOOL_WINDOW, type ToolWindowSize, type WindowBounds } from '@shared/toolWindows'
import { appIconPath } from './appIcon'
import { logLine } from '../log'
import { devServerUrl, type AppPages } from './windowPolicy'

const indexFile = join(__dirname, '../renderer/index.html')
const devUrl = devServerUrl(app.isPackaged, process.env['ELECTRON_RENDERER_URL'])

/** Wo die App-Seite liegt – die Wächter lassen nur sie zu. */
export const appPages: AppPages = {
  indexFile: pathToFileURL(indexFile).href,
  devOrigin: devUrl ? new URL(devUrl).origin : null
}

/**
 * Sichere Vorgaben für jedes Fenster mit App-Seite: Sandbox, getrennter Kontext, kein Node, keine
 * Webviews; die Seite spricht nur über die typisierte API des Preloads. Zusätzliche Optionen
 * (Autoplay, Offscreen …) können diese vier nicht überschreiben.
 */
export function secureWebPreferences(
  extra: Omit<
    WebPreferences,
    'preload' | 'sandbox' | 'contextIsolation' | 'nodeIntegration' | 'webviewTag'
  > = {}
): WebPreferences {
  return {
    ...extra,
    preload: join(__dirname, '../preload/index.js'),
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    webviewTag: false
  }
}

/** Route der App-Seite laden: beim Entwickeln vom Vite-Server, sonst die gebaute index.html. */
export function loadRoute(win: BrowserWindow, hash: string): void {
  const onLoadErr = (e: unknown): void =>
    logLine('[window] Laden fehlgeschlagen:', e instanceof Error ? e.message : String(e))
  if (devUrl) win.loadURL(devUrl + (hash ? `#${hash}` : '')).catch(onLoadErr)
  else win.loadFile(indexFile, hash ? { hash } : undefined).catch(onLoadErr)
}

// Erstellt ein App-Fenster. `hash` = Start-Route (z.B. "/tool/jingle-player");
// `size`/`bounds`: Größe und gemerkte Lage; `useContentSize`: die Maße meinen den Inhalt, nicht
// den Rahmen (kleine Werkzeuge: gemessen an der Seite); `deferShow`: Der Aufrufer zeigt das
// Fenster selbst (kleine Werkzeuge erst mit passender Höhe).
export function createWindow(
  opts: {
    hash?: string
    size?: ToolWindowSize
    bounds?: WindowBounds | null
    useContentSize?: boolean
    deferShow?: boolean
    /** false: im Hintergrund nicht drosseln (misst laufend, z. B. der RTA) */
    backgroundThrottling?: boolean
  } = {}
): BrowserWindow {
  const size = opts.size ?? TOOL_WINDOW
  const win = new BrowserWindow({
    width: opts.bounds?.width ?? size.width,
    height: opts.bounds?.height ?? size.height,
    ...(opts.bounds ? { x: opts.bounds.x, y: opts.bounds.y } : {}),
    minWidth: size.minWidth,
    minHeight: size.minHeight,
    useContentSize: opts.useContentSize ?? false,
    show: false,
    backgroundColor: '#09090b',
    autoHideMenuBar: true,
    // Anfangstitel; sobald der Renderer document.title setzt (Tool-Name), folgt
    // das Fenster automatisch (Electron spiegelt page-title-updated).
    title: APP_NAME,
    icon: appIconPath(),
    // erlaubt der In-App-Vorschau des Players, ohne Nutzergeste (auto-advance,
    // entstummt) weiterzuspielen
    webPreferences: secureWebPreferences({
      autoplayPolicy: 'no-user-gesture-required',
      ...(opts.backgroundThrottling === false ? { backgroundThrottling: false } : {})
    })
  })

  if (!opts.deferShow) {
    // Sicherheitsnetz: In der Linux-CI blieb das Hauptfenster zweimal über 15 s unsichtbar
    // (22.10.2026) – kommt 'ready-to-show' nicht, nach 5 s trotzdem zeigen. Ein kurz leeres
    // Fenster ist besser als ein Programm, das scheinbar nicht startet.
    const notfalls = setTimeout(() => {
      if (!win.isDestroyed() && !win.isVisible()) win.show()
    }, 5000)
    win.once('ready-to-show', () => {
      clearTimeout(notfalls)
      win.show()
    })
    win.once('closed', () => clearTimeout(notfalls))
  }
  // Pinch-/Strg-Rad-Seitenzoom des ganzen Fensters abschalten -> der PDF-Viewer
  // steuert den Zoom selbst (sonst zoomt/scrollt die ganze App ungewollt).
  win.webContents.setVisualZoomLevelLimits(1, 1).catch(() => {})

  // F12 / Strg+Shift+I oeffnet die DevTools (auch im gepackten App -> Diagnose)
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type !== 'keyDown') return
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      win.webContents.toggleDevTools()
    }
  })

  loadRoute(win, opts.hash ?? '')
  return win
}
