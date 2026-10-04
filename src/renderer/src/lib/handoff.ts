// Kleiner, nicht persistierter Übergabe-Speicher: ein Tool legt einen Wert ab,
// ein anderes übernimmt ihn beim Öffnen. So kann der Netzwerk-Scanner „diese IP
// im NovaStar-Tool verwenden" anbieten und die Medien-Info Dateien samt Prüfprofil an
// den Video-Konverter geben (und zurück), ohne die Tools direkt zu koppeln.
// Gilt pro Fenster (jedes Fenster hat seinen eigenen Renderer-Zustand).

import { create } from 'zustand'

/** Prüfprofil der Medien-Info für den Video-Konverter (Zielsystem + Show-Raster). */
export interface ConvertProfileHandoff {
  target: string
  raster: string
}

interface HandoffState {
  novastarHost: string | null
  setNovastarHost: (ip: string | null) => void
  /** Wert einmalig abholen (danach geleert), damit er nicht erneut greift. */
  takeNovastarHost: () => string | null
  /** Dateipfade je Ziel-Tool-Id (z.B. 'hap-converter', 'media-info'). */
  paths: Record<string, string[]>
  givePaths: (toolId: string, paths: string[]) => void
  /** Pfade für ein Tool einmalig abholen (danach leer). */
  takePaths: (toolId: string) => string[]
  convertProfile: ConvertProfileHandoff | null
  giveConvertProfile: (p: ConvertProfileHandoff) => void
  takeConvertProfile: () => ConvertProfileHandoff | null
}

export const useHandoff = create<HandoffState>((set, get) => ({
  novastarHost: null,
  setNovastarHost: (ip) => set({ novastarHost: ip }),
  takeNovastarHost: () => {
    const ip = get().novastarHost
    if (ip) set({ novastarHost: null })
    return ip
  },
  paths: {},
  givePaths: (toolId, paths) =>
    set((s) => ({
      paths: { ...s.paths, [toolId]: [...new Set([...(s.paths[toolId] ?? []), ...paths])] }
    })),
  takePaths: (toolId) => {
    const list = get().paths[toolId] ?? []
    if (list.length) {
      set((s) => {
        const next = { ...s.paths }
        delete next[toolId]
        return { paths: next }
      })
    }
    return list
  },
  convertProfile: null,
  giveConvertProfile: (p) => set({ convertProfile: p }),
  takeConvertProfile: () => {
    const p = get().convertProfile
    if (p) set({ convertProfile: null })
    return p
  }
}))
