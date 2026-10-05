// Gemeinsamer Konvertierungs-Plan für Video-Konverter und Player-Import. Aus der
// Medien-Info-Analyse einer Datei und den gewünschten Optionen wird an EINER Stelle
// entschieden, was passiert: Drehung, quadratische Pixel, Halbbilder, Bildrate, HDR,
// Alpha, Größe/Einpassen, Ton. Rein (kein Node/Electron) -> testbar und im Renderer
// als Vorschau nutzbar; der main-Prozess baut daraus die ffmpeg-Argumente.
//
// Reihenfolge der Bildfilter (die Drehung erledigt ffmpeg per Autorotate VOR der Kette):
//   Deinterlace -> Tempo/Bildrate -> quadratische Pixel -> Alpha flach -> HDR->SDR
//   -> Größe/Einpassen -> gerade/×4-Maße -> Farbmatrix/Range -> (Pixelformat im Encoder-Teil)

import type {
  ConvertFit,
  ConvertFormat,
  ConvertFps,
  ConvertOptions,
  ConvertRaster,
  MediaAudioTrack,
  MediaInfo,
  MediaVideoTrack
} from './types'
import { loudnessPlanStep, type LoudnessTarget } from './loudness'

/* --------------------------------- Formate --------------------------------- */

export interface ConvertFormatInfo {
  label: string
  family: 'hap' | 'h264' | 'hevc' | 'prores' | 'audio' | 'image'
  container: 'mov' | 'mp4' | 'wav' | 'jpg'
  ext: string
  /** Dateinamen-Zusatz: clip_<suffix>.mov */
  suffix: string
  alpha: boolean
  /** ffmpeg-Encoder, an dem die Verfügbarkeit hängt */
  encoder: string
}

const hap = (label: string, suffix: string, alpha: boolean): ConvertFormatInfo => ({
  label,
  family: 'hap',
  container: 'mov',
  ext: '.mov',
  suffix,
  alpha,
  encoder: 'hap'
})
const prores = (label: string, suffix: string, alpha = false): ConvertFormatInfo => ({
  label,
  family: 'prores',
  container: 'mov',
  ext: '.mov',
  suffix,
  alpha,
  encoder: 'prores_ks'
})

export const CONVERT_FORMATS: Record<ConvertFormat, ConvertFormatInfo> = {
  hap: hap('HAP', 'hap', false),
  hap_alpha: hap('HAP Alpha', 'hap_alpha', true),
  hap_q: hap('HAP Q', 'hap_q', false),
  h264: {
    label: 'H.264 (MP4)',
    family: 'h264',
    container: 'mp4',
    ext: '.mp4',
    suffix: 'h264',
    alpha: false,
    encoder: 'libx264'
  },
  hevc: {
    label: 'H.265 (MP4)',
    family: 'hevc',
    container: 'mp4',
    ext: '.mp4',
    suffix: 'h265',
    alpha: false,
    encoder: 'libx265'
  },
  prores_proxy: prores('ProRes 422 Proxy', 'prores_proxy'),
  prores_lt: prores('ProRes 422 LT', 'prores_lt'),
  prores_422: prores('ProRes 422', 'prores_422'),
  prores_hq: prores('ProRes 422 HQ', 'prores_hq'),
  prores_4444: prores('ProRes 4444', 'prores_4444', true),
  wav: {
    label: 'WAV (nur Ton)',
    family: 'audio',
    container: 'wav',
    ext: '.wav',
    suffix: 'ton',
    alpha: false,
    encoder: 'pcm_s24le'
  },
  jpg: {
    label: 'JPG (Standbild)',
    family: 'image',
    container: 'jpg',
    ext: '.jpg',
    suffix: 'bild',
    alpha: false,
    encoder: 'mjpeg'
  }
}

/** ProRes-Profilnummer für prores_ks (-profile:v). */
export const PRORES_PROFILE: Partial<Record<ConvertFormat, number>> = {
  prores_proxy: 0,
  prores_lt: 1,
  prores_422: 2,
  prores_hq: 3,
  prores_4444: 4
}

/* ------------------------------ Pixel & Raten ------------------------------ */

/**
 * Auf quadratische Pixel bringen (SAR 1:1). Anamorphes Material (HDV 1440×1080, DV, DVD)
 * ist gestaucht gespeichert; Medienserver, Player-Boxen und ein abschließendes setsar=1
 * ignorieren das Pixel-Seitenverhältnis -> ohne diesen Schritt wäre das Bild verzerrt.
 * Nur vergrößern (keine Details verschenkt); bei SAR 1 oder unbekannter SAR (ffmpeg
 * setzt dann sar=1) unverändert. squarePixelSize() rechnet exakt gleich.
 */
