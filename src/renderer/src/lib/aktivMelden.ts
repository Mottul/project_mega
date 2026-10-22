// Werkzeug meldet main, dass in diesem Fenster etwas läuft, das main nicht kennt (Ton im
// Fenster) – die Rückfrage beim Beenden nennt es (main/services/beenden). Beim Verlassen des
// Werkzeugs gilt es als beendet.

import { useEffect } from 'react'
import { api } from './api'

export function useAktivMelden(key: 'testton' | 'jingle', an: boolean): void {
  useEffect(() => {
    api.setAktiv(key, an)
  }, [key, an])
  useEffect(() => () => api.setAktiv(key, false), [key])
}
