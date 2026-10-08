import { describe, expect, it } from 'vitest'
import type { MediaInfo, VgenElement, VgenMusic, VgenProject } from './types'
import {
  audioGraph,
  audioRun,
  clampKenBurnsFrame,
  concatList,
  duckExpr,
  duckFactor,
  elementCacheKey,
  elementPieceArgs,
  frameAt,
  frameTime,
  hash53,
  imageSecForMusic,
  KEN_BURNS_ZOOM_MAX,
  kenBurnsFrames,
  kenBurnsPath,
  kenBurnsRect,
  musicAt,
  musicPassSamples,
  outputSegments,
  perspectiveFilter,
  piecesForRanges,
  planVideoGen,
  previewRanges,
  rangeOffset,
  sampleAt,
  transitionCacheKey,
  transitionPairs,
  transitionPieceArgs,
  type VgenCaps,
  type VgenPlan
} from './videoGenPlan'
import { audioTrack, mediaInfo, videoTrack } from '../renderer/src/tools/media-info/testFactory'

const CAPS: VgenCaps = { tonemap: true, vpxAlpha: true, xfade: true, perspective: true }

function photo(path: string, w = 4000, h = 3000, p: Partial<MediaInfo> = {}): MediaInfo {
  return mediaInfo({
    path,
    name: path,
    isStill: true,
    durationSec: null,
    audio: [],
    video: [
      videoTrack({
        codecName: 'mjpeg',
        codec: 'Motion-JPEG',
        codecClass: 'image',
        width: w,
        height: h,
        displayWidth: w,
        displayHeight: h,
        fps: null,
        fpsMode: 'still',
        pixFmt: 'yuvj420p',
        colorRange: 'pc',
        colorSpace: null,
        frames: null,
        durationSec: null
      })
    ],
    ...p
  })
}

function clip(path: string, durationSec: number, p: Partial<MediaInfo> = {}): MediaInfo {
  return mediaInfo({
    path,
    name: path,
    durationSec,
    video: [videoTrack({ durationSec })],
    audio: [audioTrack({ durationSec })],
    ...p
  })
}

let nextId = 0
function el(path: string, p: Partial<VgenElement> = {}): VgenElement {
  return {
    id: `id-${nextId++}`,
    path,
    kind: 'image',
    durationSec: null,
    inSec: null,
    outSec: null,
    kenBurns: null,
    fit: null,
    transition: null,
    audio: true,
    ...p
  }
}

function project(elements: VgenElement[], p: Partial<VgenProject['output']> = {}): VgenProject {
  return {
    elements,
    output: {
      width: 1920,
      height: 1080,
      fps: 25,
      format: 'h264',
      quality: 'standard',
      loop: false,
      background: '#000000',
      ...p
    },
    defaults: {
      imageSec: 4,
      transition: { kind: 'fade', durationSec: 1 },
      kenBurns: { mode: 'zoom-in', strength: 'medium' },
      fit: 'crop'
    },
    music: null,
    loudnorm: null
  }
}

const lookup =
  (...infos: MediaInfo[]) =>
  (path: string): MediaInfo | null =>
    infos.find((i) => i.path === path) ?? null

/** Ton der Kette: Summe der WAVs minus aller Überlappungen muss die Gesamtlänge ergeben. */
function chainSamples(plan: VgenPlan): number {
  let sum = 0
  for (const e of plan.elements) sum += e.samples
  for (const p of transitionPairs(plan)) sum -= plan.elements[p.index].transition?.samples ?? 0
  return sum
}

