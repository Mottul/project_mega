import { lazy } from 'react'
import { Music } from 'lucide-react'
import type { ToolModule } from '../types'

export const jinglePlayerTool: ToolModule = {
  id: 'jingle-player',
  name: 'Jingle-Player',
  description: 'Kurze Audios auf Pads, mit Hotkeys',
  icon: Music,
  category: 'playback',
  keywords: [
    'jingle',
    'soundboard',
    'pad',
    'audio',
    'stinger',
    'auftrittsmusik',
    'walk-in',
    'sample',
    'hotkey',
    'einspieler',
    'ausgabegerät',
    'fade'
  ],
  component: lazy(() => import('./JinglePlayer').then((m) => ({ default: m.JinglePlayer })))
}
