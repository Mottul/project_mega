import { audioDelayTool } from './audio-delay'
import { circleCalcTool } from './circle-calc'
import { dmxAddressTool } from './dmx-address'
import { hapConverterTool } from './hap-converter'
import { ledWallTool } from './led-wall'
import { manualsTool } from './manuals'
import { powerLoadTool } from './power-load'
import { projectorLumenTool } from './projector-lumen'
import { riggingTool } from './rigging'
import { stageTimerTool } from './stage-timer'
import { testPatternsTool } from './test-patterns'
import { throwRatioTool } from './throw-ratio'
import { timecodeTool } from './timecode'
import { videoPlayerTool } from './video-player'
import type { ToolModule } from './types'

// EINZIGE Stelle zum Eintragen neuer Tools.
export const tools: ToolModule[] = [
  hapConverterTool,
  manualsTool,
  testPatternsTool,
  videoPlayerTool,
  stageTimerTool,
  ledWallTool,
  circleCalcTool,
  throwRatioTool,
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
