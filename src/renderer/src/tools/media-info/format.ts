// Anzeige-Formatierung der Medien-Info (de-DE). Rein: kein React, kein api-Import
// -> testbar und vom HAP-Konverter mitnutzbar.

import type { MediaAudioTrack, MediaScanType, MediaVideoTrack } from '@shared/types'

const de = (digits: number): Intl.NumberFormat =>
  new Intl.NumberFormat('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits })

/** Zahl mit Tausenderpunkt/Dezimalkomma; `max` = höchstens so viele Nachkommastellen. */
export function nf(n: number, max = 0): string {
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: max }).format(n)
}

/** Dauer als HH:MM:SS.cc (Hundertstel) – Stunden immer zweistellig. */
export function fmtDuration(sec: number | null | undefined): string {
  if (sec === null || sec === undefined || !Number.isFinite(sec)) return '–'
  const total = Math.round(sec * 100)
  const cs = total % 100
  const s = Math.floor(total / 100)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}.${p(cs)}`
}

/** Kurze Dauer für Tabellen: „3:12" bzw. „1:02:03". */
export function fmtDurationShort(sec: number | null | undefined): string {
  if (sec === null || sec === undefined || !Number.isFinite(sec)) return '–'
  const s = Math.round(sec)
  const p = (n: number): string => String(n).padStart(2, '0')
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}:${p(m)}:${p(s % 60)}` : `${m}:${p(s % 60)}`
}

/** Dateigröße dezimal (1 GB = 10⁹ Byte) wie Finder/Hersteller-Angaben. */
export function fmtBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '–'
  if (bytes < 1000) return `${nf(bytes)} B`
  if (bytes < 1e6) return `${nf(bytes / 1e3)} KB`
  if (bytes < 1e8) return `${de(1).format(bytes / 1e6)} MB`
  if (bytes < 1e9) return `${nf(bytes / 1e6)} MB`
  if (bytes < 1e12) return `${de(2).format(bytes / 1e9)} GB`
  return `${de(2).format(bytes / 1e12)} TB`
}

/** Bitrate: kbit/s · Mbit/s · Gbit/s. */
export function fmtBitrate(bps: number | null | undefined): string {
  if (bps === null || bps === undefined || !Number.isFinite(bps) || bps <= 0) return '–'
  if (bps < 1e6) return `${nf(bps / 1e3)} kbit/s`
  if (bps < 1e8) return `${de(1).format(bps / 1e6)} Mbit/s`
  if (bps < 1e9) return `${nf(bps / 1e6)} Mbit/s`
  return `${de(2).format(bps / 1e9)} Gbit/s`
}

/** Datenrate in MB/s (Bitrate / 8) – so stehen Lesewerte auf Datenträgern. */
export function fmtMBps(bps: number | null | undefined): string {
  if (!bps || !Number.isFinite(bps)) return '–'
  const mbs = bps / 8 / 1e6
  return `${mbs < 10 ? de(1).format(mbs) : nf(mbs)} MB/s`
}

const NAMED_FPS: [number, string][] = [
  [24000 / 1001, '23,976'],
  [30000 / 1001, '29,97'],
  [48000 / 1001, '47,952'],
  [60000 / 1001, '59,94'],
  [120000 / 1001, '119,88']
]

/** Bildrate ohne Einheit: „25", „29,97", „12,5". */
export function fmtFps(fps: number | null | undefined): string {
  if (!fps || !Number.isFinite(fps)) return '–'
  for (const [v, label] of NAMED_FPS) if (Math.abs(fps - v) < 0.002) return label
  return nf(fps, 3)
}

export function fpsLabel(v: MediaVideoTrack): string {
  switch (v.fpsMode) {
    case 'still':
      return 'Standbild'
    case 'unknown':
      return v.fps ? `${fmtFps(v.fps)} fps` : 'unbekannt'
    case 'vfr':
      return `Ø ${fmtFps(v.fps)} fps (variabel)`
    case 'vfr-suspect':
      return `Ø ${fmtFps(v.fps)} fps (variabel?)`
    default:
      return `${fmtFps(v.fps)} fps`
  }
}

export function fpsModeLabel(v: MediaVideoTrack): string {
  return {
    cfr: 'konstant (CFR)',
    vfr: 'variabel (VFR, per Paket-Scan bestätigt)',
    'vfr-suspect': 'vermutlich variabel (VFR-Verdacht)',
    still: 'Standbild',
    unknown: 'unbekannt'
  }[v.fpsMode]
}

export function scanLabel(scan: MediaScanType): string {
  return {
    progressive: 'Progressiv',
    tff: 'Interlaced (oberes Halbbild zuerst, TFF)',
    bff: 'Interlaced (unteres Halbbild zuerst, BFF)',
    unknown: 'unbekannt'
  }[scan]
}

