import { app, BrowserWindow, ipcMain, protocol, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { Channels, JINGLE_PROTOCOL, MANUAL_PROTOCOL, MEDIA_PROTOCOL } from '@shared/ipc-contracts'
import {
  attachWindow,
  registerIpcHandlers,
  registerJingleProtocol,
  registerManualProtocol,
  registerMediaProtocol
} from './ipc/registry'
import { logLine } from './services/log'
import { disposeOsc } from './services/osc/oscService'
import { stopJingleRemote } from './services/jingleRemoteServer'
import { stopOscRemote } from './services/oscRemoteServer'
import { closePattern } from './services/patternWindow'
import { closePlayerOutput } from './services/player/playerWindow'
import { stopRemote } from './services/player/remoteServer'
import { disposeTimer } from './services/stageTimer'
import { closeTimerOutput } from './services/timerWindow'
import { stopTimerNdi } from './services/timerNdi'
import { stopPlayerNdi } from './services/playerNdi'

const isDev = !app.isPackaged

// Privilegierte Schemata MÜSSEN vor app.whenReady registriert werden, damit der
// renderer darauf zugreifen darf (pdfjs-fetch bzw. <video src> mit Range/Stream).
protocol.registerSchemesAsPrivileged([
  {
    scheme: MANUAL_PROTOCOL,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  },
  {
    scheme: MEDIA_PROTOCOL,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  },
  {
    scheme: JINGLE_PROTOCOL,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
])

/** App-Icon für die laufenden Fenster (Taskleiste/Titelleiste). Auf macOS kommt
 *  das Icon aus dem Bundle, daher dort ohne Effekt. */
function appIconPath(): string | undefined {
  const candidate = app.isPackaged
    ? join(process.resourcesPath, 'icon.png')
    : join(app.getAppPath(), 'build', 'icon.png')
  return existsSync(candidate) ? candidate : undefined
}

// Erstellt ein App-Fenster. `hash` = Start-Route (z.B. "/tool/jingle-player");
// `isMain` = das Hauptfenster, das beim Schließen die Vollbild-Ausgaben mitnimmt.
function createWindow(opts: { hash?: string; isMain?: boolean } = {}): BrowserWindow {
  const win = new BrowserWindow({
    width: 1240,
    height: 840,
    minWidth: 960,
    minHeight: 620,
    show: false,
    backgroundColor: '#09090b',
    autoHideMenuBar: true,
    title: 'MegaToolBox',
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

  win.once('ready-to-show', () => win.show())
  // Pinch-/Strg-Rad-Seitenzoom des ganzen Fensters abschalten -> der PDF-Viewer
  // steuert den Zoom selbst (sonst zoomt/scrollt die ganze App ungewollt).
  win.webContents.setVisualZoomLevelLimits(1, 1).catch(() => {})
  // Nur das Hauptfenster nimmt die Vollbild-Ausgaben (Testbild/Player/Timer) mit;
  // Zusatzfenster (z.B. parallel geöffnete Tools) lassen sie weiterlaufen.
  if (opts.isMain) {
    win.on('closed', () => {
      closePattern()
      closePlayerOutput()
      closeTimerOutput()
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
  if (isDev && devUrl) {
    void win.loadURL(devUrl + (hash ? `#${hash}` : ''))
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), hash ? { hash } : undefined)
  }
  return win
}

/** Öffnet ein Tool in einem EIGENEN Fenster (parallel zum Hauptfenster). */
export function openToolWindow(id: string): void {
  createWindow({ hash: `/tool/${id}` })
}

app.whenReady().then(() => {
  logLine('--- Start ---', `packaged=${app.isPackaged}`)
  logLine('appPath=', app.getAppPath())
  logLine('resourcesPath=', process.resourcesPath)
  logLine('userData=', app.getPath('userData'))
  registerManualProtocol()
  registerMediaProtocol()
  registerJingleProtocol()
  registerIpcHandlers()
  ipcMain.handle(Channels.windowOpenTool, (_e, id: string) => openToolWindow(id))
  ipcMain.handle(Channels.windowOpenOscMonitor, () => {
    createWindow({ hash: '/osc-monitor' })
  })
  attachWindow(createWindow({ isMain: true }))

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
app.on('browser-window-created', (_e, win) => {
  // Nur Fenster, die je SICHTBAR waren, stoßen die Beenden-Prüfung an: das
  // Schließen eines versteckten Dienst-Fensters (z.B. NDI-Stopp) darf die App
  // niemals beenden -- egal, was isVisible() der übrigen gerade meldet.
  let wasVisible = win.isVisible()
  win.on('show', () => {
    wasVisible = true
  })
  win.on('closed', () => {
    if (process.platform === 'darwin' || !wasVisible) return
    const anyVisible = BrowserWindow.getAllWindows().some((w) => !w.isDestroyed() && w.isVisible())
    if (!anyVisible) app.quit()
  })
})

// NDI-Sender stoppen, BEVOR die Fenster abgeräumt werden -> die Quelle
// verschwindet sauber aus dem Netz (kein hängender Eintrag bei Empfängern).
app.on('before-quit', () => {
  stopTimerNdi(false)
  stopPlayerNdi(false)
})

// Fernsteuerungs-Server + Timer-Intervall beim Beenden sauber schliessen.
app.on('will-quit', () => {
  stopRemote()
  stopJingleRemote()
  stopOscRemote()
  disposeOsc()
  disposeTimer()
})
