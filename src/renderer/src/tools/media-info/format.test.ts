import { describe, expect, it } from 'vitest'
import {
  aspectLabel,
  codecLine,
  fmtBitrate,
  fmtBytes,
  fmtDuration,
  fmtDurationShort,
  fmtFps,
  fmtMBps,
  hapRateEstimate,
  resolutionClass,
  sampleRateLabel,
  shortFormat,
  splitPath
} from './format'
import { videoTrack } from './testFactory'

describe('Formatierung (de-DE)', () => {
  it('Dauer mit Hundertsteln und zweistelligen Stunden', () => {
    expect(fmtDuration(192.4)).toBe('00:03:12.40')
    expect(fmtDuration(3725.999)).toBe('01:02:06.00')
    expect(fmtDuration(null)).toBe('–')
    expect(fmtDurationShort(192.4)).toBe('3:12')
    expect(fmtDurationShort(3725)).toBe('1:02:05')
  })

  it('Dateigröße dezimal mit deutschem Komma', () => {
    expect(fmtBytes(512)).toBe('512 B')
    expect(fmtBytes(84_500_000)).toBe('84,5 MB')
    expect(fmtBytes(845_000_000)).toBe('845 MB')
    expect(fmtBytes(7_480_000_000)).toBe('7,48 GB')
  })

  it('Bitrate und MB/s', () => {
    expect(fmtBitrate(320_000)).toBe('320 kbit/s')
    expect(fmtBitrate(12_400_000)).toBe('12,4 Mbit/s')
    expect(fmtBitrate(415_000_000)).toBe('415 Mbit/s')
    expect(fmtBitrate(1_520_000_000)).toBe('1,52 Gbit/s')
    expect(fmtMBps(311_000_000)).toBe('39 MB/s')
    expect(fmtMBps(40_000_000)).toBe('5,0 MB/s')
  })

  it('Bildraten mit Normnamen', () => {
    expect(fmtFps(25)).toBe('25')
    expect(fmtFps(30000 / 1001)).toBe('29,97')
    expect(fmtFps(24000 / 1001)).toBe('23,976')
    expect(fmtFps(60000 / 1001)).toBe('59,94')
    expect(fmtFps(12.5)).toBe('12,5')
  })

  it('Seitenverhältnis exakt, ungefähr oder dezimal', () => {
    expect(aspectLabel(1920, 1080)).toBe('16:9')
    expect(aspectLabel(1366, 768)).toBe('≈ 16:9')
    expect(aspectLabel(7680, 1080)).toBe('7,11:1')
    expect(aspectLabel(1080, 1920)).toBe('9:16')
  })

  it('Kurzform 1080p25 / 1080i/25 nur bei üblichen Formaten', () => {
    expect(shortFormat(videoTrack())).toBe('1080p25')
    expect(shortFormat(videoTrack({ scan: 'tff' }))).toBe('1080i/25')
    expect(shortFormat(videoTrack({ displayWidth: 7680, displayHeight: 1080 }))).toBeNull()
    expect(resolutionClass(3840, 2160)).toBe('UHD (4K)')
  })

  it('Codec-Zeile mit Profil, Level, Bittiefe, Chroma, Alpha, HDR', () => {
    expect(codecLine(videoTrack())).toBe('H.264 High@4.1 · 8 bit · 4:2:0')
    expect(
      codecLine(
        videoTrack({
          codec: 'ProRes 4444',
          profile: null,
          level: null,
          bitDepth: 12,
          chroma: '4:4:4',
          alpha: true
        })
      )
    ).toBe('ProRes 4444 · 12 bit · 4:4:4 + Alpha')
    expect(
      codecLine(
        videoTrack({
          codec: 'H.265 (HEVC)',
          profile: 'Main 10',
          level: '5.1',
          bitDepth: 10,
          hdr: 'pq',
          maxCll: 1000
        })
      )
    ).toBe('H.265 (HEVC) Main 10@5.1 · 10 bit · 4:2:0 · HDR10')
  })

  it('Abtastrate, Pfad-Zerlegung, HAP-Datenrate', () => {
    expect(sampleRateLabel(44100)).toBe('44,1 kHz')
    expect(sampleRateLabel(48000)).toBe('48 kHz')
    expect(splitPath('C:\\Show\\Intro\\clip.mov')).toEqual({
      dir: 'C:\\Show\\Intro',
      name: 'clip.mov'
    })
    expect(splitPath('/Volumes/SHOW/clip.mov')).toEqual({ dir: '/Volumes/SHOW', name: 'clip.mov' })
    // 1080p25 HAP Q: 1920 × 1080 × 1 Byte × 25 fps × 8 ≈ 415 Mbit/s (Obergrenze vor Snappy)
    expect(hapRateEstimate(1920, 1080, 25, 'hap_q')).toBe(414_720_000)
    expect(hapRateEstimate(1920, 1080, 25, 'hap')).toBe(207_360_000)
  })
})
