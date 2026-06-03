import { hapConverterTool } from './hap-converter'
import { manualsTool } from './manuals'
import { testPatternsTool } from './test-patterns'
import type { ToolModule } from './types'

// EINZIGE Stelle zum Eintragen neuer Tools.
export const tools: ToolModule[] = [hapConverterTool, manualsTool, testPatternsTool]

export function findTool(id: string): ToolModule | undefined {
  return tools.find((t) => t.id === id)
}
