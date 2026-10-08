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
  audioRun,
  concatList,
  elementPieceArgs,
  piecesForRanges,
  planVideoGen,
  previewRanges,
  sampleAt,
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

/** Ton als Float-Samples (ein Kanal, der linke). */
function samplesOf(path: string): Float32Array {
  const buf = execFileSync(
    FF,
    ['-v', 'error', '-i', path, '-map', '0:a', '-af', 'pan=mono|c0=c0', '-f', 'f32le', '-'],
    { maxBuffer: 256 * 1024 * 1024, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
  )
  return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4))
}

/** Effektivwert (dB) eines Abschnitts in Sekunden. */
function rmsDb(s: Float32Array, from: number, to: number): number {
  let sum = 0
  const a = Math.round(from * 48000)
  const b = Math.round(to * 48000)
  for (let i = a; i < b; i++) sum += s[i] * s[i]
  return 10 * Math.log10(sum / (b - a))
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
      ['quer.jpg', 'hoch.png', 'clip.mp4', 'pal.mp4', 'musik.wav'].map((n) => [
        file(n),
        info(file(n))
      ])
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
      // 3-s-Titel: wird mit Überblendung wiederholt; Absenken unter dem Clip-Ton
      music: {
        tracks: [file('musik.wav')],
        gainDb: -10,
        fadeInSec: 1,
        fadeOutSec: 1,
        crossfadeSec: 0.5,
        duckDb: -12
      },
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
    expect(plan.music!.entries.length).toBeGreaterThan(1)
    expect(plan.music!.duck).not.toBeNull()

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
    const audio = audioRun(plan, { wavs, graphFile: file('ton.txt'), out: file('mix.wav') })
    writeFileSync(file('ton.txt'), audio.graph)
    ff(audio.args)
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

    // 6. Vorschau-Ausschnitt um Element 0 (über die Schleifen-Naht): nur die nötigen Stücke,
    // die übrigen im Ton als Stille – Bild für Bild und Sample für Sample wie das Ergebnis
    const ranges = previewRanges(plan, 0, 8)
    expect(ranges).toHaveLength(2)
    const need = piecesForRanges(plan, ranges)
    expect(need.elements.length).toBeLessThan(plan.elements.length)
    const keepE = new Set(need.elements)
    const keepT = new Set(need.transitions)
    writeFileSync(
      file('fenster.ffconcat'),
      concatList(
        plan,
        {
          elements: vids.map((v, i) => (keepE.has(i) ? v : null)),
          transitions: trans.map((t, i) => (keepT.has(i) ? t : null))
        },
        ranges
      )
    )
    const wAudio = audioRun(
      plan,
      {
        wavs: wavs.map((w, i) => (keepE.has(i) ? w : null)),
        graphFile: file('fenster.txt'),
        out: file('fenster.wav')
      },
      ranges
    )
    writeFileSync(file('fenster.txt'), wAudio.graph)
    ff(wAudio.args)
    ff([
      ...['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', file('fenster.ffconcat')],
      ...['-map', '0:v', '-c:v', 'copy', file('fenster.mov')]
    ])
    const expectFrames = ranges.flatMap(([a, b]) => out.slice(a, b))
    expect(frameMd5(file('fenster.mov'))).toEqual(expectFrames)
    const full = samplesOf(file('mix.wav'))
    const win = samplesOf(file('fenster.wav'))
    const expectSamples = ranges.flatMap(([a, b]) => [
      ...full.subarray(sampleAt(a, plan.rate), sampleAt(b, plan.rate))
    ])
    expect(win.length).toBe(expectSamples.length)
    let maxDiff = 0
    for (let i = 0; i < win.length; i++)
      maxDiff = Math.max(maxDiff, Math.abs(win[i] - expectSamples[i]))
    expect(maxDiff).toBeLessThan(1e-6)
  }, 180_000)

  it('Musik: zwei Titel mit Überblendung, Absenken unter Originalton um 12 dB', () => {
    ff([
      ...['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=25:d=2'],
      ...['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', '2'],
      ...['-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', file('leise.mp4')]
    ])
    ff([
      ...['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=320x180', '-frames:v', '1'],
      file('bild.jpg')
    ])
    ff(['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=f=440:d=5', file('t1.wav')])
    ff(['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=f=660:d=5', file('t2.wav')])
    const media = new Map(
      ['leise.mp4', 'bild.jpg', 't1.wav', 't2.wav'].map((n) => [file(n), info(file(n))])
    )
    const cut = { kind: 'cut' as const, durationSec: 0 }
    const base: Omit<VgenElement, 'id' | 'path' | 'kind'> = {
      durationSec: 2,
      inSec: null,
      outSec: null,
      kenBurns: { mode: 'off', strength: 'medium' },
      fit: null,
      transition: cut,
      audio: true
    }
    const project: VgenProject = {
      elements: [
        { ...base, id: 'a', path: file('bild.jpg'), kind: 'image' },
        { ...base, id: 'v', path: file('leise.mp4'), kind: 'video', durationSec: null },
        { ...base, id: 'b', path: file('bild.jpg'), kind: 'image', durationSec: 4 }
      ],
      output: {
        width: 160,
        height: 90,
        fps: 25,
        format: 'h264',
        quality: 'standard',
        loop: false,
        background: '#000000'
      },
      defaults: {
        imageSec: 2,
        transition: cut,
        kenBurns: { mode: 'off', strength: 'medium' },
        fit: 'crop'
      },
      music: {
        tracks: [file('t1.wav'), file('t2.wav')],
        gainDb: -6,
        fadeInSec: 0,
        fadeOutSec: 0,
        crossfadeSec: 1,
        duckDb: -12
      },
      loudnorm: null
    }
    const plan = planVideoGen(project, (p) => media.get(p), {
      tonemap: true,
      vpxAlpha: false,
      xfade: true,
      perspective: true
    })
    expect(plan.hints.filter((h) => h.level === 'error')).toEqual([])
    expect(plan.durationSec).toBe(8)
    expect(plan.music?.duck?.ranges).toEqual([[2, 4]])
    const wavs = plan.elements.map((e, i) => {
      const w = file(`m${i}.wav`)
      ff(elementPieceArgs(plan, e, { input: e.path, video: file(`m${i}.mov`), audio: w }))
      return w
    })
    const audio = audioRun(plan, { wavs, graphFile: file('m.txt'), out: file('m-mix.wav') })
    writeFileSync(file('m.txt'), audio.graph)
    ff(audio.args)
    expect(counts(file('m-mix.wav')).samples).toBe(8 * 48000)
    const s = samplesOf(file('m-mix.wav'))
    // lavfi-Sinus: −21,07 dB Effektivwert; mono -> stereo je Kanal −3 dB (Leistung bleibt, wie
    // überall bei ffmpeg), dazu −6 dB Pegel = −30,08 dB; unter dem Video 12 dB leiser
    const free = rmsDb(s, 0.5, 1.5)
    const ducked = rmsDb(s, 2.6, 3.4)
    expect(Math.abs(free + 30.08)).toBeLessThan(0.3)
    expect(ducked - free).toBeCloseTo(-12, 1)
    // nach dem Video wieder voll; Titelwechsel 4..5 s überblendet, danach Titel 2 voll
    expect(rmsDb(s, 5.2, 7.8)).toBeCloseTo(free, 1)
  }, 120_000)
})
