// Labortest des Player-Imports: Quellen per lavfi, dann genau der Plan und die Argumente des
// Imports (playerOptions -> planConversion -> buildConvertArgs) mit dem gebündelten ffmpeg –
// je Encoder, den dieser Rechner hat (der Import nimmt bevorzugt die GPU). Geprüft wird das
// Bild selbst: Die Quelle ist einfarbig magenta, also darf im Ergebnis nirgends Grün stehen
// (Grün = Nullen in YUV, typisch für nicht beschriebene Bildbereiche).
// Ohne gebündeltes ffmpeg (CI, frischer Checkout ohne `npm run ff:fetch`) übersprungen.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { planConversion } from '@shared/convertPlan'
import type { MediaInfo } from '@shared/types'

// args/capabilities ziehen über ffmpegPath nur `electron` (app) herein
vi.mock('electron', () => ({
  app: { getPath: () => tmpdir(), isPackaged: false, getAppPath: () => process.cwd() }
}))
vi.mock('../log', () => ({ logLine: () => {} }))

const { buildConvertArgs } = await import('./args')
const { capabilitiesFrom, parseEncoderNames, parseFilterNames } = await import('./capabilities')
const { parseMediaInfo } = await import('../ffmpeg/mediaInfoParse')
const { playerOptions } = await import('../player/playerPlan')
const { probeMediaInfo } = await import('../ffmpeg/mediaInfo')
const { DEFAULT_OPTIONS, presetOptions } = await import('@renderer/tools/hap-converter/presets')

/** Analyse wie in der App (mit Tiefenanalyse: Halbbilder, GOP) */
async function deepInfo(path: string): Promise<MediaInfo> {
  const res = await probeMediaInfo(path, { deep: true })
  if (!res.ok) throw new Error(res.error)
  return res.info
}

const osDir = { win32: 'win', darwin: 'mac' }[process.platform as string] ?? 'linux'
const exe = (n: string): string =>
  join(process.cwd(), 'resources', 'ffmpeg', osDir, process.platform === 'win32' ? `${n}.exe` : n)
const FF = exe('ffmpeg')
const FP = exe('ffprobe')
const have = existsSync(FF) && existsSync(FP)
const dir = have ? mkdtempSync(join(tmpdir(), 'player-lab-')) : ''
afterAll(() => {
  if (dir && process.env.PLAYER_LAB_KEEP) console.log('Labordateien:', dir)
  else if (dir) rmSync(dir, { recursive: true, force: true })
})

const ff = (args: string[]): Buffer =>
  execFileSync(FF, ['-hide_banner', '-v', 'error', ...args], {
    maxBuffer: 256 * 1024 * 1024,
    windowsHide: true
  })

function info(path: string): MediaInfo {
  const json = JSON.parse(
    execFileSync(
      FP,
      ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path],
      {
        encoding: 'utf8',
        windowsHide: true
      }
    )
  )
  const st = statSync(path)
  return parseMediaInfo(json, { path, sizeBytes: st.size, modifiedMs: st.mtimeMs })
}

const caps = have
  ? capabilitiesFrom(
      parseEncoderNames(ff(['-encoders']).toString()),
      parseFilterNames(ff(['-filters']).toString()),
      null
    )
  : null

/** Encoder, die hier wirklich laufen (Probelauf wie in convert/encoders.ts) */
const encoders: string[] = !have
  ? []
  : ['libx264', 'h264_nvenc', 'h264_qsv', 'h264_amf'].filter((e) => {
      try {
        ff(['-f', 'lavfi', '-i', 'color=c=black:s=256x256:d=0.1', '-c:v', e, '-f', 'null', '-'])
        return true
      } catch {
        return false
      }
    })

