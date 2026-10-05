import { describe, expect, it } from 'vitest'
import {
  planConversion,
  rasterTarget,
  rateArg,
  snapRate,
  SQUARE_PIXELS,
  squarePixelSize,
  type ConvertPlan,
  type PlanCaps
} from './convertPlan'
import type { ConvertOptions, MediaInfo } from './types'
import { audioTrack, mediaInfo, videoTrack } from '../renderer/src/tools/media-info/testFactory'

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
const CAPS: PlanCaps = { tonemap: true }

function plan(info: MediaInfo, o: Partial<ConvertOptions> = {}, caps = CAPS): ConvertPlan {
  const r = planConversion(info, { ...OPTS, ...o }, caps)
  if (!r.ok) throw new Error(r.error)
  return r.plan
}
const video = (p: Parameters<typeof videoTrack>[0]): MediaInfo =>
  mediaInfo({ video: [videoTrack(p)] })
const ids = (p: ConvertPlan): string[] => p.issues.map((i) => i.id)

describe('Raten & Pixel', () => {
  it('Raster: saubere Teiler/Vielfache bleiben, sonst einfache bzw. doppelte Rate', () => {
    expect(rasterTarget(25, '25')).toBeNull()
    expect(rasterTarget(50, '25')).toBeNull()
    expect(rasterTarget(12.5, '25')).toBeNull()
    expect(rasterTarget(30, '25')).toBe(25)
    expect(rasterTarget(60, '25')).toBe(50)
    expect(rasterTarget(30000 / 1001, '30')).toBe(30)
    expect(rasterTarget(15, '30')).toBeNull()
  })
  it('Standardrate nach Verhältnis, NTSC als exakter Bruch', () => {
    expect(snapRate(23.333)).toBeCloseTo(24000 / 1001)
    expect(snapRate(30.12)).toBe(30)
    expect(rateArg(30000 / 1001)).toBe('30000/1001')
    expect(rateArg(25)).toBe('25')
  })
  it('quadratische Pixel: nur vergrößern', () => {
    expect(squarePixelSize(1440, 1080, 4 / 3)).toEqual({ width: 1920, height: 1080 })
    expect(squarePixelSize(720, 480, 8 / 9)).toEqual({ width: 720, height: 540 })
  })
})

describe('planConversion – Grundfälle', () => {
  it('sauberes 1080p25-H.264 nach H.264: nichts zu tun (Hinweis „bereits")', () => {
    const p = plan(mediaInfo())
    expect(p.video?.filters).toEqual([])
    expect(p.video?.pixFmt).toBe('yuv420p')
    expect(p.video?.gop).toBe(50)
    expect(p.audio).toMatchObject({ codec: 'aac', sampleRate: 48000, bitrate: 192000 })
    expect(p.steps).toEqual([])
    expect(ids(p)).toEqual(['same-codec'])
  })

  it('HAP Q: ×4-Auffüllen, YUV->RGB mit Rec.-709-Matrix, PCM-Ton', () => {
    const p = plan(video({ width: 1918, displayWidth: 1918 }), { format: 'hap_q' })
    expect(p.video?.filters).toEqual([
      'pad=1920:1080:0:0',
      'setsar=1',
      'scale=in_color_matrix=bt709:in_range=tv'
    ])
    expect(p.video?.pixFmt).toBe('rgba')
    expect(p.audio?.codec).toBe('pcm_s16le')
    expect(ids(p)).toContain('hap-pad')
  })

  it('Fehler: Audio-Datei als Video, Standbild als Video, WAV ohne Ton', () => {
    expect(planConversion(mediaInfo({ video: [] }), OPTS, CAPS)).toMatchObject({ ok: false })
    const still = mediaInfo({ isStill: true, video: [videoTrack({ fpsMode: 'still', fps: null })] })
    expect(planConversion(still, OPTS, CAPS)).toMatchObject({ ok: false })
    expect(
      planConversion(mediaInfo({ audio: [] }), { ...OPTS, format: 'wav' }, CAPS)
    ).toMatchObject({ ok: false })
  })

  it('WAV: nur Ton, 24 bit bei hochauflösender Quelle', () => {
    const p = plan(mediaInfo({ audio: [audioTrack({ codecName: 'pcm_s24le', bitDepth: 24 })] }), {
      format: 'wav'
    })
    expect(p.video).toBeNull()
    expect(p.audio).toMatchObject({ codec: 'pcm_s24le', sampleRate: 48000 })
  })
})

