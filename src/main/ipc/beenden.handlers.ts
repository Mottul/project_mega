// Werkzeuge melden, was nur im Fenster läuft (Testton, Jingle) – die Rückfrage beim Beenden nennt
// es (services/beenden). Kennungen prüft setRendererAktiv (Allowlist).

import { Channels } from '@shared/ipc-contracts'
import { setRendererAktiv } from '../services/beenden/laufend'
import { on } from './kanal'

export function registerBeendenHandlers(): void {
  on(Channels.setAktiv, (e, key: unknown, an: unknown) => setRendererAktiv(e.sender, key, an))
}