describe('videoGenPlan – Zeitachse', () => {
  it('drei Fotos à 4 s mit 1 s Überblenden bei 25 fps', () => {
    const plan = planVideoGen(
      project([el('a.jpg'), el('b.jpg'), el('c.jpg')]),
      lookup(photo('a.jpg'), photo('b.jpg'), photo('c.jpg')),
      CAPS
    )
    expect(plan.ok).toBe(true)
    expect(plan.elements.map((e) => [e.frames, e.start])).toEqual([
      [100, 0],
      [100, 75],
      [100, 150]
    ])
    expect(plan.totalFrames).toBe(250)
    expect(plan.durationSec).toBe(10)
    expect(plan.totalSamples).toBe(480_000)
    expect(plan.elements.map((e) => e.samples)).toEqual([192_000, 192_000, 192_000])
    expect(plan.elements[0].transition).toMatchObject({ kind: 'fade', frames: 25, samples: 48_000 })
    expect(plan.elements[2].transition).toBeNull()
    expect(chainSamples(plan)).toBe(plan.totalSamples)
  })

  it('29,97 fps: Samples aus der aufsummierten Achse, keine Drift', () => {
    const files = ['a', 'b', 'c', 'd', 'e'].map((n) => `${n}.jpg`)
    const plan = planVideoGen(
      project(
        files.map((f, i) => el(f, { durationSec: 3.3 + i * 0.7 })),
        { fps: 30000 / 1001 }
      ),
      lookup(...files.map((f) => photo(f))),
      CAPS
    )
    expect(plan.rate).toEqual([30000, 1001])
    expect(plan.totalSamples).toBe(sampleAt(plan.totalFrames, plan.rate))
    expect(chainSamples(plan)).toBe(plan.totalSamples)
    // ein Bild ist 1601,6 Samples: die WAV-Längen sind nicht alle gleich gerundet
    expect(new Set(plan.elements.map((e) => e.samples % 2)).size).toBeGreaterThan(0)
  })

  it('zu lange Übergänge werden gekürzt (höchstens die Hälfte des kürzeren Nachbarn)', () => {
    const plan = planVideoGen(
      project([el('a.jpg', { durationSec: 1 }), el('b.jpg')]),
      lookup(photo('a.jpg'), photo('b.jpg')),
      CAPS
    )
    expect(plan.elements[0].transition).toMatchObject({ frames: 12, requestedFrames: 25 })
    expect(plan.hints.find((h) => h.id === 'transition-short')?.text).toContain('0,48 s')
  })

  it('Schnitt: kein Übergangs-Stück, Ton per concat', () => {
    const plan = planVideoGen(
      project([el('a.jpg', { transition: { kind: 'cut', durationSec: 1 } }), el('b.jpg')]),
      lookup(photo('a.jpg'), photo('b.jpg')),
      CAPS
    )
    expect(plan.elements[0].transition).toMatchObject({ kind: 'cut', frames: 0, samples: 0 })
    expect(transitionPairs(plan)).toEqual([])
    expect(plan.totalFrames).toBe(200)
    expect(audioGraph(plan)).toContain('[0:a][1:a]concat=n=2:v=0:a=1[x1]')
    expect(chainSamples(plan)).toBe(plan.totalSamples)
  })

  it('Videoausschnitt: Start/Ende, über das Ende hinaus wird gekürzt', () => {
    const plan = planVideoGen(
      project([el('clip.mp4', { kind: 'video', inSec: 2, outSec: 30 })]),
      lookup(clip('clip.mp4', 10)),
      CAPS
    )
    expect(plan.elements[0]).toMatchObject({ kind: 'video', inSec: 2, frames: 200 })
    expect(plan.hints.map((h) => h.id)).toContain('range-clamped')
  })

  it('fehlende Datei oder ohne Bildspur: Fehler, ok = false', () => {
    const plan = planVideoGen(project([el('weg.jpg')]), () => null, CAPS)
    expect(plan.ok).toBe(false)
    expect(plan.hints[0]).toMatchObject({ id: 'unreadable', level: 'error' })
    expect(planVideoGen(project([]), () => null, CAPS).hints[0].id).toBe('empty')
  })

  it('xfade fehlt: Übergänge sind ein Fehler, reine Schnitte gehen', () => {
    const caps = { ...CAPS, xfade: false }
    const media = lookup(photo('a.jpg'), photo('b.jpg'))
    expect(planVideoGen(project([el('a.jpg'), el('b.jpg')]), media, caps).ok).toBe(false)
    const cuts = project([el('a.jpg'), el('b.jpg')])
    cuts.defaults.transition = { kind: 'cut', durationSec: 0 }
    expect(planVideoGen(cuts, media, caps).ok).toBe(true)
  })
})

describe('videoGenPlan – nahtlose Schleife', () => {
  const media = lookup(photo('a.jpg'), photo('b.jpg'), photo('c.jpg'))
  const looped = (): VgenPlan =>
    planVideoGen(project([el('a.jpg'), el('b.jpg'), el('c.jpg')], { loop: true }), media, CAPS)

  it('Gesamtlänge = Summe der Dauern − ALLE Übergänge, Element 0 beginnt nach seinem Kopf', () => {
    const plan = looped()
    expect(plan.loop).toBe(true)
    expect(plan.totalFrames).toBe(300 - 75)
    expect(plan.elements.map((e) => e.start)).toEqual([-25, 50, 125])
    expect(plan.elements[2].transition).toMatchObject({ frames: 25, samples: 48_000 })
    expect(plan.elements[0].headSamples).toBe(48_000)
    expect(chainSamples(plan)).toBe(plan.totalSamples)
    expect(transitionPairs(plan)).toEqual([
      { index: 0, next: 1 },
      { index: 1, next: 2 },
      { index: 2, next: 0 }
    ])
  })

  it('29,97 fps: Kopf genau so lang wie die Überlappung am Ende', () => {
    const plan = planVideoGen(
      project([el('a.jpg', { durationSec: 3.1 }), el('b.jpg'), el('c.jpg', { durationSec: 5.3 })], {
        loop: true,
        fps: 30000 / 1001
      }),
      media,
      CAPS
    )
    const last = plan.elements[2].transition
    expect(plan.elements[0].headSamples).toBe(last?.samples)
    expect(chainSamples(plan)).toBe(plan.totalSamples)
  })

  it('Bildliste: Element 0 ab dem Kopf, am Ende der Schleifen-Übergang', () => {
    const plan = looped()
    const list = concatList(plan, {
      elements: ['e0.mov', 'e1.mov', 'e2.mov'],
      transitions: ['t0.mov', 't1.mov', 't2.mov']
    })
    expect(list.split('\n').slice(0, 5)).toEqual([
      'ffconcat version 1.0',
      "file 'e0.mov'",
      'inpoint 1.000000',
      'outpoint 3.000000',
      "file 't0.mov'"
    ])
    expect(list.trim().split('\n').slice(-1)[0]).toBe("file 't2.mov'")
  })

  it('Ton: Kopf von Element 0 abgetrennt und am Ende überblendet', () => {
    const g = audioGraph(looped())
    expect(g).toContain('[h0]atrim=end_sample=48000')
    expect(g).toContain('[b0]atrim=start_sample=48000')
    expect(g).toContain('[x2][head]acrossfade=ns=48000')
    expect(g).toContain('apad,atrim=end_sample=432000')
  })

  it('ein Element: keine Schleife, Hinweis', () => {
    const plan = planVideoGen(project([el('a.jpg')], { loop: true }), media, CAPS)
    expect(plan.loop).toBe(false)
    expect(plan.hints.map((h) => h.id)).toContain('loop-single')
  })
})