describe('planConversion – Korrekturen', () => {
  it('Alpha: HAP Q -> HAP Alpha, ProRes 422 -> 4444, H.264 flach auf Schwarz', () => {
    const alpha = video({ alpha: true, chroma: 'RGB', codecName: 'qtrle', codec: 'Animation' })
    const hap = plan(alpha, { format: 'hap_q' })
    expect(hap.format).toBe('hap_alpha')
    expect(hap.video?.filters).not.toContain('premultiply=inplace=1')
    const pr = plan(alpha, { format: 'prores_hq' })
    expect(pr.format).toBe('prores_4444')
    expect(pr.video?.pixFmt).toBe('yuva444p10le')
    // RGB-Quelle -> YUV: Matrix festgelegt und gekennzeichnet
    expect(pr.video?.filters).toContain('scale=out_color_matrix=bt709:out_range=tv')
    expect(pr.video?.filters).toContain(
      'setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv'
    )
    const h264 = plan(alpha)
    expect(h264.video?.filters).toContain('premultiply=inplace=1')
    expect(ids(h264)).toContain('alpha-lost')
    // „Alpha erhalten" aus: HAP Q bleibt HAP Q, Transparenz wird schwarz
    expect(plan(alpha, { format: 'hap_q', keepAlpha: false }).format).toBe('hap_q')
  })

  it('WebM mit Alpha: libvpx-Decoder erzwingen, ohne ihn ehrlich deckend', () => {
    const webm = video({ codecName: 'vp9', codec: 'VP9', alpha: true, chroma: '4:2:0' })
    const p = plan(webm, { format: 'hap_q' })
    expect(p.video?.decoder).toBe('libvpx-vp9')
    expect(p.format).toBe('hap_alpha')
    const no = plan(webm, { format: 'hap_q' }, { tonemap: true, vpxAlpha: false })
    expect(no.format).toBe('hap_q')
    expect(no.video?.decoder).toBeNull()
    expect(ids(no)).toContain('webm-alpha')
  })

  it('gedreht + anamorph: SAR exakt umgekehrt (wie ffmpeg, ohne 2-px-Rundungsfehler)', () => {
    const p = plan(video({ width: 720, height: 480, sar: '10:11', rotation: 90 }))
    expect([p.video?.width, p.video?.height]).toEqual([528, 720])
  })

  it('Drehung 90°: Maße getauscht (ffmpeg dreht vor der Kette)', () => {
    const p = plan(video({ rotation: 90 }))
    expect([p.video?.width, p.video?.height]).toEqual([1080, 1920])
    expect(p.steps).toContain('Drehung 90° im Uhrzeigersinn eingerechnet')
    expect(plan(video({ rotation: 270 })).steps).toContain(
      'Drehung 90° gegen den Uhrzeigersinn eingerechnet'
    )
  })

  it('anamorph: HDV auf 1920×1080, gedreht mit SAR richtig herum', () => {
    const hdv = plan(video({ width: 1440, sar: '4:3' }))
    expect(hdv.video?.filters[0]).toBe(SQUARE_PIXELS)
    expect([hdv.video?.width, hdv.video?.height]).toEqual([1920, 1080])
    const rot = plan(video({ width: 1440, sar: '4:3', rotation: 90 }))
    expect([rot.video?.width, rot.video?.height]).toEqual([1080, 1920])
  })

  it('Interlaced: bwdif mit erkannter Halbbild-Reihenfolge, 25i -> 50p', () => {
    const p = plan(video({ scan: 'bff' }))
    expect(p.video?.filters[0]).toBe('bwdif=mode=send_field:parity=bff:deint=all')
    expect(p.video?.fps).toBe(50)
    expect(p.steps).toContain('Deinterlaced (25i → 50p)')
    expect(ids(plan(video({ scan: 'tff' }), { deinterlace: false }))).toContain('interlaced-kept')
  })

  it('variable Bildrate -> konstante Standardrate', () => {
    const p = plan(video({ fps: 23.333, fpsMode: 'vfr' }))
    expect(p.video?.filters).toContain('fps=24000/1001')
    expect(p.steps[0]).toBe('Konstante Bildrate (Ø 23,333 → 23,976 fps)')
  })

  it('Show-Raster: 29,97 -> 30 per Tempo (setpts + atempo), 30 -> 25 per fps', () => {
    const ntsc = plan(video({ fps: 30000 / 1001 }), { fps: { mode: 'raster', raster: '30' } })
    expect(ntsc.video?.filters).toEqual(['setpts=PTS*1000/1001', 'fps=30', 'setsar=1'])
    expect(ntsc.audio?.filters).toEqual(['atempo=1.001'])
    expect(ntsc.durationSec).toBeCloseTo((10 * 1000) / 1001)
    expect(ntsc.steps[0]).toBe('Tempo +0,1 % (29,97 → 30 fps)')
    const film = plan(video({ fps: 24000 / 1001 }), { fps: { mode: 'raster', raster: 'film' } })
    expect(film.video?.filters[0]).toBe('setpts=PTS*1000/1001')
    const pal = plan(video({ fps: 30 }), { fps: { mode: 'raster', raster: '25' } })
    expect(pal.video?.filters[0]).toBe('fps=25')
    expect(ids(pal)).toContain('fps-convert')
    expect(
      plan(video({ fps: 50 }), { fps: { mode: 'raster', raster: '25' } }).video?.filters
    ).toEqual([])
    // fest 25 aus deinterlaced 50p
    const fixed = plan(video({ scan: 'tff' }), { fps: { mode: 'fixed', fps: 25 } })
    expect(fixed.video?.filters.slice(0, 2)).toEqual([
      'bwdif=mode=send_field:parity=tff:deint=all',
      'fps=25'
    ])
  })

  it('HDR -> SDR per zscale/tonemap, sonst Hinweis', () => {
    const hdr = video({
      hdr: 'pq',
      colorTransfer: 'smpte2084',
      colorSpace: 'bt2020nc',
      colorPrimaries: 'bt2020',
      bitDepth: 10,
      pixFmt: 'yuv420p10le'
    })
    const p = plan(hdr)
    expect(p.video?.filters.some((f) => f.includes('tonemap=tonemap=hable'))).toBe(true)
    // zscale kennzeichnet selbst als Rec. 709 – keine zusätzliche Kennzeichnung nötig
    expect(p.video?.filters.some((f) => f.startsWith('setparams'))).toBe(false)
    expect(p.steps).toContain('HDR (PQ) → SDR')
    expect(ids(plan(hdr, {}, { tonemap: false }))).toContain('hdr-kept')
    expect(ids(plan(hdr, { toSdr: false }))).toContain('hdr-kept')
  })

  it('Höchstgröße: 4K -> 1080p, DCI-4K mit ffmpeg-Rundung, Hochkant bleibt, HAP ×4', () => {
    const max = { mode: 'max', width: 1920, height: 1080 } as const
    const uhd = plan(video({ width: 3840, height: 2160 }), { size: max })
    expect(uhd.video?.filters[0]).toBe(
      'scale=1920:1080:force_original_aspect_ratio=decrease:force_divisible_by=2'
    )
    expect([uhd.video?.width, uhd.video?.height]).toEqual([1920, 1080])
    const dci = plan(video({ width: 4096, height: 2160 }), { size: max })
    expect([dci.video?.width, dci.video?.height]).toEqual([1920, 1012])
    const portrait = plan(video({ width: 1080, height: 1920 }), { size: max })
    expect(portrait.video?.filters).toEqual([])
    const hap = plan(video({ width: 4096, height: 2160 }), { size: max, format: 'hap' })
    expect(hap.video?.filters[0]).toContain('force_divisible_by=4')
    expect((hap.video?.height ?? 1) % 4).toBe(0)
  })

  it('exakte Größe: Letterbox, Füllen (mit Hochskalier-Hinweis), gleiches Format nur skaliert', () => {
    const bars = plan(video({ width: 1440, height: 1080 }), {
      size: { mode: 'exact', width: 1920, height: 1080, fit: 'bars' }
    })
    expect(bars.video?.filters.slice(0, 2)).toEqual([
      'scale=1920:1080:force_original_aspect_ratio=decrease',
      'pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black'
    ])
    expect(ids(bars)).not.toContain('upscale')
    const crop = plan(video({ width: 1080, height: 1920 }), {
      size: { mode: 'exact', width: 1920, height: 1080, fit: 'crop' }
    })
    expect(crop.video?.filters.slice(0, 2)).toEqual([
      'scale=1920:1080:force_original_aspect_ratio=increase',
      'crop=1920:1080'
    ])
    expect(ids(crop)).toContain('upscale')
    const same = plan(video({ width: 1280, height: 720 }), {
      size: { mode: 'exact', width: 1920, height: 1080, fit: 'bars' }
    })
    expect(same.video?.filters[0]).toBe('scale=1920:1080')
    expect(same.steps).toContain('Skaliert auf 1920×1080')
    const blur = plan(video({ width: 1080, height: 1920 }), {
      size: { mode: 'exact', width: 1920, height: 1080, fit: 'blur' }
    })
    expect(blur.video?.filters[0]).toContain('split=2[bg][fg]')
  })

  it('ungerade Maße -> gerade (1 px abgeschnitten), Full Range -> Limited, SD ohne Kennung', () => {
    const odd = plan(video({ width: 1919, height: 1079, displayWidth: 1919, displayHeight: 1079 }))
    expect(odd.video?.filters[0]).toBe('crop=1918:1078:0:0')
    const full = plan(video({ colorRange: 'pc', pixFmt: 'yuvj420p' }))
    expect(full.video?.filters).toContain('scale=in_range=pc:out_range=tv')
    const sd = plan(
      video({
        width: 720,
        height: 576,
        colorSpace: null,
        colorPrimaries: null,
        colorTransfer: null
      })
    )
    // nur kennzeichnen (setparams), nicht umrechnen – Pixel bleiben, wie Player sie lesen
    expect(sd.video?.filters.at(-1)).toBe(
      'setparams=colorspace=bt470bg:color_primaries=bt470bg:color_trc=bt709:range=tv'
    )
  })

  it('Ton: 44,1 -> 48 kHz, Stereo-Downmix, 24 bit bleibt 24 bit, ohne Ton', () => {
    const p = plan(mediaInfo({ audio: [audioTrack({ sampleRate: 44100 })] }))
    expect(p.steps).toContain('Ton 44,1 → 48 kHz')
    const st = plan(mediaInfo({ audio: [audioTrack({ channels: 6, channelLayout: '5.1' })] }), {
      audio: 'stereo'
    })
    expect(st.audio).toMatchObject({ channels: 2, bitrate: 192000 })
    expect(st.steps).toContain('Ton 5.1 → Stereo')
    const pcm = plan(
      mediaInfo({ audio: [audioTrack({ codecName: 'pcm_s24le', bitDepth: 24, lossy: false })] }),
      { format: 'prores_422' }
    )
    expect(pcm.audio?.codec).toBe('pcm_s24le')
    const none = plan(mediaInfo(), { audio: 'none' })
    expect(none.audio).toBeNull()
    expect(none.steps).toContain('Ohne Ton')
  })
})

