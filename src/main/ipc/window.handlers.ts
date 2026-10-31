import { Channels } from '@shared/ipc-contracts'
import { createWindow } from '../services/windows/appWindows'
import { fitToolWindow, openToolWindow } from '../services/windows/smallToolWindows'
import { handle } from './kanal'

/** Werkzeug in eigenem Fenster, Höhe kleiner Werkzeugfenster, OSC-Monitor. */
export function registerWindowHandlers(): void {
  handle(Channels.openToolWindow, (_e, id: unknown) => openToolWindow(id))
  handle(Channels.fitToolWindow, (e, height: unknown) => fitToolWindow(e.sender, height))
  handle(Channels.osc.openMonitor, () => {
    createWindow({ hash: '/osc-monitor' })
  })
}
