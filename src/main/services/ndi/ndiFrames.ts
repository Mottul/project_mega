// Reine Bausteine der NDI-Sender (ohne Electron, getestet): Eingaben begrenzen und die Frames
// fürs Binding zusammensetzen. Die Werte kommen aus dem Renderer bzw. dem Spiegelfenster – das
// native Modul liest blind so viele Bytes, wie Größe und Schrittweite versprechen, deshalb wird
// hier alles geprüft, was es sonst über das Pufferende hinaus lesen ließe.

import type { NdiAudioChunk } from '@shared/types'
import type { Grandiose } from './ndi'

/** Was jeder NDI-Sender braucht: Quellenname im Netz, Auflösung, Bildrate */
export interface NdiSize {
  name: string
  width: number
  height: number
  fps: number
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback
  return Math.max(min, Math.min(max, n))
}

/** Name, Auflösung (320×180 bis 3840×2160) und Bildrate (1–60) begrenzen; Unbrauchbares -> Vorgabe */
export function clampNdiSize(cfg: Partial<NdiSize>, defaults: NdiSize): NdiSize {
  const name = typeof cfg.name === 'string' ? cfg.name.trim().slice(0, 128) : ''
  return {
    name: name || defaults.name,
    width: clampInt(cfg.width, 320, 3840, defaults.width),
    height: clampInt(cfg.height, 180, 2160, defaults.height),
    fps: clampInt(cfg.fps, 1, 60, defaults.fps)
  }
}

/** paint-Bild (BGRA, Zeilen ohne Lücke) als NDI-Videoframe */
export function videoFrame(
  g: Grandiose,
  width: number,
  height: number,
  fps: number,
  data: Buffer
): Record<string, unknown> {
  return {
    type: 'video',
    xres: width,
    yres: height,
    frameRateN: fps * 1000,
    frameRateD: 1000,
    pictureAspectRatio: width / height,
    frameFormatType: g.FORMAT_TYPE_PROGRESSIVE ?? 1,
    // KEIN timecode-Feld: laut grandiose_send.cc optional, Default ist
    // NDIlib_send_timecode_synthesize (SDK stempelt selbst). Wenn gesetzt,
    // muss es number/bigint sein -- ein Array wird hart abgelehnt.
    lineStrideBytes: width * 4,
    fourCC: g.FOURCC_BGRA ?? g.FOURCC_BGRX ?? 0,
    data
  }
}

/** Gültiger Tonblock: 1–16 gleich lange Float32-Kanäle (höchstens 1 s), übliche Abtastrate */
export function isAudioChunk(chunk: unknown): chunk is NdiAudioChunk {
  if (!chunk || typeof chunk !== 'object') return false
  const { sampleRate, channels } = chunk as Partial<NdiAudioChunk>
  if (typeof sampleRate !== 'number' || !(sampleRate >= 8000 && sampleRate <= 192000)) return false
  if (!Array.isArray(channels) || channels.length < 1 || channels.length > 16) return false
  const len = channels[0] instanceof Float32Array ? channels[0].length : 0
  if (len < 1 || len > sampleRate) return false
  return channels.every((ch) => ch instanceof Float32Array && ch.length === len)
}

/** Tonblock als NDI-Audioframe (FLTp: Kanäle nacheinander); null bei ungültigem Block */
export function audioFrame(g: Grandiose, chunk: unknown): Record<string, unknown> | null {
  if (!isAudioChunk(chunk)) return null
  const { channels } = chunk
  const noSamples = channels[0].length
  return {
    sampleRate: Math.round(chunk.sampleRate),
    noChannels: channels.length,
    noSamples,
    channelStrideBytes: noSamples * 4,
    fourCC: g.FOURCC_FLTp ?? 0,
    data: Buffer.concat(channels.map((ch) => Buffer.from(ch.buffer, ch.byteOffset, ch.byteLength)))
  }
}

/** Spitzenpegel aller Kanäle (0..1) */
export function peakOf(channels: Float32Array[]): number {
  let peak = 0
  for (const ch of channels) {
    for (let i = 0; i < ch.length; i++) {
      const a = Math.abs(ch[i])
      if (a > peak) peak = a
    }
  }
  return peak
}