describe('planConversion – Player', () => {
  const player: Partial<ConvertOptions> = {
    allowCopy: true,
    size: { mode: 'exact', width: 1920, height: 1080, fit: 'blur' }
  }
  it('passendes H.264 wird nur umverpackt (Video und AAC kopiert)', () => {
    const p = plan(mediaInfo(), player)
    expect(p.video?.copy).toBe(true)
    expect(p.audio?.codec).toBe('copy')
    expect(p.steps[0]).toBe('Video unverändert übernommen')
  })
  it('Lautheit: Video kopieren, Ton neu kodieren; gedreht/anamorph nie kopieren', () => {
    const loud = plan(mediaInfo(), { ...player, loudnorm: { i: -16, tp: -1.5, lra: 11 } })
    expect(loud.video?.copy).toBe(true)
    // Ziel im Plan, den Filter (mit Messwerten) bauen erst die Argumente
    expect(loud.audio).toMatchObject({
      codec: 'aac',
      filters: [],
      loudness: { i: -16, tp: -1.5, lra: 11 }
    })
    expect(loud.steps).toContain('Lautheit auf −16 LUFS (EBU R128)')
    expect(plan(video({ rotation: 180 }), player).video?.copy).toBe(false)
    expect(plan(video({ width: 1440, sar: '4:3' }), player).video?.copy).toBe(false)
  })
  it('Standbild -> JPG in Wandgröße, Transparenz auf Schwarz', () => {
    const still = mediaInfo({
      isStill: true,
      durationSec: null,
      audio: [],
      video: [
        videoTrack({
          codecName: 'png',
          codec: 'PNG',
          fpsMode: 'still',
          fps: null,
          alpha: true,
          chroma: 'RGB'
        })
      ]
    })
    const p = plan(still, { ...player, format: 'jpg' })
    expect(p.video?.filters).toContain('premultiply=inplace=1')
    expect(p.video?.pixFmt).toBeNull()
    expect(p.durationSec).toBeNull()
  })
})
