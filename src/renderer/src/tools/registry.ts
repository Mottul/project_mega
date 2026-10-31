import { atemControlTool } from './atem-control'
import { audioDelayTool } from './audio-delay'
import { cameraLensTool } from './camera-lens'
import { circleCalcTool } from './circle-calc'
import { dmxAddressTool } from './dmx-address'
import { hapConverterTool } from './hap-converter'
import { jinglePlayerTool } from './jingle-player'
import { ledWallTool } from './led-wall'
import { manualsTool } from './manuals'
import { mediaInfoTool } from './media-info'
import { netscanTool } from './netscan'
import { novastarTool } from './novastar'
import { oscControlTool } from './osc-control'
import { packingListTool } from './packing-list'
import { miniManualTool } from './mini-manual'
import { powerLoadTool } from './power-load'
import { projectorLumenTool } from './projector-lumen'
import { riggingTool } from './rigging'
import { stageTimerTool } from './stage-timer'
import { testPatternsTool } from './test-patterns'
import { throwRatioTool } from './throw-ratio'
import { rtaTool } from './rta'
import { timecodeTool } from './timecode'
import { videoGeneratorTool } from './video-generator'
import { videoPlayerTool } from './video-player'
import { youtubeDlTool } from './youtube-dl'
import type { ToolModule } from './types'

// EINZIGE Stelle zum Eintragen neuer Tools.
export const tools: ToolModule[] = [
  hapConverterTool,
  videoGeneratorTool,
  mediaInfoTool,
  manualsTool,
  testPatternsTool,
  videoPlayerTool,
  jinglePlayerTool,
  oscControlTool,
  novastarTool,
  atemControlTool,
  netscanTool,
  youtubeDlTool,
  stageTimerTool,
  ledWallTool,
  packingListTool,
  miniManualTool,
  circleCalcTool,
  throwRatioTool,
  cameraLensTool,
  projectorLumenTool,
  dmxAddressTool,
  powerLoadTool,
  audioDelayTool,
  rtaTool,
  riggingTool,
  timecodeTool
]

export function findTool(id: string): ToolModule | undefined {
  return tools.find((t) => t.id === id)
}
