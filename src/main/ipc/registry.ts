import { ipcMain, protocol, type BrowserWindow } from 'electron'
import { readFile } from 'node:fs/promises'
import { Channels, MANUAL_PROTOCOL } from '@shared/ipc-contracts'
import type { AppSettings } from '@shared/types'
import { jobManager } from '../services/ffmpeg/jobManager'
import { logFilePath, logLine } from '../services/log'
import { resolveManualFile } from '../services/manuals/manualsService'
import { getSettings, setSettings } from '../services/store'
import { registerDialogHandlers } from './dialog.handlers'
import { registerFfmpegHandlers } from './ffmpeg.handlers'
import { registerManualsHandlers } from './manuals.handlers'

/** Bedient das custom `manual://`-Protocol (PDF-Bytes der Bibliothek). */
export function registerManualProtocol(): void {
  protocol.handle(MANUAL_PROTOCOL, async (request) => {
    try {
      const url = new URL(request.url)
      const abs = resolveManualFile(url.pathname)
      if (!abs) {
        logLine('[manual://] NICHT GEFUNDEN url=', request.url, 'pathname=', url.pathname)
        return new Response('Not found', { status: 404 })
      }
      const data = await readFile(abs)
      logLine('[manual://] OK', abs, `${data.byteLength} bytes`)
      return new Response(data, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Length': String(data.byteLength),
          'Accept-Ranges': 'none'
        }
      })
    } catch (err) {
      logLine('[manual://] FEHLER url=', request.url, '->', err instanceof Error ? err.message : String(err))
      return new Response('Error', { status: 500 })
    }
  })
}

let handlersRegistered = false

/** Registriert alle ipcMain.handle-Kanaele -- genau einmal. */
export function registerIpcHandlers(): void {
  if (handlersRegistered) return
  handlersRegistered = true

  ipcMain.handle(Channels.settingsGet, () => getSettings())
  ipcMain.handle(Channels.settingsSet, (_e, patch: Partial<AppSettings>) => setSettings(patch))
  ipcMain.handle(Channels.appLogPath, () => logFilePath())

  registerDialogHandlers()
  registerFfmpegHandlers()
  registerManualsHandlers()
}

/** Verbindet die Live-Job-Updates mit dem konkreten Fenster. */
export function attachWindow(win: BrowserWindow): void {
  jobManager.setSink((job) => {
    if (!win.isDestroyed()) win.webContents.send(Channels.hapUpdate, job)
  })
}
