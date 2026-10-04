// ffmpeg-Argumentbau für den Player (Wand-Auflösung, Fit-Modi, Vorschaubilder). Die
// Encoder-Erkennung liegt im gemeinsamen Konvertierungs-Kern (convert/encoders).

import type { FitMode } from '@shared/types'
export {
  detectEncoders,
  encoderOutputArgs,
  encoderPixFmt,
  resolveEncoder
} from '../convert/encoders'
import { encoderOutputArgs, encoderPixFmt } from '../convert/encoders'
// quadratische Pixel: gemeinsame Definition im Konvertierungs-Plan
import { SQUARE_PIXELS } from '@shared/convertPlan'
export { SQUARE_PIXELS }

/**
 * Fit-Filtergraph für die Ziel-/Wand-Auflösung. Ein-/Ausgang sind je genau einer
 * (auch der blur-Graph via split/overlay), daher überall als -vf nutzbar.
 * pixFmt=null -> kein format-Suffix (für Standbild-/JPG-Ausgabe).
 * „stretch" füllt die Fläche ohnehin vollständig – dort spielt die SAR keine Rolle.
 */
export function buildFitFilter(
  fit: FitMode,
  width: number,
  height: number,
  pixFmt: 'yuv420p' | 'nv12' | null,
  blur?: { strength: number; darken: number }
): string {
  const W = Math.max(2, Math.round(width))
  const H = Math.max(2, Math.round(height))
  const suffix = pixFmt ? `,format=${pixFmt}` : ''

  if (fit === 'stretch') {
    return `scale=${W}:${H},setsar=1${suffix}`
  }
  if (fit === 'bars') {
    return (
      `${SQUARE_PIXELS},scale=${W}:${H}:force_original_aspect_ratio=decrease,` +
      `pad=${W}:${H}:(${W}-iw)/2:(${H}-ih)/2:color=black,setsar=1${suffix}`
    )
  }
  // blur: formatfüllender, unscharfer Hintergrund + scharfer Inhalt mittig.
  // Stärke 0..100 skaliert den boxblur-Radius (50 ~ bisheriges min/40), gedeckelt
  // gegen Extremkosten. Abdunkelung legt ein halbtransparentes Schwarz darüber.
  const minWH = Math.min(W, H)
  const strength = Math.max(0, Math.min(100, blur?.strength ?? 50))
  const radius = Math.max(1, Math.min(Math.round(minWH / 8), Math.round((minWH * strength) / 2000)))
  const dim = Math.max(0, Math.min(100, blur?.darken ?? 0)) / 100
  const dimChain =
    dim > 0 ? `,drawbox=x=0:y=0:w=${W}:h=${H}:color=black@${dim.toFixed(3)}:t=fill` : ''
  return (
    `${SQUARE_PIXELS},split=2[bg][fg];` +
    `[bg]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=${radius}:1${dimChain}[bgb];` +
    `[fg]scale=${W}:${H}:force_original_aspect_ratio=decrease[fgs];` +
    `[bgb][fgs]overlay=(W-w)/2:(H-h)/2,setsar=1${suffix}`
  )
}

/** ffmpeg-Argumente: Video/GIF -> H.264-MP4 in Wand-Auflösung. */
export function buildVideoArgs(opts: {
  input: string
  output: string
  encoder: string
  fit: FitMode
  width: number
  height: number
  hasAudio: boolean
  blur?: { strength: number; darken: number }
  loudnorm?: { i: number; tp: number; lra: number }
}): string[] {
  const pf = encoderPixFmt(opts.encoder)
  const vf = buildFitFilter(opts.fit, opts.width, opts.height, pf, opts.blur)
  // Loudness-Filter (-af) nur bei vorhandener Audiospur; betrifft nur den Audio-
  // stream (kollidiert nicht mit -vf) und greift NIE im copy-Zweig (kann nicht filtern).
  const af =
    opts.hasAudio && opts.loudnorm
      ? ['-af', `loudnorm=I=${opts.loudnorm.i}:TP=${opts.loudnorm.tp}:LRA=${opts.loudnorm.lra}`]
      : []
  const audio = opts.hasAudio ? [...af, '-c:a', 'aac', '-b:a', '192k'] : ['-an']
  return [
    '-hide_banner',
    '-i',
    opts.input,
    '-vf',
    vf,
    ...encoderOutputArgs(opts.encoder),
    ...audio,
    '-movflags',
    '+faststart',
    '-progress',
    'pipe:1',
    '-nostats',
    '-y',
    opts.output
  ]
}

/** ffmpeg-Argumente: schon passendes Video nur in den Container kopieren (kein Re-Encode). */
export function buildCopyArgs(opts: {
  input: string
  output: string
  hasAudio: boolean
}): string[] {
  const args = ['-hide_banner', '-i', opts.input, '-map', '0:v:0']
  if (opts.hasAudio) args.push('-map', '0:a:0?', '-c:a', 'copy')
  else args.push('-an')
  args.push(
    '-c:v',
    'copy',
    '-movflags',
    '+faststart',
    '-progress',
    'pipe:1',
    '-nostats',
    '-y',
    opts.output
  )
  return args
}

/** ffmpeg-Argumente: Standbild -> in Wand-Auflösung gebackenes JPG. */
export function buildImageArgs(opts: {
  input: string
  output: string
  fit: FitMode
  width: number
  height: number
  blur?: { strength: number; darken: number }
}): string[] {
  const vf = buildFitFilter(opts.fit, opts.width, opts.height, null, opts.blur)
  return [
    '-hide_banner',
    '-i',
    opts.input,
    '-vf',
    vf,
    '-frames:v',
    '1',
    '-q:v',
    '2',
    '-y',
    opts.output
  ]
}

/** ffmpeg-Argumente: Vorschaubild (480px breit) aus Video/Bild. */
export function buildThumbArgs(opts: {
  input: string
  output: string
  seekSec: number
  isVideo: boolean
}): string[] {
  const seek = opts.isVideo ? ['-ss', String(Math.max(0, opts.seekSec))] : []
  return [
    '-hide_banner',
    ...seek,
    '-i',
    opts.input,
    '-frames:v',
    '1',
    '-vf',
    'scale=480:-2',
    '-q:v',
    '3',
    '-y',
    opts.output
  ]
}
