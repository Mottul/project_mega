// ffmpeg-Argumente aus einem Konvertierungs-Plan (shared/convertPlan). Hier steht nur
// noch Encoder-Wissen (Qualitätsstufen, Level, Container-Flags) – alle inhaltlichen
// Entscheidungen (Drehung, Pixel, Halbbilder, Bildrate, HDR, Größe, Ton) trifft der Plan.

import { PRORES_PROFILE, type ConvertPlan } from '@shared/convertPlan'
import type { ConvertOptions, ConvertQuality } from '@shared/types'
import { encoderOutputArgs, encoderPixFmt } from './encoders'

export interface ConvertIo {
  input: string
  output: string
  /** H.264-Encoder: libx264 (Standard) oder ein geprüfter GPU-Encoder (Player) */
  h264Encoder?: string
  /** HAP-Chunks (aus der Auflösung bzw. manuell) */
  hapChunks?: number
}

const CRF_H264: Record<ConvertQuality, number> = { high: 18, standard: 21, small: 25 }
const CRF_HEVC: Record<ConvertQuality, number> = { high: 20, standard: 24, small: 28 }

/** H.264-Level nach Bildgröße und -rate (Tabelle A-1): 4.1 bis 1080p30, 4.2 bis 1080p60. */
export function h264Level(width: number, height: number, fps: number | null): string {
  const mbs = Math.ceil(width / 16) * Math.ceil(height / 16)
  const perSec = mbs * (fps ?? 30)
  if (mbs <= 8192 && perSec <= 245760) return '4.1'
  if (mbs <= 8704 && perSec <= 522240) return '4.2'
  if (mbs <= 36864 && perSec <= 983040) return '5.1'
  return '5.2'
}

function videoEncoderArgs(plan: ConvertPlan, opts: ConvertOptions, io: ConvertIo): string[] {
  const v = plan.video
  if (!v) return []
  const gop = v.gop ? ['-g', String(v.gop)] : []
  switch (plan.formatInfo.family) {
    case 'hap':
      return [
        '-c:v',
        'hap',
        '-format',
        plan.format,
        '-compressor',
        opts.hapCompressor,
        '-chunks',
        String(Math.max(1, io.hapChunks ?? 1))
      ]
    case 'h264': {
      const enc = io.h264Encoder ?? 'libx264'
      // GPU-Encoder: bewährte Einstellungen des Players
      if (enc !== 'libx264') return [...encoderOutputArgs(enc), ...gop]
      const args = [
        '-c:v',
        'libx264',
        '-preset',
        'medium',
        '-crf',
        String(CRF_H264[opts.quality]),
        '-profile:v',
        'high',
        ...gop
      ]
      if (opts.compat) {
        // Player-Boxen/TVs: festes Level + Bitraten-Deckel (sonst ruckeln Spitzen)
        const level = h264Level(v.width, v.height, v.fps)
        const sd = level.startsWith('4')
        args.push(
          '-level:v',
          level,
          '-maxrate',
          sd ? '25M' : '60M',
          '-bufsize',
          sd ? '50M' : '120M'
        )
      }
      return args
    }
    case 'hevc':
      return [
        '-c:v',
        'libx265',
        '-preset',
        'medium',
        '-crf',
        String(CRF_HEVC[opts.quality]),
        // hvc1 statt hev1: sonst spielen QuickTime/Apple-Geräte die Datei nicht
        '-tag:v',
        'hvc1',
        ...gop,
        '-x265-params',
        'log-level=error'
      ]
    case 'prores':
      return [
        '-c:v',
        'prores_ks',
        '-profile:v',
        String(PRORES_PROFILE[plan.format] ?? 2),
        '-vendor',
        'apl0'
      ]
    case 'image':
      return ['-frames:v', '1', '-q:v', '2', '-update', '1']
    default:
      return []
  }
}

/** Vollständige ffmpeg-Argumente (Fortschritt über -progress pipe:1). */
export function buildConvertArgs(plan: ConvertPlan, opts: ConvertOptions, io: ConvertIo): string[] {
  const args = ['-hide_banner', '-nostdin', '-i', io.input]
  const v = plan.video
  const a = plan.audio
  // Spuren ausdrücklich wählen: Cover-Bilder, Untertitel, Daten- und weitere Tonspuren
  // bleiben weg (die erste Spur ist z.B. bei MP4 mit Cover nicht immer das Video)
  if (v) args.push('-map', `0:${v.streamIndex}`)
  if (a) args.push('-map', `0:${a.streamIndex}`)

  if (v) {
    if (v.copy) {
      args.push('-c:v', 'copy')
    } else {
      const enc = io.h264Encoder ?? 'libx264'
      // QSV arbeitet intern mit nv12
      const pixFmt = plan.formatInfo.family === 'h264' && v.pixFmt ? encoderPixFmt(enc) : v.pixFmt
      const chain = [...v.filters, ...(pixFmt ? [`format=${pixFmt}`] : [])]
      if (chain.length) args.push('-vf', chain.join(','))
      args.push(...videoEncoderArgs(plan, opts, io))
      // Konstante Bildrate erzwingen: alte AVIs/Streams haben Zeitstempel-Lücken (fehlende
      // Bilder) -> sonst entstünde trotz „konstanter" Quelle eine variable Ausgabe
      if (v.fps && plan.formatInfo.family !== 'image') args.push('-fps_mode', 'cfr')
      if (v.colorTags) {
        const t = v.colorTags
        args.push(
          '-color_primaries',
          t.primaries,
          '-color_trc',
          t.trc,
          '-colorspace',
          t.space,
          '-color_range',
          t.range
        )
      }
    }
  }

  if (a) {
    if (a.codec === 'copy') {
      args.push('-c:a', 'copy')
    } else {
      if (a.filters.length) args.push('-af', a.filters.join(','))
      args.push('-c:a', a.codec)
      if (a.bitrate) args.push('-b:a', `${Math.round(a.bitrate / 1000)}k`)
      if (a.channels) args.push('-ac', String(a.channels))
      if (a.sampleRate) args.push('-ar', String(a.sampleRate))
    }
  }

  switch (plan.formatInfo.container) {
    case 'mp4':
      // Index an den Anfang: sofort abspielbar (USB-Player, Browser, Netzlaufwerk)
      args.push('-movflags', '+faststart')
      break
    case 'wav':
      // über 4 GB automatisch als RF64
      args.push('-rf64', 'auto')
      break
  }
  args.push('-progress', 'pipe:1', '-nostats', '-y', io.output)
  return args
}
