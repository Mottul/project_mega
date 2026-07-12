import { lazy } from 'react'
import { PlaySquare } from 'lucide-react'
import type { ToolModule } from '../types'

export const videoPlayerTool: ToolModule = {
  id: 'video-player',
  name: 'LED-Trailer-Player',
  description:
    'Playlist-Player für den LED-Trailer (NovaStar) – drei feste Formate, Laufschrift, ' +
    'Medien auf Format einbacken (Fit-Modi, GPU), Vollbild-Ausgabe.',
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
    'konvertieren'
  ],
  component: lazy(() => import('./VideoPlayer').then((m) => ({ default: m.VideoPlayer })))
}