// Bekannte Verhältnisse als ganzzahlige Paare -> „exakt" heißt wirklich w·b = h·a
// (1366 × 768 ist eben nicht exakt 16:9, sondern nur ungefähr).
const RATIOS: [number, number, string][] = [
  [1, 1, '1:1'],
  [5, 4, '5:4'],
  [4, 3, '4:3'],
  [3, 2, '3:2'],
  [16, 10, '16:10'],
  [16, 9, '16:9'],
  [37, 20, '1,85:1'],
  [256, 135, '1,90:1'],
  [2, 1, '2:1'],
  [64, 27, '21:9'],
  [239, 100, '2,39:1'],
  [32, 9, '32:9'],
  [9, 16, '9:16'],
  [4, 5, '4:5'],
  [3, 4, '3:4']
]

/** Seitenverhältnis: bekanntes Verhältnis (exakt oder ≤ 1 % daneben mit „≈"), sonst „x,xx:1". */
export function aspectLabel(w: number, h: number): string {
  if (!w || !h) return '–'
  const r = w / h
  for (const [a, b, label] of RATIOS) if (w * b === h * a) return label
  for (const [a, b, label] of RATIOS) if (Math.abs(r - a / b) / (a / b) <= 0.01) return `≈ ${label}`
  return r >= 1 ? `${de(2).format(r)}:1` : `1:${de(2).format(1 / r)}`
}

const RES_CLASSES: Record<string, string> = {
  '1280x720': 'HD',
  '1920x1080': 'Full HD',
  '2048x1080': '2K DCI',
  '2560x1440': 'QHD',
  '3840x2160': 'UHD (4K)',
  '4096x2160': '4K DCI',
  '7680x4320': '8K UHD',
  '720x576': 'PAL (SD)',
  '720x480': 'NTSC (SD)'
}

export function resolutionClass(w: number, h: number): string | null {
  return RES_CLASSES[`${w}x${h}`] ?? null
}

export function fmtResolution(w: number, h: number): string {
  return w && h ? `${nf(w)} × ${nf(h)}` : '–'
}

/** Kurzform „1080p25" bzw. „1080i/25" – nur bei üblichen Formaten. */
export function shortFormat(v: MediaVideoTrack): string | null {
  const h = v.displayHeight
  const w = v.displayWidth
  if (!v.fps || v.fpsMode === 'still') return null
  const standard =
    (Math.abs(w - (h * 16) / 9) < 2 && [720, 1080, 1440, 2160, 4320].includes(h)) ||
    (h === 576 && (w === 720 || w === 768 || w === 1024)) ||
    (h === 480 && (w === 720 || w === 640 || w === 854))
  if (!standard) return null
  const interlaced = v.scan === 'tff' || v.scan === 'bff'
  return interlaced ? `${h}i/${fmtFps(v.fps)}` : `${h}p${fmtFps(v.fps)}`
}

/** Codec-Zeile: „H.264 High@4.1 · 8 bit · 4:2:0" (+ Alpha, HDR). */
export function codecLine(v: MediaVideoTrack): string {
  const head = [v.codec, v.profile ? `${v.profile}${v.level ? `@${v.level}` : ''}` : null]
    .filter(Boolean)
    .join(' ')
  const parts = [head]
  if (v.bitDepth) parts.push(`${v.bitDepth} bit`)
  if (v.chroma) parts.push(v.alpha ? `${v.chroma} + Alpha` : v.chroma)
  else if (v.alpha) parts.push('Alpha')
  const hdr = hdrLabel(v)
  if (hdr) parts.push(hdr)
  return parts.join(' · ')
}

export function codecClassLabel(v: MediaVideoTrack): string {
  switch (v.codecClass) {
    case 'gpu':
      return 'GPU-Codec (Textur)'
    case 'intra':
      return 'Intra (jedes Bild eigenständig)'
    case 'longgop':
      if (v.gop?.allIntra) return 'Intra (nur Keyframes)'
      return v.hasBFrames ? 'Long-GOP (mit B-Frames)' : 'Long-GOP'
    case 'image':
      return 'Einzelbild'
    default:
      return 'unbekannt'
  }
}

export function gopLabel(v: MediaVideoTrack): string | null {
  const g = v.gop
  if (!g) return null
  if (g.allIntra) return 'nur Keyframes (Intra)'
  if (!g.keyframeInterval) return null
  // Kurzer Clip komplett gescannt und nur EIN Keyframe -> „mindestens" wäre irreführend
  if (g.keyframeIntervalAtLeast && v.frames && g.packets >= v.frames)
    return 'nur ein Keyframe (Clipanfang)'
  const sec = v.fps ? g.keyframeInterval / v.fps : null
  const pre = g.keyframeIntervalAtLeast ? 'mindestens ' : ''
  return `Keyframe ${pre}alle ${nf(g.keyframeInterval)} Bilder${sec ? ` (${nf(sec, 1)} s)` : ''}`
}

export function hdrLabel(v: MediaVideoTrack): string | null {
  if (v.dolbyVision) return `Dolby Vision ${v.dolbyVision}`
  if (v.hdr === 'pq') return v.masteringMaxNits || v.maxCll ? 'HDR10' : 'HDR (PQ)'
  if (v.hdr === 'hlg') return 'HLG'
  return null
}

