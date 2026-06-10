import { audioDelayTool } from './audio-delay'
import { circleCalcTool } from './circle-calc'
import { dmxAddressTool } from './dmx-address'
import { hapConverterTool } from './hap-converter'
import { manualsTool } from './manuals'
import { powerLoadTool } from './power-load'
import { testPatternsTool } from './test-patterns'
import { throwRatioTool } from './throw-ratio'
import { videoPlayerTool } from './video-player'
import type { ToolModule } from './types'

// EINZIGE Stelle zum Eintragen neuer Tools.
export const tools: ToolModule[] = [
  hapConverterTool,
  manualsTool,
  testPatternsTool,
  videoPlayerTool,
  circleCalcTool,
  throwRatioTool,
  dmxAddressTool,
  powerLoadTool,
  audioDelayTool
]

export function findTool(id: string): ToolModule | undefined {
  return tools.find((t) => t.id === id)
}
