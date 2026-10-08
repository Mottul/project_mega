// Labortest des Video-Generators: führt die Befehle aus shared/videoGenPlan.ts mit dem
// gebündelten ffmpeg wirklich aus und zählt nach – Bilder und Samples auf das Stück genau,
// jede Stückgrenze per Bild-Prüfsumme gegen die Zwischendateien. Bewusst unbequem: 29,97 fps,
// Schleife, Musik, anamorphes Video ohne Ton, Mono-44,1-kHz-Ton, PNG mit Transparenz.
// Ohne gebündeltes ffmpeg (CI, frischer Checkout ohne `npm run ff:fetch`) übersprungen.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import type { MediaInfo, VgenElement, VgenProject } from '@shared/types'
import {
  audioGraph,
  audioRunArgs,
  concatList,
  elementPieceArgs,
  planVideoGen,
  transitionPairs,
  transitionPieceArgs,
  type VgenPlan
} from '@shared/videoGenPlan'
import { parseMediaInfo, type FfprobeJson } from '../ffmpeg/mediaInfoParse'

const osDir = { win32: 'win', darwin: 'mac' }[process.platform as string] ?? 'linux'
const exe = (n: string): string =>
  join(process.cwd(), 'resources', 'ffmpeg', osDir, process.platform === 'win32' ? `${n}.exe` : n)
const FF = exe('ffmpeg')
const FP = exe('ffprobe')
const have = existsSync(FF) && existsSync(FP)

const dir = have ? mkdtempSync(join(tmpdir(), 'vgen-lab-')) : ''
// VGEN_LAB_KEEP=1 lässt die Labordateien zur Fehlersuche stehen
afterAll(() => {
  if (dir && process.env.VGEN_LAB_KEEP) console.log('Labordateien:', dir)
  else if (dir) rmSync(dir, { recursive: true, force: true })
})

const ff = (args: string[]): string =>
  execFileSync(FF, args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  })
const probeJson = (path: string, extra: string[] = []): FfprobeJson =>
  JSON.parse(
    execFileSync(
      FP,
      ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', ...extra, path],
      { encoding: 'utf8', windowsHide: true }
    )
  ) as FfprobeJson

function info(path: string): MediaInfo {
  const st = statSync(path)
  return parseMediaInfo(probeJson(path), { path, sizeBytes: st.size, modifiedMs: st.mtimeMs })
}

/** Bildzahl (dekodiert gezählt) und Samples (Dauer in Zeitbasis 1/48000) einer Datei. */
function counts(path: string): { frames: number | null; samples: number | null } {
  const j = probeJson(path, ['-count_frames']) as {
    streams?: { codec_type?: string; nb_read_frames?: string; duration_ts?: number }[]
  }
  const v = j.streams?.find((s) => s.codec_type === 'video')
  const a = j.streams?.find((s) => s.codec_type === 'audio')
  return {
    frames: v?.nb_read_frames ? Number(v.nb_read_frames) : null,
    samples: a?.duration_ts ?? null
  }
}

/** Prüfsummen aller dekodierten Bilder einer Datei (framemd5). */
function frameMd5(path: string): string[] {
  return ff(['-v', 'error', '-i', path, '-map', '0:v', '-f', 'framemd5', '-'])
    .split('\n')
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split(',').pop()!.trim())
}

const file = (n: string): string => join(dir, n)

