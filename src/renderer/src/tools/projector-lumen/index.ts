import { lazy } from 'react'
import { Lightbulb } from 'lucide-react'
import type { ToolModule } from '../types'

export const projectorLumenTool: ToolModule = {
  id: 'projector-lumen',
  name: 'Beamer-Lumen',
  description: 'Wie viel Lumen die Bildgröße braucht',
  icon: Lightbulb,
  category: 'visual',
  keywords: [
    'beamer',
    'projektor',
    'lumen',
    'ansi',
    'helligkeit',
    'lux',
    'leinwand',
    'gain',
    'projektion',
    'lumen-bedarf',
    'umgebungslicht'
  ],
  component: lazy(() => import('./ProjectorLumen').then((m) => ({ default: m.ProjectorLumen })))
}
