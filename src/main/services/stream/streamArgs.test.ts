import { describe, expect, it } from 'vitest'
import { DEFAULT_TIMER_STREAM } from '@shared/types'
import { buildStreamArgs, clampStreamConfig, framesDue, streamEncoderArgs } from './streamArgs'

const cfg = DEFAULT_TIMER_STREAM

describe('Stream – Eingaben begrenzen', () => {
  it('übernimmt gültige Werte und ersetzt Unbrauchbares durch die Vorgabe', () => {
    expect(clampStreamConfig(cfg, cfg)).toEqual(cfg)
    expect(clampStreamConfig({ width: Number.NaN, port: 'x' as never }, cfg)).toEqual(cfg)
  })

  it('macht Maße gerade (yuv420p) und hält Port und Rate in Grenzen', () => {
    const c = clampStreamConfig({ width: 1281, height: 721, port: 80, bitrateKbps: 1e9 }, cfg)
    expect(c).toMatchObject({ width: 1280, height: 720, port: 1024, bitrateKbps: 20000 })
  })
})

describe('Stream – ffmpeg-Argumente', () => {
  it('liest BGRA von stdin in der eingestellten Größe und schreibt MPEG-TS auf stdout', () => {
    const a = buildStreamArgs('libx264', cfg)
    expect(a.join(' ')).toContain('-f rawvideo -pix_fmt bgra -s 1920x1080 -framerate 30 -i pipe:0')
    expect(a.slice(-7).join(' ')).toBe(
      '-f mpegts -mpegts_flags resend_headers -flush_packets 1 pipe:1'
    )
  })

  it('jeder Encoder: konstante Rate, Schlüsselbild jede Sekunde, keine B-Frames', () => {
    for (const enc of ['libx264', 'h264_nvenc', 'h264_qsv', 'h264_amf', 'h264_videotoolbox']) {
      const a = streamEncoderArgs(enc, { ...cfg, fps: 25 })
      const at = (k: string): string | undefined => a[a.indexOf(k) + 1]
      expect(at('-c:v'), enc).toBe(enc)
      expect(at('-b:v'), enc).toBe('4000k')
      expect(at('-maxrate'), enc).toBe('4000k')
      expect(at('-g'), enc).toBe('25')
      expect(at('-bf'), enc).toBe('0')
    }
  })

  it('libx264 läuft ohne Vorausschau (zerolatency) und mit festem Schlüsselbild-Takt', () => {
    const a = streamEncoderArgs('libx264', cfg)
    expect(a.join(' ')).toContain('-tune zerolatency')
    expect(a.join(' ')).toContain('-sc_threshold 0')
  })

  it('Quick Sync bekommt nv12, alle anderen yuv420p', () => {
    expect(buildStreamArgs('h264_qsv', cfg).join(' ')).toContain('format=nv12')
    expect(buildStreamArgs('h264_nvenc', cfg).join(' ')).toContain('format=yuv420p')
  })
})

describe('Stream – Bildtakt', () => {
  it('zählt die fälligen Bilder nach der Uhr', () => {
    expect(framesDue(1000, 1000, 30)).toBe(0)
    expect(framesDue(1000, 1999, 30)).toBe(29)
    expect(framesDue(1000, 2000, 30)).toBe(30)
    expect(framesDue(0, 60_000, 25)).toBe(1500)
  })

  it('nie negativ (Uhr springt zurück)', () => {
    expect(framesDue(5000, 4000, 30)).toBe(0)
  })
})
