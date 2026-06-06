import { lazy } from 'react'
import { PlaySquare } from 'lucide-react'
import type { ToolModule } from '../types'

export const videoPlayerTool: ToolModule = {
  id: 'video-player',
  name: 'Video-Player',
  description:
    'Playlist-Player für LED-Wände/Beamer – Medien auf Wand-Auflösung einbacken (Fit-Modi, GPU), Vollbild-Ausgabe, Play/Pause/Skip/Seek/Loop/Shuffle.',
  icon: PlaySquare,
  category: 'media',
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
    'konvertieren'
  ],
  component: lazy(() => import('./VideoPlayer').then((m) => ({ default: m.VideoPlayer })))
}
