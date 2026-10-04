import { BrowserWindow } from 'electron'

// Sendet ein Event an ALLE offenen Fenster (Hauptfenster + Ausgabefenster).
// Nötig für den geteilten Player-Zustand -> beide bleiben synchron.
export function broadcast(channel: string, ...args: unknown[]): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, ...args)
  }
}

/** Wie broadcast, aber ohne das auslösende Fenster (das kennt seine Änderung schon –
 *  ein Echo würde schnelle Folgeänderungen kurz zurückspringen lassen). */
export function broadcastExcept(
  exceptId: number | null,
  channel: string,
  ...args: unknown[]
): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed() && w.webContents.id !== exceptId) w.webContents.send(channel, ...args)
  }
}
