// App-Fenster mit sicheren Vorgaben (Sandbox, keine neuen Fenster, DevTools per F12): Haupt- und
// Werkzeugfenster. Was ein Fenster darüber hinaus tut, verdrahtet der Aufrufer – das Hauptfenster
// in index.ts, die kleinen Werkzeugfenster in smallToolWindows.ts. Ausgabefenster (Testbild,
// Player, Timer) haben eigene Dienste.
import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { APP_NAME } from '@shared/brand'
import { TOOL_WINDOW, type ToolWindowSize, type WindowBounds } from '@shared/toolWindows'
import { appIconPath } from './appIcon'
import { logLine } from './log'

const isDev = !app.isPackaged

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
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // sichere Defaults
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      // erlaubt der In-App-Vorschau des Players, ohne Nutzergeste (auto-advance,
      // entstummt) weiterzuspielen
      autoplayPolicy: 'no-user-gesture-required'
    }
  })

  if (!opts.deferShow) win.once('ready-to-show', () => win.show())
  // Pinch-/Strg-Rad-Seitenzoom des ganzen Fensters abschalten -> der PDF-Viewer
  // steuert den Zoom selbst (sonst zoomt/scrollt die ganze App ungewollt).
  win.webContents.setVisualZoomLevelLimits(1, 1).catch(() => {})
  // Externe Links im Standardbrowser oeffnen, keine neuen Fenster zulassen
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  // F12 / Strg+Shift+I oeffnet die DevTools (auch im gepackten App -> Diagnose)
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type !== 'keyDown') return
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      win.webContents.toggleDevTools()
    }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  const hash = opts.hash ?? ''
  const onLoadErr = (e: unknown): void =>
    logLine('[window] Laden fehlgeschlagen:', e instanceof Error ? e.message : String(e))
  if (isDev && devUrl) {
    win.loadURL(devUrl + (hash ? `#${hash}` : '')).catch(onLoadErr)
  } else {
    win
      .loadFile(join(__dirname, '../renderer/index.html'), hash ? { hash } : undefined)
      .catch(onLoadErr)
  }
  return win
}