export const SQUARE_PIXELS =
  "scale='if(gte(sar,1),trunc(iw*sar/2)*2,iw)':'if(gte(sar,1),ih,trunc(ih/sar/2)*2)',setsar=1"

/** SAR als Bruch [Zähler, Nenner]; unbekannt/ungültig = [1, 1]. */
export function sarParts(s: string | null | undefined): [number, number] {
  const m = /^(\d+)[:/](\d+)$/.exec(s ?? '')
  if (!m) return [1, 1]
  const num = Number(m[1])
  const den = Number(m[2])
  return num > 0 && den > 0 ? [num, den] : [1, 1]
}

/** Maße in quadratischen Pixeln (dieselbe Rechnung wie SQUARE_PIXELS). */
export function squarePixelSize(
  w: number | null,
  h: number | null,
  sar: number
): { width: number | null; height: number | null } {
  if (!w || !h || sar === 1) return { width: w, height: h }
  return sar > 1
    ? { width: Math.trunc((w * sar) / 2) * 2, height: h }
    : { width: w, height: Math.trunc(h / sar / 2) * 2 }
}

// NTSC-Raten exakt als Bruch (ffmpeg rechnet sonst mit gerundeten Werten)
const NAMED_RATES: [number, number, number, string][] = [
  [24000 / 1001, 24000, 1001, '23,976'],
  [30000 / 1001, 30000, 1001, '29,97'],
  [48000 / 1001, 48000, 1001, '47,952'],
  [60000 / 1001, 60000, 1001, '59,94'],
  [120000 / 1001, 120000, 1001, '119,88']
]
const STANDARD_RATES = [24000 / 1001, 24, 25, 30000 / 1001, 30, 48, 50, 60000 / 1001, 60]

export const RASTER_BASE: Record<ConvertRaster, number> = {
  '25': 25,
  '30': 30,
  ntsc: 30000 / 1001,
  film: 24
}

/** Bildrate als Bruch [Zähler, Nenner]. */
export function rateRational(f: number): [number, number] {
  for (const [v, num, den] of NAMED_RATES) if (Math.abs(f - v) < 0.002) return [num, den]
  if (Math.abs(f - Math.round(f)) < 1e-3) return [Math.round(f), 1]
  return [Math.round(f * 1000), 1000]
}

/** Schreibweise für ffmpeg-Filter: „30000/1001", „25", „12.5". */
export function rateArg(f: number): string {
  const [num, den] = rateRational(f)
  if (den === 1) return String(num)
  if (den === 1001) return `${num}/${den}`
  return String(num / den)
}

const de = (n: number, max = 3): string =>
  new Intl.NumberFormat('de-DE', { maximumFractionDigits: max }).format(n)

/** Anzeige: „29,97", „25", „12,5". */
export function rateText(f: number | null): string {
  if (!f) return '?'
  for (const [v, , , label] of NAMED_RATES) if (Math.abs(f - v) < 0.002) return label
  return de(f, 3)
}

/** Nächste Standard-Bildrate (Verhältnis, nicht Differenz: 59 liegt näher an 60 als an 50). */
export function snapRate(f: number): number {
  let best = STANDARD_RATES[0]
  for (const s of STANDARD_RATES)
    if (Math.abs(Math.log(f / s)) < Math.abs(Math.log(f / best))) best = s
  return best
}

/**
 * Zielrate für ein Show-Raster; null = passt schon (Rate ist ein ganzzahliger Teiler oder
 * ein Vielfaches der Ausgaberate, z.B. 12,5/25/50/100 bei 50 Hz).
 */
export function rasterTarget(f: number, raster: ConvertRaster): number | null {
  const base = RASTER_BASE[raster]
  const hz = 2 * base
  const ratio = f <= hz ? hz / f : f / hz
  const n = Math.round(ratio)
  if (n >= 1 && Math.abs(ratio - n) < 1e-4) return null
  // schnelle Quellen auf die doppelte Rate (60 -> 50), langsame auf die einfache (30 -> 25)
  return f > base * 1.25 ? hz : base
}

type RateChange = { target: number; method: 'conform' | 'fps' } | null

