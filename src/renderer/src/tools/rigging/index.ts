import { lazy } from 'react'
import { Weight } from 'lucide-react'
import type { ToolModule } from '../types'

export const riggingTool: ToolModule = {
  id: 'rigging',
  name: 'Rigging-Last',
  description:
    'Auflagerkräfte einer Traverse (2 Punkte) und Strangkräfte im Bridle nach Anschlagwinkel.',
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
    'kn'
  ],
  component: lazy(() => import('./Rigging').then((m) => ({ default: m.Rigging })))
}
