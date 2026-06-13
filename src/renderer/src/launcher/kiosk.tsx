// Kundenansicht ("Kiosk"): beim Start direkt in ein gesperrtes Tool. Tools
// können über useKiosk() erkennen, dass sie gesperrt laufen, und heikle
// Einstellungen ausblenden (z.B. der Player verbirgt Wand-/Encoder-/Import-
// Optionen). Verlassen mit Strg+Shift+K.

import { createContext, useContext } from 'react'

export const KioskContext = createContext(false)

/** true, wenn das Tool in der gesperrten Kundenansicht läuft. */
export function useKiosk(): boolean {
  return useContext(KioskContext)
}