function decideRate(f: number, variable: boolean, opt: ConvertFps): RateChange {
  // Bei variabler Rate ist der Durchschnitt kein Bildtakt -> erst auf einen Standard
  const base = variable ? snapRate(f) : f
  const target =
    opt.mode === 'original'
      ? variable
        ? base
        : null
      : opt.mode === 'raster'
        ? (rasterTarget(base, opt.raster) ?? (variable ? base : null))
        : !variable && Math.abs(opt.fps - f) < 1e-3
          ? null
          : opt.fps
  if (target === null) return null
  // 29,97 <-> 30 und 23,976 <-> 24: Tempo minimal anpassen statt alle 17-42 s ein Bild
  // zu doppeln/auszulassen (Bildsprünge bei Schwenks). Nur bei konstanter Quelle.
  const dev = Math.abs(target / f - 1)
  if (!variable && dev > 1e-6 && dev <= 0.0011) return { target, method: 'conform' }
  return { target, method: 'fps' }
}

/* ---------------------------------- Plan ---------------------------------- */

export interface PlanCaps {
  /** HDR -> SDR möglich (Filter zscale + tonemap im gebündelten ffmpeg) */
  tonemap: boolean
  /** libvpx-Decoder vorhanden (nur sie lesen den Alpha-Kanal von VP8/VP9-WebM) */
  vpxAlpha?: boolean
}

export interface ConvertIssue {
  id: string
  level: 'problem' | 'warning' | 'info'
  title: string
  text: string
}

export interface ColorTags {
  primaries: string
  trc: string
  space: string
  range: 'tv' | 'pc'
}

export interface ConvertPlanVideo {
  streamIndex: number
  /** unverändert übernehmen (nur umverpacken) */
  copy: boolean
  width: number
  height: number
  fps: number | null
  filters: string[]
  /** Ziel-Pixelformat (null = Encoder wählt, z.B. JPG) */
  pixFmt: string | null
  /** Decoder für die Quelle erzwingen (z.B. libvpx-vp9 für WebM mit Alpha) */
  decoder: string | null
  /** Keyframe-Abstand in Bildern für Long-GOP-Encoder (2 s) */
  gop: number | null
}

export interface ConvertPlanAudio {
  streamIndex: number
  codec: 'aac' | 'pcm_s16le' | 'pcm_s24le' | 'copy'
  /** null = Kanalzahl der Quelle */
  channels: number | null
  sampleRate: number | null
  bitrate: number | null
  /** Filter vor der Lautheit (Tempo) */
  filters: string[]
  /** Lautheit angleichen: Ziel. Der Filter entsteht erst mit den Messwerten (args.ts). */
  loudness: LoudnessTarget | null
}

export interface ConvertPlan {
  /** tatsächliches Format (Alpha-Automatik kann es ändern) */
  format: ConvertFormat
  formatInfo: ConvertFormatInfo
  video: ConvertPlanVideo | null
  audio: ConvertPlanAudio | null
  /** erwartete Ausgabedauer (Tempo-Anpassung ändert sie minimal) */
  durationSec: number | null
  /** was mit der Datei passiert – für Vorschau und Auftragsliste */
  steps: string[]
  issues: ConvertIssue[]
}

export type ConvertPlanResult = { ok: true; plan: ConvertPlan } | { ok: false; error: string }

// Codecs, deren SD-/1080-Material oft interlaced ist (Scan nicht erkannt -> Hinweis)
const SCAN_SUSPECT = new Set(['mpeg2video', 'dvvideo', 'h264', 'vc1', 'prores', 'dnxhd'])

const FIT_LABEL: Record<ConvertFit, string> = {
  bars: 'Letterbox',
  crop: 'Gefüllt (Rand beschnitten)',
  stretch: 'Gestreckt',
  blur: 'Blur-Rand'
}

const TONEMAP_HEAD =
  'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0'

function fitFilters(
  fit: ConvertFit,
  W: number,
  H: number,
  alpha: boolean,
  blur: ConvertOptions['blur']
): string[] {
  switch (fit) {
    case 'bars':
      return [
        `scale=${W}:${H}:force_original_aspect_ratio=decrease`,
        `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=${alpha ? 'black@0' : 'black'}`
      ]
    case 'crop':
      return [`scale=${W}:${H}:force_original_aspect_ratio=increase`, `crop=${W}:${H}`]
    case 'stretch':
      return [`scale=${W}:${H}`]
    case 'blur': {
      // formatfüllender, unscharfer Hintergrund + scharfer Inhalt mittig. Stärke 0..100
      // skaliert den boxblur-Radius (gedeckelt gegen Extremkosten), Abdunkelung legt ein
      // halbtransparentes Schwarz darüber.
      const minWH = Math.min(W, H)
      const strength = Math.max(0, Math.min(100, blur?.strength ?? 50))
      const radius = Math.max(
        1,
        Math.min(Math.round(minWH / 8), Math.round((minWH * strength) / 2000))
      )
      const dim = Math.max(0, Math.min(100, blur?.darken ?? 0)) / 100
      const dimChain =
        dim > 0 ? `,drawbox=x=0:y=0:w=${W}:h=${H}:color=black@${dim.toFixed(3)}:t=fill` : ''
      return [
        `split=2[bg][fg];` +
          `[bg]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=${radius}:1${dimChain}[bgb];` +
          `[fg]scale=${W}:${H}:force_original_aspect_ratio=decrease[fgs];` +
          `[bgb][fgs]overlay=(W-w)/2:(H-h)/2`
      ]
    }
  }
}

