import { lazy } from 'react'
import { Tv } from 'lucide-react'
import type { ToolModule } from '../types'

export const novastarTool: ToolModule = {
  id: 'novastar',
  name: 'NovaStar-Steuerung',
  description:
    'NovaPro UHD Jr & Co. über Netzwerk (TCP) steuern: Helligkeit, Fade-to-Black, Roh-Befehle. Vorabversion.',
  icon: Tv,
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
    'tcp'
  ],
  component: lazy(() => import('./Novastar').then((m) => ({ default: m.Novastar })))
}
