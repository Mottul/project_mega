// H.264-Encoder für Player-Import und Video-Konverter: GPU-Encoder werden erkannt UND
// durch einen Mini-Test-Encode VALIDIERT (im Build vorhandener Encoder heißt nicht, dass
// die passende Hardware da ist). Schlägt das fehl, fällt alles sauber auf libx264 (CPU)
// zurück. Chromium dekodiert H.264 hardwarebeschleunigt -> Ziel des Players.

import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import type { EncoderInfo, PlayerEncoderStatus } from '@shared/types'
import { logLine } from '../log'
import { ffmpegBinPath } from '../ffmpeg/ffmpegPath'

const pexecFile = promisify(execFile)

// Plattform-spezifische Reihenfolge der Hardware-Kandidaten (bester zuerst).
function hardwareCandidates(): EncoderInfo[] {
  const nvenc: EncoderInfo = { id: 'h264_nvenc', label: 'NVIDIA NVENC (GPU)', hardware: true }
  const qsv: EncoderInfo = { id: 'h264_qsv', label: 'Intel Quick Sync (GPU)', hardware: true }
  const amf: EncoderInfo = { id: 'h264_amf', label: 'AMD AMF (GPU)', hardware: true }
  const vt: EncoderInfo = {
    id: 'h264_videotoolbox',
    label: 'Apple VideoToolbox (GPU)',
    hardware: true
  }
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
      return [
        '-c:v',
        'h264_amf',
        '-quality',
        'balanced',
        '-rc',
        'cqp',
        '-qp_i',
        '22',
        '-qp_p',
        '22'
      ]
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
    '-f',
    'lavfi',
    '-i',
    'color=c=black:s=256x256:r=1',
    '-frames:v',
    '1',
    '-vf',
    `format=${pf}`,
    ...encoderOutputArgs(encoder),
    '-f',
    'null',
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
  logLine(
    '[player] Encoder verfügbar:',
    available.map((e) => e.id).join(', '),
    '-> empfohlen',
    recommended
  )
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
