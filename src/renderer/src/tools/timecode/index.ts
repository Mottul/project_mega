import { lazy } from 'react'
import { Clapperboard } from 'lucide-react'
import type { ToolModule } from '../types'

export const timecodeTool: ToolModule = {
  id: 'timecode',
  name: 'Timecode-Rechner',
  description: 'SMPTE-Timecode ↔ Frames ↔ Echtzeit (inkl. Drop-Frame) und Dauer zwischen In/Out.',
  icon: Clapperboard,
  category: 'calc',
  keywords: [
    'timecode',
    'smpte',
    'ltc',
    'frames',
    'fps',
    'drop frame',
    'dropframe',
    'ndf',
    'df',
    '29.97',
    '23.976',
    'dauer',
    'in out'
  ],
  component: lazy(() => import('./Timecode').then((m) => ({ default: m.Timecode })))
}
