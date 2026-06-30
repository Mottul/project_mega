import { lazy } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import type { ToolModule } from '../types'

export const oscControlTool: ToolModule = {
  id: 'osc-control',
  name: 'OSC-Steuerung',
  description:
    'Frei belegbares Steuerpult (Fader/Taster/XY/Farbe), das OSC an MadMapper & Co. sendet – mit Feedback-Monitor.',
  icon: SlidersHorizontal,
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
    'udp'
  ],
  component: lazy(() => import('./OscControl').then((m) => ({ default: m.OscControl })))
}
