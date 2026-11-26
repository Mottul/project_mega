import { lazy } from 'react'
import { Youtube } from 'lucide-react'
import type { ToolModule } from '../types'

export const youtubeDlTool: ToolModule = {
  id: 'youtube-dl',
  name: 'YouTube-Downloader',
  description: 'Videos und Audio mit yt-dlp laden',
  icon: Youtube,
  category: 'media',
  keywords: [
    'youtube',
    'download',
    'yt-dlp',
    'ytdlp',
    'video',
    'audio',
    'mp3',
    'mp4',
    'clip',
    'herunterladen',
    'm4a',
    'auflösungswahl',
    'queue'
  ],
  component: lazy(() =>
    import('./YoutubeDownloader').then((m) => ({ default: m.YoutubeDownloader }))
  )
}
