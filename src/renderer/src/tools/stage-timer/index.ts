import { lazy } from 'react'
import { Timer } from 'lucide-react'
import type { ToolModule } from '../types'

export const stageTimerTool: ToolModule = {
  id: 'stage-timer',
  name: 'Stage-Timer & Uhr',
  description: 'Sprechzeit-Timer und Uhr für die Bühne',
  icon: Timer,
  category: 'playback',
  keywords: [
    'timer',
    'sprechzeit',
    'countdown',
    'redner',
    'speaker',
    'uhr',
    'clock',
    'sekunden',
    'bühne',
    'buehne',
    'stage',
    'nachricht',
    'vortrag',
    'abschnitte',
    'farbwarnung',
    'nachrichten',
    'vollbild',
    'anzeige'
  ],
  component: lazy(() => import('./StageTimer').then((m) => ({ default: m.StageTimer })))
}
