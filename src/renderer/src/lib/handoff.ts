// Kleiner, nicht persistierter Übergabe-Speicher: ein Tool legt eine IP ab,
// ein anderes (NovaStar / OSC-NovaStar-Panel) übernimmt sie beim Öffnen. So kann
// der Netzwerk-Scanner „diese IP im NovaStar-Tool verwenden" anbieten, ohne die
// Tools direkt zu koppeln.

import { create } from 'zustand'

interface HandoffState {
  novastarHost: string | null
  setNovastarHost: (ip: string | null) => void
  /** Wert einmalig abholen (danach geleert), damit er nicht erneut greift. */
  takeNovastarHost: () => string | null
}

export const useHandoff = create<HandoffState>((set, get) => ({
  novastarHost: null,
  setNovastarHost: (ip) => set({ novastarHost: ip }),
  takeNovastarHost: () => {
    const ip = get().novastarHost
    if (ip) set({ novastarHost: null })
    return ip
  }
}))
