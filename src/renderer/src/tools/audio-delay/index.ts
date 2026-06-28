import { lazy } from 'react'
import { AudioLines } from 'lucide-react'
import type { ToolModule } from '../types'

export const audioDelayTool: ToolModule = {
  id: 'audio-delay',
  name: 'Audio-Delay & SPL',
  description:
    'Lautsprecher-Laufzeit (Delay) aus Distanz und Schalldruck-Abfall über die Entfernung.',
  icon: AudioLines,
  category: 'calc',
  keywords: [
    'audio',
    'delay',
    'laufzeit',
    'verzögerung',
    'spl',
    'pegel',
    'db',
    'lautsprecher',
    'schall',
    'distanz',
    'delayline'
  ],
  component: lazy(() => import('./AudioDelay').then((m) => ({ default: m.AudioDelay })))
}
