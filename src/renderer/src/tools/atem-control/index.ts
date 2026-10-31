import { lazy } from 'react'
import { SlidersVertical } from 'lucide-react'
import type { ToolModule } from '../types'

export const atemControlTool: ToolModule = {
  id: 'atem-control',
  name: 'ATEM-Steuerung',
  description:
    'Blackmagic-ATEM-Mischer vom Laptop bedienen: Programm, Vorschau, Cut, Auto, Hebel und Fade to Black. Mit Probebetrieb ohne Gerät.',
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