describe('videoGenPlan – Ken Burns', () => {
  const out = { width: 1920, height: 1080 }

  it('Zoom rein: vom Grundfenster auf 1/Z, mittig', () => {
    const p = kenBurnsPath('x', 'zoom-in', 'medium', out, out, 'crop')!
    expect(kenBurnsRect(p, 0)).toEqual({ x: 0, y: 0, w: 1, h: 1 })
    const end = kenBurnsRect(p, 1)
    expect(end.w).toBeCloseTo(1 / 1.2, 9)
    expect(end.x + end.w / 2).toBeCloseTo(0.5, 9)
  })

  it('Schwenk bleibt immer innerhalb der Fläche', () => {
    for (const mode of ['pan-left', 'pan-right', 'pan-up', 'pan-down'] as const) {
      for (const canvas of [out, { width: 1920, height: 3414 }, { width: 4000, height: 1080 }]) {
        const p = kenBurnsPath('x', mode, 'strong', canvas, out, 'crop')!
        for (const t of [0, 0.25, 0.5, 1]) {
          const r = kenBurnsRect(p, t)
          expect(r.x).toBeGreaterThanOrEqual(-1e-9)
          expect(r.y).toBeGreaterThanOrEqual(-1e-9)
          expect(r.x + r.w).toBeLessThanOrEqual(1 + 1e-9)
          expect(r.y + r.h).toBeLessThanOrEqual(1 + 1e-9)
        }
      }
    }
  })

  it('automatisch: Hochkant schwenkt senkrecht, sonst deterministisch aus der id', () => {
    const portrait = { width: 1920, height: 2560 }
    expect(kenBurnsPath('a', 'auto', 'medium', portrait, out, 'crop')!.mode).toMatch(
      /^pan-(up|down)$/
    )
    const m1 = kenBurnsPath('elem-1', 'auto', 'medium', out, out, 'crop')!.mode
    expect(kenBurnsPath('elem-1', 'auto', 'medium', out, out, 'crop')!.mode).toBe(m1)
    const modes = new Set(
      Array.from(
        { length: 40 },
        (_, i) => kenBurnsPath(`e${i}`, 'auto', 'medium', out, out, 'crop')!.mode
      )
    )
    expect(modes.size).toBeGreaterThan(2)
    // Ränder/Blur: nur Zoom (ein Schwenk zeigte den Rand)
    expect(kenBurnsPath('a', 'auto', 'medium', out, out, 'bars')!.mode).toMatch(/^zoom-/)
    expect(kenBurnsPath('a', 'off', 'medium', out, out, 'crop')).toBeNull()
  })

  it('perspective: Ecken als Ausdruck der Bildnummer, Zoom exponentiell', () => {
    const p = kenBurnsPath('x', 'zoom-in', 'medium', out, out, 'crop')!
    const f = perspectiveFilter(p, 100)
    expect(f).toContain('pow(1.2,in/99)')
    expect(f).toContain('interpolation=cubic:eval=frame')
    expect(f.match(/:x[0-3]=/g)).toHaveLength(3)
  })
})

