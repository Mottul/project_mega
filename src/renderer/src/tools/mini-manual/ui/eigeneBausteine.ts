// Eigene Bausteine aus der Ablage (main) – eine Liste für Auswahl, Fehlerfälle und den Hinweis
// „Neuere Fassung“. Neu geladen nach jeder Änderung in diesem Fenster (Ereignis) und beim Fokus
// (geändert in einem anderen Fenster) – sonst sähe man eine neue Version erst nach dem Neuöffnen.

import { useEffect, useState } from 'react'
import type { EigenerBaustein } from '@shared/types'
import { api } from '@renderer/lib/api'

const GEAENDERT = 'mini-manual:bausteine-geaendert'

/** Nach Speichern, Umbenennen, Löschen oder Import aufrufen */
export function meldeBausteineGeaendert(): void {
  window.dispatchEvent(new Event(GEAENDERT))
}

export function useEigeneBausteine(): EigenerBaustein[] {
  const [liste, setListe] = useState<EigenerBaustein[]>([])
  useEffect(() => {
    let alive = true
    // nur die letzte Anfrage zählt – eine ältere Antwort darf keine neuere überschreiben
    let nr = 0
    const laden = (): void => {
      const meine = ++nr
      void api.bausteine.list().then((l) => {
        if (alive && meine === nr) setListe(l)
      })
    }
    laden()
    window.addEventListener('focus', laden)
    window.addEventListener(GEAENDERT, laden)
    return () => {
      alive = false
      window.removeEventListener('focus', laden)
      window.removeEventListener(GEAENDERT, laden)
    }
  }, [])
  return liste
}
