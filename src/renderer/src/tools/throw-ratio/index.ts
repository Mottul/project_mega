import { lazy } from 'react'
import { Projector } from 'lucide-react'
import type { ToolModule } from '../types'

export const throwRatioTool: ToolModule = {
  id: 'throw-ratio',
  name: 'Projektionsverhältnis',
  description: 'Abstand, Bildgröße und Objektiv des Beamers',
  icon: Projector,
  category: 'visual',
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
    'distanz',
    'bildmaße',
    'projektionsabstand'
  ],
  component: lazy(() => import('./ThrowRatio').then((m) => ({ default: m.ThrowRatio })))
}
