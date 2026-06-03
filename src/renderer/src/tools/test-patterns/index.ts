import { lazy } from 'react'
import { MonitorPlay } from 'lucide-react'
import type { ToolModule } from '../types'

export const testPatternsTool: ToolModule = {
  id: 'test-patterns',
  name: 'Testbildgenerator',
  description:
    'Testbilder für Beamer/LED-Wände/Displays – Vollbild auf gewähltem Monitor, PNG- und Video-Export.',
  icon: MonitorPlay,
  category: 'media',
  keywords: [
    'testbild',
    'test pattern',
    'gitter',
    'grid',
    'farbbalken',
    'smpte',
    'ebu',
    'kalibrierung',
    'geometrie',
    'konvergenz',
    'led',
    'beamer',
    'monitor',
    'pixelfehler'
  ],
  component: lazy(() => import('./TestPatterns').then((m) => ({ default: m.TestPatterns })))
}