describe('videoGenPlan – Befehle', () => {
  it('Foto-Stück: einmal dekodieren, wiederholen, Ken Burns, exakt N Bilder und Stille', () => {
    const plan = planVideoGen(project([el('a.jpg')]), lookup(photo('a.jpg')), CAPS)
    const args = elementPieceArgs(plan, plan.elements[0], {
      input: 'a.jpg',
      video: 'v.mov',
      audio: 'a.wav'
    })
    const g = args[args.indexOf('-filter_complex') + 1]
    expect(g).toContain('loop=loop=99:size=1:start=0,settb=1/25,setpts=N')
    expect(g).toContain('perspective=')
    expect(g).toContain('trim=end_frame=100')
    // JPEG: volle Range, Rec. 601 -> HD: Rec. 709 Limited
    expect(g).toContain('in_color_matrix=bt601:in_range=pc:out_color_matrix=bt709:out_range=tv')
    // Farbort einheitlich links (JPEG käme mit „center“; ein Wechsel in der Bildliste ließe
    // neueres ffmpeg umrechnen)
    expect(g).toContain('out_chroma_loc=left')
    expect(g).toContain(':chroma_location=left')
    expect(g).toContain('anullsrc=r=48000:cl=stereo,atrim=end_sample=192000')
    expect(args).toContain('-g')
    expect(args.slice(-3)).toEqual(['-progress', 'pipe:1', '-nostats'])
  })

  it('Hochkantfoto beim Füllen: Deckfläche, nach der Bewegung auf Ausgabegröße', () => {
    const plan = planVideoGen(
      project([el('hoch.jpg', { kenBurns: { mode: 'auto', strength: 'medium' } })]),
      lookup(photo('hoch.jpg', 3000, 4000)),
      CAPS
    )
    const e = plan.elements[0]
    expect(e.canvas).toEqual({ width: 1920, height: 2560 })
    const g = elementPieceArgs(plan, e, { input: 'i', video: 'v', audio: 'a' }).join(' ')
    expect(g).toContain('scale=1920:2560:flags=lanczos')
    expect(g).toContain('scale=1920:1080:flags=bicubic')
  })

  it('Video-Stück: Ausschnitt, feste Rate, auffüllen, Ton exakt, SD-Matrix umgerechnet', () => {
    const sd = clip('sd.mp4', 8, {
      video: [
        videoTrack({
          width: 720,
          height: 576,
          displayWidth: 1024,
          displayHeight: 576,
          sar: '64:45',
          colorSpace: 'bt470bg',
          scan: 'tff',
          durationSec: 8
        })
      ]
    })
    const plan = planVideoGen(
      project([el('sd.mp4', { kind: 'video', inSec: 1, outSec: 3, fit: 'bars' })]),
      lookup(sd),
      CAPS
    )
    const args = elementPieceArgs(plan, plan.elements[0], {
      input: 'sd.mp4',
      video: 'v',
      audio: 'a'
    })
    expect(args.slice(args.indexOf('-ss'), args.indexOf('-i') + 2)).toEqual([
      '-ss',
      '1.000000',
      '-t',
      '2.020000',
      '-i',
      'sd.mp4'
    ])
    const g = args[args.indexOf('-filter_complex') + 1]
    expect(g).toContain('bwdif=mode=send_field:parity=tff:deint=all,fps=25,scale=')
    expect(g).toContain('in_color_matrix=bt601:in_range=tv:out_color_matrix=bt709')
    expect(g).toContain('pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x000000')
    expect(g).toContain('tpad=stop_mode=clone')
    expect(g).toContain('[0:1]aresample=48000')
    expect(g).toContain('atrim=end_sample=96000')
  })

  it('Video ohne Originalton: Stille', () => {
    const plan = planVideoGen(
      project([el('c.mp4', { kind: 'video', audio: false })]),
      lookup(clip('c.mp4', 2)),
      CAPS
    )
    expect(plan.elements[0].audioStream).toBeNull()
    const g = elementPieceArgs(plan, plan.elements[0], { input: 'i', video: 'v', audio: 'a' })
    expect(g.join(' ')).toContain('anullsrc')
  })

  it('Übergangs-Stück: nur das Ende von a und den Anfang von b, halbes Bild Versatz', () => {
    const plan = planVideoGen(
      project([el('a.jpg'), el('b.jpg')]),
      lookup(photo('a.jpg'), photo('b.jpg')),
      CAPS
    )
    const args = transitionPieceArgs(plan, 0, { a: 'e0.mov', b: 'e1.mov', out: 't0.mov' })
    expect(args.slice(3, 11)).toEqual([
      '-ss',
      frameTime(74.5, plan.rate),
      '-i',
      'e0.mov',
      '-t',
      frameTime(25.5, plan.rate),
      '-i',
      'e1.mov'
    ])
    expect(args.join(' ')).toContain(
      'xfade=transition=fade:duration=1.000000:offset=0,trim=end_frame=25'
    )
  })

  it('Bildliste: Pfade mit / und maskiertem Apostroph', () => {
    const plan = planVideoGen(
      project([el('a.jpg'), el('b.jpg')]),
      lookup(photo('a.jpg'), photo('b.jpg')),
      CAPS
    )
    const list = concatList(plan, {
      elements: ["C:\\cache\\it's.mov", 'C:\\cache\\b.mov'],
      transitions: ['C:\\cache\\t.mov', null]
    })
    expect(list).toContain("file 'C:/cache/it'\\''s.mov'")
    expect(list).toContain('outpoint 3.000000')
    expect(list).toContain('inpoint 1.000000')
    expect(() => concatList(plan, { elements: ['a', 'b'], transitions: [null, null] })).toThrow(
      /fehlt/
    )
  })

  it('Musik: auf Gesamtlänge, Blenden, Pegel; gemischt ohne Normalisierung', () => {
    const p = project([el('a.jpg'), el('b.jpg')])
    p.music = music(['m.mp3'])
    const plan = planVideoGen(p, lookup(photo('a.jpg'), photo('b.jpg'), song('m.mp3', 60)), CAPS)
    const g = audioGraph(plan)
    expect(g).toContain('[2:a]aresample=48000')
    expect(g).toContain('asetpts=N/SR/TB,afade=t=in:d=2,afade=t=out:st=4:d=3,volume=-6dB[mus]')
    expect(g).toContain('amix=inputs=2:duration=first:dropout_transition=0:normalize=0')
  })
})

