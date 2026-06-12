import { lazy } from 'react'
import { Youtube } from 'lucide-react'
import type { ToolModule } from '../types'

export const youtubeDlTool: ToolModule = {
  id: 'youtube-dl',
  name: 'YouTube-Downloader',
  description: 'Videos/Audio per yt-dlp herunterladen (MP4/MP3/M4A), mit Auflösungswahl und Queue.',
  icon: Youtube,
  category: 'media',
  keywords: ['youtube', 'download', 'yt-dlp', 'ytdlp', 'video', 'audio', 'mp3', 'mp4', 'clip', 'herunterladen'],
  component: lazy(() => import('./YoutubeDownloader').then((m) => ({ default: m.YoutubeDownloader })))
}
