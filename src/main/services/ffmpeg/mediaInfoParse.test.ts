import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  analyzePackets,
  applyDeepAnalysis,
  deriveFps,
  describeProbeError,
  extensionMismatch,
  parseFirstFrame,
  parseMediaInfo,
  parsePixFmt,
  type FfprobeJson
} from './mediaInfoParse'

// Echte ffprobe-Ausgaben (BtbN-Build, -show_format -show_streams -show_chapters)
// erzeugter Testdateien; nur der Dateipfad ist auf den Namen gekürzt.
const SAMPLES = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('./__fixtures__/ffprobe-samples.json', import.meta.url)),
    'utf8'
  )
) as Record<string, { size: number; probe: FfprobeJson }>

function info(name: string): ReturnType<typeof parseMediaInfo> {
  const s = SAMPLES[name]
  if (!s) throw new Error(`Fixture fehlt: ${name}`)
  return parseMediaInfo(s.probe, { path: `/medien/${name}`, sizeBytes: s.size, modifiedMs: null })
}

describe('parseMediaInfo – Container & Allgemeines', () => {
  it('H.264-MOV mit Timecode-Spur: Codec, Profil/Level, Timecode, Audio', () => {
    const i = info('h264_1080p25_aac_tc.mov')
    expect(i.container).toBe('QuickTime (MOV)')
    expect(i.durationSec).toBe(2)
    const v = i.video[0]
    expect(v).toMatchObject({
      codec: 'H.264',
      profile: 'High',
      level: '4.0',
      fourcc: 'avc1',
      width: 1920,
      height: 1080,
      fps: 25,
      fpsMode: 'cfr',
      scan: 'progressive',
      bitDepth: 8,
      chroma: '4:2:0',
      codecClass: 'longgop',
      alpha: false
    })
    expect(i.timecode).toBe('10:00:00:00')
    expect(i.data.map((d) => d.kind)).toEqual(['Timecode'])
    expect(i.audio[0]).toMatchObject({
      codec: 'AAC',
      channelLayout: 'stereo',
      sampleRate: 48000,
      bitDepth: null, // verlustbehaftet -> keine Bittiefe (fltp ist nur Decoder-Format)
      lossy: true
    })
  })

  it('MP3 mit Coverbild: Cover ist KEINE Videospur', () => {
    const i = info('mp3_cover.mp3')
    expect(i.video).toHaveLength(0)
    expect(i.covers).toHaveLength(1)
    expect(i.audio[0].codec).toBe('MP3')
  })

  it('Standbild: keine Dauer, keine fps, keine Bitrate', () => {
    const i = info('still.png')
    expect(i.isStill).toBe(true)
    expect(i.durationSec).toBeNull()
    expect(i.bitRate).toBeNull()
    expect(i.video[0]).toMatchObject({ fps: null, fpsMode: 'still', codecClass: 'image' })
  })

  it('abgeschnittenes Faststart-MP4 wird als unvollständig erkannt', () => {
    expect(info('truncated_faststart.mp4').incomplete).toBe(true)
    expect(info('h264_1080p25_aac_tc.mov').incomplete).toBe(false)
  })

  it('MP4-Kapitelspur ist weder Daten- noch Untertitelspur, Kapitel werden gelesen', () => {
    const i = info('chapters.mp4')
    expect(i.data).toHaveLength(0)
    expect(i.subtitles).toHaveLength(0)
    expect(i.chapters.map((c) => c.title)).toEqual(['Intro', 'Hauptteil'])
  })

  it('Endung passend zum Container', () => {
    expect(extensionMismatch('mov,mp4,m4a,3gp,3g2,mj2', '.mp4')).toBe(false)
    expect(extensionMismatch('matroska,webm', '.mp4')).toBe(true)
    expect(extensionMismatch('mpegts', '.mts')).toBe(false)
    expect(extensionMismatch('unbekannt', '.xyz')).toBe(false)
  })
})