function song(path: string, sec: number): MediaInfo {
  return mediaInfo({
    path,
    name: path,
    isStill: false,
    durationSec: sec,
    video: [],
    audio: [audioTrack({ durationSec: sec })]
  })
}

function music(tracks: string[], p: Partial<VgenMusic> = {}): VgenMusic {
  return { tracks, gainDb: -6, fadeInSec: 2, fadeOutSec: 3, crossfadeSec: 2, duckDb: 0, ...p }
}

describe('videoGenPlan – eigener Ken-Burns-Rahmen', () => {
  const out = { width: 1920, height: 1080 }

  it('Start und Ende aus dem Rahmen, in die Fläche gezwungen', () => {
    const p = kenBurnsPath('x', 'custom', 'medium', { width: 1920, height: 2560 }, out, 'crop', {
      from: { cx: 0.5, cy: 0, zoom: 1 },
      to: { cx: 0.9, cy: 0.5, zoom: 2 }
    })!
    expect(p.mode).toBe('custom')
    // Grundfenster auf der Hochkant-Fläche: ganze Breite, 1080/2560 der Höhe
    expect(p.bw).toBe(1)
    expect(p.bh).toBeCloseTo(1080 / 2560, 9)
    const a = kenBurnsRect(p, 0)
    expect(a.y).toBeCloseTo(0, 9) // oben angeschlagen statt darüber hinaus
    const b = kenBurnsRect(p, 1)
    expect(b.w).toBeCloseTo(0.5, 9)
    expect(b.x + b.w).toBeCloseTo(1, 9) // rechts angeschlagen
    for (const t of [0, 0.3, 0.7, 1]) {
      const r = kenBurnsRect(p, t)
      expect(r.x).toBeGreaterThanOrEqual(-1e-9)
      expect(r.y).toBeGreaterThanOrEqual(-1e-9)
      expect(r.x + r.w).toBeLessThanOrEqual(1 + 1e-9)
      expect(r.y + r.h).toBeLessThanOrEqual(1 + 1e-9)
    }
  })

  it('Zoom höchstens 4×; ohne Rahmen ruhig in der Mitte; Bahn -> Rahmen -> gleiche Bahn', () => {
    expect(clampKenBurnsFrame({ cx: 0.5, cy: 0.5, zoom: 10 }, 1, 1).zoom).toBe(KEN_BURNS_ZOOM_MAX)
    const still = kenBurnsPath('x', 'custom', 'medium', out, out, 'crop')!
    expect(kenBurnsRect(still, 0)).toEqual({ x: 0, y: 0, w: 1, h: 1 })
    const auto = kenBurnsPath('x', 'pan-left', 'strong', out, out, 'crop')!
    const again = kenBurnsPath('x', 'custom', 'strong', out, out, 'crop', kenBurnsFrames(auto))!
    expect(perspectiveFilter(again, 100)).toBe(perspectiveFilter(auto, 100))
  })

  it('im Plan: eigener Rahmen ändert das Stück', () => {
    const media = lookup(photo('a.jpg'))
    const base = planVideoGen(project([el('a.jpg', { id: 'K' })]), media, CAPS)
    const own = planVideoGen(
      project([
        el('a.jpg', {
          id: 'K',
          kenBurns: {
            mode: 'custom',
            strength: 'medium',
            from: { cx: 0.3, cy: 0.3, zoom: 1.5 },
            to: { cx: 0.6, cy: 0.6, zoom: 1.2 }
          }
        })
      ]),
      media,
      CAPS
    )
    expect(own.elements[0].kenBurns).toMatchObject({ mode: 'custom', z0: 1.5, z1: 1.2 })
    expect(elementCacheKey(own, own.elements[0])).not.toBe(elementCacheKey(base, base.elements[0]))
  })
})