/** Farbmatrix der Quelle (null = nicht gekennzeichnet). */
function sourceMatrix(v: MediaVideoTrack): 'bt709' | 'bt601' | 'bt2020' | null {
  switch (v.colorSpace) {
    case 'bt709':
      return 'bt709'
    case 'smpte170m':
    case 'bt470bg':
      return 'bt601'
    case 'bt2020nc':
    case 'bt2020c':
      return 'bt2020'
    default:
      return null
  }
}

/**
 * Farbkennung als Filter. NICHT als Encoder-Option (-colorspace …): aktuelles ffmpeg
 * versteht die als Umrechnungsziel und wandelt ungekennzeichnete Bilder dann von Rec. 601
 * nach Rec. 709 – sichtbare Farbverschiebung; -color_primaries/-color_trc allein werden
 * sogar ignoriert. setparams kennzeichnet nur und landet vollständig in der Datei.
 */
export function setparamsFor(t: ColorTags): string {
  return `setparams=colorspace=${t.space}:color_primaries=${t.primaries}:color_trc=${t.trc}:range=${t.range}`
}

/** Kennung für YUV-Ausgaben: HD = Rec. 709, SD = Rec. 601 (PAL/NTSC-Primaries). */
export function tagsFor(matrix: 'bt709' | 'bt601', height: number): ColorTags {
  if (matrix === 'bt709') return { primaries: 'bt709', trc: 'bt709', space: 'bt709', range: 'tv' }
  const pal = height === 576
  return {
    primaries: pal ? 'bt470bg' : 'smpte170m',
    trc: 'bt709',
    space: pal ? 'bt470bg' : 'smpte170m',
    range: 'tv'
  }
}

function channelText(a: MediaAudioTrack): string {
  if (a.channels === 1) return 'Mono'
  if (a.channels === 6) return '5.1'
  if (a.channels === 8) return '7.1'
  return `${a.channels ?? '?'} Kanäle`
}

function planAudio(
  a: MediaAudioTrack | null,
  opts: ConvertOptions,
  fi: ConvertFormatInfo,
  tempo: number | null,
  copyVideo: boolean,
  steps: string[]
): ConvertPlanAudio | null {
  if (!a || fi.family === 'image') return null
  if (opts.audio === 'none') {
    steps.push('Ohne Ton')
    return null
  }
  const filters: string[] = []
  if (tempo) filters.push(`atempo=${Number(tempo.toFixed(6))}`)
  const loudness = opts.loudnorm ?? null
  if (loudness) steps.push(loudnessPlanStep(loudness))
  const stereo = opts.audio === 'stereo' && a.channels !== 2
  // Player: AAC/MP3 unverändert übernehmen, wenn das Video ohnehin nur umverpackt wird
  if (
    opts.allowCopy &&
    copyVideo &&
    !filters.length &&
    !loudness &&
    !stereo &&
    (a.codecName === 'aac' || a.codecName === 'mp3')
  ) {
    return {
      streamIndex: a.index,
      codec: 'copy',
      channels: null,
      sampleRate: null,
      bitrate: null,
      filters,
      loudness: null
    }
  }
  const pcm = fi.family === 'hap' || fi.family === 'prores' || fi.family === 'audio'
  const hiRes = (a.bitDepth ?? 0) >= 24 || a.float
  const codec = pcm ? (hiRes ? 'pcm_s24le' : 'pcm_s16le') : 'aac'
  let channels: number | null = stereo ? 2 : null
  if (stereo) steps.push(`Ton ${channelText(a)} → Stereo`)
  // AAC kann höchstens 8 Kanäle
  if (!pcm && !stereo && (a.channels ?? 2) > 8) {
    channels = 2
    steps.push(`Ton ${channelText(a)} → Stereo (AAC max. 8 Kanäle)`)
  }
  if (a.sampleRate && a.sampleRate !== 48000) {
    steps.push(`Ton ${de(a.sampleRate / 1000, 1)} → 48 kHz`)
  }
  const outChannels = channels ?? a.channels ?? 2
  return {
    streamIndex: a.index,
    codec,
    channels,
    sampleRate: 48000,
    bitrate: codec === 'aac' ? (outChannels <= 2 ? 192000 : 384000) : null,
    filters,
    loudness
  }
}