describe('parseMediaInfo – Codec-Varianten', () => {
  it('HAP-Varianten nur über die FourCC', () => {
    expect(info('hap_q.mov').video[0]).toMatchObject({
      codec: 'HAP Q',
      profile: null,
      codecClass: 'gpu',
      alpha: false
    })
    expect(info('hap_alpha.mov').video[0]).toMatchObject({ codec: 'HAP Alpha', alpha: true })
  })

  it('unbekannte FourCC (HAP R) ohne codec_name', () => {
    const v = info('patched_fourcc_Hap7.mov').video[0]
    expect(v.codec).toBe('HAP R (Hap7, nicht decodierbar)')
    expect(v.codecName).toBeNull()
    expect(v.codecClass).toBe('unknown')
  })

  it('ProRes 4444 mit Alpha (12 bit gemeldet), ProRes 422 HQ + PCM 24 bit', () => {
    expect(info('prores4444_alpha.mov').video[0]).toMatchObject({
      codec: 'ProRes 4444',
      bitDepth: 12,
      chroma: '4:4:4',
      alpha: true,
      codecClass: 'intra'
    })
    const p = info('prores422hq_pcm24.mov')
    expect(p.video[0]).toMatchObject({ codec: 'ProRes 422 HQ', bitDepth: 10, chroma: '4:2:2' })
    expect(p.audio[0]).toMatchObject({ codec: 'PCM 24 bit', bitDepth: 24, lossy: false })
  })

  it('DNxHR in MXF: Video-Bitrate aus Gesamt minus Ton geschätzt, Container-Timecode', () => {
    const i = info('dnxhr_hqx.mxf')
    expect(i.video[0]).toMatchObject({ codec: 'DNxHR HQX', bitRateEstimated: true })
    expect(i.video[0].bitRate).toBeGreaterThan(180_000_000)
    expect(i.timecode).toBe('00:00:00:00')
    expect(i.audio[0]).toMatchObject({ channelLayout: 'mono', layoutKnown: false })
  })

  it('WebM: Alpha nur über alpha_mode, Dauer aus tags.DURATION', () => {
    const v = info('vp9_alpha.webm').video[0]
    expect(v.alpha).toBe(true)
    expect(v.alphaNote).toMatch(/alpha_mode/)
    expect(v.durationSec).toBe(1)
  })

  it('HEVC hev1-Kennung bleibt sichtbar', () => {
    expect(info('hevc_hev1.mp4').video[0]).toMatchObject({ fourcc: 'hev1', level: '2.1' })
  })
})

describe('parseMediaInfo – Matroska-Eigenheiten', () => {
  it('ffmpeg-MKV: keine Stream-Bitraten, Bildzahl geschätzt, Sprache/Titel aus Tags', () => {
    const i = info('h264_aac.mkv')
    expect(i.container).toBe('Matroska (MKV)')
    expect(i.video[0].bitRate).toBeNull()
    expect(i.video[0]).toMatchObject({ frames: 50, framesEstimated: true })
    expect(i.audio[0]).toMatchObject({ language: 'ger', title: 'Deutsch' })
  })

  it('mkvmerge: Bitrate/Bildzahl aus Statistik-Tags (BPS, NUMBER_OF_FRAMES)', () => {
    const v = info('mkvmerge_h264_aac.mkv').video[0]
    expect(v.bitRate).toBe(4963812)
    expect(v).toMatchObject({ frames: 50, framesEstimated: false, bitRateEstimated: false })
  })

  it('MKV-Bildrate 19001/317 rastet auf 59,94 ein', () => {
    expect(info('mkv_5994.mkv').video[0].fps).toBeCloseTo(60000 / 1001, 6)
  })
})