describe('videoGenPlan – Abschnitte und Vorschau-Ausschnitt', () => {
  const files = ['a', 'b', 'c', 'd', 'e'].map((n) => `${n}.jpg`)
  const media = lookup(...files.map((f) => photo(f)))
  const five = (loop = false): VgenPlan =>
    planVideoGen(
      project(
        files.map((f) => el(f)),
        { loop }
      ),
      media,
      CAPS
    )
  const names = {
    elements: files.map((_, i) => `e${i}.mov`),
    transitions: files.map((_, i) => `t${i}.mov`)
  }

  it('Abschnitte liegen lückenlos hintereinander und ergeben die Gesamtlänge', () => {
    for (const loop of [false, true]) {
      const plan = five(loop)
      const segs = outputSegments(plan)
      let at = 0
      for (const s of segs) {
        expect(s.at).toBe(at)
        at += s.frames
      }
      expect(at).toBe(plan.totalFrames)
      expect(segs.filter((s) => s.kind === 'transition')).toHaveLength(loop ? 5 : 4)
    }
  })

  it('Element ganz von Übergängen verbraucht: kein leerer Eintrag in der Bildliste', () => {
    const plan = planVideoGen(
      project([el('a.jpg'), el('b.jpg', { durationSec: 2 }), el('c.jpg')]),
      lookup(photo('a.jpg'), photo('b.jpg'), photo('c.jpg')),
      CAPS
    )
    // b: 50 Bilder, Übergänge davor und danach je 25
    expect(outputSegments(plan).some((s) => s.kind === 'element' && s.index === 1)).toBe(false)
    const list = concatList(plan, names)
    expect(list).not.toContain('e1.mov')
    expect(list).toContain('t0.mov')
  })

  it('Ausschnitt um ein Element: eine Sekunde davor und danach, an den Enden gekappt', () => {
    const plan = five()
    // Starts 0, 75, 150, 225, 300; je 100 Bilder; gesamt 400
    expect(previewRanges(plan, 2, 25)).toEqual([[125, 275]])
    expect(previewRanges(plan, 0, 25)).toEqual([[0, 125]])
    expect(previewRanges(plan, 4, 25)).toEqual([[275, 400]])
    expect(piecesForRanges(plan, [[125, 275]])).toEqual({
      elements: [1, 2, 3],
      transitions: [1, 2]
    })
  })

  it('Schleife: Ausschnitt über die Naht in zwei Bereichen', () => {
    const plan = five(true)
    // Starts −25, 50, 125, 200, 275; gesamt 375
    expect(plan.totalFrames).toBe(375)
    expect(previewRanges(plan, 0, 25)).toEqual([
      [325, 375],
      [0, 100]
    ])
    expect(previewRanges(plan, 4, 25)).toEqual([
      [250, 375],
      [0, 25]
    ])
    expect(previewRanges(plan, 2, 1000)).toEqual([[0, 375]])
    // Ende von Element 4, Schleifen-Übergang, Element 0, Übergang 0→1, Anfang von Element 1
    const need = piecesForRanges(plan, previewRanges(plan, 0, 25))
    expect(need).toEqual({ elements: [0, 1, 4], transitions: [0, 4] })
    // Lage des Elements im aneinandergehängten Ausschnitt
    expect(rangeOffset(previewRanges(plan, 0, 25), -25, 375)).toBe(25)
    expect(
      rangeOffset(
        [
          [325, 375],
          [0, 100]
        ],
        74,
        375
      )
    ).toBe(124)
    expect(rangeOffset([[0, 10]], 50, 375)).toBeNull()
  })

  it('Bildliste des Ausschnitts: angeschnittene Stücke mit in-/outpoint, Naht durchgehend', () => {
    const plan = five(true)
    const list = concatList(plan, names, [
      [325, 375],
      [0, 100]
    ])
    // 325..350 = Mittelteil von e4 ab Stück-Bild 50, dann der Schleifen-Übergang, e0, t0, e1
    expect(list.split('\n').slice(1, -1)).toEqual([
      "file 'e4.mov'",
      `inpoint ${frameTime(50, plan.rate)}`,
      `outpoint ${frameTime(75, plan.rate)}`,
      "file 't4.mov'",
      "file 'e0.mov'",
      `inpoint ${frameTime(25, plan.rate)}`,
      `outpoint ${frameTime(75, plan.rate)}`,
      "file 't0.mov'",
      "file 'e1.mov'",
      `inpoint ${frameTime(25, plan.rate)}`,
      `outpoint ${frameTime(50, plan.rate)}`
    ])
    // fehlendes Stück: Fehler statt stiller Lücke
    expect(() =>
      concatList(
        plan,
        { elements: [null, null, null, null, null], transitions: names.transitions },
        [[0, 10]]
      )
    ).toThrow(/Element 1 fehlt/)
  })

  it('Ton des Ausschnitts: fehlende Elemente als exakt lange Stille, dann zugeschnitten', () => {
    const plan = five(true)
    const silent = new Set([2])
    const g = audioGraph(plan, {
      silent,
      ranges: [
        [325, 375],
        [0, 100]
      ]
    })
    expect(g).toContain(
      `anullsrc=r=48000:cl=stereo,atrim=end_sample=${plan.elements[2].samples},aformat=sample_fmts=s16[s2]`
    )
    // Eingänge neu durchgezählt: 0, 1, [s2], 2, 3
    expect(g).toContain('[x1][s2]acrossfade')
    expect(g).toContain('[x2][2:a]acrossfade')
    expect(g).toContain('[full]asplit=2[f0][f1]')
    expect(g).toContain(
      `[f0]atrim=start_sample=${sampleAt(325, plan.rate)}:end_sample=${sampleAt(375, plan.rate)}`
    )
    expect(g).toContain('[r0][r1]concat=n=2:v=0:a=1[out]')
    const run = audioRun(
      plan,
      { wavs: ['w0', 'w1', null, 'w3', 'w4'], graphFile: 'g.txt', out: 'mix.wav' },
      [[0, 10]]
    )
    expect(run.args.filter((a) => a.startsWith('w'))).toEqual(['w0', 'w1', 'w3', 'w4'])
    expect(run.graph).toContain('[s2]')
  })

  it('Live-Vorschau: Ebenen und Fortschritt je Ausgabebild (wie xfade: k/T)', () => {
    const plan = five()
    expect(frameAt(plan, 10)).toEqual({ layers: [{ index: 0, local: 10 }], transition: null })
    expect(frameAt(plan, 80)).toEqual({
      layers: [
        { index: 0, local: 80 },
        { index: 1, local: 5 }
      ],
      transition: { kind: 'fade', progress: 5 / 25 }
    })
    expect(frameAt(plan, 9999).layers).toEqual([{ index: 4, local: 99 }])
    const loop = five(true)
    // erstes Bild der Datei: Element 0 hinter seinem Kopf
    expect(frameAt(loop, 0).layers).toEqual([{ index: 0, local: 25 }])
    // letztes Bild: Schleifen-Übergang, b = Element 0 kurz vor seinem Kopf-Ende
    expect(frameAt(loop, 374)).toMatchObject({
      layers: [
        { index: 4, local: 99 },
        { index: 0, local: 24 }
      ]
    })
    expect(frameAt(loop, 375)).toEqual(frameAt(loop, 0))
  })
})

