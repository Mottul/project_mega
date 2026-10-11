import { ipcMain } from 'electron'
import { Channels } from '@shared/ipc-contracts'
import { createWindow } from '../services/appWindows'
import { fitToolWindow, openToolWindow } from '../services/smallToolWindows'

/** Werkzeug in eigenem Fenster, Höhe kleiner Werkzeugfenster, OSC-Monitor. */
export function registerWindowHandlers(): void {
  ipcMain.handle(Channels.windowOpenTool, (_e, id: unknown) => openToolWindow(id))
  ipcMain.handle(Channels.windowFitContent, (e, height: unknown) => fitToolWindow(e.sender, height))
  ipcMain.handle(Channels.windowOpenOscMonitor, () => {
    createWindow({ hash: '/osc-monitor' })
  })
}
