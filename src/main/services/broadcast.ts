import { BrowserWindow } from 'electron'

// Sendet ein Event an ALLE offenen Fenster (Hauptfenster + Ausgabefenster).
// Nötig für den geteilten Player-Zustand -> beide bleiben synchron.
export function broadcast(channel: string, ...args: unknown[]): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, ...args)
  }
}
