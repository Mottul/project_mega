import { lazy } from 'react'
import { PlugZap } from 'lucide-react'
import type { ToolModule } from '../types'

export const powerLoadTool: ToolModule = {
  id: 'power-load',
  name: 'Stromlast & Absicherung',
  description: 'Leistung ↔ Strom, Geräte je Stromkreis',
  icon: PlugZap,
  category: 'rigging',
  keywords: [
    'strom',
    'leistung',
    'watt',
    'ampere',
    'absicherung',
    'sicherung',
    'stromkreis',
    'drehstrom',
    'cee',
    'schuko',
    'phase',
    'power',
    '16 a',
    '32 a',
    '63 a'
  ],
  component: lazy(() => import('./PowerLoad').then((m) => ({ default: m.PowerLoad })))
}
