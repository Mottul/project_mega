// Encoder-Erkennung + ffmpeg-Argumentbau für den Player. Ziel ist immer
// H.264/MP4 (Chromium dekodiert das hardwarebeschleunigt). GPU-Encoder werden
// erkannt UND durch einen Mini-Test-Encode VALIDIERT (im Build vorhandener
// Encoder heißt nicht, dass die passende Hardware da ist). Schlägt das fehl,
// fällt alles sauber auf libx264 (CPU) zurück.

import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import type { EncoderInfo, FitMode, PlayerEncoderStatus } from '@shared/types'
import { logLine } from '../log'
import { ffmpegBinPath } from '../ffmpeg/ffmpegPath'

const pexecFile = promisify(execFile)

// Plattform-spezifische Reihenfolge der Hardware-Kandidaten (bester zuerst).
function hardwareCandidates(): EncoderInfo[] {
  const nvenc: EncoderInfo = { id: 'h264_nvenc', label: 'NVIDIA NVENC (GPU)', hardware: true }
  const qsv: EncoderInfo = { id: 'h264_qsv', label: 'Intel Quick Sync (GPU)', hardware: true }
  const amf: EncoderInfo = { id: 'h264_amf', label: 'AMD AMF (GPU)', hardware: true }
  const vt: EncoderInfo = { id: 'h264_videotoolbox', label: 'Apple VideoToolbox (GPU)', hardware: true }
  if (process.platform === 'darwin') return [vt]
  if (process.platform === 'win32') return [nvenc, amf, qsv]
  return [nvenc, qsv] // linux (VAAPI bewusst weggelassen -> braucht Geräte-Setup)
}

const CPU_ENCODER: EncoderInfo = { id: 'libx264', label: 'libx264 (CPU)', hardware: false }

let cached: PlayerEncoderStatus | null = null

/** nv12 für QSV (interner Hardware-Pixelpfad), sonst yuv420p (H.264-konform). */
export function encoderPixFmt(encoder: string): 'yuv420p' | 'nv12' {
  return encoder === 'h264_qsv' ? 'nv12' : 'yuv420p'
}

/** Encoder-spezifische Ausgabe-Argumente (qualitätsbasiert, sinnvolle Defaults). */
export function encoderOutputArgs(encoder: string): string[] {
  switch (encoder) {
    case 'h264_nvenc':
      return ['-c:v', 'h264_nvenc', '-preset', 'p5', '-rc', 'vbr', '-cq', '23', '-b:v', '0']
    case 'h264_qsv':
      return ['-c:v', 'h264_qsv', '-global_quality', '23']
    case 'h264_amf':
      return ['-c:v', 'h264_amf', '-quality', 'balanced', '-rc', 'cqp', '-qp_i', '22', '-qp_p', '22']
    case 'h264_videotoolbox':
      return ['-c:v', 'h264_videotoolbox', '-q:v', '55']
    default:
      return ['-c:v', 'libx264', '-preset', 'medium', '-crf', '20']
  }
}

function runOk(args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegBinPath('ffmpeg'), args, { windowsHide: true })
    proc.on('error', () => resolve(false))
    proc.on('close', (code) => resolve(code === 0))
  })
}

/** Mini-Test-Encode (1 Frame, 256×256) -> verifiziert, dass der Encoder real läuft. */
function testEncode(encoder: string): Promise<boolean> {
  const pf = encoderPixFmt(encoder)
  const args = [
    '-hide_banner',
    '-f', 'lavfi',
    '-i', 'color=c=black:s=256x256:r=1',
    '-frames:v', '1',
    '-vf', `format=${pf}`,
    ...encoderOutputArgs(encoder),
    '-f', 'null',
    '-'
  ]
  return runOk(args)
}

