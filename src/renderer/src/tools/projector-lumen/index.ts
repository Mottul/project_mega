import { lazy } from 'react'
import { Lightbulb } from 'lucide-react'
import type { ToolModule } from '../types'

export const projectorLumenTool: ToolModule = {
  id: 'projector-lumen',
  name: 'Beamer-Lumen',
  description: 'Lumen-Bedarf aus Bildgröße und Umgebungslicht – und ob der vorhandene Beamer reicht.',
  icon: Lightbulb,
  category: 'calc',
  keywords: ['beamer', 'projektor', 'lumen', 'ansi', 'helligkeit', 'lux', 'leinwand', 'gain', 'projektion'],
  component: lazy(() => import('./ProjectorLumen').then((m) => ({ default: m.ProjectorLumen })))
}
