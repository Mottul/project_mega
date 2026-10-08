import { describe, expect, it, vi } from 'vitest'

// args/capabilities ziehen über ffmpegPath nur `electron` (app) herein
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp', isPackaged: false, getAppPath: () => '/x' }
}))

const { buildConvertArgs, buildLoudnessMeasureArgs, h264Level } = await import('./args')
const { capabilitiesFrom, parseEncoderNames, parseFilterNames } = await import('./capabilities')
const { ConvertQueue } = await import('./queue')
const { ffmpegErrorText } = await import('./runFfmpeg')
const { computeChunks, uniqueOutputPath } = await import('./converterJobs')
import { planConversion, type ConvertPlan } from '@shared/convertPlan'
import type { ConvertOptions, MediaInfo } from '@shared/types'
import {
  audioTrack,
  mediaInfo,
  videoTrack
} from '../../../renderer/src/tools/media-info/testFactory'

const OPTS: ConvertOptions = {
  format: 'h264',
  quality: 'standard',
  compat: false,
  keepAlpha: true,
  size: { mode: 'original' },
  fps: { mode: 'original' },
  deinterlace: true,
  toSdr: true,
  audio: 'auto',
  hapCompressor: 'snappy',
  hapChunks: { kind: 'auto' }
}

function argsFor(info: MediaInfo, o: Partial<ConvertOptions> = {}, io = {}): string[] {
  const opts = { ...OPTS, ...o }
  const r = planConversion(info, opts, { tonemap: true })
  if (!r.ok) throw new Error(r.error)
  return buildConvertArgs(r.plan as ConvertPlan, opts, { input: 'in.mov', output: 'out', ...io })
}
const after = (args: string[], flag: string): string | undefined => args[args.indexOf(flag) + 1]

