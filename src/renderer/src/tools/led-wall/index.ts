import { lazy } from 'react'
import { Grid3x3 } from 'lucide-react'
import type { ToolModule } from '../types'

export const ledWallTool: ToolModule = {
  id: 'led-wall',
  name: 'LED-Wall-Konfigurator',
  description: 'Wand planen: Auflösung, Strom, Verkabelung',
  icon: Grid3x3,
  category: 'visual',
  keywords: [
    'led',
    'ledwall',
    'wall',
    'wand',
    'konfigurator',
    'modul',
    'pixelpitch',
    'curving',
    'ballast',
    'verkabelung',
    'us2',
    'auflösung',
    'aufloesung',
    '16:9',
    'signal',
    'pdf',
    'doku'
  ],
  component: lazy(() => import('./LedWall').then((m) => ({ default: m.LedWall })))
}
