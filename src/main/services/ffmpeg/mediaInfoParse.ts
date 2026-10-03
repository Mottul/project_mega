// ffprobe-JSON -> MediaInfo. Reine Funktionen OHNE electron/fs-Import, damit sie
// mit echten ffprobe-Ausgaben (Fixtures) testbar sind. Alle Regeln sind gegen
// ~140 erzeugte Testdateien geprüft; die Kommentare nennen jeweils den Anlass.
// Grundsatz: JEDES ffprobe-Feld ist optional, Zahlen kommen teils als String.

import type {
  MediaAudioTrack,
  MediaChapter,
  MediaCodecClass,
  MediaCover,
  MediaDataTrack,
  MediaFpsMode,
  MediaGopInfo,
  MediaInfo,
  MediaScanType,
  MediaSubtitleTrack,
  MediaTag,
  MediaVideoTrack
} from '@shared/types'

/* ------------------------------ ffprobe-Typen ----------------------------- */

type FfTags = Record<string, string | number | undefined>

interface FfSideData {
  side_data_type?: string
  rotation?: number
  displaymatrix?: string
  max_luminance?: string
  max_content?: number
  max_average?: number
  dv_profile?: number
  dv_bl_signal_compatibility_id?: number
}

export interface FfStream {
  index?: number
  codec_type?: string
  codec_name?: string
  codec_long_name?: string
  profile?: string
  level?: number
  codec_tag_string?: string
  width?: number
  height?: number
  sample_aspect_ratio?: string
  display_aspect_ratio?: string
  pix_fmt?: string
  field_order?: string
  color_range?: string
  color_space?: string
  color_transfer?: string
  color_primaries?: string
  has_b_frames?: number
  r_frame_rate?: string
  avg_frame_rate?: string
  time_base?: string
  bits_per_raw_sample?: string
  bits_per_sample?: number
  sample_fmt?: string
  sample_rate?: string
  channels?: number
  channel_layout?: string
  bit_rate?: string
  duration?: string
  nb_frames?: string
  disposition?: Record<string, number | undefined>
  tags?: FfTags
  side_data_list?: FfSideData[]
}

export interface FfFormat {
  format_name?: string
  format_long_name?: string
  duration?: string
  start_time?: string
  size?: string
  bit_rate?: string
  probe_score?: number
  tags?: FfTags
}

export interface FfChapter {
  start_time?: string
  end_time?: string
  tags?: FfTags
}

export interface FfprobeJson {
  streams?: FfStream[]
  format?: FfFormat
  chapters?: FfChapter[]
  error?: { code?: number; string?: string }
}

/* --------------------------------- Helfer -------------------------------- */

