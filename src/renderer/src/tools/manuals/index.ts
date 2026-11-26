import { lazy } from 'react'
import { BookOpen } from 'lucide-react'
import type { ToolModule } from '../types'

export const manualsTool: ToolModule = {
  id: 'manuals',
  name: 'Manuals-Bibliothek',
  description: 'Handbücher offline durchsuchen',
  icon: BookOpen,
  category: 'media',
  keywords: [
    'manual',
    'handbuch',
    'pdf',
    'suche',
    'bibliothek',
    'doku',
    'datenblatt',
    'geräte-handbücher',
    'importieren',
    'volltextsuche'
  ],
  component: lazy(() => import('./ManualsLibrary').then((m) => ({ default: m.ManualsLibrary })))
}
