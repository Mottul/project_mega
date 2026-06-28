import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { ProbeResult } from '@shared/types'
import { ffmpegBinPath } from './ffmpegPath'

const pexecFile = promisify(execFile)

interface FfStream {
  codec_type?: string
  codec_name?: string
  width?: number
  height?: number
  r_frame_rate?: string
  avg_frame_rate?: string
  duration?: string
}
interface FfFormat {
  duration?: string
}

function parseFps(rate?: string): number | null {
  if (!rate) return null
  const [num, den] = rate.split('/').map(Number)
  if (!num || !den) return null
  const fps = num / den
  return Number.isFinite(fps) ? Math.round(fps * 100) / 100 : null
}

/** ffprobe -> Aufloesung, Dauer, fps, Codec. */
export async function probe(path: string): Promise<ProbeResult> {
  const probePath = ffmpegBinPath('ffprobe')
  const args = ['-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', path]
  const { stdout } = await pexecFile(probePath, args, { maxBuffer: 16 * 1024 * 1024 })
  const json = JSON.parse(stdout) as { streams?: FfStream[]; format?: FfFormat }
  const video = (json.streams ?? []).find((s) => s.codec_type === 'video')

  const durationStr = video?.duration ?? json.format?.duration
  const durationSec = durationStr ? Number(durationStr) : null

  return {
    path,
    width: video?.width ?? null,
    height: video?.height ?? null,
    durationSec: durationSec && Number.isFinite(durationSec) ? durationSec : null,
    fps: parseFps(video?.r_frame_rate) ?? parseFps(video?.avg_frame_rate),
    codec: video?.codec_name ?? null,
    hasVideo: Boolean(video)
  }
}