function num(v: unknown): number | null {
  if (v === undefined || v === null || v === '' || v === 'N/A') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function pos(v: unknown): number | null {
  const n = num(v)
  return n !== null && n > 0 ? n : null
}

/** „30000/1001" bzw. „16:9" -> Zahl; „0/0", „0:1", „N/A" -> null. */
export function ratio(s: string | undefined): number | null {
  if (!s) return null
  const [a, b] = s.split(/[/:]/).map(Number)
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return null
  return a / b
}

/**
 * Tag-Wert ohne Groß-/Kleinschreibung. Entfernt Ziel-Präfixe (mkvmerge
 * „MOVIE/ENCODER") und Sprach-Suffixe (ältere mkvmerge „BPS-eng").
 */
export function tag(tags: FfTags | undefined, ...keys: string[]): string | null {
  if (!tags) return null
  for (const k of keys) {
    const want = k.toLowerCase()
    for (const [tk, tv] of Object.entries(tags)) {
      if (tv === undefined || tv === '') continue
      const base = tk
        .toLowerCase()
        .replace(/^[a-z]+\//, '')
        .replace(/-[a-z]{2,3}$/, '')
      if (base === want) return String(tv)
    }
  }
  return null
}

/** Matroska-Dauer „HH:MM:SS.nnnnnnnnn" -> Sekunden. */
function hmsToSec(s: string | null): number | null {
  const m = s?.match(/^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/)
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null
}

/** FourCC nur, wenn druckbar („[0][0][0][0]" = keine Kennung). */
function fourcc(s: FfStream): string | null {
  const t = s.codec_tag_string
  return t && !t.includes('[') ? t : null
}

function language(tags: FfTags | undefined): string | null {
  const l = tag(tags, 'language')
  return l && l !== 'und' ? l : null
}

/* ------------------------------ pix_fmt-Regeln ---------------------------- */

export interface PixFmtInfo {
  bits: number
  chroma: string | null
  alpha: boolean
  fullRange: boolean
}

/** pix_fmt -> Bittiefe/Chroma/Alpha; geprüft gegen alle Software-pix_fmts von ffprobe. */
export function parsePixFmt(pixFmt: string): PixFmtInfo {
  const n = pixFmt.toLowerCase().replace(/(msb)?(le|be)$/, '')
  const alpha = /^(yuva|gbrap|ya\d|yaf|vuya|ayuv|uyva|rgba|bgra|argb|abgr)/.test(n)
  const fullRange = n.startsWith('yuvj')
  let chroma: string | null = null
  if (/^(gray|ya|monow|monob)/.test(n)) chroma = 'Graustufen'
  else if (n === 'pal8') chroma = 'Palette'
  else if (/^(rgb|bgr|gbr|argb|abgr|0rgb|0bgr|x2rgb|x2bgr)/.test(n)) chroma = 'RGB'
  else if (/^bayer/.test(n)) chroma = 'Bayer (RAW)'
  else if (/^xyz/.test(n)) chroma = 'XYZ'
  else {
    const m = n.match(/(420|422|444|411|410|440)/)
    if (m) chroma = `${m[1][0]}:${m[1][1]}:${m[1][2]}`
    else if (/^(nv12|nv21|p01\d)/.test(n)) chroma = '4:2:0'
    else if (/^(nv16|nv61|nv20|p21\d|y21\d|uyvy|yuyv|yvyu)/.test(n)) chroma = '4:2:2'
    else if (/^(nv24|nv42|p41\d|xv\d\d|v30x|vuya|vuyx|ayuv|uyva)/.test(n)) chroma = '4:4:4'
    else if (/^uyyvyy411/.test(n)) chroma = '4:1:1'
  }
  let bits = 8
  let m: RegExpMatchArray | null
  if ((m = n.match(/^(?:p[024]|y2)(1[026])$/))) bits = Number(m[1])
  else if ((m = n.match(/^xv(30|36|48)$/))) bits = { 30: 10, 36: 12, 48: 16 }[m[1] as '30']
  else if (/^(nv20|v30x|x2rgb10|x2bgr10)$/.test(n)) bits = 10
  else if ((m = n.match(/f(16|32)$/))) bits = Number(m[1])
  else if (/^(rgb|bgr)a?(48|64)$/.test(n) || n === 'ayuv64') bits = 16
  else if (/^(rgb|bgr)a?(96|128)$/.test(n)) bits = 32
  else if ((m = n.match(/^(?:rgb|bgr)(444|555|565)$/))) {
    bits = { 444: 4, 555: 5, 565: 6 }[m[1] as '444']
  } else if (/^(rgb|bgr)4(_byte)?$/.test(n)) bits = 2
  else if (/^(rgb|bgr)8$/.test(n)) bits = 3
  else if (/^(monob|monow)$/.test(n)) bits = 1
  else if ((m = n.match(/^xyz(\d+)$/))) bits = Number(m[1])
  else if ((m = n.match(/^bayer_\w{4}(\d+)$/))) bits = Number(m[1])
  else if ((m = n.match(/(?:p|gray|ya)(\d+)$/))) bits = Number(m[1])
  return { bits, chroma, alpha, fullRange }
}

/* ------------------------------ Codec-Namen ------------------------------ */

const PRORES_TAG: Record<string, string> = {
  apco: 'ProRes 422 Proxy',
  apcs: 'ProRes 422 LT',
  apcn: 'ProRes 422',
  apch: 'ProRes 422 HQ',
  ap4h: 'ProRes 4444',
  ap4x: 'ProRes 4444 XQ',
  aprn: 'ProRes RAW',
  aprh: 'ProRes RAW HQ'
}
const PRORES_PROFILE: Record<string, string> = {
  Proxy: 'ProRes 422 Proxy',
  LT: 'ProRes 422 LT',
  Standard: 'ProRes 422',
  HQ: 'ProRes 422 HQ',
  '4444': 'ProRes 4444',
  XQ: 'ProRes 4444 XQ'
}
// HAP-Variante steht NUR in der FourCC (kein profile).
export const HAP_TAG: Record<string, string> = {
  Hap1: 'HAP',
  Hap5: 'HAP Alpha',
  HapY: 'HAP Q',
  HapM: 'HAP Q Alpha',
  HapA: 'HAP Alpha-Only',
  Hap7: 'HAP R'
}
const CODEC_NAME: Record<string, string> = {
  h264: 'H.264',
  hevc: 'H.265 (HEVC)',
  av1: 'AV1',
  vp9: 'VP9',
  vp8: 'VP8',
  mpeg1video: 'MPEG-1',
  mpeg2video: 'MPEG-2',
  mpeg4: 'MPEG-4 Part 2 (DivX/Xvid)',
  msmpeg4v3: 'MS MPEG-4 v3',
  wmv1: 'WMV 7',
  wmv2: 'WMV 8',
  wmv3: 'WMV 9',
  vc1: 'VC-1',
  theora: 'Theora',
  mjpeg: 'Motion-JPEG',
  dvvideo: 'DV',
  cfhd: 'GoPro CineForm',
  ffv1: 'FFV1',
  qtrle: 'QuickTime Animation',
  rawvideo: 'Unkomprimiert',
  v210: 'Unkomprimiert 10 bit (v210)',
  png: 'PNG',
  gif: 'GIF',
  bmp: 'BMP',
  tiff: 'TIFF',
  webp: 'WebP',
  exr: 'OpenEXR',
  dpx: 'DPX',
  jpeg2000: 'JPEG 2000',
  notchlc: 'NotchLC',
  dxv: 'Resolume DXV',
  aac: 'AAC',
  mp3: 'MP3',
  mp2: 'MPEG Layer II',
  ac3: 'Dolby Digital (AC-3)',
  eac3: 'Dolby Digital Plus (E-AC-3)',
  truehd: 'Dolby TrueHD',
  dts: 'DTS',
  opus: 'Opus',
  vorbis: 'Vorbis',
  flac: 'FLAC',
  alac: 'Apple Lossless',
  wmav2: 'WMA',
  mov_text: 'MP4-Text (tx3g)',
  subrip: 'SubRip (SRT)',
  ass: 'ASS/SSA',
  ssa: 'ASS/SSA',
  webvtt: 'WebVTT',
  hdmv_pgs_subtitle: 'PGS (Bild)',
  dvd_subtitle: 'VobSub (Bild)',
  dvb_subtitle: 'DVB (Bild)',
  eia_608: 'CEA-608'
}

const GPU_CODECS = new Set(['hap', 'dxv', 'notchlc'])
const INTRA_CODECS = new Set([
  'prores',
  'prores_raw',
  'dnxhd',
  'cfhd',
  'mjpeg',
  'qtrle',
  'rawvideo',
  'v210',
  'r210',
  'ffv1',
  'huffyuv',
  'utvideo',
  'jpeg2000',
  'dvvideo',
  'png'
])
const LONGGOP_CODECS = new Set([
  'h264',
  'hevc',
  'av1',
  'vp8',
  'vp9',
  'mpeg1video',
  'mpeg2video',
  'mpeg4',
  'msmpeg4v3',
  'vc1',
  'wmv1',
  'wmv2',
  'wmv3',
  'theora'
])
const LOSSY_AUDIO = new Set([
  'aac',
  'mp3',
  'mp2',
  'ac3',
  'eac3',
  'opus',
  'vorbis',
  'dts',
  'wmav2',
  'wmapro',
  'amr_nb',
  'amr_wb'
])
// Bittiefe verlustfreier Codecs aus dem Sample-Format (wenn ffprobe sonst nichts nennt)
const SAMPLE_FMT_BITS: Record<string, number> = {
  u8: 8,
  u8p: 8,
  s16: 16,
  s16p: 16,
  s32: 32,
  s32p: 32,
  flt: 32,
  fltp: 32,
  dbl: 64,
  dblp: 64
}
const MPEG2_LEVELS: Record<number, string> = { 4: 'High', 6: 'High 1440', 8: 'Main', 10: 'Low' }
const BITMAP_SUBS = new Set(['hdmv_pgs_subtitle', 'dvd_subtitle', 'dvb_subtitle', 'xsub'])

function codecDisplay(s: FfStream): string {
  const name = s.codec_name
  const tg = fourcc(s)
  if (name === 'prores') {
    return (tg && PRORES_TAG[tg]) || (s.profile && PRORES_PROFILE[s.profile]) || 'ProRes'
  }
  if (name === 'hap') return (tg && HAP_TAG[tg]) || 'HAP'
  // Unbekannte FourCC (z.B. HAP R „Hap7"): ffprobe liefert gar keinen codec_name.
  if (!name) return tg ? `${HAP_TAG[tg] ?? 'Unbekannt'} (${tg}, nicht decodierbar)` : 'Unbekannt'
  if (name === 'dnxhd') {
    return s.profile?.startsWith('DNXHR') ? `DNxHR ${s.profile.slice(6)}` : 'DNxHD'
  }
  const pcm = name.match(/^pcm_([suf])(\d+)(le|be)?(_planar)?$/)
  if (pcm) {
    const kind = pcm[1] === 'f' ? ' float' : pcm[1] === 'u' ? ' unsigned' : ''
    return `PCM ${pcm[2]} bit${kind}`
  }
  let label = CODEC_NAME[name] ?? s.codec_long_name ?? name
  if (name === 'aac' && s.profile && s.profile !== 'LC') label += ` ${s.profile}`
  return label
}

/** Level je Codec in der üblichen Schreibweise. */
function levelLabel(s: FfStream): string | null {
  const l = s.level
  if (l === undefined || l === null || l < 0) return null
  switch (s.codec_name) {
    case 'h264':
      return l === 9 ? '1b' : (l / 10).toFixed(1)
    case 'hevc':
      return String(Math.round((l / 30) * 10) / 10)
    case 'av1':
      return `${2 + (l >> 2)}.${l & 3}`
    case 'mpeg2video':
      return MPEG2_LEVELS[l] ?? null
    default:
      return null
  }
}

function codecClass(name: string | undefined, still: boolean): MediaCodecClass {
  if (still) return 'image'
  if (!name) return 'unknown'
  if (GPU_CODECS.has(name)) return 'gpu'
  if (INTRA_CODECS.has(name)) return 'intra'
  if (LONGGOP_CODECS.has(name)) return 'longgop'
  return 'unknown'
}

/* --------------------------------- fps ---------------------------------- */

const STANDARD_FPS = [
  24000 / 1001,
  24,
  25,
  30000 / 1001,
  30,
  48000 / 1001,
  48,
  50,
  60000 / 1001,
  60,
  100,
  120000 / 1001,
  120
]

/** Auf Normraten einrasten (MKV liefert z.B. 19001/317 = 59,9401). */
export function snapFps(f: number): number {
  for (const std of STANDARD_FPS) if (Math.abs(f - std) / std < 0.0005) return std
  return Math.round(f * 1000) / 1000
}

/**
 * Bildrate + Modus aus r_frame_rate/avg_frame_rate.
 * - r ≥ 1000 oder r = Zeitbasis > 240 (90000/1, 600/1) ist kein Bildtakt
 * - avg > r·1,01 verwerfen (DV meldet avg = 60000/1)
 * - |r−avg| ≤ 1 % -> CFR; r/avg ≈ 2 -> CFR mit avg (Feldtakt bei Roh-H.264)
 * - sonst VFR-Verdacht, angezeigt wird der Durchschnitt
 */
export function deriveFps(s: FfStream): { fps: number | null; mode: MediaFpsMode } {
  const r = ratio(s.r_frame_rate)
  const a = ratio(s.avg_frame_rate)
  const tb = ratio(s.time_base)
  const rOk = r && r < 1000 && !(tb && r > 240 && Math.abs(r - 1 / tb) < 1e-6) ? r : null
  const aOk = a && a < 1000 && !(rOk && a > rOk * 1.01) ? a : null
  if (rOk && aOk) {
    if (Math.abs(rOk - aOk) / rOk <= 0.01) return { fps: snapFps(rOk), mode: 'cfr' }
    if (Math.abs(rOk / aOk - 2) < 0.01) return { fps: snapFps(aOk), mode: 'cfr' }
    return { fps: snapFps(aOk), mode: 'vfr-suspect' }
  }
  const one = rOk ?? aOk
  return one ? { fps: snapFps(one), mode: 'cfr' } : { fps: null, mode: 'unknown' }
}

/* ------------------------------- Rotation ------------------------------- */

function parseMatrix(s: string | undefined): number[] | null {
  if (!s) return null
  const nums = s
    .split('\n')
    .filter((l) => l.includes(':'))
    .flatMap((l) => l.split(':')[1].trim().split(/\s+/).map(Number))
  return nums.length === 9 ? nums : null
}

/**
 * Anzeige-Drehung im Uhrzeigersinn + Spiegelung. Display-Matrix-„rotation" ist
 * GEGEN den Uhrzeigersinn positiv (Handy hochkant = −90). Spiegelung erkennt man
 * nur an der Matrix (Determinante < 0); hflip meldet sonst ebenfalls −180.
 * Altlast: tags.rotate zählt im Uhrzeigersinn.
 */
export function deriveRotation(s: FfStream): { rotation: number; mirrored: boolean } {
  const norm = (d: number): number => ((Math.round(d) % 360) + 360) % 360
  const dm = s.side_data_list?.find((x) => x.side_data_type === 'Display Matrix')
  if (dm) {
    const m = parseMatrix(dm.displaymatrix)
    const mirrored = m ? m[0] * m[4] - m[1] * m[3] < 0 : false
    let rotation = norm(-(num(dm.rotation) ?? 0))
    // reines horizontales Spiegeln: Matrix [-1 0; 0 1] -> keine Drehung
    if (mirrored && rotation === 180 && m && m[4] > 0) rotation = 0
    return { rotation, mirrored }
  }
  const legacy = num(tag(s.tags, 'rotate'))
  return { rotation: legacy === null ? 0 : norm(legacy), mirrored: false }
}

/* ------------------------------ Container ------------------------------- */

const MOV_BRANDS: Record<string, string> = {
  'qt  ': 'QuickTime (MOV)',
  'M4A ': 'MPEG-4 Audio (M4A)',
  'M4V ': 'MPEG-4 Video (M4V)',
  'M4B ': 'MPEG-4 Hörbuch (M4B)',
  'mj2 ': 'Motion JPEG 2000',
  XAVC: 'XAVC (MP4)'
}
const FORMAT_NAMES: Record<string, string> = {
  mxf: 'MXF',
  mpegts: 'MPEG-TS',
  mpeg: 'MPEG-PS',
  avi: 'AVI',
  wav: 'WAV',
  w64: 'Wave64',
  aiff: 'AIFF',
  mp3: 'MP3',
  flac: 'FLAC',
  ogg: 'Ogg',
  gif: 'GIF',
  dv: 'DV',
  asf: 'Windows Media (ASF)',
  flv: 'Flash Video',
  aac: 'AAC (ADTS)',
  ac3: 'AC-3',
  eac3: 'E-AC-3',
  h264: 'H.264-Rohdatenstrom',
  hevc: 'HEVC-Rohdatenstrom'
}

export function containerName(fmt: FfFormat, ext: string): string {
  const fn = fmt.format_name ?? ''
  // ffprobe meldet MOV, MP4 und M4A gleich ("mov,mp4,m4a,…") – die Brand entscheidet.
  if (fn.startsWith('mov,mp4')) {
    const brand = tag(fmt.tags, 'major_brand')
    if (!brand) return 'QuickTime (MOV)'
    if (MOV_BRANDS[brand]) return MOV_BRANDS[brand]
    if (/^3g2/.test(brand)) return '3GPP2 (3G2)'
    if (/^3g/.test(brand)) return '3GPP (3GP)'
    return 'MPEG-4 (MP4)'
  }
  if (fn === 'matroska,webm') return ext === '.webm' ? 'WebM' : 'Matroska (MKV)'
  if (fn === 'image2') return `Einzelbild (${ext.slice(1).toUpperCase() || 'Bild'})`
  if (fn.endsWith('_pipe')) return `Einzelbild (${fn.replace('_pipe', '').toUpperCase()})`
  return FORMAT_NAMES[fn] ?? fmt.format_long_name ?? (fn || 'Unbekannt')
}

// Erwartete Endungen je Containerfamilie (Player wählen den Demuxer oft per Endung).
const EXT_FAMILIES: [RegExp, string[]][] = [
  [/^mov,mp4/, ['mov', 'qt', 'mp4', 'm4v', 'm4a', 'm4b', '3gp', '3g2', 'mj2']],
  [/^matroska/, ['mkv', 'mka', 'mks', 'webm']],
  [/^mpegts$/, ['ts', 'mts', 'm2ts', 'm2t', 'tsv']],
  [/^avi$/, ['avi']],
  [/^mxf/, ['mxf']],
  [/^mpeg$/, ['mpg', 'mpeg', 'vob', 'm2p', 'mpe']],
  [/^asf$/, ['wmv', 'wma', 'asf']],
  [/^wav$/, ['wav', 'bwf']],
  [/^mp3$/, ['mp3']],
  [/^flac$/, ['flac']],
  [/^ogg$/, ['ogg', 'oga', 'ogv', 'opus']],
  [/^aiff$/, ['aif', 'aiff', 'aifc']],
  [/^gif$/, ['gif']],
  [/^dv$/, ['dv', 'dif']],
  [/^flv$/, ['flv']]
]

export function extensionMismatch(formatName: string | undefined, ext: string): boolean {
  if (!formatName || !ext) return false
  const e = ext.replace(/^\./, '').toLowerCase()
  const fam = EXT_FAMILIES.find(([re]) => re.test(formatName))
  return fam ? !fam[1].includes(e) : false
}

/* ------------------------------- Timecode ------------------------------- */

function framesToTc(sec: number, fps: number | null): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  const whole = Math.floor(sec)
  const hh = Math.floor(whole / 3600)
  const mm = Math.floor((whole % 3600) / 60)
  const ss = whole % 60
  if (fps) return `${p(hh)}:${p(mm)}:${p(ss)}:${p(Math.round((sec - whole) * fps))}`
  return `${p(hh)}:${p(mm)}:${p(ss)}.${String(Math.round((sec - whole) * 1000)).padStart(3, '0')}`
}

/* --------------------------------- Parser -------------------------------- */

export interface ParseContext {
  path: string
  sizeBytes: number | null
  modifiedMs: number | null
}

function basenameOf(p: string): string {
  return p.split(/[\\/]/).pop() ?? p
}

function extOf(p: string): string {
  const b = basenameOf(p)
  const i = b.lastIndexOf('.')
  return i > 0 ? b.slice(i).toLowerCase() : ''
}

function collectTags(json: FfprobeJson): MediaTag[] {
  const out: MediaTag[] = []
  const push = (scope: string, tags: FfTags | undefined): void => {
    for (const [key, value] of Object.entries(tags ?? {})) {
      if (value === undefined || value === '') continue
      out.push({ scope, key, value: String(value) })
    }
  }
  push('Datei', json.format?.tags)
  for (const s of json.streams ?? []) {
    const kind =
      { video: 'Video', audio: 'Audio', subtitle: 'Untertitel', data: 'Daten' }[
        s.codec_type ?? ''
      ] ?? s.codec_type
    push(`Spur ${s.index ?? '?'}${kind ? ` (${kind})` : ''}`, s.tags)
  }
  return out
}

/** Normalisiert die Basis-Ausgabe (-show_format -show_streams -show_chapters). */
export function parseMediaInfo(json: FfprobeJson, ctx: ParseContext): MediaInfo {
  const fmt = json.format ?? {}
  const streams = json.streams ?? []
  const ext = extOf(ctx.path)
  const formatName = fmt.format_name ?? null
  const size = ctx.sizeBytes ?? pos(fmt.size)
  const fmtDur = pos(fmt.duration)
  const stillContainer = formatName === 'image2' || (formatName ?? '').endsWith('_pipe')

  const durOf = (s: FfStream): number | null =>
    pos(s.duration) ?? hmsToSec(tag(s.tags, 'DURATION')) ?? fmtDur
  // Bitrate: Stream -> mkvmerge-Statistik -> Bytes/Dauer (Rest-Schätzung später)
  const brOf = (s: FfStream): number | null => {
    const direct = pos(s.bit_rate) ?? pos(tag(s.tags, 'BPS'))
    if (direct) return direct
    const bytes = pos(tag(s.tags, 'NUMBER_OF_BYTES'))
    const d = durOf(s)
    return bytes && d ? (bytes * 8) / d : null
  }

  const video: MediaVideoTrack[] = []
  const audio: MediaAudioTrack[] = []
  const subtitles: MediaSubtitleTrack[] = []
  const data: MediaDataTrack[] = []
  const covers: MediaCover[] = []
  let attachments = 0

  for (const s of streams) {
    const index = s.index ?? 0
    const type = s.codec_type
    if (type === 'video' && s.disposition?.attached_pic === 1) {
      // Cover-Art (MP3/M4A) ist kein Video – sonst „PNG mit 90000 fps".
      covers.push({
        index,
        codec: codecDisplay(s),
        width: s.width ?? null,
        height: s.height ?? null
      })
      continue
    }
    if (type === 'video') {
      const pf = s.pix_fmt ? parsePixFmt(s.pix_fmt) : null
      const frames = pos(s.nb_frames) ?? pos(tag(s.tags, 'NUMBER_OF_FRAMES'))
      const isStill = stillContainer || frames === 1
      const { fps, mode } = isStill ? { fps: null, mode: 'still' as MediaFpsMode } : deriveFps(s)
      const { rotation, mirrored } = deriveRotation(s)
      const w = s.width ?? 0
      const h = s.height ?? 0
      const sarNum = ratio(s.sample_aspect_ratio)
      const anamorphic = sarNum !== null && Math.abs(sarNum - 1) > 0.001
      let dw = anamorphic && sarNum ? Math.round(w * sarNum) : w
      let dh = h
      if (rotation === 90 || rotation === 270) [dw, dh] = [dh, dw]
      const fo = s.field_order
      const scan: MediaScanType =
        fo === 'progressive'
          ? 'progressive'
          : fo === 'tt' || fo === 'tb'
            ? 'tff'
            : fo === 'bb' || fo === 'bt'
              ? 'bff'
              : 'unknown'
      const tg = fourcc(s)
      const hapAlpha = s.codec_name === 'hap' && (tg === 'Hap5' || tg === 'HapM' || tg === 'HapA')
      const webmAlpha = tag(s.tags, 'alpha_mode') === '1'
      const isGif = s.codec_name === 'gif'
      const alpha = !isGif && (Boolean(pf?.alpha) || hapAlpha || webmAlpha)
      const alphaNote = isGif
        ? 'GIF: höchstens 1-bit-Transparenz'
        : webmAlpha && !pf?.alpha
          ? 'nur als WebM-Alpha (alpha_mode)'
          : null
      const side = s.side_data_list ?? []
      const md = side.find((x) => x.side_data_type === 'Mastering display metadata')
      const cll = side.find((x) => x.side_data_type === 'Content light level metadata')
      const dovi = side.find((x) => x.side_data_type === 'DOVI configuration record')
      const trc = s.color_transfer ?? null
      const range =
        s.color_range === 'pc' || pf?.fullRange ? 'pc' : s.color_range === 'tv' ? 'tv' : null
      const dur = durOf(s)
      const br = brOf(s)
      const bitDepth =
        pos(s.bits_per_raw_sample) ?? (pf && pf.chroma !== 'Bayer (RAW)' ? pf.bits : null)
      const profileShown =
        s.codec_name === 'prores' || s.codec_name === 'dnxhd' || s.codec_name === 'hap'
          ? null
          : (s.profile ?? null)
      video.push({
        index,
        codecName: s.codec_name ?? null,
        codec: codecDisplay(s),
        profile: profileShown,
        level: levelLabel(s),
        fourcc: tg,
        codecClass: codecClass(s.codec_name, isStill),
        width: w,
        height: h,
        displayWidth: dw,
        displayHeight: dh,
        sar: anamorphic ? (s.sample_aspect_ratio ?? null) : null,
        dar:
          s.display_aspect_ratio && s.display_aspect_ratio !== '0:1'
            ? s.display_aspect_ratio
            : null,
        rotation,
        mirrored,
        fps,
        fpsRational: isStill ? null : (s.r_frame_rate ?? null),
        fpsMode: mode,
        scan: isStill || isGif ? 'progressive' : scan,
        pixFmt: s.pix_fmt ?? null,
        bitDepth,
        chroma: pf?.chroma ?? null,
        alpha,
        alphaNote,
        colorRange: range,
        colorSpace: s.color_space ?? null,
        colorTransfer: trc,
        colorPrimaries: s.color_primaries ?? null,
        hdr: trc === 'smpte2084' ? 'pq' : trc === 'arib-std-b67' ? 'hlg' : null,
        dolbyVision:
          dovi?.dv_profile !== undefined
            ? `${dovi.dv_profile}${dovi.dv_bl_signal_compatibility_id ? `.${dovi.dv_bl_signal_compatibility_id}` : ''}`
            : null,
        masteringMaxNits: md ? ratio(md.max_luminance) : null,
        maxCll: cll?.max_content ?? null,
        maxFall: cll?.max_average ?? null,
        bitRate: isStill ? null : br,
        bitRateEstimated: false,
        frames: isStill ? null : frames,
        framesEstimated: false,
        durationSec: isStill ? null : dur,
        hasBFrames: (s.has_b_frames ?? 0) > 0,
        timecode: tag(s.tags, 'timecode'),
        language: language(s.tags),
        title: tag(s.tags, 'title', 'name'),
        gop: null
      })
    } else if (type === 'audio') {
      const name = s.codec_name ?? ''
      const lossy = LOSSY_AUDIO.has(name)
      // Bittiefe nur bei verlustfreien Codecs: fltp ist bei AAC nur das Decoder-Format.
      let bits: number | null = null
      if (!lossy) {
        bits =
          pos(s.bits_per_raw_sample) ??
          pos(s.bits_per_sample) ??
          SAMPLE_FMT_BITS[s.sample_fmt ?? ''] ??
          null
      }
      const ch = s.channels ?? null
      const layout =
        s.channel_layout ?? (ch === 1 ? 'mono' : ch === 2 ? 'stereo' : ch ? `${ch} Kanäle` : null)
      audio.push({
        index,
        codecName: s.codec_name ?? null,
        codec: codecDisplay(s),
        profile: s.profile ?? null,
        channels: ch,
        channelLayout: layout,
        layoutKnown: Boolean(s.channel_layout),
        sampleRate: pos(s.sample_rate),
        bitDepth: bits,
        float: /^(flt|dbl)/.test(s.sample_fmt ?? '') && !lossy ? true : /^pcm_f/.test(name),
        lossy,
        bitRate: brOf(s),
        bitRateEstimated: false,
        durationSec: durOf(s),
        language: language(s.tags),
        title: tag(s.tags, 'title', 'name'),
        isDefault: s.disposition?.default === 1
      })
    } else if (type === 'subtitle') {
      subtitles.push({
        index,
        codecName: s.codec_name ?? null,
        codec: codecDisplay(s),
        bitmap: BITMAP_SUBS.has(s.codec_name ?? ''),
        language: language(s.tags),
        title: tag(s.tags, 'title', 'name'),
        forced: s.disposition?.forced === 1,
        isDefault: s.disposition?.default === 1
      })
    } else if (type === 'data') {
      const tg = s.codec_tag_string
      // MP4-Kapitelspur sieht aus wie Daten/Untertitel – ist aber nur Kapitel-Text.
      if (s.codec_name === 'bin_data' && tg === 'text') continue
      const kinds: Record<string, string> = {
        tmcd: 'Timecode',
        gpmd: 'GoPro-Telemetrie',
        mebx: 'Kamera-Metadaten (mebx)',
        rtmd: 'Sony-Kamera-Metadaten'
      }
      const kind =
        (tg && kinds[tg]) ||
        (s.codec_name === 'klv' ? 'KLV-Metadaten' : tg && !tg.includes('[') ? tg : null) ||
        s.codec_name ||
        'Daten'
      data.push({ index, kind, timecode: tag(s.tags, 'timecode') })
    } else if (type === 'attachment') {
      attachments++
    }
  }

  const realVideo = video.filter((v) => v.fpsMode !== 'still')
  const isStill = video.length > 0 && realVideo.length === 0 && audio.length === 0

  // Bitrate-Rest: genau EIN Stream ohne Angabe -> Gesamt minus übrige (≈).
  const fmtRate = pos(fmt.bit_rate)
  const tracks: { bitRate: number | null; bitRateEstimated: boolean }[] = [...realVideo, ...audio]
  const missing = tracks.filter((t) => t.bitRate === null)
  if (fmtRate && missing.length === 1 && tracks.length > 0) {
    const rest = fmtRate - tracks.reduce((sum, t) => sum + (t.bitRate ?? 0), 0)
    if (rest > 0) {
      missing[0].bitRate = rest
      missing[0].bitRateEstimated = true
    }
  }
  // Bildanzahl schätzen, wo der Container keine nennt (MKV/TS)
  for (const v of realVideo) {
    if (v.frames === null && v.fps && v.durationSec) {
      v.frames = Math.round(v.fps * v.durationSec)
      v.framesEstimated = true
    }
  }

  // Gesamtdauer: Format -> längster Stream; Standbilder haben keine Dauer
  let duration = fmtDur
  if (!duration) {
    const ds = [...realVideo, ...audio].map((t) => t.durationSec).filter((d): d is number => !!d)
    duration = ds.length ? Math.max(...ds) : null
  }
  if (isStill) duration = null
  let overall = isStill ? null : fmtRate
  let overallEstimated = false
  if (!overall && !isStill && size && duration) {
    overall = (size * 8) / duration
    overallEstimated = true
  }

  // Timecode: Video-Tag (MOV) -> tmcd-Spur -> Format (MXF/DV/MKV) -> BWF-time_reference
  let timecode: string | null = null
  let timecodeSource: string | null = null
  const vtc = video.find((v) => v.timecode)
  const dtc = data.find((d) => d.timecode)
  const ftc = tag(fmt.tags, 'timecode')
  if (vtc) [timecode, timecodeSource] = [vtc.timecode, 'Videospur']
  else if (dtc) [timecode, timecodeSource] = [dtc.timecode, 'Timecode-Spur']
  else if (ftc) [timecode, timecodeSource] = [ftc, 'Container']
  else {
    const ref = num(tag(fmt.tags, 'time_reference'))
    const sr = audio[0]?.sampleRate
    if (ref !== null && sr) {
      timecode = framesToTc(ref / sr, realVideo[0]?.fps ?? null)
      timecodeSource = 'BWF (time_reference)'
    }
  }

  // Unvollständige Kopie: Index (MOV/MP4-Sampletabelle bzw. mkvmerge-Statistik)
  // verspricht mehr Bytes als die Datei hat. MXF/TS-Bitraten sind nominal -> nicht prüfen.
  let expected = 0
  const movLike = (formatName ?? '').startsWith('mov,mp4')
  for (const s of streams) {
    if (s.disposition?.attached_pic === 1) continue
    if (movLike) {
      const b = pos(s.bit_rate)
      const d = pos(s.duration)
      if (b && d) expected += (b * d) / 8
    } else {
      const nb = pos(tag(s.tags, 'NUMBER_OF_BYTES'))
      if (nb) expected += nb
    }
  }
  const incomplete = Boolean(size && expected && size < expected * 0.9)

  const make = tag(fmt.tags, 'com.apple.quicktime.make', 'make')
  const model = tag(fmt.tags, 'com.apple.quicktime.model', 'model')
  const created = tag(fmt.tags, 'creation_time') ?? findStreamCreation(streams)
  const chapters: MediaChapter[] = (json.chapters ?? [])
    .map((c) => ({
      startSec: num(c.start_time) ?? 0,
      endSec: num(c.end_time) ?? 0,
      title: tag(c.tags, 'title')
    }))
    .filter((c) => c.endSec >= c.startSec)

  return {
    path: ctx.path,
    name: basenameOf(ctx.path),
    sizeBytes: size,
    modifiedMs: ctx.modifiedMs,
    formatName,
    container: containerName(fmt, ext),
    containerLong: fmt.format_long_name ?? null,
    extensionMismatch: stillContainer ? false : extensionMismatch(formatName ?? undefined, ext),
    probeScore: fmt.probe_score ?? null,
    isStill,
    durationSec: duration,
    startTimeSec: num(fmt.start_time),
    bitRate: overall,
    bitRateEstimated: overallEstimated,
    timecode,
    timecodeSource,
    title: tag(fmt.tags, 'title'),
    encoder: tag(fmt.tags, 'encoder', 'software', 'encoding_tool', 'product_name'),
    creationTime: validCreation(created),
    camera: [make, model].filter(Boolean).join(' ') || null,
    location: tag(fmt.tags, 'com.apple.quicktime.location.ISO6709', 'location'),
    incomplete,
    video,
    audio,
    subtitles,
    data,
    covers,
    attachments,
    chapters,
    tags: collectTags(json),
    deepAnalyzed: false
  }
}

function findStreamCreation(streams: FfStream[]): string | null {
  for (const s of streams) {
    const c = tag(s.tags, 'creation_time')
    if (c) return c
  }
  return null
}

/** creation_time kann „…Z;…Z" verkettet sein; 1904/1970-Nullwerte verwerfen. */
function validCreation(v: string | null): string | null {
  if (!v) return null
  const first = v.split(';')[0].trim()
  const year = Number(first.slice(0, 4))
  return Number.isFinite(year) && year >= 1990 ? first : null
}

/* ---------------------------- Tiefenanalyse ------------------------------ */

/**
 * Paket-Scan (`-show_entries packet=pts,duration,flags -of csv=p=0`) -> GOP + VFR.
 * VFR gilt als bestätigt, wenn > 2 % der Bildabstände > 10 % vom Median abweichen
 * (MKV rundet auf ms: 16/17 ms bei 59,94 fps sind KEIN VFR).
 */
export function analyzePackets(csv: string): MediaGopInfo | null {
  const rows = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [pts, , flags] = l.split(',')
      return { pts: num(pts), key: (flags ?? '').startsWith('K') }
    })
  if (rows.length < 2) return null
  const keyIdx = rows.map((r, i) => (r.key ? i : -1)).filter((i) => i >= 0)
  const gaps = keyIdx.slice(1).map((v, i) => v - keyIdx[i])
  const median = (arr: number[]): number | null => {
    if (!arr.length) return null
    const s = [...arr].sort((a, b) => a - b)
    return s[Math.floor(s.length / 2)]
  }
  const allIntra = keyIdx.length === rows.length
  let keyframeInterval: number | null
  let atLeast = false
  if (allIntra) keyframeInterval = 1
  else if (gaps.length) keyframeInterval = median(gaps)
  else {
    // nur ein (oder kein) Keyframe im Scan -> Abstand mindestens so lang wie der Scan
    keyframeInterval = rows.length
    atLeast = true
  }
  const pts = rows
    .map((r) => r.pts)
    .filter((p): p is number => p !== null)
    .sort((a, b) => a - b)
  const deltas = pts
    .slice(1)
    .map((p, i) => p - pts[i])
    .filter((d) => d > 0)
  const med = median(deltas)
  let vfr = false
  if (med && deltas.length >= 10) {
    const off = deltas.filter((d) => Math.abs(d - med) > Math.max(med * 0.1, 1)).length
    vfr = off / deltas.length > 0.02
  }
  return {
    packets: rows.length,
    keyframes: keyIdx.length,
    keyframeInterval,
    keyframeIntervalAtLeast: atLeast,
    allIntra,
    vfr
  }
}

