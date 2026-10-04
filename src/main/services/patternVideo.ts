// Exportiert ein Testbild-Standbild als Video-Loop (MP4/H.264 oder HAP Q) ueber
// das gebuendelte ffmpeg -- z.B. fuer Dauerschleifen im Medienserver.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { tagsFor } from '@shared/convertPlan'
import type { ColorLoopRequest, PatternVideoRequest } from '@shared/types'
import { runFfmpeg } from './convert/runFfmpeg'

/** Breite/Höhe aus dem IHDR-Block einer PNG (Bytes 16–23, Big Endian). */
export function pngSize(png: Uint8Array): { width: number; height: number } | null {
  if (png.length < 24) return null
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength)
  return { width: dv.getUint32(16), height: dv.getUint32(20) }
}

/**
 * RGB -> YUV mit festgelegter Farbmatrix (+ Kennzeichnung). Ohne Angabe rechnet swscale
 * mit Rec. 601, HD-Player zeigen aber Rec. 709 -> Grün um 16 % zu dunkel, Rot/Blau mit
 * Farbstich. Für ein Testbild (Farbkontrolle der LED-Wand) inakzeptabel.
 */
export function yuvColor(height: number): { filter: string; tags: string[] } {
  const matrix = height >= 720 ? 'bt709' : 'bt601'
  const t = tagsFor(matrix, height)
  return {
    filter: `scale=out_color_matrix=${matrix}:out_range=tv,format=yuv420p`,
    tags: [
      '-color_primaries',
      t.primaries,
      '-color_trc',
      t.trc,
      '-colorspace',
      t.space,
      '-color_range',
      t.range
    ]
  }
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
  const color = yuvColor(pngSize(req.png)?.height ?? 1080)
  const codec =
    req.format === 'hap_q'
      ? ['-vf', pad, '-c:v', 'hap', '-format', 'hap_q', '-compressor', 'snappy']
      : [
          '-vf',
          `${pad},${color.filter}`,
          '-c:v',
          'libx264',
          '-preset',
          'medium',
          '-crf',
          '18',
          ...color.tags
        ]

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
    await runFfmpeg(args, { durationSec: dur, onProgress })
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
    // als RGB erzeugen: die Wandlung nach YUV (H.264) bzw. RGBA (HAP) passiert dann mit
    // festgelegter Matrix statt mit dem Rec.-601-Standard der Farbquelle
    inputs.push('-f', 'lavfi', '-i', `color=c=${hex}:s=${w}x${h}:r=${fps}:d=${sec},format=rgb24`)
  }
  const labels = colors.map((_, i) => `[${i}:v]`).join('')
  const pad = 'pad=ceil(iw/4)*4:ceil(ih/4)*4:0:0'
  const isHap = req.format === 'hap_q'
  const color = yuvColor(h)
  const chain = isHap
    ? `${labels}concat=n=${colors.length}:v=1:a=0,${pad}[v]`
    : `${labels}concat=n=${colors.length}:v=1:a=0,${pad},${color.filter}[v]`
  const codec = isHap
    ? ['-c:v', 'hap', '-format', 'hap_q', '-compressor', 'snappy']
    : ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18', ...color.tags]

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
  return runFfmpeg(args, { durationSec: total, onProgress })
}