describe('parseMediaInfo – Bildgeometrie, Scan, Bildrate', () => {
  it('Rotation per Display-Matrix: Anzeige hochkant', () => {
    const v = info('rotated_90.mp4').video[0]
    expect(v).toMatchObject({ width: 1280, height: 720, displayWidth: 720, displayHeight: 1280 })
    expect(v.rotation).toBe(270) // +90 gegen den Uhrzeigersinn = 270 im Uhrzeigersinn
  })

  it('horizontal gespiegelt ist KEINE 180°-Drehung', () => {
    expect(info('hflip.mp4').video[0]).toMatchObject({ rotation: 0, mirrored: true })
  })

  it('anamorphe Pixel: Anzeigegröße aus SAR', () => {
    expect(info('anamorph_pal_169.mp4').video[0]).toMatchObject({
      width: 720,
      displayWidth: 1024,
      sar: '64:45',
      dar: '16:9'
    })
  })

  it('Interlaced TFF', () => {
    expect(info('h264_interlaced_tff.mp4').video[0].scan).toBe('tff')
  })

  it('VFR-Verdacht aus r_frame_rate ≠ avg_frame_rate', () => {
    const v = info('vfr.mp4').video[0]
    expect(v.fpsMode).toBe('vfr-suspect')
    expect(v.fps).toBeCloseTo(70 / 3, 3)
  })

  it('DV: avg_frame_rate 60000/1 wird verworfen, SAR 16:15', () => {
    const v = info('dv_pal.dv').video[0]
    expect(v).toMatchObject({ fps: 25, fpsMode: 'cfr', displayWidth: 768 })
  })

  it('Roh-H.264 mit Feldtakt (r = 50, avg = 25) -> 25 fps', () => {
    expect(info('h264_interlaced.h264').video[0]).toMatchObject({ fps: 25, fpsMode: 'cfr' })
  })

  it('29,97 mit Drop-Frame-Timecode', () => {
    const i = info('h264_2997_df.mov')
    expect(i.video[0].fps).toBeCloseTo(30000 / 1001, 6)
    expect(i.timecode).toBe('01:00:00;00')
  })

  it('deriveFps: Zeitbasis als r_frame_rate wird ignoriert', () => {
    expect(
      deriveFps({ r_frame_rate: '90000/1', avg_frame_rate: '25/1', time_base: '1/90000' })
    ).toEqual({ fps: 25, mode: 'cfr' })
  })
})

describe('parseMediaInfo – HDR, Ton, Untertitel', () => {
  it('HDR10 mit Mastering-Metadaten im Container', () => {
    const v = info('hevc_hdr10_container_md.mp4').video[0]
    expect(v).toMatchObject({ hdr: 'pq', bitDepth: 10, colorPrimaries: 'bt2020' })
    expect(v.masteringMaxNits).toBe(1000)
    expect(v.maxCll).toBe(1000)
  })

  it('BWF-Timecode aus time_reference', () => {
    expect(info('wav_bwf_tc.wav').timecode).toBe('10:00:00.000')
  })

  it('mehrere Tonspuren mit Sprache/Name, Untertitel mov_text', () => {
    const i = info('multi_audio_subs.mp4')
    expect(i.audio.map((a) => [a.language, a.title, a.isDefault])).toEqual([
      ['deu', 'Deutsch', true],
      ['eng', 'English', false]
    ])
    expect(i.subtitles[0]).toMatchObject({ codec: 'MP4-Text (tx3g)', bitmap: false })
  })
})

describe('parsePixFmt', () => {
  it.each([
    ['yuv420p', 8, '4:2:0', false],
    ['yuvj422p', 8, '4:2:2', false],
    ['yuv422p10le', 10, '4:2:2', false],
    ['yuva444p12le', 12, '4:4:4', true],
    ['p010le', 10, '4:2:0', false],
    ['rgb0', 8, 'RGB', false],
    ['rgba', 8, 'RGB', true],
    ['rgb48be', 16, 'RGB', false],
    ['gbrpf32le', 32, 'RGB', false],
    ['gray', 8, 'Graustufen', false],
    ['pal8', 8, 'Palette', false]
  ])('%s -> %i bit, %s, Alpha %s', (fmt, bits, chroma, alpha) => {
    expect(parsePixFmt(fmt)).toMatchObject({ bits, chroma, alpha })
  })
})

