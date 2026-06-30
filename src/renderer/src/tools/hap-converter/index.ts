import { lazy } from 'react'
import { FileVideo } from 'lucide-react'
import type { ToolModule } from '../types'

export const hapConverterTool: ToolModule = {
  id: 'hap-converter',
  name: 'HAP-Konverter',
  description: 'Videos im Batch nach HAP / HAP Q / HAP Alpha konvertieren (z.B. für MadMapper).',
  icon: FileVideo,
  category: 'media',
  keywords: [
    'hap',
    'video',
    'konverter',
    'madmapper',
    'resolume',
    'codec',
    'mov',
    'snappy',
    'encode'
  ],
  component: lazy(() => import('./HapConverter').then((m) => ({ default: m.HapConverter })))
}
