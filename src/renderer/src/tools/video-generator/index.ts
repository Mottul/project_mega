import { lazy } from 'react'
import { Images } from 'lucide-react'
import type { ToolModule } from '../types'

export const videoGeneratorTool: ToolModule = {
  id: 'video-generator',
  name: 'Video-Generator',
  description:
    'Bilder und Videos zu einem Video: Diashow mit Ken Burns, Übergängen, Musik und nahtloser Schleife.',
  icon: Images,
  category: 'media',
  keywords: [
    'diashow',
    'slideshow',
    'montage',
    'ken burns',
    'fotos',
    'bilder',
    'übergang',
    'überblenden',
    'schleife',
    'loop',
    'sponsor',
    'sponsorloop',
    'musik',
    'zusammenfügen',
    'zusammenschnitt',
    'gala',
    'hochzeit',
    'video erstellen'
  ],
  component: lazy(() => import('./VideoGenerator').then((m) => ({ default: m.VideoGenerator })))
}
