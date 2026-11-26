import { lazy } from 'react'
import { SlidersVertical } from 'lucide-react'
import type { ToolModule } from '../types'

export const atemControlTool: ToolModule = {
  id: 'atem-control',
  name: 'ATEM-Steuerung',
  description: 'Blackmagic-Mischer vom Laptop bedienen',
  icon: SlidersVertical,
  category: 'control',
  keywords: [
    'atem',
    'blackmagic',
    'bmd',
    'mischer',
    'bildmischer',
    'videomischer',
    'switcher',
    'vision mixer',
    'programm',
    'program',
    'vorschau',
    'preview',
    'cut',
    'auto',
    'übergang',
    'transition',
    'hebel',
    't-bar',
    'fade to black',
    'ftb',
    'tally',
    'mini extreme',
    'constellation',
    'probebetrieb',
    'simulator'
  ],
  component: lazy(() => import('./AtemControl').then((m) => ({ default: m.AtemControl })))
}
