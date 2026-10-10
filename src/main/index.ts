import { app, BrowserWindow, ipcMain, protocol, screen, shell, type WebContents } from 'electron'
import { existsSync, renameSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { APP_NAME, PREVIOUS_APP_NAMES } from '@shared/brand'
import {
  fitHeight,
  isSmallTool,
  OWN_WINDOW_PARAM,
  restoreBounds,
  TOOL_WINDOW,
  toolWindowSize,
  type ToolWindowSize,
  type WindowBounds
} from '@shared/toolWindows'
import { Channels, JINGLE_PROTOCOL, MANUAL_PROTOCOL, MEDIA_PROTOCOL } from '@shared/ipc-contracts'
import {
  attachWindow,
  registerIpcHandlers,
  registerJingleProtocol,
  registerManualProtocol,
  registerMediaProtocol
} from './ipc/registry'
import { appIconPath } from './services/appIcon'
import { killAllFfmpeg } from './services/convert/runFfmpeg'
import { initFfmpegUpdates } from './services/ffmpeg/ffmpegUpdate'
import { logLine } from './services/log'
import { hasRunningWork, stopAllWork } from './services/shutdown'
import { disposeOsc } from './services/osc/oscService'
import { stopJingleRemote } from './services/jingleRemoteServer'
import { stopOscRemote } from './services/oscRemoteServer'
import { closePattern } from './services/patternWindow'
import { closePlayerOutput } from './services/player/playerWindow'
import { stopRemote } from './services/player/remoteServer'
import { stopRemoteApp } from './services/remoteAppServer'
import { stopTimerRemote } from './services/timerRemoteServer'
import { disposeTimer } from './services/stageTimer'
import { closeTimerOutput } from './services/timerWindow'
import { stopTimerNdi } from './services/timerNdi'
import { stopPlayerNdi } from './services/playerNdi'
import { checkOnStartup } from './services/ytdlp/ytDlp'
import { getSettings, setSettings } from './services/store'

const isDev = !app.isPackaged

// Globale Auffanglinien: unbehandelte Fehler/Rejections landen im Debug-Log
// (im gepackten Build sonst unsichtbar) statt die App still zu destabilisieren.
process.on('unhandledRejection', (reason) => {
  logLine(
    '[unhandledRejection]',
    reason instanceof Error ? (reason.stack ?? reason.message) : reason
  )
})
process.on('uncaughtException', (err) => {
  logLine('[uncaughtException]', err.stack ?? err.message)
})

// Privilegierte Schemata MÜSSEN vor app.whenReady registriert werden, damit der
// renderer darauf zugreifen darf (pdfjs-fetch bzw. <video src> mit Range/Stream).
protocol.registerSchemesAsPrivileged([
  {
    scheme: MANUAL_PROTOCOL,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  },
  {
    scheme: MEDIA_PROTOCOL,
    // corsEnabled: ohne dieses Privileg sind Custom-Schemes von CORS
    // AUSGESCHLOSSEN -- ein <video crossOrigin="anonymous"> (NDI-Audio-Tap)
    // scheitert dann trotz Access-Control-Allow-Origin-Header komplett
    // (schwarzes Bild). Mit corsEnabled + ACAO-Header ist der Load sauber
    // CORS-freigegeben und MediaElementSource liefert Ton statt Stille.
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true
    }
  },
  {
    scheme: JINGLE_PROTOCOL,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
])

// Erstellt ein App-Fenster. `hash` = Start-Route (z.B. "/tool/jingle-player");
// `isMain` = das Hauptfenster, das beim Schließen die Vollbild-Ausgaben und die Fenster der
// kleinen Werkzeuge mitnimmt.
// `size`/`bounds`: kleine Werkzeuge bekommen ein passend kleines Fenster (Inhaltsgröße).
// `deferShow`: Der Aufrufer zeigt das Fenster selbst (kleine Werkzeuge erst mit passender Höhe).
function createWindow(
  opts: {
    hash?: string
    isMain?: boolean
    size?: ToolWindowSize
    bounds?: WindowBounds | null
    deferShow?: boolean
  } = {}
): BrowserWindow {
  const size = opts.size ?? TOOL_WINDOW
  const small = size !== TOOL_WINDOW
  const win = new BrowserWindow({
    width: opts.bounds?.width ?? size.width,
    height: opts.bounds?.height ?? size.height,
    ...(opts.bounds ? { x: opts.bounds.x, y: opts.bounds.y } : {}),
    minWidth: size.minWidth,
    minHeight: size.minHeight,
    // Maße der kleinen Fenster meinen den Inhalt (gemessen an der Seite), nicht den Rahmen
    useContentSize: small,
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
  // Nur das Hauptfenster nimmt die Vollbild-Ausgaben (Testbild/Player/Timer) mit;
  // Zusatzfenster (z.B. parallel geöffnete Tools) lassen sie weiterlaufen. Die kleinen
  // Werkzeuge gehen mit: Ihre Fenster haben keinen Weg zurück zum Startbildschirm.
  if (opts.isMain) {
    win.on('closed', () => {
      closePattern()
      closePlayerOutput()
      closeTimerOutput()
      closeSmallToolWindows()
    })
  }

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
function fitToolWindow(sender: WebContents, requested: unknown): void {
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

function closeSmallToolWindows(): void {
  for (const win of [...smallToolWindows.values()]) if (!win.isDestroyed()) win.close()
}

// Einmalige userData-Übernahme nach der Umbenennung: heißt der App-Ordner neu
// (leitet Electron aus dem App-Namen ab) und existiert noch nicht, aber ein
// Ordner eines früheren Namens liegt daneben -> diesen übernehmen. Best effort,
// wirft nie; passiert genau einmal (danach existiert der neue Ordner).
function migrateUserData(): void {
  try {
    const cur = app.getPath('userData')
    if (existsSync(cur)) return
    const parent = dirname(cur)
    for (const old of PREVIOUS_APP_NAMES) {
      const oldPath = join(parent, old)
      if (oldPath !== cur && existsSync(oldPath)) {
        renameSync(oldPath, cur)
        logLine('[migrate] userData übernommen:', oldPath, '->', cur)
        return
      }
    }
  } catch (e) {
    logLine('[migrate] userData-Migration übersprungen:', e instanceof Error ? e.message : e)
  }
}

app.whenReady().then(() => {
  migrateUserData() // vor jedem Zugriff auf DB/Settings
  logLine('--- Start ---', `packaged=${app.isPackaged}`)
  // vor jedem ffmpeg-Aufruf: bereitliegenden Build aktivieren, tägliche Prüfung planen
  initFfmpegUpdates()
  logLine('appPath=', app.getAppPath())
  logLine('resourcesPath=', process.resourcesPath)
  logLine('userData=', app.getPath('userData'))
  registerManualProtocol()
  registerMediaProtocol()
  registerJingleProtocol()
  registerIpcHandlers()
  ipcMain.handle(Channels.windowOpenTool, (_e, id: unknown) => openToolWindow(id))
  ipcMain.handle(Channels.windowFitContent, (e, height: unknown) => fitToolWindow(e.sender, height))
  ipcMain.handle(Channels.windowOpenOscMonitor, () => {
    createWindow({ hash: '/osc-monitor' })
  })
  attachWindow(createWindow({ isMain: true }))
  checkOnStartup() // yt-dlp im Hintergrund prüfen, sobald das Fenster steht

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) attachWindow(createWindow({ isMain: true }))
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// 'window-all-closed' feuert NICHT, solange unsichtbare Dienst-Fenster leben
// (NDI-Offscreen-Spiegel von Timer/Player). Die dürfen die App aber nicht am
// Leben halten: schließt das letzte SICHTBARE Fenster, wird beendet -- sonst
// läuft der Prozess (und der NDI-Stream!) unsichtbar weiter.
// Gezählt werden Fenster, die je gezeigt wurden (Haupt-, Werkzeug-, Ausgabefenster, auch
// minimiert); Dienst-Fenster (NDI-Spiegel, PDF-Export) werden nie gezeigt und zählen nie.
// Bewusst NICHT isVisible() der übrigen: Unter Windows meldet ein MINIMIERTES Fenster
// „unsichtbar“ – war die Mottulbox minimiert und schloss man die Vollbild-Ausgabe (Escape im
// Timer-, Player- oder Testbild-Fenster), beendete sich die ganze App.
const shownWindows = new Set<BrowserWindow>()
app.on('browser-window-created', (_e, win) => {
  if (win.isVisible()) shownWindows.add(win)
  win.on('show', () => shownWindows.add(win))
  win.on('closed', () => {
    const wasShown = shownWindows.delete(win)
    if (process.platform === 'darwin' || !wasShown || shownWindows.size > 0) return
    logLine('[fenster] letztes Fenster geschlossen – beenden')
    app.quit()
  })
})

// NDI-Sender stoppen, BEVOR die Fenster abgeräumt werden -> die Quelle
// verschwindet sauber aus dem Netz (kein hängender Eintrag bei Empfängern).
app.on('before-quit', () => {
  stopTimerNdi(false)
  stopPlayerNdi(false)
})

// Laufende Konvertierungen, Generator-Läufe, Importe und Downloads abbrechen und ihr Aufräumen
// abwarten (höchstens 3 s), erst dann wirklich beenden – sonst schriebe ffmpeg weiter
// (services/shutdown.ts). Der zweite quit() läuft hier durch.
let workStopped = false
app.on('before-quit', (e) => {
  if (workStopped || !hasRunningWork()) return
  e.preventDefault()
  workStopped = true
  void stopAllWork().finally(() => app.quit())
})

// Fernsteuerungs-Server + Timer-Intervall beim Beenden sauber schliessen.
app.on('will-quit', () => {
  // letztes Netz: was jetzt noch an ffmpeg läuft, überlebte sonst die App
  killAllFfmpeg()
  stopRemote()
  stopJingleRemote()
  stopOscRemote()
  stopTimerRemote()
  stopRemoteApp()
  disposeOsc()
  disposeTimer()
})
