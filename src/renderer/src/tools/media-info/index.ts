import { lazy } from 'react'
import { FileSearch } from 'lucide-react'
import type { ToolModule } from '../types'

export const mediaInfoTool: ToolModule = {
  id: 'media-info',
  name: 'Medien-Info',
  description:
    'Video-Eckdaten per ffprobe: Auflösung, fps, Codec, Bitrate, Ton – mit Show-Check (Ampel) und Playlist-Vergleich.',
  icon: FileSearch,
  category: 'media',
  keywords: [
    'mediainfo',
    'medieninfo',
    'ffprobe',
    'metadaten',
    'analyse',
    'check',
    'info',
    'video',
    'audio',
    'auflösung',
    'aufloesung',
    'fps',
    'bildrate',
    'framerate',
    'bitrate',
    'codec',
    'container',
    'format',
    'interlaced',
    'vfr',
    'hdr',
    'alpha',
    'hap',
    'prores',
    'h264',
    'hevc',
    'timecode',
    'fat32',
    'usb',
    'led'
  ],
  component: lazy(() => import('./MediaInfo').then((m) => ({ default: m.MediaInfo })))
}
