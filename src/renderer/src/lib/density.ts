// UI-Dichte (Kompaktmodus). Ansatz: die Wurzel-Schriftgröße umschalten -- da
// Tailwind Größen/Abstände in rem rechnet, schrumpfen Bedienelemente, Abstände
// UND Text proportional mit. Analog zu lib/theme: synchroner Boot in main.tsx
// (kein Umbau-Flackern), localStorage als schneller Spiegel, settings.json als
// Quelle der Wahrheit.

import type { UiDensity } from '@shared/types'

const STORAGE_KEY = 'av-density'

/** Dichte am <html> setzen (compact -> Klasse .ui-compact). */
export function applyDensity(density: UiDensity): void {
  document.documentElement.classList.toggle('ui-compact', density === 'compact')
}

/** Schneller Boot-Spiegel (localStorage) -- Quelle der Wahrheit bleibt settings.json. */
export function persistDensity(density: UiDensity): void {
  try {
    localStorage.setItem(STORAGE_KEY, density)
  } catch {
    // localStorage nicht verfügbar -> nur für diese Sitzung
  }
}

export function storedDensity(): UiDensity {
  try {
    if (localStorage.getItem(STORAGE_KEY) === 'compact') return 'compact'
  } catch {
    // ignorieren
  }
  return 'normal'
}