describe('videoGenPlan – Musik', () => {
  const pics = ['a.jpg', 'b.jpg', 'c.jpg']
  const base = (p: Partial<VgenProject['output']> = {}): VgenProject =>
    project(
      pics.map((f) => el(f)),
      p
    )

  it('mehrere Titel nacheinander mit Überblendung, wiederholt, bis die Länge reicht', () => {
    const p = base()
    p.defaults.imageSec = 20 // 3 × 20 s − 2 × 1 s = 58 s
    p.music = music(['x.mp3', 'y.mp3'], { crossfadeSec: 2 })
    const plan = planVideoGen(
      p,
      lookup(...pics.map((f) => photo(f)), song('x.mp3', 25), song('y.mp3', 10)),
      CAPS
    )
    expect(plan.durationSec).toBe(58)
    // x 25 + y 10 − 2 + x 25 − 2 = 56 s < 59 s (58 + 1 s Reserve) -> noch einmal y
    expect(plan.music?.entries.map((e) => e.path)).toEqual(['x.mp3', 'y.mp3', 'x.mp3', 'y.mp3'])
    expect(plan.music?.entries.map((e) => e.crossfade)).toEqual([96_000, 96_000, 96_000, 0])
    const g = audioGraph(plan)
    expect(g).toContain('[3:a]aresample=48000')
    expect(g).toContain('[6:a]aresample=48000')
    expect(g).toContain('[m0][m1]acrossfade=ns=96000:c1=tri:c2=tri[mc1]')
    expect(g).toContain('[mc3]atrim=end_sample=2784000')
    const run = audioRun(plan, { wavs: ['w0', 'w1', 'w2'], graphFile: 'g', out: 'o' })
    expect(run.args.filter((a) => a.endsWith('.mp3'))).toEqual(['x.mp3', 'y.mp3', 'x.mp3', 'y.mp3'])
    // kein endloses Wiederholen eines Eingangs mehr
    expect(run.args).not.toContain('-stream_loop')
  })

  it('Überblendung höchstens die Hälfte des kürzeren Titels; unlesbarer Titel ist ein Fehler', () => {
    const p = base()
    p.music = music(['kurz.mp3', 'x.mp3'], { crossfadeSec: 5 })
    const media = lookup(...pics.map((f) => photo(f)), song('kurz.mp3', 3), song('x.mp3', 60))
    expect(planVideoGen(p, media, CAPS).music?.entries[0].crossfade).toBe(72_000)
    p.music = music(['weg.mp3'])
    const bad = planVideoGen(p, media, CAPS)
    expect(bad.ok).toBe(false)
    expect(bad.hints.map((h) => h.id)).toContain('music-unreadable')
  })

  it('Absenken: nur wo Videos mit Originalton laufen, nahe Bereiche zusammen', () => {
    const p = project([
      el('a.jpg'),
      el('v1.mp4', { kind: 'video' }),
      el('v2.mp4', { kind: 'video', transition: { kind: 'cut', durationSec: 0 } }),
      el('v3.mp4', { kind: 'video', audio: false }),
      el('b.jpg')
    ])
    p.music = music(['m.mp3'], { duckDb: -12 })
    const plan = planVideoGen(
      p,
      lookup(
        photo('a.jpg'),
        photo('b.jpg'),
        clip('v1.mp4', 3),
        clip('v2.mp4', 3),
        clip('v3.mp4', 3),
        song('m.mp3', 300)
      ),
      CAPS
    )
    // a 0..4, v1 3..6, v2 5..8 (Schnitt danach), v3 8..11 ohne Ton
    const d = plan.music?.duck
    expect(d?.ranges).toEqual([[3, 8]])
    expect(d?.gain).toBeCloseTo(Math.pow(10, -12 / 20), 9)
    expect(duckFactor(d!, 1)).toBe(1)
    expect(duckFactor(d!, 5.5)).toBeCloseTo(d!.gain, 9)
    expect(duckFactor(d!, 3.25)).toBeCloseTo(1 - (1 - d!.gain) * 0.5, 9)
    expect(duckExpr(d!)).toBe('1-0.74881136*min(1,clip((t-3)/0.5,0,1)*clip((8-t)/0.5,0,1))')
    expect(audioGraph(plan)).toContain(
      `volume=-6dB,asetnsamples=n=480:p=0,volume='${duckExpr(d!)}':eval=frame[mus]`
    )
  })

  it('Absenken bei Schleife: der Kopf von Element 0 liegt auch am Dateiende', () => {
    const p = project([el('v.mp4', { kind: 'video' }), el('a.jpg'), el('b.jpg')], { loop: true })
    p.music = music(['m.mp3'], { duckDb: -18 })
    const plan = planVideoGen(
      p,
      lookup(clip('v.mp4', 4), photo('a.jpg'), photo('b.jpg'), song('m.mp3', 60)),
      CAPS
    )
    // Dauer 4 + 4 + 4 − 3 = 9 s; Element 0 beginnt bei −1 s
    expect(plan.durationSec).toBe(9)
    expect(plan.music?.duck?.ranges).toEqual([
      [-1, 3],
      [8, 12]
    ])
  })

  it('musicAt: Überblendung zwischen Titeln und an der Schleifen-Naht wie im Graph', () => {
    const p = base({ loop: true })
    p.defaults.imageSec = 10 // 3 × 10 − 3 × 1 = 27 s
    p.music = music(['x.mp3', 'y.mp3'], { crossfadeSec: 2, gainDb: 0 })
    const plan = planVideoGen(
      p,
      lookup(...pics.map((f) => photo(f)), song('x.mp3', 20), song('y.mp3', 20)),
      CAPS
    )
    const C = plan.music!.loopCrossfade
    expect(C).toBe(96_000)
    // Ausgabe 0 s = Musik 2 s (Musik läuft ab C, ihr Ende blendet in den Anfang)
    expect(musicAt(plan, 0).parts).toEqual([{ entry: 0, path: 'x.mp3', offsetSec: 2, weight: 1 }])
    // Ausgabe 17 s = Musik 19 s: x klingt aus (1 s vor Ende), y setzt ein
    const mid = musicAt(plan, 17).parts
    expect(mid.map((x) => [x.path, x.offsetSec, x.weight])).toEqual([
      ['x.mp3', 19, 0.5],
      ['y.mp3', 1, 0.5]
    ])
    // Naht: 26 s = halb in der 2-s-Überblendung zurück an den Anfang
    const seam = musicAt(plan, 26).parts
    expect(seam.map((x) => [x.path, x.offsetSec, x.weight])).toEqual([
      ['y.mp3', 10, 0.5],
      ['x.mp3', 1, 0.5]
    ])
    expect(musicAt(plan, 26).gain).toBe(1)
  })

  it('Standzeit an Musik anpassen: Länge trifft die Musik auf ein Bild genau', () => {
    const p = base()
    p.music = music(['x.mp3', 'y.mp3'], { crossfadeSec: 2 })
    const media = lookup(...pics.map((f) => photo(f)), song('x.mp3', 30), song('y.mp3', 20))
    // Musik: 30 + 20 − 2 = 48 s -> 3 × d − 2 × 1 = 48 -> d = 16,667 s
    const r = imageSecForMusic(p, media, CAPS)
    expect(r.ok && r.imageSec).toBeCloseTo(16.68, 2)
    expect(r.ok && Math.abs(r.durationSec - 48)).toBeLessThan(0.05)
    expect(musicPassSamples(p.music, media)).toBe(48 * 48_000)
    // keine Bilder mit Vorgabe-Standzeit
    const own = base()
    own.music = p.music
    own.elements.forEach((e) => (e.durationSec = 3))
    expect(imageSecForMusic(own, media, CAPS)).toMatchObject({ ok: false })
  })
})

