import { lazy } from 'react'
import { Camera } from 'lucide-react'
import type { ToolModule } from '../types'

export const cameraLensTool: ToolModule = {
  id: 'camera-lens',
  name: 'Kameraobjektiv',
  description:
    'Brennweite, Sensor & Entfernung → Bildausschnitt: wie viel einer Person bei maximalem Zoom ins Bild passt.',
  icon: Camera,
  category: 'calc',
  keywords: [
    'kamera',
    'objektiv',
    'brennweite',
    'zoom',
    'telekonverter',
    'doppler',
    'sensor',
    'crop',
    'bildwinkel',
    'bildausschnitt',
    'field of view',
    'fov',
    'entfernung',
    'ptz',
    'tele'
  ],
  component: lazy(() => import('./CameraLens').then((m) => ({ default: m.CameraLens })))
}
