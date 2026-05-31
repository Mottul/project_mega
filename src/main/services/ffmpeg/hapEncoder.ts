import { execFile } from 'node:child_process'
import { cpus } from 'node:os'
import { basename, dirname, extname, join } from 'node:path'
import { promisify } from 'node:util'
import type { HapCheckResult, HapFormat } from '@shared/types'
import { ffmpegBinPath } from './ffmpegPath'

const pexecFile = promisify(execFile)

/**
 * Auto-chunks: anhand der Flaeche skalieren (720p -> 1, hoeher bis Kernzahl).
 * HAP profitiert beim Decoding von mehreren Chunks; mehr als Kerne bringt nichts.
 */
export function computeChunks(width: number | null, height: number | null): number {
  const cores = Math.max(1, cpus().length)
  if (!width || !height) return 1
  const ratio = (width * height) / (1280 * 720)
  return Math.min(Math.max(Math.round(ratio), 1), cores)
}

/** Endgueltige ffmpeg-Argumente fuer einen HAP-Encode (MOV-Container). */
export function buildHapArgs(
  input: string,
  output: string,
  format: HapFormat,
  chunks: number
): string[] {
  return [
    '-hide_banner',
    '-i', input,
    '-c:v', 'hap',
    '-format', format,
    '-compressor', 'snappy',
    '-chunks', String(Math.max(1, chunks)),
    '-progress', 'pipe:1',
    '-nostats',
    '-y',
    output
  ]
}

/** Zielpfad: <name>_<format>.mov, im Ausgabe- oder Quellordner. */
export function hapOutputPath(input: string, outputDir: string | null, format: HapFormat): string {
  const base = basename(input, extname(input))
  const dir = outputDir ?? dirname(input)
  return join(dir, `${base}_${format}.mov`)
}

/** Prueft, ob das gebundelte ffmpeg den HAP-Encoder kann (-> braucht libsnappy). */
export async function checkHap(): Promise<HapCheckResult> {
  const ffmpeg = ffmpegBinPath('ffmpeg')
  try {
    const { stdout } = await pexecFile(ffmpeg, ['-hide_banner', '-encoders'], {
      maxBuffer: 8 * 1024 * 1024
    })
    const hapEncoders: string[] = []
    for (const line of stdout.split('\n')) {
      // Zeilenformat: " V....D hap                  Vidvox Hap"
      const m = line.match(/^\s*[A-Z.]{6}\s+(hap[\w]*)\b/i)
      if (m) hapEncoders.push(m[1].toLowerCase())
    }
    let version: string | null = null
    try {
      const v = await pexecFile(ffmpeg, ['-version'], { maxBuffer: 1024 * 1024 })
      version = v.stdout.split('\n')[0]?.trim() ?? null
    } catch {
      // Version ist optional
    }
    return {
      available: hapEncoders.includes('hap'),
      ffmpegFound: true,
      version,
      hapEncoders
    }
  } catch (err) {
    return {
      available: false,
      ffmpegFound: false,
      version: null,
      hapEncoders: [],
      error: err instanceof Error ? err.message : String(err)
    }
  }
}
