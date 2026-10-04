import { lazy } from 'react'
import { FileCog } from 'lucide-react'
import type { ToolModule } from '../types'

// id bleibt 'hap-converter' (früherer Name): gespeicherte Favoriten, Kiosk-Freigaben,
// Fenster-/Seitenleisten-Zustände und Übergaben hängen an der id.
export const hapConverterTool: ToolModule = {
  id: 'hap-converter',
  name: 'Video-Konverter',
  description:
    'Clips passend fürs Zielsystem: HAP für Medienserver, H.264 für Player-Boxen, ProRes für QLab – mit Deinterlace, Bildraten-Raster und HDR → SDR.',
  icon: FileCog,
  category: 'media',
  keywords: [
    'hap',
    'hap q',
    'h264',
    'h265',
    'hevc',
    'prores',
    'wav',
    'video',
    'konverter',
    'konvertieren',
    'umwandeln',
    'transcode',
    'encode',
    'madmapper',
    'resolume',
    'qlab',
    'usb',
    'deinterlace'
  ],
  component: lazy(() => import('./VideoConverter').then((m) => ({ default: m.VideoConverter })))
}
