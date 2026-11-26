import { lazy } from 'react'
import { SlidersVertical } from 'lucide-react'
import type { ToolModule } from '../types'

export const oscControlTool: ToolModule = {
  id: 'osc-control',
  name: 'OSC-Steuerung',
  description: 'Frei belegbares Pult, sendet OSC',
  icon: SlidersVertical,
  category: 'control',
  keywords: [
    'osc',
    'madmapper',
    'mad mapper',
    'mapping',
    'projektion',
    'vj',
    'resolume',
    'qlab',
    'fader',
    'steuerung',
    'control',
    'surface',
    'pult',
    'udp',
    'steuerpult',
    'taster',
    'xy',
    'farbe',
    'feedback-monitor'
  ],
  component: lazy(() => import('./OscControl').then((m) => ({ default: m.OscControl })))
}
