// LED-Wall-Planung als Kopie in die Anleitung übernehmen – aus derselben Projektdatei oder aus dem
// aktuellen Konfigurator. Gemeinsam für das Kapitel LED-Wall und den geführten Einstieg.

import { digest } from '@shared/projectFile'
import { api } from '@renderer/lib/api'
import { toast } from '@renderer/lib/toast'
import { ledWallFile, useLedWall } from '../../led-wall/store'
import { kopieAus } from '../ledWallKopie'
import { useMiniManual } from '../store'
import type { LedWallQuelle } from './useLedWallQuelle'

/** Stand der Planung aus derselben Projektdatei; false = nichts übernommen */
export function ausDatei(q: LedWallQuelle): boolean {
  if (!q.stand) return false
  const s = q.stand
  const k = kopieAus(s.data, { rev: s.rev, sha256: s.sha256 })
  if (!k) {
    toast.error('Die LED-Wall-Planung in der Datei ist unlesbar.')
    return false
  }
  useMiniManual.getState().update((a) => ({ ...a, ledWall: k }))
  return true
}

/** Alle Wände der Planung im Konfigurator; fragt nach, wenn sie zu einem anderen Projekt gehört */
export async function ausKonfigurator(): Promise<boolean> {
  const c = useLedWall.getState()
  const data = ledWallFile(c)
  const deckblatt = useMiniManual.getState().anleitung.deckblatt
  const andere =
    (deckblatt.projekt.trim() &&
      c.projectName.trim() &&
      deckblatt.projekt.trim() !== c.projectName.trim()) ||
    (deckblatt.kunde.trim() &&
      c.customerName.trim() &&
      deckblatt.kunde.trim() !== c.customerName.trim())
  if (andere) {
    const ok = await api.confirm({
      message: 'Die Planung im Konfigurator gehört zu einem anderen Projekt.',
      detail: `Konfigurator: ${[c.projectName, c.customerName].filter(Boolean).join(' · ')}\nAnleitung: ${[deckblatt.projekt, deckblatt.kunde].filter(Boolean).join(' · ')}`,
      confirmLabel: 'Trotzdem übernehmen'
    })
    if (!ok) return false
    // Rückfragen sperren nur dieses Fenster: Hat ein anderes die Planung inzwischen geändert,
    // gilt die Zustimmung nicht für den neuen Stand (review-checkliste, „Zustand nach await“)
    if (digest(ledWallFile(useLedWall.getState())) !== digest(data)) {
      toast.warning('Die Planung im Konfigurator hat sich inzwischen geändert – bitte noch einmal.')
      return false
    }
  }
  useMiniManual.getState().update((a) => ({ ...a, ledWall: kopieAus(data, null) }))
  return true
}