/**
 * Plan für eine Datei. Fehler (ok:false) nur, wenn das Ziel grundsätzlich nicht passt
 * (keine Videospur, Standbild als Video, …); alles andere sind Schritte bzw. Hinweise.
 */
export function planConversion(
  info: MediaInfo,
  opts: ConvertOptions,
  caps: PlanCaps
): ConvertPlanResult {
  const steps: string[] = []
  const issues: ConvertIssue[] = []
  const v = info.video[0] ?? null
  const a = info.audio[0] ?? null
  let format = opts.format
  let fi = CONVERT_FORMATS[format]

  if (fi.family === 'audio') {
    if (!a) return { ok: false, error: 'Keine Tonspur – nichts zu konvertieren' }
    // „ohne Ton" ergibt bei reiner Ton-Ausgabe keinen Sinn
    const aOpts: ConvertOptions = opts.audio === 'none' ? { ...opts, audio: 'auto' } : opts
    const audio = planAudio(a, aOpts, fi, null, false, steps)
    return {
      ok: true,
      plan: {
        format,
        formatInfo: fi,
        video: null,
        audio,
        durationSec: info.durationSec,
        steps,
        issues
      }
    }
  }

  if (!v) return { ok: false, error: 'Keine Videospur – nur als „WAV (nur Ton)" konvertierbar' }
  if (!v.codecName) return { ok: false, error: 'Videospur nicht decodierbar (unbekannter Codec)' }
  if (!v.width || !v.height) return { ok: false, error: 'Bildgröße unbekannt' }
  const still = info.isStill || v.fpsMode === 'still'
  // JPG aus einem Video = erstes Bild (z.B. animiertes PNG/WebP in der Player-Bibliothek)
  if (fi.family !== 'image' && still) return { ok: false, error: 'Standbild – kein Video' }

  /* Alpha. VP8/VP9-WebM tragen Alpha in Zusatzdaten, die nur die libvpx-Decoder lesen –
     ffmpegs eigener Decoder verwirft sie still (alles würde deckend) */
  const vpx = v.alpha && (v.codecName === 'vp9' || v.codecName === 'vp8')
  let decoder: string | null = null
  let srcAlpha = v.alpha
  if (vpx) {
    if (caps.vpxAlpha === false) {
      srcAlpha = false
      issues.push({
        id: 'webm-alpha',
        level: 'warning',
        title: 'Transparenz der WebM nicht lesbar',
        text: 'Dem gebündelten ffmpeg fehlt der libvpx-Decoder – die Datei wird deckend übernommen.'
      })
    } else {
      decoder = v.codecName === 'vp9' ? 'libvpx-vp9' : 'libvpx'
    }
  }
  /* Alpha-Quellen automatisch in die Alpha-Variante der Formatfamilie */
  if (srcAlpha && opts.keepAlpha && !fi.alpha) {
    const alt: ConvertFormat | null =
      fi.family === 'hap' ? 'hap_alpha' : fi.family === 'prores' ? 'prores_4444' : null
    if (alt) {
      format = alt
      fi = CONVERT_FORMATS[alt]
      steps.push(`Alpha erkannt → ${fi.label}`)
    }
  }
  const alphaOut = srcAlpha && fi.alpha
  if (srcAlpha && !fi.alpha) {
    issues.push({
      id: 'alpha-lost',
      level: 'warning',
      title: 'Transparenz geht verloren',
      text:
        fi.family === 'hap' || fi.family === 'prores'
          ? 'Transparente Bereiche werden schwarz („Alpha erhalten" ist aus).'
          : `${fi.label} kann keine Transparenz – transparente Bereiche werden schwarz. Für Alpha HAP Alpha oder ProRes 4444 wählen.`
    })
  }

  /* Geometrie: ffmpeg dreht (Autorotate) vor der Filterkette -> Maße/SAR mitdrehen */
  const rot = (((v.rotation ?? 0) % 360) + 360) % 360
  const turned = rot === 90 || rot === 270
  let w = turned ? v.height : v.width
  let h = turned ? v.width : v.height
  // gedreht: ffmpeg vertauscht Zähler/Nenner exakt -> ebenso rechnen (1/x rundet anders)
  const [sarNum, sarDen] = sarParts(v.sar)
  const sar = turned ? sarDen / sarNum : sarNum / sarDen
  // rot ist im Uhrzeigersinn gespeichert; „270°" läse sich wie ein Fehler
  if (rot) {
    steps.push(
      rot === 180
        ? 'Drehung 180° eingerechnet'
        : `Drehung 90° ${rot === 90 ? 'im' : 'gegen den'} Uhrzeigersinn eingerechnet`
    )
  }
  if (v.mirrored) steps.push('Spiegelung eingerechnet')

  const filters: string[] = []

  /* Halbbilder */
  const interlaced = v.scan === 'tff' || v.scan === 'bff'
  let rate = still ? null : v.fps
  if (interlaced && opts.deinterlace && !still) {
    filters.push(`bwdif=mode=send_field:parity=${v.scan}:deint=all`)
    const field = rate ? rate * 2 : null
    steps.push(
      rate && field ? `Deinterlaced (${rateText(rate)}i → ${rateText(field)}p)` : 'Deinterlaced'
    )
    rate = field
  } else if (interlaced && !still) {
    issues.push({
      id: 'interlaced-kept',
      level: 'warning',
      title: 'Interlaced bleibt erhalten',
      text: 'Ohne Deinterlacing entstehen auf LED-Wänden und Beamern Kammeffekte bei Bewegung.'
    })
  } else if (
    v.scan === 'unknown' &&
    !still &&
    SCAN_SUSPECT.has(v.codecName) &&
    [480, 486, 576, 1080].includes(v.height)
  ) {
    issues.push({
      id: 'scan-unknown',
      level: 'info',
      title: 'Scan-Typ unbekannt',
      text: 'SD- oder 1080-Material ist möglicherweise interlaced. In der Medien-Info mit Tiefenanalyse prüfen.'
    })
  }

  /* Bildrate */
  const variable = v.fpsMode === 'vfr' || v.fpsMode === 'vfr-suspect'
  const change = rate ? decideRate(rate, variable, opts.fps) : null
  let durationSec = info.durationSec
  let tempo: number | null = null
  if (change && rate) {
    if (change.method === 'conform') {
      const [a1, b1] = rateRational(rate)
      const [c1, d1] = rateRational(change.target)
      // neue Zeitstempel = alte · Quellrate/Zielrate (exakter Bruch)
      let num = a1 * d1
      let den = b1 * c1
      const g = gcd(num, den)
      num /= g
      den /= g
      filters.push(`setpts=PTS*${num}/${den}`, `fps=${rateArg(change.target)}`)
      tempo = den / num
      if (durationSec) durationSec = (durationSec * num) / den
      const pct = (tempo - 1) * 100
      steps.push(
        `Tempo ${pct > 0 ? '+' : '−'}${de(Math.abs(pct), 2)} % (${rateText(rate)} → ${rateText(change.target)} fps)`
      )
    } else {
      filters.push(`fps=${rateArg(change.target)}`)
      if (variable) {
        steps.push(`Konstante Bildrate (Ø ${rateText(rate)} → ${rateText(change.target)} fps)`)
      } else {
        const fewer = change.target < rate
        steps.push(
          `Bildrate ${rateText(rate)} → ${rateText(change.target)} fps (${fewer ? 'Bilder ausgelassen' : 'Bilder wiederholt'})`
        )
        issues.push({
          id: 'fps-convert',
          level: 'info',
          title: `Bildrate ${rateText(rate)} → ${rateText(change.target)} fps`,
          text: fewer
            ? 'Einzelne Bilder werden ausgelassen – Bewegungen minimal unruhiger als eine Aufnahme in der Zielrate.'
            : 'Einzelne Bilder werden wiederholt – Bewegungen minimal unruhiger als eine Aufnahme in der Zielrate.'
        })
      }
    }
  }
  const outRate = change ? change.target : rate

  /* Quadratische Pixel */
  if (Math.abs(sar - 1) > 1e-9) {
    const sq = squarePixelSize(w, h, sar)
    filters.push(SQUARE_PIXELS)
    steps.push(`Pixel quadratisch (${w}×${h} → ${sq.width}×${sq.height})`)
    w = sq.width ?? w
    h = sq.height ?? h
  }

  /* Alpha flach rechnen (vor jeder Formatwandlung, die Alpha verwirft) */
  if (srcAlpha && !alphaOut) {
    filters.push('premultiply=inplace=1')
    steps.push('Transparenz auf Schwarz')
  }

  /* HDR -> SDR */
  const rgbOut = fi.family === 'hap'
  const yuvOut = fi.family === 'h264' || fi.family === 'hevc' || fi.family === 'prores'
  const pixFmt =
    fi.family === 'hap'
      ? 'rgba'
      : fi.family === 'h264' || fi.family === 'hevc'
        ? 'yuv420p'
        : fi.family === 'prores'
          ? format === 'prores_4444'
            ? alphaOut
              ? 'yuva444p10le'
              : 'yuv444p10le'
            : 'yuv422p10le'
          : null
  let tonemapped = false
  if (v.dolbyVision?.startsWith('5')) {
    issues.push({
      id: 'dovi5',
      level: 'warning',
      title: 'Dolby Vision Profil 5',
      text: 'Lässt sich ohne Dolby-Decoder nicht farbtreu umrechnen – Farben können verfälscht sein.'
    })
  }
  if (v.hdr) {
    if (opts.toSdr && caps.tonemap && !alphaOut) {
      filters.push(
        rgbOut
          ? `${TONEMAP_HEAD},zscale=t=bt709,format=gbrp`
          : `${TONEMAP_HEAD},zscale=t=bt709:m=bt709:r=tv,format=${pixFmt ?? 'yuv420p'}`
      )
      tonemapped = true
      steps.push(`HDR (${v.hdr === 'hlg' ? 'HLG' : 'PQ'}) → SDR`)
    } else {
      issues.push({
        id: 'hdr-kept',
        level: 'warning',
        title: 'HDR bleibt erhalten',
        text:
          opts.toSdr && !caps.tonemap
            ? 'Das gebündelte ffmpeg kann kein HDR → SDR (zscale/tonemap fehlen) – auf SDR-Ausgabe wirken die Farben flau.'
            : 'Auf SDR-Ausgabe (LED-Wand, Beamer, die meisten Player) wirken die Farben flau.'
      })
    }
  }

  /* Größe / Einpassen */
  const needsEven = yuvOut
  const size = opts.size
  if (size.mode === 'max') {
    const long = Math.max(size.width, size.height)
    const short = Math.min(size.width, size.height)
    // Hochkant passt in die gedrehte Box (1080×1920 bleibt bei „max. 1920×1080")
    const boxW = w >= h ? long : short
    const boxH = w >= h ? short : long
    if (w > boxW || h > boxH) {
      // HAP gleich auf ×4 (spart den schwarzen Auffüll-Rand), sonst gerade Maße.
      // Rundung wie ffmpeg (scale_eval: auf Vielfache runden, dann auf die Box kappen).
      const div = fi.family === 'hap' ? 4 : 2
      const tmpW = Math.round((boxH * w) / (h * div)) * div
      const tmpH = Math.round((boxW * h) / (w * div)) * div
      const ow = Math.floor(Math.min(tmpW, boxW) / div) * div
      const oh = Math.floor(Math.min(tmpH, boxH) / div) * div
      filters.push(
        `scale=${boxW}:${boxH}:force_original_aspect_ratio=decrease:force_divisible_by=${div}`
      )
      steps.push(`Verkleinert (${w}×${h} → ${ow}×${oh})`)
      w = ow
      h = oh
    }
  } else if (size.mode === 'exact') {
    let W = Math.max(2, Math.round(size.width))
    let H = Math.max(2, Math.round(size.height))
    if (needsEven) {
      W -= W % 2
      H -= H % 2
    }
    if (W !== w || H !== h) {
      const sameAspect = Math.abs(w / h - W / H) / (W / H) < 0.01
      const fit: ConvertFit = sameAspect ? 'stretch' : size.fit
      filters.push(...fitFilters(fit, W, H, alphaOut, opts.blur))
      steps.push(sameAspect ? `Skaliert auf ${W}×${H}` : `${FIT_LABEL[fit]} auf ${W}×${H}`)
      // Letterbox/Blur zeigen das ganze Bild (kleinerer Faktor), Füllen/Strecken den größeren
      const factor =
        fit === 'bars' || fit === 'blur' ? Math.min(W / w, H / h) : Math.max(W / w, H / h)
      if (factor > 1.05) {
        issues.push({
          id: 'upscale',
          level: 'info',
          title: `Wird hochskaliert (×${de(factor, 1)})`,
          text: 'Die Quelle ist kleiner als das Ziel – das Bild wirkt weicher als echtes Material in dieser Auflösung.'
        })
      }
      w = W
      h = H
    }
  }

  /* Gerade Maße (4:2:x) bzw. Vielfache von 4 (HAP) */
  if (needsEven && (w % 2 || h % 2)) {
    const ew = w - (w % 2)
    const eh = h - (h % 2)
    filters.push(`crop=${ew}:${eh}:0:0`)
    steps.push(`Auf gerade Maße (${w}×${h} → ${ew}×${eh})`)
    w = ew
    h = eh
  }
  if (fi.family === 'hap' && (w % 4 || h % 4)) {
    const pw = Math.ceil(w / 4) * 4
    const ph = Math.ceil(h / 4) * 4
    filters.push(`pad=${pw}:${ph}:0:0${alphaOut ? ':color=black@0' : ''}`)
    steps.push(`Auf ${pw}×${ph} aufgefüllt (HAP braucht ×4-Maße)`)
    issues.push({
      id: 'hap-pad',
      level: 'info',
      title: `Wird auf ${pw}×${ph} aufgefüllt`,
      text: `HAP komprimiert 4×4-Pixelblöcke; rechts/unten kommt ein schwarzer Rand dazu (+${pw - w}/${ph - h} px). Bei pixelgenauem LED-Mapping als Linie sichtbar – besser vorher passend skalieren oder zuschneiden.`
    })
    w = pw
    h = ph
  }

  /* Unverändert übernehmen? (Player: schon passendes H.264 nur umverpacken) */
  const structural = filters.length > 0
  const copy =
    Boolean(opts.allowCopy) &&
    format === 'h264' &&
    v.codecName === 'h264' &&
    !structural &&
    !rot &&
    !v.mirrored &&
    !srcAlpha &&
    !v.hdr &&
    (v.pixFmt === 'yuv420p' || v.pixFmt === 'yuvj420p')
  if (structural) filters.push('setsar=1')

  /* Farbe: Matrix/Range explizit, damit nichts geraten wird */
  const srcYuv = Boolean(v.chroma?.includes(':'))
  const srcMatrix = sourceMatrix(v)
  // Ungekennzeichnet: HD wie Rec. 709, SD wie Rec. 601 (so zeigen es Player auch an)
  const assumed: 'bt709' | 'bt601' =
    srcMatrix === 'bt601' ? 'bt601' : srcMatrix ? 'bt709' : v.height >= 720 ? 'bt709' : 'bt601'
  if (!copy && !tonemapped) {
    if (rgbOut && srcYuv) {
      // YUV -> RGB: ohne Angabe nähme swscale Rec. 601 -> HD-Material farbverschoben
      filters.push(
        `scale=in_color_matrix=${srcMatrix === 'bt2020' ? 'bt2020' : assumed}:in_range=${v.colorRange === 'pc' ? 'pc' : 'tv'}`
      )
    } else if (yuvOut && srcYuv) {
      if (v.colorRange === 'pc') {
        filters.push('scale=in_range=pc:out_range=tv')
        steps.push('Full Range → Limited')
      }
      // ungekennzeichnet: so kennzeichnen, wie Player es ohnehin lesen (Pixel unverändert)
      if (!srcMatrix) filters.push(setparamsFor(tagsFor(assumed, v.height)))
    } else if (yuvOut && !srcYuv) {
      // RGB-Quelle (PNG, Animation, 4444-RGB): Matrix der Ausgabe festlegen und kennzeichnen
      const out: 'bt709' | 'bt601' = h >= 720 ? 'bt709' : 'bt601'
      filters.push(`scale=out_color_matrix=${out}:out_range=tv`, setparamsFor(tagsFor(out, h)))
    }
  }
  // HDR -> SDR: zscale kennzeichnet die Bilder selbst als Rec. 709

  if (fi.family === 'h264' && opts.compat && (w * h > 1920 * 1088 || (outRate ?? 0) > 60.5)) {
    issues.push({
      id: 'compat-level',
      level: 'info',
      title: 'Über 1080p60 für Player-Boxen',
      text: 'Viele USB-/TV-Player schaffen höchstens 1080p60 (Level 4.2). Für sie „max. 1920×1080" wählen.'
    })
  }
  const sameCodec =
    fi.family === 'hap' || fi.family === 'prores'
      ? v.codec === fi.label
      : fi.family === 'h264' || fi.family === 'hevc'
        ? v.codecName === (fi.family === 'h264' ? 'h264' : 'hevc')
        : false
  if (sameCodec && !structural && !copy) {
    issues.push({
      id: 'same-codec',
      level: 'info',
      title: `Bereits ${v.codec}`,
      text: 'An Bild und Ton ist nichts zu korrigieren – eine erneute Konvertierung kostet nur Qualität und Zeit.'
    })
  }

  const steps2 = copy ? ['Video unverändert übernommen', ...steps] : steps
  const audio = planAudio(a, opts, fi, tempo, copy, steps2)
  return {
    ok: true,
    plan: {
      format,
      formatInfo: fi,
      video: {
        streamIndex: v.index,
        copy,
        width: w,
        height: h,
        fps: still ? null : outRate,
        filters: copy ? [] : filters,
        pixFmt: copy ? null : pixFmt,
        decoder,
        gop:
          (fi.family === 'h264' || fi.family === 'hevc') && outRate ? Math.round(outRate * 2) : null
      },
      audio,
      durationSec: still ? null : durationSec,
      steps: steps2,
      issues
    }
  }
}

function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : Math.abs(a)
}