/** Erkennt + validiert verfügbare Encoder (gecacht). */
export async function detectEncoders(force = false): Promise<PlayerEncoderStatus> {
  if (cached && !force) return cached
  const ffmpeg = ffmpegBinPath('ffmpeg')

  let listing = ''
  let version: string | null = null
  try {
    const { stdout } = await pexecFile(ffmpeg, ['-hide_banner', '-encoders'], {
      maxBuffer: 8 * 1024 * 1024
    })
    listing = stdout
    try {
      const v = await pexecFile(ffmpeg, ['-version'], { maxBuffer: 1024 * 1024 })
      version = v.stdout.split('\n')[0]?.trim() ?? null
    } catch {
      // Version optional
    }
  } catch (err) {
    cached = {
      ffmpegFound: false,
      version: null,
      available: [],
      recommended: CPU_ENCODER.id,
      error: err instanceof Error ? err.message : String(err)
    }
    return cached
  }

  // libx264 ist im gebündelten Build immer dabei.
  const available: EncoderInfo[] = []
  const present = (id: string): boolean =>
    new RegExp(`^\\s*[A-Z.]{6}\\s+${id}\\b`, 'm').test(listing)

  for (const cand of hardwareCandidates()) {
    if (!present(cand.id)) continue
    const ok = await testEncode(cand.id)
    logLine(`[player] Encoder-Test ${cand.id}: ${ok ? 'OK' : 'nicht nutzbar'}`)
    if (ok) available.push(cand)
  }
  available.push(CPU_ENCODER)

  const recommended = available[0]?.id ?? CPU_ENCODER.id
  cached = { ffmpegFound: true, version, available, recommended }
  logLine('[player] Encoder verfügbar:', available.map((e) => e.id).join(', '), '-> empfohlen', recommended)
  return cached
}

/** Setting ('auto'|'cpu'|konkret) -> tatsächlich zu nutzender, geprüfter Encoder. */
export async function resolveEncoder(setting: string): Promise<string> {
  const status = await detectEncoders()
  if (setting === 'cpu') return CPU_ENCODER.id
  if (setting && setting !== 'auto') {
    if (status.available.some((e) => e.id === setting)) return setting
    // gewünschter Encoder nicht (mehr) nutzbar -> Empfehlung
  }
  return status.recommended
}

/**
 * Fit-Filtergraph für die Ziel-/Wand-Auflösung. Ein-/Ausgang sind je genau einer
 * (auch der blur-Graph via split/overlay), daher überall als -vf nutzbar.
 * pixFmt=null -> kein format-Suffix (für Standbild-/JPG-Ausgabe).
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
      `scale=${W}:${H}:force_original_aspect_ratio=decrease,` +
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
  const dimChain = dim > 0 ? `,drawbox=x=0:y=0:w=${W}:h=${H}:color=black@${dim.toFixed(3)}:t=fill` : ''
  return (
    `split=2[bg][fg];` +
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
}): string[] {
  const pf = encoderPixFmt(opts.encoder)
  const vf = buildFitFilter(opts.fit, opts.width, opts.height, pf, opts.blur)
  const audio = opts.hasAudio ? ['-c:a', 'aac', '-b:a', '192k'] : ['-an']
  return [
    '-hide_banner',
    '-i', opts.input,
    '-vf', vf,
    ...encoderOutputArgs(opts.encoder),
    ...audio,
    '-movflags', '+faststart',
    '-progress', 'pipe:1',
    '-nostats',
    '-y',
    opts.output
  ]
}

/** ffmpeg-Argumente: schon passendes Video nur in den Container kopieren (kein Re-Encode). */
export function buildCopyArgs(opts: { input: string; output: string; hasAudio: boolean }): string[] {
  const args = ['-hide_banner', '-i', opts.input, '-map', '0:v:0']
  if (opts.hasAudio) args.push('-map', '0:a:0?', '-c:a', 'copy')
  else args.push('-an')
  args.push(
    '-c:v', 'copy',
    '-movflags', '+faststart',
    '-progress', 'pipe:1',
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
    '-i', opts.input,
    '-vf', vf,
    '-frames:v', '1',
    '-q:v', '2',
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
    '-i', opts.input,
    '-frames:v', '1',
    '-vf', 'scale=480:-2',
    '-q:v', '3',
    '-y',
    opts.output
  ]
}
