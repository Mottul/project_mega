// Reine Entscheidungen des Player-Imports (ohne Datenbank/Electron -> testbar): welche
// Optionen der gemeinsame Konvertierungs-Plan bekommt und welcher Namens-Zusatz ins
// Bibliotheks-Medium wandert.

import { extname } from 'node:path'
import type { ConvertOptions, MediaInfo, MediaKind, PlayerImportRequest } from '@shared/types'

// Dieselbe Quelle kann mit unterschiedlicher Aufbereitung mehrfach in der
// Bibliothek liegen (eigene conv_key je Fit-Modus). Damit die Einträge nicht
// gleich aussehen, wandert der Fit in den Titel (das Thumbnail wird ohnehin aus
// dem aufbereiteten Ergebnis erzeugt, zeigt also Blur/Balken/Streckung direkt).
type Fit = PlayerImportRequest['fitMode']
const FIT_TITLE: Record<Fit, string> = {
  blur: 'Blur',
  bars: 'Letterbox',
  stretch: 'Stretch',
  original: 'Unverändert'
}

// Namens-Zusatz aus der Quell-Auflösung – nicht aus dem gewählten Fit-Modus allein:
//  - gleiche Auflösung  -> Bild unverändert        -> „Original"
//  - gleiches Seitenverh.-> reine Skalierung        -> „Scale"
//  - anderes Seitenverh. -> Fit greift sichtbar     -> Blur/Letterbox/Stretch
// srcW/srcH sind Anzeige-Maße in quadratischen Pixeln. Anamorphe Quellen sind auch bei
// passenden Anzeige-Maßen nie „Original": sie werden auf quadratische Pixel umgerechnet.
// (Den billigen Weg – Skalieren statt Blur-Graph bei gleichem Seitenverhältnis – wählt
// der Konvertierungs-Plan selbst.)
export function analyzeFit(
  fit: Fit,
  srcW: number | null,
  srcH: number | null,
  tgtW: number,
  tgtH: number,
  anamorphic = false
): { suffix: string; effectiveFit: Fit } {
  // unverändert: kein Einbacken, also auch kein „Original“/„Scale“ – die Datei bleibt, wie sie ist
  if (fit === 'original') return { suffix: FIT_TITLE.original, effectiveFit: 'original' }
  const known = !!srcW && !!srcH
  const exact = known && srcW === tgtW && srcH === tgtH
  const sameAspect = known && Math.abs(srcW! / srcH! - tgtW / tgtH) < 0.01
  if (exact && !anamorphic) return { suffix: 'Original', effectiveFit: 'stretch' }
  if (sameAspect) return { suffix: 'Scale', effectiveFit: 'stretch' }
  return { suffix: FIT_TITLE[fit], effectiveFit: fit }
}

export interface PlayerSpec {
  fit: Fit
  width: number
  height: number
  blurStrength: number
  blurDarken: number
}

/**
 * Optionen für den gemeinsamen Plan: H.264 in Wandgröße (bzw. JPG für Standbilder),
 * alle Korrekturen an, unverändertes H.264 nur umverpacken.
 */
export function playerOptions(
  kind: MediaKind,
  spec: PlayerSpec,
  loudnorm: ConvertOptions['loudnorm']
): ConvertOptions {
  return {
    format: kind === 'image' ? 'jpg' : 'h264',
    quality: 'standard',
    compat: false,
    keepAlpha: false,
    // „unverändert“ kommt nie hierher (wird kopiert, nicht gerechnet) – zur Sicherheit Ränder
    size: {
      mode: 'exact',
      width: spec.width,
      height: spec.height,
      fit: spec.fit === 'original' ? 'bars' : spec.fit
    },
    fps: { mode: 'original' },
    deinterlace: true,
    toSdr: true,
    audio: 'auto',
    hapCompressor: 'snappy',
    hapChunks: { kind: 'auto' },
    loudnorm: kind === 'image' ? null : (loudnorm ?? null),
    blur: { strength: spec.blurStrength, darken: spec.blurDarken },
    allowCopy: true
  }
}