describe('buildConvertArgs', () => {
  it('HAP Alpha: Spuren explizit, ×4-Auffüllen, rgba, Chunks/Kompressor', () => {
    const info = mediaInfo({
      video: [videoTrack({ index: 1, alpha: true, chroma: 'RGB', width: 1918 })],
      audio: [audioTrack({ index: 0 })]
    })
    const a = argsFor(info, { format: 'hap_q', hapCompressor: 'none' }, { hapChunks: 4 })
    expect(a.slice(0, 4)).toEqual(['-hide_banner', '-nostdin', '-i', 'in.mov'])
    expect(a.filter((_x, i) => a[i - 1] === '-map')).toEqual(['0:1', '0:0'])
    expect(after(a, '-vf')).toBe('pad=1920:1080:0:0:color=black@0,setsar=1,format=rgba')
    expect(after(a, '-format')).toBe('hap_alpha')
    expect(after(a, '-compressor')).toBe('none')
    expect(after(a, '-chunks')).toBe('4')
    expect(after(a, '-c:a')).toBe('pcm_s16le')
    expect(a).not.toContain('-movflags')
    expect(a.slice(-5)).toEqual(['-progress', 'pipe:1', '-nostats', '-y', 'out'])
  })

  it('H.264 für Player-Boxen: Level + Bitraten-Deckel, faststart, AAC 48 kHz', () => {
    const a = argsFor(mediaInfo({ video: [videoTrack({ fps: 50 })] }), { compat: true })
    expect(after(a, '-level:v')).toBe('4.2')
    expect(after(a, '-maxrate')).toBe('25M')
    expect(after(a, '-crf')).toBe('21')
    expect(after(a, '-g')).toBe('100')
    expect(after(a, '-movflags')).toBe('+faststart')
    expect(after(a, '-b:a')).toBe('192k')
    expect(after(a, '-ar')).toBe('48000')
  })

  it('ungekennzeichnete Quelle: Farbkennung wird gesetzt; QSV bekommt nv12', () => {
    const untagged = mediaInfo({
      video: [videoTrack({ colorSpace: null, colorPrimaries: null, colorTransfer: null })]
    })
    const a = argsFor(untagged)
    // per setparams (Encoder-Optionen würden ffmpeg 601 -> 709 umrechnen lassen)
    expect(after(a, '-vf')).toContain(
      'setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv'
    )
    expect(a).not.toContain('-colorspace')
    const q = argsFor(
      mediaInfo({ video: [videoTrack({ scan: 'tff' })] }),
      {},
      { encoder: 'h264_qsv' }
    )
    expect(after(q, '-vf')?.endsWith('format=nv12')).toBe(true)
    expect(after(q, '-c:v')).toBe('h264_qsv')
  })

  it('H.265 mit hvc1, ProRes 4444 mit Profil 4, WAV mit RF64, Kopie ohne Filter', () => {
    expect(after(argsFor(mediaInfo(), { format: 'hevc' }), '-tag:v')).toBe('hvc1')
    const pr = argsFor(mediaInfo({ video: [videoTrack({ alpha: true, chroma: 'RGB' })] }), {
      format: 'prores_4444'
    })
    expect(after(pr, '-profile:v')).toBe('4')
    expect(after(pr, '-vf')?.endsWith('format=yuva444p10le')).toBe(true)
    const wav = argsFor(mediaInfo(), { format: 'wav' })
    expect(wav).not.toContain('-vf')
    expect(after(wav, '-rf64')).toBe('auto')
    const copy = argsFor(mediaInfo(), {
      allowCopy: true,
      size: { mode: 'exact', width: 1920, height: 1080, fit: 'bars' }
    })
    expect(after(copy, '-c:v')).toBe('copy')
    expect(after(copy, '-c:a')).toBe('copy')
    expect(copy).not.toContain('-vf')
  })

  it('GPU-Encoder: H.264 mit Player-Box-Grenzen, H.265 mit hvc1, ProRes schnell', () => {
    const info = mediaInfo({ video: [videoTrack({ fps: 50 })] })
    const nv = argsFor(info, { compat: true }, { encoder: 'h264_nvenc' })
    expect(after(nv, '-c:v')).toBe('h264_nvenc')
    expect(after(nv, '-level:v')).toBe('4.2')
    expect(after(nv, '-maxrate')).toBe('25M')
    expect(after(nv, '-g')).toBe('100')
    expect(nv).not.toContain('-crf')
    // Player-Import (Standard, ohne Grenzen): die bewährten Werte wie bisher
    const player = argsFor(info, {}, { encoder: 'h264_nvenc' })
    expect(after(player, '-cq')).toBe('23')
    expect(player).not.toContain('-maxrate')
    const hevc = argsFor(info, { format: 'hevc' }, { encoder: 'hevc_videotoolbox' })
    expect(after(hevc, '-c:v')).toBe('hevc_videotoolbox')
    expect(after(hevc, '-tag:v')).toBe('hvc1')
    expect(hevc).not.toContain('-x265-params')
    const qsv = argsFor(info, { format: 'hevc' }, { encoder: 'hevc_qsv' })
    expect(after(qsv, '-vf')?.endsWith('format=nv12')).toBe(true)
    // ProRes 4444 mit Alpha über prores_aw: Alpha-Format und Hersteller-Kennung bleiben
    const alpha = mediaInfo({ video: [videoTrack({ alpha: true, chroma: 'RGB' })] })
    const aw = argsFor(alpha, { format: 'prores_4444' }, { encoder: 'prores_aw' })
    expect(after(aw, '-c:v')).toBe('prores_aw')
    expect(after(aw, '-profile:v')).toBe('4')
    expect(after(aw, '-vendor')).toBe('apl0')
    expect(after(aw, '-vf')?.endsWith('format=yuva444p10le')).toBe(true)
    const vt = argsFor(mediaInfo(), { format: 'prores_hq' }, { encoder: 'prores_videotoolbox' })
    expect(after(vt, '-c:v')).toBe('prores_videotoolbox')
    expect(after(vt, '-profile:v')).toBe('3')
    expect(vt).not.toContain('-vendor')
    // ohne Encoder-Angabe: die klassischen CPU-Encoder
    expect(after(argsFor(mediaInfo(), { format: 'prores_hq' }), '-c:v')).toBe('prores_ks')
  })

  it('Lautheit: Messlauf nur über die Tonspur, Downmix vor loudnorm, Messwerte im Lauf', () => {
    const loud = { i: -23, tp: -1.5, lra: 11 }
    const surround = mediaInfo({ audio: [audioTrack({ index: 1, channels: 6 })] })
    const opts = {
      ...OPTS,
      format: 'prores_422' as const,
      audio: 'stereo' as const,
      loudnorm: loud
    }
    const r = planConversion(surround, opts, { tonemap: true })
    if (!r.ok) throw new Error(r.error)
    const measure = buildLoudnessMeasureArgs(r.plan, 'in.mov')
    expect(measure).not.toBeNull()
    const m = measure as string[]
    expect(m.filter((_x, i) => m[i - 1] === '-map')).toEqual(['0:1'])
    expect(after(m, '-af')).toBe(
      'aformat=channel_layouts=stereo,loudnorm=I=-23:TP=-1.5:LRA=11:dual_mono=true:print_format=json'
    )
    expect(m.slice(-6)).toEqual(['-f', 'null', '-progress', 'pipe:1', '-nostats', '-'])

    const measured = {
      kind: 'measured' as const,
      linear: true,
      m: { i: -30, tp: -12, lra: 5, thresh: -41, offset: 0.2 }
    }
    const run = argsFor(surround, opts, { loudness: measured })
    const af = after(run, '-af') ?? ''
    expect(af.startsWith('aformat=channel_layouts=stereo,loudnorm=I=-23:')).toBe(true)
    expect(af).toContain('measured_I=-30.00')
    expect(af.endsWith(':linear=true')).toBe(true)
    expect(after(run, '-ac')).toBe('2')
    // stille Spur: kein loudnorm, Ton sonst wie geplant
    const silent = argsFor(surround, opts, { loudness: { kind: 'silent' } })
    expect(after(silent, '-af')).toBe('aformat=channel_layouts=stereo')
    // ohne Messung (z. B. fehlgeschlagen): einstufig wie früher
    expect(after(argsFor(mediaInfo(), { loudnorm: loud }), '-af')).toBe(
      'loudnorm=I=-23:TP=-1.5:LRA=11:dual_mono=true'
    )
    // ohne Lautheit: kein Messlauf, kein Downmix-Filter (nur -ac)
    const plain = planConversion(surround, { ...opts, loudnorm: null }, { tonemap: true })
    if (!plain.ok) throw new Error(plain.error)
    expect(buildLoudnessMeasureArgs(plain.plan, 'in.mov')).toBeNull()
    expect(argsFor(surround, { ...opts, loudnorm: null })).not.toContain('-af')
  })

  it('WebM mit Alpha: Decoder vor -i erzwungen', () => {
    const webm = mediaInfo({
      video: [videoTrack({ codecName: 'vp9', codec: 'VP9', alpha: true })]
    })
    const a = argsFor(webm, { format: 'hap_alpha' })
    expect(a.slice(0, 6)).toEqual([
      '-hide_banner',
      '-nostdin',
      '-c:v',
      'libvpx-vp9',
      '-i',
      'in.mov'
    ])
  })

  it('H.264-Level nach Tabelle A-1', () => {
    expect(h264Level(1920, 1080, 25)).toBe('4.1')
    expect(h264Level(1920, 1080, 60)).toBe('4.2')
    expect(h264Level(3840, 2160, 30)).toBe('5.1')
    expect(h264Level(3840, 2160, 60)).toBe('5.2')
  })
})