describe('Tiefenanalyse', () => {
  it('analyzePackets: Long-GOP mit Keyframe alle 50 Bilder, konstante Abstände', () => {
    const csv = Array.from(
      { length: 150 },
      (_, i) => `${i * 512},512,${i % 50 === 0 ? 'K__' : '___'}`
    )
    expect(analyzePackets(csv.join('\n'))).toMatchObject({
      packets: 150,
      keyframes: 3,
      keyframeInterval: 50,
      keyframeIntervalAtLeast: false,
      allIntra: false,
      vfr: false
    })
  })

  it('analyzePackets: nur ein Keyframe -> Mindestabstand; nur Keyframes -> Intra', () => {
    const one = Array.from({ length: 40 }, (_, i) => `${i * 10},10,${i === 0 ? 'K_' : '__'}`)
    expect(analyzePackets(one.join('\n'))).toMatchObject({
      keyframeInterval: 40,
      keyframeIntervalAtLeast: true
    })
    const intra = Array.from({ length: 20 }, (_, i) => `${i * 10},10,K_`)
    expect(analyzePackets(intra.join('\n'))).toMatchObject({ allIntra: true, keyframeInterval: 1 })
  })

  it('analyzePackets: VFR erkannt, ms-Rundung (16/17) ist kein VFR', () => {
    const vfr = Array.from(
      { length: 60 },
      (_, i) => `${i < 30 ? i * 512 : 30 * 512 + (i - 30) * 1536},,_`
    )
    expect(analyzePackets(vfr.join('\n'))?.vfr).toBe(true)
    let t = 0
    const mkv = Array.from({ length: 60 }, (_, i) => {
      const line = `${t},,_`
      t += i % 3 === 0 ? 16 : 17
      return line
    })
    expect(analyzePackets(mkv.join('\n'))?.vfr).toBe(false)
  })

  it('applyDeepAnalysis bestätigt bzw. entwarnt VFR und ergänzt den Scan-Typ', () => {
    const base = info('vfr.mp4')
    const gopConst = {
      packets: 90,
      keyframes: 1,
      keyframeInterval: 90,
      keyframeIntervalAtLeast: true,
      allIntra: false,
      vfr: false
    }
    expect(applyDeepAnalysis(base, gopConst, null).video[0].fpsMode).toBe('cfr')
    const confirmed = applyDeepAnalysis(info('vfr.mp4'), { ...gopConst, vfr: true }, null)
    expect(confirmed.video[0].fpsMode).toBe('vfr')
    expect(confirmed.deepAnalyzed).toBe(true)
    const dv = applyDeepAnalysis(info('dv_pal.dv'), null, {
      interlaced: true,
      topFieldFirst: false,
      masteringMaxNits: null,
      maxCll: null,
      maxFall: null
    })
    expect(dv.video[0].scan).toBe('bff')
  })

  it('parseFirstFrame liest Interlace-Flag und HDR10-SEI', () => {
    const f = parseFirstFrame({
      frames: [
        {
          interlaced_frame: 0,
          top_field_first: 0,
          side_data_list: [
            { side_data_type: 'Mastering display metadata', max_luminance: '10000000/10000' },
            { side_data_type: 'Content light level metadata', max_content: 1000, max_average: 400 }
          ]
        }
      ]
    })
    expect(f).toEqual({
      interlaced: false,
      topFieldFirst: false,
      masteringMaxNits: 1000,
      maxCll: 1000,
      maxFall: 400
    })
    expect(parseFirstFrame({})).toBeNull()
  })
})

describe('describeProbeError', () => {
  it('abgebrochene MP4/MOV-Aufnahme, Pfad wird aus dem Detail entfernt', () => {
    const d = describeProbeError(
      '{"error":{"code":-1094995529,"string":"Invalid data found when processing input"}}',
      '[mov,mp4,m4a,3gp,3g2,mj2 @ 0x1] moov atom not found\n/m/clip.mp4: Invalid data found when processing input\n',
      '/m/clip.mp4'
    )
    expect(d).toEqual({
      error: 'MP4/MOV unvollständig – Aufnahme oder Kopiervorgang abgebrochen',
      detail: 'Invalid data found when processing input'
    })
  })

  it('unbekanntes Format und fehlende Datei', () => {
    expect(describeProbeError('{"error":{"code":-1094995529}}', '').error).toMatch(/Keine lesbare/)
    expect(describeProbeError('{"error":{"code":-2}}', '').error).toBe('Datei nicht gefunden')
    expect(describeProbeError('kein json', 'x: Permission denied').error).toBe('Keine Leserechte')
  })
})
