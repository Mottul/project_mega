// Persistierte eigene Gerätebezeichnungen des Netzwerk-Scanners. Schlüssel ist
// bevorzugt die MAC (bleibt über IP-Wechsel/DHCP stabil), sonst die IP. Der
// eigentliche Scan-Zustand (Geräteliste) lebt flüchtig in der Komponente.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { NetDeviceType } from '@shared/types'
import { debouncedStorage } from '@renderer/lib/persistStorage'

interface NetLabelState {
  labels: Record<string, string> // key (mac||ip) -> Bezeichnung
  types: Record<string, NetDeviceType> // key (mac||ip) -> manuell gesetzter Typ
  setLabel: (key: string, label: string) => void
  /** Typ manuell festlegen; null = wieder automatisch erkennen. */
  setType: (key: string, type: NetDeviceType | null) => void
}

/** Stabiler Schlüssel für ein Gerät: MAC bevorzugt, sonst IP. */
export function deviceKey(mac: string | null, ip: string): string {
  return mac ? `mac:${mac}` : `ip:${ip}`
}

export const useNetLabels = create<NetLabelState>()(
  persist(
    (set) => ({
      labels: {},
      types: {},
      setLabel: (key, label) =>
        set((s) => {
          const next = { ...s.labels }
          const trimmed = label.trim()
          if (trimmed) next[key] = trimmed
          else delete next[key]
          return { labels: next }
        }),
      setType: (key, type) =>
        set((s) => {
          const next = { ...s.types }
          if (type) next[key] = type
          else delete next[key]
          return { types: next }
        })
    }),
    {
      name: 'netscan-labels',
      storage: debouncedStorage(),
      // Basisversion: v0 (unversioniert) und v1 haben dieselbe Form -> durchreichen.
      // Ab jetzt existiert ein Migrationspunkt für künftige Schemaänderungen.
      version: 1,
      migrate: (persisted) => persisted as NetLabelState
    }
  )
)
