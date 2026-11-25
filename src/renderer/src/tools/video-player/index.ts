import { lazy } from 'react'
import { PlaySquare } from 'lucide-react'
import type { ToolModule } from '../types'

export const videoPlayerTool: ToolModule = {
  id: 'video-player',
  name: 'Video-Player',
  description: 'Playlist-Player für LED-Wand und Beamer',
  icon: PlaySquare,
  category: 'playback',
  keywords: [
    'player',
    'videoplayer',
    'led',
    'led-wand',
    'led wall',
    'playlist',
    'medienserver',
    'beamer',
    'wiedergabe',
    'loop',
    'vollbild',
    'blur',
    'fit',
    'konvertieren',
    'einbacken',
    'auflösung',
    'gpu',
    'ausgabe',
    'pause',
    'skip',
    'seek',
    'shuffle'
  ],
  component: lazy(() => import('./VideoPlayer').then((m) => ({ default: m.VideoPlayer })))
}
