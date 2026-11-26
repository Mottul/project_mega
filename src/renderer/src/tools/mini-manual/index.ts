import { lazy } from 'react'
import { BookOpenCheck } from 'lucide-react'
import type { ToolModule } from '../types'

export const miniManualTool: ToolModule = {
  id: 'mini-manual',
  name: 'Mini-Manual',
  description: 'Kurz-Anleitung und Fehlersuche als PDF',
  icon: BookOpenCheck,
  category: 'rigging',
  keywords: [
    'anleitung',
    'kunde',
    'übergabe',
    'bedienung',
    'fehlersuche',
    'handbuch',
    'kurzkarte',
    'manual',
    'troubleshooting',
    'led-wand',
    'led wall',
    'pdf',
    'lehrling',
    'kurz-anleitungen',
    'vor ort',
    'schritt für schritt'
  ],
  component: lazy(() => import('./MiniManual').then((m) => ({ default: m.MiniManual })))
}
