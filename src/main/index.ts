import { app, BrowserWindow, protocol, shell } from 'electron'
import { join } from 'node:path'
import { MANUAL_PROTOCOL } from '@shared/ipc-contracts'
import { attachWindow, registerIpcHandlers, registerManualProtocol } from './ipc/registry'
import { logLine } from './services/log'

const isDev = !app.isPackaged

// Privilegiertes Schema MUSS vor app.whenReady registriert werden, damit der
// renderer per fetch (pdfjs) darauf zugreifen darf.
protocol.registerSchemesAsPrivileged([
  {
    scheme: MANUAL_PROTOCOL,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
])

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1240,
    height: 840,
    minWidth: 960,
    minHeight: 620,
    show: false,
    backgroundColor: '#09090b',
    autoHideMenuBar: true,
    title: 'AV Toolbox',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // sichere Defaults
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.once('ready-to-show', () => win.show())

  // Externe Links im Standardbrowser oeffnen, keine neuen Fenster zulassen
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (isDev && devUrl) {
    void win.loadURL(devUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

app.whenReady().then(() => {
  logLine('--- Start ---', `packaged=${app.isPackaged}`)
  logLine('appPath=', app.getAppPath())
  logLine('resourcesPath=', process.resourcesPath)
  logLine('userData=', app.getPath('userData'))
  registerManualProtocol()
  registerIpcHandlers()
  attachWindow(createWindow())

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) attachWindow(createWindow())
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