describe.skipIf(!have)('Video-Generator im Labor (gebündeltes ffmpeg)', () => {
  it('Schleife bei 29,97 fps: Bilder, Samples und Stückgrenzen exakt', () => {
    // Testmedien per lavfi
    ff([
      '-v',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=s=800x600',
      '-frames:v',
      '1',
      file('quer.jpg')
    ])
    ff([
      ...['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=600x800'],
      ...['-vf', "format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lt(X,300),255,0)'"],
      ...['-frames:v', '1', file('hoch.png')]
    ])
    ff([
      ...['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=25:d=3'],
      ...['-f', 'lavfi', '-i', 'sine=f=440:r=44100:d=3', '-ac', '1'],
      ...['-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', file('clip.mp4')]
    ])
    ff([
      ...['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=720x576:r=25:d=2'],
      ...['-vf', 'setsar=64/45', '-c:v', 'libx264', '-preset', 'ultrafast', file('pal.mp4')]
    ])
    ff(['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=f=220:d=3', file('musik.wav')])

    const media = new Map(
      ['quer.jpg', 'hoch.png', 'clip.mp4', 'pal.mp4'].map((n) => [file(n), info(file(n))])
    )
    expect(media.get(file('hoch.png'))?.video[0].alpha).toBe(true)
    expect(media.get(file('pal.mp4'))?.video[0].sar).toBe('64:45')

    const els: VgenElement[] = [
      {
        id: 'quer',
        path: file('quer.jpg'),
        kind: 'image',
        durationSec: 1.5,
        inSec: null,
        outSec: null,
        kenBurns: { mode: 'zoom-in', strength: 'medium' },
        fit: null,
        transition: { kind: 'fade', durationSec: 0.5 },
        audio: true
      },
      {
        id: 'hoch',
        path: file('hoch.png'),
        kind: 'image',
        durationSec: 1.3,
        inSec: null,
        outSec: null,
        kenBurns: { mode: 'auto', strength: 'strong' },
        fit: null,
        transition: { kind: 'cut', durationSec: 0 },
        audio: true
      },
      {
        id: 'clip',
        path: file('clip.mp4'),
        kind: 'video',
        durationSec: null,
        inSec: 0.5,
        outSec: 2.2,
        kenBurns: null,
        fit: 'blur',
        transition: { kind: 'dissolve', durationSec: 0.4 },
        audio: true
      },
      {
        id: 'pal',
        path: file('pal.mp4'),
        kind: 'video',
        durationSec: null,
        inSec: null,
        outSec: null,
        kenBurns: null,
        fit: 'bars',
        transition: { kind: 'fadeblack', durationSec: 0.4 },
        audio: true
      }
    ]
    const project: VgenProject = {
      elements: els,
      output: {
        width: 320,
        height: 180,
        fps: 30000 / 1001,
        format: 'h264',
        quality: 'standard',
        loop: true,
        background: '#203040'
      },
      defaults: {
        imageSec: 2,
        transition: { kind: 'fade', durationSec: 0.5 },
        kenBurns: { mode: 'auto', strength: 'medium' },
        fit: 'crop'
      },
      music: { path: file('musik.wav'), gainDb: -10, fadeInSec: 1, fadeOutSec: 1 },
      loudnorm: null
    }
    const plan: VgenPlan = planVideoGen(project, (p) => media.get(p), {
      tonemap: true,
      vpxAlpha: false,
      xfade: true,
      perspective: true
    })
    expect(plan.hints.filter((h) => h.level === 'error')).toEqual([])
    expect(plan.loop).toBe(true)

    // 1. Element-Stücke
    const vids = plan.elements.map((_, i) => file(`e${i}.mov`))
    const wavs = plan.elements.map((_, i) => file(`e${i}.wav`))
    plan.elements.forEach((e, i) => {
      ff(elementPieceArgs(plan, e, { input: e.path, video: vids[i], audio: wavs[i] }))
      expect(counts(vids[i]).frames, `Bilder Element ${i}`).toBe(e.frames)
      expect(counts(wavs[i]).samples, `Samples Element ${i}`).toBe(e.samples)
    })

    // 2. Übergänge
    const trans: (string | null)[] = plan.elements.map(() => null)
    for (const p of transitionPairs(plan)) {
      trans[p.index] = file(`t${p.index}.mov`)
      ff(
        transitionPieceArgs(plan, p.index, {
          a: vids[p.index],
          b: vids[p.next],
          out: trans[p.index]!
        })
      )
      expect(counts(trans[p.index]!).frames).toBe(plan.elements[p.index].transition?.frames)
    }

    // 3. Ton-Lauf
    writeFileSync(file('ton.txt'), audioGraph(plan, project.music))
    ff(audioRunArgs(wavs, project.music!.path, file('ton.txt'), file('mix.wav')))
    expect(counts(file('mix.wav')).samples).toBe(plan.totalSamples)

    // 4. Zusammensetzen (Bild unverändert kopiert -> Stückgrenzen per Prüfsumme vergleichbar)
    writeFileSync(file('liste.ffconcat'), concatList(plan, { elements: vids, transitions: trans }))
    ff([
      ...['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', file('liste.ffconcat')],
      ...['-i', file('mix.wav'), '-map', '0:v', '-map', '1:a', '-c:v', 'copy'],
      ...['-c:a', 'pcm_s16le', file('ergebnis.mov')]
    ])
    const result = counts(file('ergebnis.mov'))
    expect(result.frames).toBe(plan.totalFrames)
    expect(result.samples).toBe(plan.totalSamples)

    // 5. Stückgrenzen: jedes Ausgabebild stammt genau vom erwarteten Bild seines Stücks
    const out = frameMd5(file('ergebnis.mov'))
    const pieces = vids.map(frameMd5)
    const tpieces = trans.map((t) => (t ? frameMd5(t) : null))
    const n = plan.elements.length
    let g = 0
    for (let i = 0; i < n; i++) {
      const e = plan.elements[i]
      const prev = plan.elements[(i - 1 + n) % n]
      const before = i > 0 || plan.loop ? (prev.transition?.frames ?? 0) : 0
      const after = e.transition?.frames ?? 0
      const body = e.frames - before - after
      expect(out[g], `erstes Bild von Element ${i}`).toBe(pieces[i][before])
      expect(out[g + body - 1], `letztes Bild von Element ${i}`).toBe(
        pieces[i][e.frames - after - 1]
      )
      g += body
      if (after > 0) {
        expect(out[g], `Übergang nach ${i}, erstes Bild`).toBe(tpieces[i]![0])
        expect(out[g + after - 1], `Übergang nach ${i}, letztes Bild`).toBe(tpieces[i]![after - 1])
        g += after
      }
    }
    expect(g).toBe(plan.totalFrames)
  }, 180_000)
})
