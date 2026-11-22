import { describe, expect, it } from 'vitest'
import { DEFAULT_TIMER_STREAM } from '@shared/types'
import {
  buildStreamArgs,
  clampStreamConfig,
  streamEncoderArgs,
  streamVideoFilter,
  type StreamBildEingang
} from './streamArgs'

const cfg = DEFAULT_TIMER_STREAM
/** Eingang der Bilder: in der eingestellten Größe, Port des Senders */
const bilder = (width = cfg.width, height = cfg.height): StreamBildEingang => ({
  width,
  height,
  port: 50123
})

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
  it('liest BGRA über TCP in der eingestellten Größe und schreibt MPEG-TS auf stdout', () => {
    // nicht über stdin: unter macOS ein Socket-Paar mit 8 KB Puffer, das Bild käme zu spät
    const a = buildStreamArgs('libx264', cfg, bilder())
    expect(a.join(' ')).toContain(
      '-f rawvideo -pix_fmt bgra -s 1920x1080 -framerate 30 -i tcp://127.0.0.1:50123'
    )
    expect(a).toContain('-nostdin')
    expect(a).not.toContain('pipe:0')
    expect(a.slice(-7).join(' ')).toBe(
      '-f mpegts -mpegts_flags resend_headers -flush_packets 1 pipe:1'
    )
  })

  it('Zeit von der Uhr: Wanduhr-Zeitstempel am Eingang, fester Takt per fps-Filter', () => {
    const a = buildStreamArgs('libx264', { ...cfg, fps: 25 }, bilder())
    // Die Option gilt nur vor dem Eingang, den sie betrifft
    expect(a.indexOf('-use_wallclock_as_timestamps')).toBeLessThan(a.indexOf('-i'))
    expect(a[a.indexOf('-use_wallclock_as_timestamps') + 1]).toBe('1')
    // fps zuletzt: Es verdoppelt fertige Bilder, statt jedes Doppel neu umzurechnen
    expect(a[a.indexOf('-vf') + 1]).toMatch(/,fps=25$/)
  })

  it('absolute Zeitstempel: Ein Neustart von ffmpeg dreht die Zeit nicht auf 0 zurück', () => {
    const a = buildStreamArgs('libx264', cfg, bilder())
    expect(a).toContain('-copyts')
    // weder an den Anfang schieben (start_at_zero) noch beim Muxen auf 0 setzen
    expect(a).not.toContain('-start_at_zero')
    expect(a).not.toContain('-avoid_negative_ts')
  })

  it('bei Bildschirm-Skalierung: Eingang in der paint-Größe, ffmpeg skaliert auf die Ausgabe', () => {
    const a = buildStreamArgs('libx264', cfg, bilder(2880, 1620))
    expect(a.join(' ')).toContain('-s 2880x1620')
    expect(a[a.indexOf('-vf') + 1]).toMatch(/^scale=w=1920:h=1080:/)
    expect(a[a.indexOf('-vf') + 1]).not.toContain('pad=')
  })

  it('anderes Seitenverhältnis (breite NDI-Wand): eingepasst mit Rand, nicht verzerrt', () => {
    const vf = streamVideoFilter('nv12', cfg, { width: 3840, height: 1080 })
    expect(vf).toContain('force_original_aspect_ratio=decrease')
    expect(vf).toContain('force_divisible_by=2')
    expect(vf).toContain('pad=1920:1080:(ow-iw)/2:(oh-ih)/2')
    // Rand auf yuv420p (sicher für pad), danach das Format des Encoders, dann der Takt
    expect(vf).toMatch(/format=yuv420p,pad=.*,format=nv12,fps=30$/)
  })

  it('ohne Ton: -an, kein zweiter Eingang', () => {
    const a = buildStreamArgs('libx264', cfg, bilder())
    expect(a).toContain('-an')
    expect(a.filter((x) => x === '-i')).toHaveLength(1)
  })

  it('mit Ton: Stereo-Float über TCP, Zeit = Start + Samples (absolut wie die Bilder), AAC', () => {
    const a = buildStreamArgs('libx264', cfg, bilder(), { port: 51234, startMs: 1795000000123 })
    const s = a.join(' ')
    expect(a).not.toContain('-an')
    expect(s).toContain('-f f32le -sample_rate 48000 -ch_layout stereo -i tcp://127.0.0.1:51234')
    expect(s).toContain('-map 0:v -map 1:a')
    expect(a[a.indexOf('-af') + 1]).toBe('asetpts=N/SR/TB+1795000000.123/TB')
    // absolut auch mit Ton: Ein Neustart (NDI an oder aus) dreht die Zeit nicht zurück
    expect(a.filter((x) => x === '-copyts')).toHaveLength(1)
    expect(a).not.toContain('-avoid_negative_ts')
    expect(s).toContain('-c:a aac -b:a 160k')
    // Wanduhr nur am Bild: Roh-PCM bekäme Stempel am Ende seiner 85-ms-Pakete
    expect(a.filter((x) => x === '-use_wallclock_as_timestamps')).toHaveLength(1)
    expect(a.indexOf('-use_wallclock_as_timestamps')).toBeLessThan(
      a.indexOf('tcp://127.0.0.1:50123')
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
    expect(buildStreamArgs('h264_qsv', cfg, bilder()).join(' ')).toContain('format=nv12')
    expect(buildStreamArgs('h264_nvenc', cfg, bilder()).join(' ')).toContain('format=yuv420p')
  })
})
