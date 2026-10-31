import { BrowserWindow, type WebContents } from 'electron'
import type { Ereignis, KanalFn } from '@shared/ipc-contracts'

/** Ein Ereignis an genau ein Fenster; die Nutzlast prüft der Vertrag. */
export function sendeAn<F extends KanalFn>(
  ziel: WebContents,
  k: Ereignis<F>,
  ...args: Parameters<F>
): void {
  ziel.send(k.kanal, ...args)
}

// Sendet ein Event an ALLE offenen Fenster (Hauptfenster + Ausgabefenster).
// Nötig für den geteilten Player-Zustand -> beide bleiben synchron.
export function broadcast<F extends KanalFn>(k: Ereignis<F>, ...args: Parameters<F>): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) sendeAn(w.webContents, k, ...args)
  }
}

/** Wie broadcast, aber ohne das auslösende Fenster (das kennt seine Änderung schon –
 *  ein Echo würde schnelle Folgeänderungen kurz zurückspringen lassen). */
export function broadcastExcept<F extends KanalFn>(
  exceptId: number | null,
  k: Ereignis<F>,
  ...args: Parameters<F>
): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed() && w.webContents.id !== exceptId) sendeAn(w.webContents, k, ...args)
  }
}