export interface FirstFrameInfo {
  interlaced: boolean | null
  topFieldFirst: boolean | null
  masteringMaxNits: number | null
  maxCll: number | null
  maxFall: number | null
}

/** Erstes Frame (`-show_frames … -read_intervals %+#1`): Interlace-Flag + HDR10-SEI. */
export function parseFirstFrame(json: unknown): FirstFrameInfo | null {
  const frames = (json as { frames?: Record<string, unknown>[] } | null)?.frames
  const f = frames?.[0]
  if (!f) return null
  const side = (f.side_data_list as FfSideData[] | undefined) ?? []
  const md = side.find((x) => x.side_data_type === 'Mastering display metadata')
  const cll = side.find((x) => x.side_data_type === 'Content light level metadata')
  const il = num(f.interlaced_frame)
  const tff = num(f.top_field_first)
  return {
    interlaced: il === null ? null : il === 1,
    topFieldFirst: tff === null ? null : tff === 1,
    masteringMaxNits: md ? ratio(md.max_luminance) : null,
    maxCll: cll?.max_content ?? null,
    maxFall: cll?.max_average ?? null
  }
}

/** Ergebnisse der Tiefenanalyse in die erste Videospur übernehmen. */
export function applyDeepAnalysis(
  info: MediaInfo,
  gop: MediaGopInfo | null,
  frame: FirstFrameInfo | null
): MediaInfo {
  const v = info.video.find((t) => t.fpsMode !== 'still')
  if (v) {
    if (gop) {
      v.gop = gop
      if (v.fpsMode === 'vfr-suspect' || v.fpsMode === 'cfr') {
        // Paket-Scan ist der Nachweis: bestätigen oder entwarnen
        v.fpsMode = gop.vfr ? 'vfr' : 'cfr'
      }
    }
    if (frame) {
      if (v.scan === 'unknown' && frame.interlaced !== null) {
        v.scan = frame.interlaced ? (frame.topFieldFirst ? 'tff' : 'bff') : 'progressive'
      }
      v.masteringMaxNits ??= frame.masteringMaxNits
      v.maxCll ??= frame.maxCll
      v.maxFall ??= frame.maxFall
    }
  }
  return { ...info, deepAnalyzed: true }
}

