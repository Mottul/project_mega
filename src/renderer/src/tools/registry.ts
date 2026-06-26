import { audioDelayTool } from './audio-delay'
import { cameraLensTool } from './camera-lens'
import { circleCalcTool } from './circle-calc'
import { dmxAddressTool } from './dmx-address'
import { hapConverterTool } from './hap-converter'
import { jinglePlayerTool } from './jingle-player'
import { ledWallTool } from './led-wall'
import { manualsTool } from './manuals'
import { novastarTool } from './novastar'
import { oscControlTool } from './osc-control'
import { packingListTool } from './packing-list'
import { powerLoadTool } from './power-load'
import { projectorLumenTool } from './projector-lumen'
import { riggingTool } from './rigging'
import { stageTimerTool } from './stage-timer'
import { testPatternsTool } from './test-patterns'
import { throwRatioTool } from './throw-ratio'
import { timecodeTool } from './timecode'
import { videoPlayerTool } from './video-player'
import { youtubeDlTool } from './youtube-dl'
import type { ToolModule } from './types'

// EINZIGE Stelle zum Eintragen neuer Tools.
export const tools: ToolModule[] = [
  hapConverterTool,
  manualsTool,
  testPatternsTool,
  videoPlayerTool,
  jinglePlayerTool,
  oscControlTool,
  novastarTool,
  youtubeDlTool,
  stageTimerTool,
  ledWallTool,
  packingListTool,
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

export function findTool(id: string): ToolModule | undefined {
  return tools.find((t) => t.id === id)
}
