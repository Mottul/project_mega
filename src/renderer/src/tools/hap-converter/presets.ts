// Zielsystem-Vorgaben und Auswahllisten des Video-Konverters. Die Zielsysteme sind
// dieselben wie im Prüfprofil der Medien-Info – eine Vorgabe setzt Format, Größe und
// Ton; alles bleibt danach frei änderbar.

import type {
  ConvertFit,
  ConvertFormat,
  ConvertFps,
  ConvertOptions,
  ConvertRaster,
  ConvertSize
} from '@shared/types'

export type ConverterTarget = 'mediaserver' | 'usb' | 'mac' | 'laptop' | 'general' | 'custom'

export const TARGETS: { value: ConverterTarget; label: string; hint: string }[] = [
  {
    value: 'mediaserver',
    label: 'Medienserver (Resolume, MadMapper, Millumin …)',
    hint: 'HAP Q: GPU-Codec – flüssiges Scrubbing, viele Layer, Transparenz als HAP Alpha.'
  },
  {
    value: 'usb',
    label: 'USB-/LED-Player, Beamer/TV per USB',
    hint: 'H.264 bis 1080p (Level 4.2, Bitraten-Deckel) mit Stereo-Ton – das schaffen fast alle Player-Boxen.'
  },
  {
    value: 'mac',
    label: 'QLab / macOS',
    hint: 'ProRes 422: ruckelfrei in QLab und Keynote, Transparenz als ProRes 4444.'
  },
  {
    value: 'laptop',
    label: 'Laptop-Playout (Mottulbox-Player, VLC, PowerPoint)',
    hint: 'H.264 in hoher Qualität.'
  },
  {
    value: 'general',
    label: 'Weitergabe / Allgemein',
    hint: 'H.264 – spielt praktisch überall.'
  },
  { value: 'custom', label: 'Eigene Einstellungen', hint: '' }
]

export const FORMAT_GROUPS: {
  label: string
  options: { value: ConvertFormat; label: string }[]
}[] = [
  {
    label: 'HAP (Medienserver)',
    options: [
      { value: 'hap_q', label: 'HAP Q (beste Qualität)' },
      { value: 'hap', label: 'HAP (kleiner)' },
      { value: 'hap_alpha', label: 'HAP Alpha (mit Transparenz)' }
    ]
  },
  {
    label: 'H.264 / H.265',
    options: [
      { value: 'h264', label: 'H.264 (MP4) – spielt überall' },
      { value: 'hevc', label: 'H.265 (MP4) – kleinere Dateien' }
    ]
  },
  {
    label: 'ProRes (QLab, Schnitt)',
    options: [
      { value: 'prores_proxy', label: 'ProRes 422 Proxy' },
      { value: 'prores_lt', label: 'ProRes 422 LT' },
      { value: 'prores_422', label: 'ProRes 422' },
      { value: 'prores_hq', label: 'ProRes 422 HQ' },
      { value: 'prores_4444', label: 'ProRes 4444 (mit Transparenz)' }
    ]
  },
  { label: 'Ton', options: [{ value: 'wav', label: 'WAV – nur Ton' }] }
]

export const DEFAULT_OPTIONS: ConvertOptions = {
  format: 'hap_q',
  quality: 'standard',
  compat: false,
  keepAlpha: true,
  size: { mode: 'original' },
  fps: { mode: 'original' },
  deinterlace: true,
  toSdr: true,
  audio: 'auto',
  hapCompressor: 'snappy',
  hapChunks: { kind: 'auto' }
}

/** Vorgabe eines Zielsystems (Bildrate, Halbbilder, HDR und HAP-Details bleiben). */
export function presetOptions(target: ConverterTarget, cur: ConvertOptions): ConvertOptions {
  const original: ConvertSize = { mode: 'original' }
  switch (target) {
    case 'mediaserver':
      return {
        ...cur,
        format: 'hap_q',
        keepAlpha: true,
        compat: false,
        size: original,
        audio: 'auto'
      }
    case 'usb':
      return {
        ...cur,
        format: 'h264',
        quality: 'standard',
        compat: true,
        size: { mode: 'max', width: 1920, height: 1080 },
        audio: 'stereo'
      }
    case 'mac':
      return {
        ...cur,
        format: 'prores_422',
        keepAlpha: true,
        compat: false,
        size: original,
        audio: 'auto'
      }
    case 'laptop':
      return {
        ...cur,
        format: 'h264',
        quality: 'high',
        compat: false,
        size: original,
        audio: 'auto'
      }
    case 'general':
      return {
        ...cur,
        format: 'h264',
        quality: 'standard',
        compat: false,
        size: original,
        audio: 'auto'
      }
    default:
      return cur
  }
}

