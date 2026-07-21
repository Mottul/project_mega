import type { ToolboxApi } from '@shared/ipc-contracts'

// Typisierter Zugriff auf die per preload exponierte Bruecke. Fehlt sie (preload
// nicht geladen), liefert ein Proxy bei jedem Zugriff eine KLARE Meldung statt
// eines kryptischen „Cannot read properties of undefined" – so landet der Grund
// in der Fehlergrenze/im Log statt in einem stillen Absturz.
const missingBridge = (): never => {
  throw new Error('Programmbrücke (window.api) nicht verfügbar – Preload nicht geladen.')
}

export const api: ToolboxApi =
  window.api ?? (new Proxy({}, { get: missingBridge }) as unknown as ToolboxApi)
