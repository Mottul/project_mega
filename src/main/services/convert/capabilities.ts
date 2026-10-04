// Was kann das gebündelte ffmpeg? Formate hängen an Encodern (HAP braucht libsnappy,
// H.265 libx265, ProRes prores_ks), HDR -> SDR an den Filtern zscale + tonemap. Die
// Oberfläche graut Unmögliches aus, statt erst beim Konvertieren zu scheitern.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { CONVERT_FORMATS } from '@shared/convertPlan'
import type { ConvertCapabilities, ConvertFormat } from '@shared/types'
import { ffmpegBinPath } from '../ffmpeg/ffmpegPath'

const pexecFile = promisify(execFile)

/** Namen aus `ffmpeg -encoders` („ V....D hap   Vidvox Hap"). */
export function parseEncoderNames(listing: string): Set<string> {
  const out = new Set<string>()
  for (const line of listing.split('\n')) {
    const m = /^\s*[A-Z.]{6}\s+(\S+)/.exec(line)
    if (m) out.add(m[1])
  }
  return out
}

/** Namen aus `ffmpeg -filters` („ TS bwdif   V->V   Deinterlace …"). */
export function parseFilterNames(listing: string): Set<string> {
  const out = new Set<string>()
  for (const line of listing.split('\n')) {
    const m = /^\s*[A-Z.|]{2,3}\s+(\w+)\s+[AVN|]+->[AVN|]+/.exec(line)
    if (m) out.add(m[1])
  }
  return out
}

export function capabilitiesFrom(
  encoders: Set<string>,
  filters: Set<string>,
  version: string | null
): ConvertCapabilities {
  const formats = {} as Record<ConvertFormat, boolean>
  for (const [id, f] of Object.entries(CONVERT_FORMATS)) {
    formats[id as ConvertFormat] = encoders.has(f.encoder)
  }
  return {
    ffmpegFound: true,
    version,
    formats,
    tonemap: filters.has('zscale') && filters.has('tonemap')
  }
}

let cached: Promise<ConvertCapabilities> | null = null

async function detect(): Promise<ConvertCapabilities> {
  const ff = ffmpegBinPath('ffmpeg')
  const opts = { maxBuffer: 8 * 1024 * 1024, windowsHide: true }
  try {
    const [enc, fil] = await Promise.all([
      pexecFile(ff, ['-hide_banner', '-encoders'], opts),
      pexecFile(ff, ['-hide_banner', '-filters'], opts)
    ])
    const version = await pexecFile(ff, ['-version'], opts)
      .then((r) => r.stdout.split('\n')[0]?.trim() ?? null)
      .catch(() => null)
    return capabilitiesFrom(parseEncoderNames(enc.stdout), parseFilterNames(fil.stdout), version)
  } catch (err) {
    // nicht dauerhaft „nicht gefunden" merken (ffmpeg kann nachträglich bereitgestellt werden)
    cached = null
    const formats = {} as Record<ConvertFormat, boolean>
    for (const id of Object.keys(CONVERT_FORMATS)) formats[id as ConvertFormat] = false
    return {
      ffmpegFound: false,
      version: null,
      error: err instanceof Error ? err.message : String(err),
      formats,
      tonemap: false
    }
  }
}

export function getConvertCapabilities(): Promise<ConvertCapabilities> {
  cached ??= detect()
  return cached
}