/* ----------------------------- Fehlermeldungen ---------------------------- */

/** Letzte stderr-Zeile ohne vorangestellten Dateipfad. */
export function lastLine(text: string, path?: string): string | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const last = lines.length ? lines[lines.length - 1] : null
  // ffprobe stellt den vollen Pfad voran – der steht in der Oberfläche ohnehin
  return path && last?.startsWith(`${path}: `) ? last.slice(path.length + 2) : last
}

/** ffprobe-Fehler -> kurze deutsche Meldung (+ Originaltext als Detail). */
export function describeProbeError(
  stdout: string,
  stderr: string,
  path?: string
): { error: string; detail: string | null } {
  let code: number | null = null
  let text: string | null = null
  try {
    const j = JSON.parse(stdout) as FfprobeJson
    code = j.error?.code ?? null
    text = j.error?.string ?? null
  } catch {
    // kein JSON (z.B. abgebrochen) -> nur stderr
  }
  const detail = lastLine(stderr, path) ?? text
  const all = `${stderr}\n${text ?? ''}`
  if (/moov atom not found/i.test(all))
    return { error: 'MP4/MOV unvollständig – Aufnahme oder Kopiervorgang abgebrochen', detail }
  if (/EBML header parsing failed/i.test(all))
    return { error: 'Matroska/WebM-Datei beschädigt', detail }
  if (code === -2 || /No such file/i.test(all)) return { error: 'Datei nicht gefunden', detail }
  if (code === -13 || /Permission denied/i.test(all)) return { error: 'Keine Leserechte', detail }
  if (code === -21 || /Is a directory/i.test(all)) return { error: 'Ist ein Ordner', detail }
  return { error: 'Keine lesbare Mediendatei (Format nicht erkannt oder beschädigt)', detail }
}
