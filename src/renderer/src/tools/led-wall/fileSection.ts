// Anbindung des LED-Wall-Konfigurators an die Projektdatei (Abschnitt „ledWall“): Optionen für
// useProjectFile. Beim Übernehmen werden die Raster gleich auf die Modulzahl gebracht – sonst
// machte ensureGridSize die Datei direkt nach dem Öffnen „ungespeichert“.

import type { ProjectFileOptions } from '@renderer/lib/projectFile'
import { computeWall } from './compute'
import {
  DEFAULT_LED_WALL_CONFIG,
  describePlanning,
  FIRST_WALL_ID,
  GRID_SIDE_MAX,
  isDefaultFileData,
  LED_WALL_SECTION_VERSION,
  ledWallFileData,
  wallLabel,
  wallsOf,
  type LedWallConfig
} from './config'
import { resizeGrid } from './math'
import { ledWallFile, plannedWalls, useLedWall } from './store'

/** Planung mit Rastern in der Größe, die Modul und Maße ergeben. */
export function withFittedGrids(c: LedWallConfig): LedWallConfig {
  const d = computeWall(c)
  return { ...c, sig: resizeGrid(c.sig, d.rows, d.cols), pwr: resizeGrid(c.pwr, d.rows, d.cols) }
}

type State = ReturnType<typeof useLedWall.getState>

const blankWall = (): { id: string; name: string; config: LedWallConfig } => ({
  id: FIRST_WALL_ID,
  name: wallLabel(0),
  config: withFittedGrids(DEFAULT_LED_WALL_CONFIG)
})

export const LED_WALL_FILE: ProjectFileOptions<State> = {
  section: 'ledWall',
  version: LED_WALL_SECTION_VERSION,
  label: 'LED-Wall-Planung',
  store: useLedWall,
  data: (s) => ledWallFile(s),
  binding: (s) => s.file,
  setBinding: (b) => useLedWall.getState().setFile(b),
  apply: (data) => {
    if (!data || typeof data !== 'object') return false
    // bis Version 2 eine Wand, ab 3 die Liste; fehlende Felder ergänzt sanitize
    const p = wallsOf(data)
    if (!p) return false
    // Maße aus einer fremden Datei, die eine riesige Wand ergeben (500000 m), nicht anlegen –
    // der Renderer hinge an Millionen Modulen. Auch in Summe: 20 Wände an der Grenze wären
    // 20 Mio. Zellen.
    let cells = 0
    for (const w of p.walls) {
      const d = computeWall(w.config)
      if (!(d.rows <= GRID_SIDE_MAX && d.cols <= GRID_SIDE_MAX)) return false
      cells += d.rows * d.cols
    }
    if (!(cells <= GRID_SIDE_MAX * GRID_SIDE_MAX)) return false
    useLedWall.getState().replacePlanning({
      ...p,
      walls: p.walls.map((w) => ({ ...w, config: withFittedGrids(w.config) }))
    })
    return true
  },
  reset: () =>
    useLedWall
      .getState()
      .replacePlanning({ projectName: '', customerName: '', walls: [blankWall()] }),
  blank: () => ledWallFileData('', '', [blankWall()]),
  isEmpty: (s) => isDefaultFileData(plannedWalls(s)),
  suggestedName: (s) => s.projectName.trim() || s.customerName.trim() || 'LED-Wall',
  describe: describePlanning
}
