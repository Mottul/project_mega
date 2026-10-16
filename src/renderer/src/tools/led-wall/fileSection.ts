// Anbindung des LED-Wall-Konfigurators an die Projektdatei (Abschnitt „ledWall“): Optionen für
// useProjectFile. Beim Übernehmen werden die Raster gleich auf die Modulzahl gebracht – sonst
// machte ensureGridSize die Datei direkt nach dem Öffnen „ungespeichert“.

import type { ProjectFileOptions } from '@renderer/lib/projectFile'
import { computeWall } from './compute'
import {
  DEFAULT_LED_WALL_CONFIG,
  describePlanning,
  GRID_SIDE_MAX,
  isDefaultPlanning,
  LED_WALL_SECTION_VERSION,
  ledWallSection,
  sanitizeLedWallConfig,
  type LedWallConfig
} from './config'
import { resizeGrid } from './math'
import { useLedWall } from './store'

/** Planung mit Rastern in der Größe, die Modul und Maße ergeben. */
export function withFittedGrids(c: LedWallConfig): LedWallConfig {
  const d = computeWall(c)
  return { ...c, sig: resizeGrid(c.sig, d.rows, d.cols), pwr: resizeGrid(c.pwr, d.rows, d.cols) }
}

type State = ReturnType<typeof useLedWall.getState>

export const LED_WALL_FILE: ProjectFileOptions<State> = {
  section: 'ledWall',
  version: LED_WALL_SECTION_VERSION,
  label: 'LED-Wall-Planung',
  store: useLedWall,
  data: (s) => ledWallSection(s),
  binding: (s) => s.file,
  setBinding: (b) => useLedWall.getState().setFile(b),
  apply: (data) => {
    if (!data || typeof data !== 'object') return false
    // Version 1 und 2 haben dieselbe Grundform; fehlende Felder ergänzt sanitize
    const c = sanitizeLedWallConfig(data)
    // Maße aus einer fremden Datei, die eine riesige Wand ergeben (500000 m), nicht anlegen –
    // der Renderer hinge an Millionen Modulen
    const d = computeWall(c)
    if (!(d.rows <= GRID_SIDE_MAX && d.cols <= GRID_SIDE_MAX)) return false
    useLedWall.getState().replaceConfig(withFittedGrids(c))
    return true
  },
  reset: () => useLedWall.getState().replaceConfig(withFittedGrids(DEFAULT_LED_WALL_CONFIG)),
  blank: () => ledWallSection(withFittedGrids(DEFAULT_LED_WALL_CONFIG)),
  isEmpty: (s) => isDefaultPlanning(s),
  suggestedName: (s) => s.projectName.trim() || s.customerName.trim() || 'LED-Wall',
  describe: describePlanning
}
