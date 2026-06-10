import { lazy } from 'react'
import { Zap } from 'lucide-react'
import type { ToolModule } from '../types'

export const powerLoadTool: ToolModule = {
  id: 'power-load',
  name: 'Stromlast & Absicherung',
  description: 'Leistung ↔ Strom (1∼/3∼) und wie viele Geräte auf einen 16/32/63-A-Stromkreis passen.',
  icon: Zap,
  category: 'calc',
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
    'power'
  ],
  component: lazy(() => import('./PowerLoad').then((m) => ({ default: m.PowerLoad })))
}
