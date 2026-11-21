import { describe, expect, it } from 'vitest'
import { DEFAULT_TIMER_STREAM } from '@shared/types'
import { buildStreamArgs, clampStreamConfig, streamEncoderArgs } from './streamArgs'

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

  it('Zeit von der Uhr: Wanduhr-Zeitstempel am Eingang, fester Takt per fps-Filter', () => {
    const a = buildStreamArgs('libx264', { ...cfg, fps: 25 })
    // Die Option gilt nur vor dem Eingang, den sie betrifft
    expect(a.indexOf('-use_wallclock_as_timestamps')).toBeLessThan(a.indexOf('-i'))
    expect(a[a.indexOf('-use_wallclock_as_timestamps') + 1]).toBe('1')
    // fps zuletzt: Es verdoppelt fertige Bilder, statt jedes Doppel neu umzurechnen
    expect(a[a.indexOf('-vf') + 1]).toMatch(/,fps=25$/)
  })

  it('bei Bildschirm-Skalierung: Eingang in der paint-Größe, ffmpeg skaliert auf die Ausgabe', () => {
    const a = buildStreamArgs('libx264', cfg, { width: 2880, height: 1620 })
    expect(a.join(' ')).toContain('-s 2880x1620')
    expect(a[a.indexOf('-vf') + 1]).toMatch(/^scale=w=1920:h=1080:/)
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
