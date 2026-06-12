import { lazy } from 'react'
import { ClipboardList } from 'lucide-react'
import type { ToolModule } from '../types'

export const packingListTool: ToolModule = {
  id: 'packing-list',
  name: 'Packliste',
  description: 'Material-Checkliste mit Mengen – aus der LED-Wall-Konfiguration befüllbar, als PDF.',
  icon: ClipboardList,
  category: 'utility',
  keywords: ['packliste', 'checkliste', 'material', 'liste', 'verladung', 'case', 'inventar', 'pdf'],
  component: lazy(() => import('./PackingList').then((m) => ({ default: m.PackingList })))
}
