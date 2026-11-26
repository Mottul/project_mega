import { lazy } from 'react'
import { AudioLines } from 'lucide-react'
import type { ToolModule } from '../types'

export const audioDelayTool: ToolModule = {
  id: 'audio-delay',
  name: 'Audio-Delay & SPL',
  description: 'Laufzeit und Pegelabfall über die Distanz',
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
    'delayline',
    'schalldruck',
    'entfernung'
  ],
  component: lazy(() => import('./AudioDelay').then((m) => ({ default: m.AudioDelay })))
}
