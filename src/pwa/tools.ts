// Die Werkzeuge der Rechner-PWA: genau die kleinen Werkzeuge der App (SMALL_TOOLS), dieselben
// Module wie im Desktop-Launcher. Bewusst eine eigene Liste statt tools/registry: Die Registry
// zieht jedes Werkzeug samt seiner Chunks in den Build – die großen brauchen Electron und hätten
// im Browser nichts verloren. Dass beide Listen übereinstimmen, prüft tools.test.ts; dass kein
// Rechner Electron braucht, prüft der Build (vite.pwa.config.ts bricht bei api/settings ab).
import { audioDelayTool } from '@renderer/tools/audio-delay'
import { cameraLensTool } from '@renderer/tools/camera-lens'
import { circleCalcTool } from '@renderer/tools/circle-calc'
import { dmxAddressTool } from '@renderer/tools/dmx-address'
import { powerLoadTool } from '@renderer/tools/power-load'
import { projectorLumenTool } from '@renderer/tools/projector-lumen'
import { riggingTool } from '@renderer/tools/rigging'
import { throwRatioTool } from '@renderer/tools/throw-ratio'
import { timecodeTool } from '@renderer/tools/timecode'
import type { ToolModule } from '@renderer/tools/types'

/** Reihenfolge = Startseite der PWA (wie in der Desktop-Registry) */
export const PWA_TOOLS: ToolModule[] = [
  circleCalcTool,
  throwRatioTool,
  cameraLensTool,
  projectorLumenTool,
  dmxAddressTool,
  powerLoadTool,
  audioDelayTool,
  riggingTool,
  timecodeTool
]

export function findPwaTool(id: string | undefined): ToolModule | undefined {
  return PWA_TOOLS.find((t) => t.id === id)
}
