// Exportiert ein Testbild-Standbild als Video-Loop (MP4/H.264 oder HAP Q) ueber
// das gebuendelte ffmpeg -- z.B. fuer Dauerschleifen im Medienserver.

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ColorLoopRequest, PatternVideoRequest } from '@shared/types'
import { ffmpegBinPath } from './ffmpeg/ffmpegPath'

function runFfmpeg(
  args: string[],
  totalSec: number,
  onProgress: (p: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegBinPath('ffmpeg'), args, { windowsHide: true })
    let stderrTail = ''
    proc.stdout.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString().split('\n')) {
        const [key, value] = line.split('=')
        if (key === 'out_time_us') {
          const us = Number(value)
          if (Number.isFinite(us))
            onProgress(Math.min(0.99, Math.max(0, us / 1_000_000 / totalSec)))
        }
      }
    })
    proc.stderr.on('data', (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-2000)
    })
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else
        reject(
          new Error(`ffmpeg beendet mit Code ${code}. ${stderrTail.trim().split('\n').pop() ?? ''}`)
        )
    })
  })
}

export async function exportPatternVideo(
  req: PatternVideoRequest,
  outputPath: string,
  onProgress: (p: number) => void
): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'pattern-'))
  const pngPath = join(dir, 'frame.png')
  writeFileSync(pngPath, Buffer.from(req.png))

  const dur = Math.max(1, Math.min(3600, req.durationSec))
  const fps = Math.max(1, Math.min(60, req.fps))
  // HAP/x264 brauchen gerade bzw. durch 4 teilbare Maße -> auffuellen.
  const pad = 'pad=ceil(iw/4)*4:ceil(ih/4)*4:0:0'
  const codec =
    req.format === 'hap_q'
      ? ['-vf', pad, '-c:v', 'hap', '-format', 'hap_q', '-compressor', 'snappy']
      : ['-vf', `${pad},format=yuv420p`, '-c:v', 'libx264', '-preset', 'medium', '-crf', '18']

  const args = [
    '-hide_banner',
    '-loop',
    '1',
    '-i',
    pngPath,
    '-t',
    String(dur),
    '-r',
    String(fps),
    ...codec,
    '-progress',
    'pipe:1',
    '-nostats',
    '-y',
    outputPath
  ]

  try {
    await runFfmpeg(args, dur, onProgress)
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
}

// Pixelcheck-Loop: zyklisch durch Vollfarben, je Farbe einstellbare Dauer. Die
// Farbflaechen erzeugt ffmpeg direkt (lavfi color), keine Zwischenbilder noetig.
export function exportColorLoop(
  req: ColorLoopRequest,
  outputPath: string,
  onProgress: (p: number) => void
): Promise<void> {
  const w = Math.max(2, Math.round(req.width))
  const h = Math.max(2, Math.round(req.height))
  const sec = Math.max(1, Math.min(600, req.secondsPerColor))
  const fps = Math.max(1, Math.min(60, req.fps))
  const colors = req.colors.length ? req.colors : ['#ffffff']
  const total = colors.length * sec

  const inputs: string[] = []
  for (const c of colors) {
    const hex = '0x' + c.replace('#', '').slice(0, 6).padStart(6, '0')
    inputs.push('-f', 'lavfi', '-i', `color=c=${hex}:s=${w}x${h}:r=${fps}:d=${sec}`)
  }
  const labels = colors.map((_, i) => `[${i}:v]`).join('')
  const pad = 'pad=ceil(iw/4)*4:ceil(ih/4)*4:0:0'
  const isHap = req.format === 'hap_q'
  const chain = isHap
    ? `${labels}concat=n=${colors.length}:v=1:a=0,${pad}[v]`
    : `${labels}concat=n=${colors.length}:v=1:a=0,${pad},format=yuv420p[v]`
  const codec = isHap
    ? ['-c:v', 'hap', '-format', 'hap_q', '-compressor', 'snappy']
    : ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18']

  const args = [
    '-hide_banner',
    ...inputs,
    '-filter_complex',
    chain,
    '-map',
    '[v]',
    ...codec,
    '-r',
    String(fps),
    '-progress',
    'pipe:1',
    '-nostats',
    '-y',
    outputPath
  ]
  return runFfmpeg(args, total, onProgress)
}