/** Einfarbige Quelle (magenta), 1 s, mit Ton */
function source(name: string, w: number, h: number): string {
  const out = join(dir, `${name}.mp4`)
  ff([
    ...['-f', 'lavfi', '-i', `color=c=0xc040c0:s=${w}x${h}:r=25:d=1`],
    ...['-f', 'lavfi', '-i', 'sine=frequency=440:duration=1'],
    ...['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '-y', out]
  ])
  return out
}

/** RGB eines Bildes (0,5 s) und die Stellen, an denen Grün steht */
function greenColumns(file: string, w: number, h: number): number[] {
  const rgb = ff([
    '-ss',
    '0.5',
    '-i',
    file,
    '-frames:v',
    '1',
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    '-'
  ])
  const y = Math.floor(h / 2)
  const cols: number[] = []
  for (let x = 0; x < w; x += Math.max(1, Math.floor(w / 64))) {
    const i = (y * w + x) * 3
    const [r, g, b] = [rgb[i], rgb[i + 1], rgb[i + 2]]
    if (g > r + 40 && g > b + 40) cols.push(x)
  }
  return cols
}

/** Quelle -> Wand: schmaler (Ränder links/rechts), breiter (oben/unten), sehr breite LED-Wand */
const CASES = [
  { name: '4zu3', w: 1440, h: 1080, wall: { w: 1920, h: 1080 } },
  { name: 'hochkant', w: 1080, h: 1920, wall: { w: 1920, h: 1080 } },
  { name: 'vga', w: 640, h: 480, wall: { w: 3840, h: 1080 } },
  { name: '16zu9', w: 1920, h: 1080, wall: { w: 1280, h: 1024 } }
]

describe.skipIf(!have)('Labor Player-Import: Blur-Rand', () => {
  for (const enc of encoders) {
    for (const c of CASES) {
      {
        const wall = c.wall
        it(`${enc}: ${c.name} ${c.w}×${c.h} auf ${wall.w}×${wall.h} – kein Grün im Bild`, () => {
          const src = source(c.name, c.w, c.h)
          const opts = playerOptions(
            'video',
            { fit: 'blur', width: wall.w, height: wall.h, blurStrength: 50, blurDarken: 0 },
            null
          )
          const planned = planConversion(info(src), opts, caps!)
          expect(planned.ok).toBe(true)
          if (!planned.ok) return
          const out = join(dir, `${enc}-${c.name}-${wall.w}x${wall.h}.mp4`)
          const args = buildConvertArgs(planned.plan, opts, {
            input: src,
            output: out,
            encoder: enc
          })
          ff(args.filter((a) => a !== '-hide_banner'))
          const res = info(out)
          expect([res.video[0]?.width, res.video[0]?.height]).toEqual([wall.w, wall.h])
          expect(greenColumns(out, wall.w, wall.h)).toEqual([])
        })
      }
    }
  }
})

describe.skipIf(!have)('Labor: Video aus dem Konverter (Laptop-Playout) beim Player-Import', () => {
  for (const enc of encoders) {
    it(`${enc}: gleiche Größe wie die Wand -> nur umverpacken, kein zweites Kodieren`, async () => {
      // Kameradatei, die der Konverter neu kodiert (MPEG-2 mit PCM-Ton)
      const cam = join(dir, `kamera-${enc}.mov`)
      ff([
        ...['-f', 'lavfi', '-i', 'testsrc2=s=1920x1080:r=25:d=3'],
        ...['-f', 'lavfi', '-i', 'sine=frequency=440:duration=3:sample_rate=48000'],
        ...['-c:v', 'mpeg2video', '-q:v', '4', '-c:a', 'pcm_s16le', '-shortest', '-y', cam]
      ])
      const conv = presetOptions('laptop', DEFAULT_OPTIONS)
      const cp = planConversion(await deepInfo(cam), conv, caps!)
      expect(cp.ok).toBe(true)
      if (!cp.ok) return
      const laptop = join(dir, `laptop-${enc}.mp4`)
      const cargs = buildConvertArgs(cp.plan, conv, { input: cam, output: laptop, encoder: enc })
      ff(cargs.filter((a) => a !== '-hide_banner'))

      const opts = playerOptions(
        'video',
        { fit: 'blur', width: 1920, height: 1080, blurStrength: 50, blurDarken: 0 },
        null
      )
      const pp = planConversion(await deepInfo(laptop), opts, caps!)
      expect(pp.ok).toBe(true)
      if (!pp.ok) return
      expect(
        { video: pp.plan.video?.copy, audio: pp.plan.audio?.codec },
        `Schritte: ${pp.plan.steps.join(' | ')} – Filter: ${pp.plan.video?.filters.join(',')}`
      ).toEqual({ video: true, audio: 'copy' })
    })
  }
})
