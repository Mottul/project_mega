// Spiegelt die eine Verbindung aus dem main: Status und Ansicht. Geschaltet wird nur über Befehle,
// der neue Stand kommt immer vom Mischer zurück.

import { useEffect, useState } from 'react'
import { ATEM_GETRENNT, type AtemStatus, type AtemView } from '@shared/atem'
import { api } from '@renderer/lib/api'

export function useAtem(): { status: AtemStatus; view: AtemView | null } {
  const [status, setStatus] = useState<AtemStatus>(ATEM_GETRENNT)
  const [view, setView] = useState<AtemView | null>(null)

  useEffect(() => {
    let weg = false
    void api.atem.status().then((s) => {
      if (!weg) setStatus(s)
    })
    void api.atem.view().then((v) => {
      if (!weg) setView(v)
    })
    const offStatus = api.atem.onStatus((s) => {
      setStatus(s)
      // Beim Neuverbinden oder Trennen gilt der alte Stand nicht mehr; bei „verloren“ bleibt er
      // ausgegraut stehen, damit man sieht, was zuletzt auf Sendung war
      if (s.phase === 'getrennt' || s.phase === 'verbindet') setView(null)
    })
    const offView = api.atem.onView(setView)
    return () => {
      weg = true
      offStatus()
      offView()
    }
  }, [])

  return { status, view }
}
