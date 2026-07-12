import { videoPlayerTool } from './video-player'
import type { ToolModule } from './types'

// stoffl-Branch: EIN Werkzeug -- der LED-Trailer-Player. Die übrigen Tools
// bleiben im Repo (Code unter tools/*), sind aber bewusst nicht registriert;
// die App startet direkt in dieses Tool (siehe App.tsx).
export const tools: ToolModule[] = [videoPlayerTool]

export function findTool(id: string): ToolModule | undefined {
  return tools.find((t) => t.id === id)
}
