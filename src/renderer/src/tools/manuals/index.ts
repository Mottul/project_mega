import { lazy } from 'react'
import { BookOpen } from 'lucide-react'
import type { ToolModule } from '../types'

export const manualsTool: ToolModule = {
  id: 'manuals',
  name: 'Manuals-Bibliothek',
  description: 'Geräte-Handbücher importieren und per Volltextsuche offline durchsuchen.',
  icon: BookOpen,
  category: 'database',
  keywords: ['manual', 'handbuch', 'pdf', 'suche', 'bibliothek', 'doku', 'datenblatt'],
  component: lazy(() => import('./ManualsLibrary').then((m) => ({ default: m.ManualsLibrary })))
}
