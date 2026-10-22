// Werkzeuge melden, was nur im Fenster läuft (Testton, Jingle) – die Rückfrage beim Beenden nennt
// es (services/beenden). Kennungen prüft setRendererAktiv (Allowlist).

import { ipcMain } from 'electron'
import { Channels } from '@shared/ipc-contracts'
import { setRendererAktiv } from '../services/beenden/laufend'

export function registerBeendenHandlers(): void {
  ipcMain.on(Channels.appSetAktiv, (e, key: unknown, an: unknown) =>
    setRendererAktiv(e.sender, key, an)
  )
}
