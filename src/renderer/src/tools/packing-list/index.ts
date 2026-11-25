import { lazy } from 'react'
import { ListChecks } from 'lucide-react'
import type { ToolModule } from '../types'

export const packingListTool: ToolModule = {
  id: 'packing-list',
  name: 'Packliste',
  description: 'Material-Checkliste, auch aus der LED-Wall',
  icon: ListChecks,
  category: 'rigging',
  keywords: [
    'packliste',
    'checkliste',
    'material',
    'liste',
    'verladung',
    'case',
    'inventar',
    'pdf',
    'mengen',
    'konfiguration'
  ],
  component: lazy(() => import('./PackingList').then((m) => ({ default: m.PackingList })))
}
