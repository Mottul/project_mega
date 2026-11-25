import { lazy } from 'react'
import { Camera } from 'lucide-react'
import type { ToolModule } from '../types'

export const cameraLensTool: ToolModule = {
  id: 'camera-lens',
  name: 'Kameraobjektiv',
  description: 'Bildausschnitt aus Brennweite und Entfernung',
  icon: Camera,
  category: 'visual',
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
    'tele',
    'person'
  ],
  component: lazy(() => import('./CameraLens').then((m) => ({ default: m.CameraLens })))
}