/* ------------------------ Auswahl <-> Optionen (select) ------------------------ */

export const SIZE_CHOICES: { value: string; label: string }[] = [
  { value: 'original', label: 'Original' },
  { value: 'max-3840', label: 'höchstens 3840 × 2160 (UHD)' },
  { value: 'max-1920', label: 'höchstens 1920 × 1080' },
  { value: 'max-1280', label: 'höchstens 1280 × 720' },
  { value: 'exact', label: 'genau … (Wand/Leinwand)' }
]

export function sizeChoice(s: ConvertSize): string {
  if (s.mode === 'max') return `max-${Math.max(s.width, s.height)}`
  return s.mode
}

export function sizeFromChoice(choice: string, cur: ConvertSize): ConvertSize {
  if (choice === 'max-3840') return { mode: 'max', width: 3840, height: 2160 }
  if (choice === 'max-1920') return { mode: 'max', width: 1920, height: 1080 }
  if (choice === 'max-1280') return { mode: 'max', width: 1280, height: 720 }
  if (choice === 'exact') {
    return cur.mode === 'exact' ? cur : { mode: 'exact', width: 1920, height: 1080, fit: 'bars' }
  }
  return { mode: 'original' }
}

export const FIT_CHOICES: { value: ConvertFit; label: string }[] = [
  { value: 'bars', label: 'Einpassen (schwarze Ränder)' },
  { value: 'crop', label: 'Füllen (Rand beschneiden)' },
  { value: 'blur', label: 'Füllen mit Blur-Rand' },
  { value: 'stretch', label: 'Strecken (verzerrt)' }
]

const RASTER_LABEL: Record<ConvertRaster, string> = {
  '25': 'Show-Raster 25/50 Hz',
  '30': 'Show-Raster 30/60 Hz',
  ntsc: 'Show-Raster 29,97/59,94',
  film: 'Show-Raster 24/48'
}

export const FPS_CHOICES: { group: string; options: { value: string; label: string }[] }[] = [
  {
    group: 'Bildrate',
    options: [
      { value: 'original', label: 'Original (variable Rate wird konstant)' },
      ...(Object.keys(RASTER_LABEL) as ConvertRaster[]).map((r) => ({
        value: `raster-${r}`,
        label: RASTER_LABEL[r]
      }))
    ]
  },
  {
    group: 'Fest',
    options: [
      { value: 'fixed-25', label: '25 fps' },
      { value: 'fixed-50', label: '50 fps' },
      { value: 'fixed-30', label: '30 fps' },
      { value: 'fixed-60', label: '60 fps' },
      { value: 'fixed-24', label: '24 fps' },
      { value: 'fixed-23.976', label: '23,976 fps' },
      { value: 'fixed-29.97', label: '29,97 fps' },
      { value: 'fixed-59.94', label: '59,94 fps' }
    ]
  }
]

const NTSC: Record<string, number> = {
  '23.976': 24000 / 1001,
  '29.97': 30000 / 1001,
  '59.94': 60000 / 1001
}

export function fpsChoice(f: ConvertFps): string {
  if (f.mode === 'raster') return `raster-${f.raster}`
  if (f.mode === 'fixed') {
    const named = Object.entries(NTSC).find(([, v]) => Math.abs(v - f.fps) < 0.001)
    return `fixed-${named ? named[0] : f.fps}`
  }
  return 'original'
}

export function fpsFromChoice(choice: string): ConvertFps {
  if (choice.startsWith('raster-'))
    return { mode: 'raster', raster: choice.slice(7) as ConvertRaster }
  if (choice.startsWith('fixed-')) {
    const key = choice.slice(6)
    return { mode: 'fixed', fps: NTSC[key] ?? Number(key) }
  }
  return { mode: 'original' }
}

/** Show-Raster der Medien-Info („none" = keine Vorgabe) -> Bildraten-Option. */
export function fpsFromShowRaster(raster: string): ConvertFps {
  return raster === '25' || raster === '30' || raster === 'ntsc' || raster === 'film'
    ? { mode: 'raster', raster }
    : { mode: 'original' }
}