describe('videoGenPlan – Cache-Schlüssel', () => {
  const media = lookup(photo('a.jpg'), photo('b.jpg'))
  const base = (): VgenProject => project([el('a.jpg', { id: 'A' }), el('b.jpg', { id: 'B' })])

  it('gleiche Eingabe -> gleicher Schlüssel; Einstellung oder Quelle geändert -> neuer', () => {
    const p1 = planVideoGen(base(), media, CAPS)
    const p2 = planVideoGen(base(), media, CAPS)
    expect(elementCacheKey(p1, p1.elements[0])).toBe(elementCacheKey(p2, p2.elements[0]))
    const strong = base()
    strong.elements[0].kenBurns = { mode: 'zoom-in', strength: 'strong' }
    const p3 = planVideoGen(strong, media, CAPS)
    expect(elementCacheKey(p3, p3.elements[0])).not.toBe(elementCacheKey(p1, p1.elements[0]))
    // B unverändert -> Stück B bleibt im Cache, nur der Übergang ist neu
    expect(elementCacheKey(p3, p3.elements[1])).toBe(elementCacheKey(p1, p1.elements[1]))
    expect(transitionCacheKey(p3, 0, 1)).not.toBe(transitionCacheKey(p1, 0, 1))
    const touched = planVideoGen(
      base(),
      lookup(photo('a.jpg', 4000, 3000, { modifiedMs: 5 }), photo('b.jpg')),
      CAPS
    )
    expect(elementCacheKey(touched, touched.elements[0])).not.toBe(
      elementCacheKey(p1, p1.elements[0])
    )
  })

  it('hash53 ist stabil', () => {
    expect(hash53('Mottulbox')).toBe(hash53('Mottulbox'))
    expect(hash53('Mottulbox')).toMatch(/^[0-9a-f]{14}$/)
    expect(hash53('a')).not.toBe(hash53('b'))
  })
})
