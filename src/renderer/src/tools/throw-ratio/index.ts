import { lazy } from 'react'
import { Projector } from 'lucide-react'
import type { ToolModule } from '../types'

export const throwRatioTool: ToolModule = {
  id: 'throw-ratio',
  name: 'Projektionsverhältnis',
  description: 'Throw Ratio, Bildmaße und Projektionsabstand – das passende Beamer-Objektiv wählen.',
  icon: Projector,
  category: 'calc',
  keywords: [
    'projektion',
    'throw ratio',
    'beamer',
    'projektor',
    'objektiv',
    'linse',
    'abstand',
    'bildbreite',
    'leinwand',
    'distanz'
  ],
  component: lazy(() => import('./ThrowRatio').then((m) => ({ default: m.ThrowRatio })))
}
