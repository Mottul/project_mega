// Auswahllisten und Anzeige-Helfer des Video-Generators (deutsche Namen; erlaubte Werte selbst
// stehen in shared/videoGenProject, damit main dieselben prüft).

import { CONVERT_FORMATS } from '@shared/convertPlan'
import { STILL_IMAGE_EXTENSIONS, VIDEO_EXTENSIONS } from '@shared/mediaExtensions'
import type { ConvertFormat, ConvertQuality, VgenElementKind } from '@shared/types'
import { VGEN_FORMATS } from '@shared/videoGenProject'

export const SIZE_PRESETS: { id: string; label: string; width: number; height: number }[] = [
  { id: 'hd', label: 'HD 1920 × 1080', width: 1920, height: 1080 },
  { id: '4k', label: '4K 3840 × 2160', width: 3840, height: 2160 },
  { id: 'portrait', label: 'Hochkant 1080 × 1920', width: 1080, height: 1920 },
  { id: '720p', label: '720p 1280 × 720', width: 1280, height: 720 }
]

export function sizePresetId(width: number, height: number): string {
  return SIZE_PRESETS.find((p) => p.width === width && p.height === height)?.id ?? 'custom'
}

export const FORMAT_OPTIONS: { value: ConvertFormat; label: string }[] = VGEN_FORMATS.map((f) => ({
  value: f,
  label: CONVERT_FORMATS[f].label
}))

export const QUALITY_OPTIONS: { value: ConvertQuality; label: string }[] = [
  { value: 'high', label: 'Hoch (größere Dateien)' },
  { value: 'standard', label: 'Standard' },
  { value: 'small', label: 'Klein (sichtbar weicher)' }
]

const STILL = new Set(STILL_IMAGE_EXTENSIONS)
const VIDEO = new Set(VIDEO_EXTENSIONS)

/** Art nach Endung (die Analyse entscheidet endgültig, z. B. GIF mit nur einem Bild). */
export function kindForPath(path: string): VgenElementKind | null {
  const i = path.lastIndexOf('.')
  const ext = i >= 0 ? path.slice(i + 1).toLowerCase() : ''
  if (STILL.has(ext)) return 'image'
  if (ext === 'gif') return 'gif'
  if (VIDEO.has(ext)) return 'video'
  return null
}

export const MEDIA_FILTER_EXTENSIONS = [...STILL_IMAGE_EXTENSIONS, 'gif', ...VIDEO_EXTENSIONS]

export const basename = (p: string): string => p.split(/[\\/]/).pop() ?? p

/** Dauer „1:05,2“ (Minuten:Sekunden, eine Nachkommastelle) bzw. „4,5 s“ unter einer Minute. */
export function fmtDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '–'
  const tenth = Math.round(sec * 10) / 10
  if (tenth < 60) return `${tenth.toLocaleString('de-DE', { maximumFractionDigits: 1 })} s`
  const m = Math.floor(tenth / 60)
  const s = tenth - m * 60
  const ss = s.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return `${m}:${s < 10 ? '0' : ''}${ss}`
}