describe('Fähigkeiten, Fehlertexte, Warteschlange', () => {
  it('Encoder-/Filterlisten von ffmpeg auswerten', () => {
    const enc = parseEncoderNames(' V....D libx264   libx264 H.264\n V.S..D hap   Vidvox Hap\n')
    const fil = parseFilterNames(
      ' TS bwdif   V->V   Deinterlace\n .S zscale  V->V   Apply\n .S xfade   VV->V   Cross fade\n'
    )
    expect([...enc]).toEqual(['libx264', 'hap'])
    const caps = capabilitiesFrom(enc, fil, 'ffmpeg version x')
    expect(caps.formats.hap_q).toBe(true)
    expect(caps.formats.hevc).toBe(false)
    expect(caps.tonemap).toBe(false) // tonemap fehlt
    expect(caps.vpxAlpha).toBe(false)
    expect(caps.xfade).toBe(true) // zwei Bild-Eingänge: „VV->V“
    expect(caps.perspective).toBe(false)
    const dec = parseEncoderNames(' V....D libvpx   libvpx VP8\n V..... libvpx-vp9  libvpx VP9\n')
    expect(capabilitiesFrom(enc, fil, null, dec).vpxAlpha).toBe(true)
  })

  it('Fehlertext: Ursache statt „Conversion failed!", ohne [codec @ 0x…]', () => {
    const stderr = '[libx264 @ 0x55aa] width not divisible by 2 (1919x1080)\nConversion failed!\n'
    expect(ffmpegErrorText(1, stderr)).toBe(
      'ffmpeg beendet mit Code 1 – width not divisible by 2 (1919x1080)'
    )
  })

  it('Spuren: Player wartet nie auf den Konverter, Limits je Spur, Entfernen vor Start', async () => {
    const q = new ConvertQueue()
    const started: string[] = []
    const gates: Record<string, () => void> = {}
    const job = (id: string) => () =>
      new Promise<void>((res) => {
        started.push(id)
        gates[id] = res
      })
    q.add('k1', 'converter', job('k1'))
    q.add('k2', 'converter', job('k2'))
    q.add('k3', 'converter', job('k3'))
    q.add('p1', 'player', job('p1'))
    await Promise.resolve()
    await Promise.resolve()
    expect(started).toEqual(['k1', 'p1'])
    expect(q.remove('k3')).toBe(true)
    gates.k1()
    await new Promise((r) => setTimeout(r, 0))
    expect(started).toEqual(['k1', 'p1', 'k2'])
    q.setLimit('converter', 2)
    expect(q.runningCount('converter')).toBe(1)
  })

  it('gleicher Sperr-Schlüssel nie gleichzeitig: wartet ohne Platz, andere ziehen vorbei', async () => {
    const q = new ConvertQueue()
    q.setLimit('player', 2)
    const started: string[] = []
    const gates: Record<string, () => void> = {}
    const job = (id: string) => () =>
      new Promise<void>((res) => {
        started.push(id)
        gates[id] = res
      })
    q.add('a1', 'player', job('a1'), 'clip.mp4')
    q.add('a2', 'player', job('a2'), 'clip.mp4')
    q.add('b', 'player', job('b'), 'other.mp4')
    q.add('a3', 'player', job('a3'), 'clip.mp4')
    await Promise.resolve()
    expect(started).toEqual(['a1', 'b'])
    // der wartende Doppelgänger ist noch abbrechbar
    expect(q.remove('a3')).toBe(true)
    gates.a1()
    await new Promise((r) => setTimeout(r, 0))
    expect(started).toEqual(['a1', 'b', 'a2'])
    expect(q.runningCount('player')).toBe(2)
  })
})

describe('Auftragsliste', () => {
  it('Ausgabename: nie überschreiben, Groß/klein egal, nie die Quelle selbst', () => {
    const taken = new Set(['/out/clip_hap_q.mov', '/out/clip_hap_q_2.mov'])
    const has = (p: string): boolean => taken.has(p.toLowerCase())
    expect(uniqueOutputPath('/in/clip.mp4', '/out', 'hap_q', '.mov', has)).toBe(
      '/out/clip_hap_q_3.mov'
    )
    expect(uniqueOutputPath('/in/clip.mp4', null, 'h264', '.mp4', () => false)).toBe(
      '/in/clip_h264.mp4'
    )
  })

  it('HAP-Chunks aus der Fläche, mindestens 1', () => {
    expect(computeChunks(null, null)).toBe(1)
    expect(computeChunks(1280, 720)).toBe(1)
    expect(computeChunks(1920, 1080)).toBeGreaterThanOrEqual(1)
  })
})
