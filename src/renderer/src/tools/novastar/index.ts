import { lazy } from 'react'
import { MonitorCog } from 'lucide-react'
import type { ToolModule } from '../types'

export const novastarTool: ToolModule = {
  id: 'novastar',
  name: 'NovaStar-Steuerung',
  description: 'LED-Prozessor steuern: Helligkeit, Presets',
  icon: MonitorCog,
  category: 'control',
  keywords: [
    'novastar',
    'novapro',
    'uhd jr',
    'led',
    'prozessor',
    'processor',
    'helligkeit',
    'brightness',
    'fade to black',
    'ftb',
    'blackout',
    'tcp',
    'netzwerk',
    'roh-befehle',
    'vorabversion'
  ],
  component: lazy(() => import('./Novastar').then((m) => ({ default: m.Novastar })))
}