/* ------------------------- „Unverändert“: direkt abspielen ------------------------- */

/** Endungen, die der Player unverändert übernimmt (Chromium spielt sie direkt) */
const DIRECT_VIDEO_EXT = new Set(['.mp4', '.m4v', '.mov', '.webm'])
const DIRECT_IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])
export const DIRECT_EXTENSIONS = [...DIRECT_VIDEO_EXT, ...DIRECT_IMAGE_EXT]

const CODEC_NAME: Record<string, string> = {
  prores: 'ProRes',
  hap: 'HAP',
  mpeg2video: 'MPEG-2',
  dnxhd: 'DNxHD/DNxHR',
  mjpeg: 'Motion-JPEG',
  dvvideo: 'DV',
  pcm_s16le: 'PCM',
  pcm_s24le: 'PCM',
  pcm_s16be: 'PCM',
  pcm_s24be: 'PCM',
  ac3: 'AC-3 (Dolby Digital)',
  eac3: 'E-AC-3',
  alac: 'Apple Lossless'
}
const named = (codec: string): string => CODEC_NAME[codec] ?? codec.toUpperCase()

/** Art des Mediums unverändert übernommen: Bilder und GIFs zeigt der Player als Bild */
export function directKind(path: string): MediaKind {
  return DIRECT_IMAGE_EXT.has(extname(path).toLowerCase()) ? 'image' : 'video'
}

/** Endung der Kopie in der Bibliothek (klein geschrieben, wie die Quelle) */
export function directStoredExt(path: string): string {
  return extname(path).toLowerCase()
}

/**
 * Kann der Player (Chromium) die Datei unverändert abspielen? null = ja, sonst der Grund samt
 * Ausweg. Bewusst vorsichtig: lieber eine klare Absage beim Import als ein schwarzes Bild in
 * der Show. H.265 nur unter Windows und macOS (dort über die Hardware der Grafikkarte).
 */
export function directPlayProblem(info: MediaInfo, path: string, platform: string): string | null {
  const ext = extname(path).toLowerCase()
  const other = 'mit einer anderen Einpass-Art importieren (wird dann umgerechnet)'
  if (DIRECT_IMAGE_EXT.has(ext)) return null
  if (!DIRECT_VIDEO_EXT.has(ext)) {
    return `${ext ? ext.slice(1).toUpperCase() : 'Diese Datei'} kann der Player nicht direkt abspielen – ${other}.`
  }
  const v = info.video.find((t) => t.fpsMode !== 'still') ?? info.video[0]
  if (!v?.codecName) return `Keine Videospur gefunden – ${other}.`
  const webm = ext === '.webm'
  const codec = v.codecName
  const videoOk = webm
    ? ['vp8', 'vp9', 'av1'].includes(codec)
    : codec === 'h264'
      ? v.pixFmt === 'yuv420p' || v.pixFmt === 'yuvj420p'
      : codec === 'hevc'
        ? platform === 'win32' || platform === 'darwin'
        : ['vp9', 'av1'].includes(codec)
  if (!videoOk) {
    const why =
      codec === 'h264'
        ? `H.264 mit ${v.pixFmt ?? 'diesem Pixelformat'} (10 bit oder 4:2:2)`
        : codec === 'hevc'
          ? 'H.265 unter Linux'
          : named(codec)
    return `${why} kann der Player nicht direkt abspielen – ${other}.`
  }
  const a = info.audio[0]
  if (a?.codecName) {
    const audioOk = webm
      ? ['opus', 'vorbis'].includes(a.codecName)
      : ['aac', 'mp3', 'opus', 'flac'].includes(a.codecName)
    if (!audioOk) {
      return `Ton im Format ${named(a.codecName)} spielt der Player nicht – ${other}.`
    }
  }
  return null
}