const PRIMARIES: Record<string, string> = {
  bt709: 'Rec. 709',
  bt2020: 'Rec. 2020',
  smpte170m: 'Rec. 601 (NTSC)',
  bt470bg: 'Rec. 601 (PAL)',
  smpte432: 'Display P3',
  smpte431: 'DCI-P3'
}
const TRANSFER: Record<string, string> = {
  bt709: 'SDR',
  smpte170m: 'SDR',
  bt470bg: 'SDR',
  'iec61966-2-1': 'sRGB',
  smpte2084: 'PQ (HDR)',
  'arib-std-b67': 'HLG (HDR)',
  linear: 'linear'
}

export function colorLabel(v: MediaVideoTrack): string {
  const prim = v.colorPrimaries ? (PRIMARIES[v.colorPrimaries] ?? v.colorPrimaries) : null
  const trc = v.colorTransfer ? (TRANSFER[v.colorTransfer] ?? v.colorTransfer) : null
  const range = v.colorRange === 'pc' ? 'Full Range' : v.colorRange === 'tv' ? 'Limited' : null
  const parts = [prim, trc, range].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'Farbraum nicht angegeben'
}

export function rotationLabel(v: MediaVideoTrack): string | null {
  if (!v.rotation && !v.mirrored) return null
  const parts: string[] = []
  if (v.rotation) parts.push(`${v.rotation}° im Uhrzeigersinn`)
  if (v.mirrored) parts.push('gespiegelt')
  return parts.join(', ')
}

const LAYOUTS: Record<string, string> = {
  mono: 'Mono',
  stereo: 'Stereo',
  '2.1': '2.1',
  '3.0': '3.0',
  quad: 'Quadro (4.0)',
  '4.0': '4.0',
  '5.0': '5.0',
  '5.0(side)': '5.0',
  '5.1': '5.1',
  '5.1(side)': '5.1',
  '6.1': '6.1',
  '7.1': '7.1',
  '7.1(wide)': '7.1'
}

export function channelLabel(a: MediaAudioTrack): string {
  if (a.channelLayout && LAYOUTS[a.channelLayout]) return LAYOUTS[a.channelLayout]
  if (a.channels === 1) return 'Mono'
  if (a.channels === 2) return 'Stereo'
  return a.channels ? `${a.channels} Kanäle${a.layoutKnown ? '' : ' (ohne Layout)'}` : '–'
}

export function sampleRateLabel(hz: number | null): string {
  if (!hz) return '–'
  return `${nf(hz / 1000, 1)} kHz`
}

/** Ton-Kurzzeile: „AAC · 48 kHz · Stereo" bzw. „PCM 24 bit · 48 kHz · 5.1". */
export function audioLine(a: MediaAudioTrack): string {
  return [a.codec, sampleRateLabel(a.sampleRate), channelLabel(a)].join(' · ')
}

const LANG: Record<string, string> = {
  ger: 'Deutsch',
  deu: 'Deutsch',
  eng: 'Englisch',
  fre: 'Französisch',
  fra: 'Französisch',
  spa: 'Spanisch',
  ita: 'Italienisch',
  dut: 'Niederländisch',
  nld: 'Niederländisch',
  pol: 'Polnisch',
  por: 'Portugiesisch',
  rus: 'Russisch',
  tur: 'Türkisch',
  swe: 'Schwedisch',
  dan: 'Dänisch',
  nor: 'Norwegisch',
  fin: 'Finnisch',
  cze: 'Tschechisch',
  ces: 'Tschechisch',
  hun: 'Ungarisch',
  jpn: 'Japanisch',
  chi: 'Chinesisch',
  zho: 'Chinesisch',
  ara: 'Arabisch',
  gsw: 'Schweizerdeutsch'
}

export function languageLabel(code: string | null): string | null {
  if (!code) return null
  return LANG[code.toLowerCase()] ?? code
}

/** Datum lokal: „03.10.2026, 14:22". */
export function fmtDate(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return '–'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return String(v)
  return d.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/** Ordner + Dateiname aus einem Pfad (Windows/macOS/Linux). */
export function splitPath(p: string): { dir: string; name: string } {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  return i >= 0 ? { dir: p.slice(0, i), name: p.slice(i + 1) } : { dir: '', name: p }
}

/** HAP-Datenrate (Obergrenze vor Snappy) aus Maßen + fps; k = Bytes/Pixel. */
export function hapRateEstimate(
  w: number,
  h: number,
  fps: number | null,
  format: 'hap' | 'hap_alpha' | 'hap_q'
): number | null {
  if (!w || !h || !fps) return null
  const k = format === 'hap' ? 0.5 : 1
  const ceil4 = (n: number): number => Math.ceil(n / 4) * 4
  return ceil4(w) * ceil4(h) * k * fps * 8
}
