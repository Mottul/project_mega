import { lazy } from 'react'
import { Weight } from 'lucide-react'
import type { ToolModule } from '../types'

export const riggingTool: ToolModule = {
  id: 'rigging',
  name: 'Rigging-Last',
  description: 'Auflager- und Bridle-Kräfte an der Traverse',
  icon: Weight,
  category: 'rigging',
  keywords: [
    'rigging',
    'traverse',
    'truss',
    'last',
    'auflager',
    'hängepunkt',
    'haengepunkt',
    'bridle',
    'anschlagmittel',
    'stropp',
    'winkel',
    'kn',
    'auflagerkräfte',
    'strangkräfte',
    'anschlagwinkel'
  ],
  component: lazy(() => import('./Rigging').then((m) => ({ default: m.Rigging })))
}
