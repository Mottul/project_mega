// Persistierte eigene Gerätebezeichnungen des Netzwerk-Scanners. Schlüssel ist
// bevorzugt die MAC (bleibt über IP-Wechsel/DHCP stabil), sonst die IP. Der
// eigentliche Scan-Zustand (Geräteliste) lebt flüchtig in der Komponente.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { debouncedStorage } from '@renderer/lib/persistStorage'

interface NetLabelState {
  labels: Record<string, string> // key (mac||ip) -> Bezeichnung
  setLabel: (key: string, label: string) => void
}

/** Stabiler Schlüssel für ein Gerät: MAC bevorzugt, sonst IP. */
export function deviceKey(mac: string | null, ip: string): string {
  return mac ? `mac:${mac}` : `ip:${ip}`
}

export const useNetLabels = create<NetLabelState>()(
  persist(
    (set) => ({
      labels: {},
      setLabel: (key, label) =>
        set((s) => {
          const next = { ...s.labels }
          const trimmed = label.trim()
          if (trimmed) next[key] = trimmed
          else delete next[key]
          return { labels: next }
        })
    }),
    { name: 'netscan-labels', storage: debouncedStorage() }
  )
)
