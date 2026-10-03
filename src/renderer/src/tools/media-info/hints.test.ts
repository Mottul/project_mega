import { describe, expect, it } from 'vitest'
import {
  analyzeMedia,
  DEFAULT_PROFILE,
  findDeviations,
  hapInputHints,
  playlistHints,
  worstLevel,
  type CheckProfile,
  type MediaHint
} from './hints'
import { audioTrack, mediaInfo, videoTrack } from './testFactory'

const ids = (hints: MediaHint[]): string[] => hints.map((h) => h.id)
const level = (hints: MediaHint[], id: string): string | undefined =>
  hints.find((h) => h.id === id)?.level
const profile = (p: Partial<CheckProfile>): CheckProfile => ({ ...DEFAULT_PROFILE, ...p })

describe('analyzeMedia – saubere Datei', () => {
  it('1080p25 H.264 + AAC 48 kHz: nur der Long-GOP-Hinweis (Info)', () => {
    const hints = analyzeMedia(mediaInfo(), DEFAULT_PROFILE)
    expect(ids(hints)).toEqual(['longgop'])
    expect(worstLevel(hints)).toBe('info')
  })

  it('HAP Q im MOV für Medienserver: grünes OK', () => {
    const info = mediaInfo({
      formatName: 'mov,mp4,m4a,3gp,3g2,mj2',
      video: [
        videoTrack({
          codecName: 'hap',
          codec: 'HAP Q',
          fourcc: 'HapY',
          codecClass: 'gpu',
          profile: null
        })
      ],
      audio: []
    })
    const hints = analyzeMedia(info, profile({ target: 'mediaserver' }))
    expect(ids(hints)).toEqual(['hap-ok'])
    expect(worstLevel(hints)).toBe('ok')
  })
})

describe('analyzeMedia – Profilabhängigkeit', () => {
  it('HAP auf USB-Player ist ein Problem, Long-GOP dort kein Thema', () => {
    const hap = mediaInfo({
      video: [videoTrack({ codecName: 'hap', codec: 'HAP', fourcc: 'Hap1', codecClass: 'gpu' })]
    })
    const usb = analyzeMedia(hap, profile({ target: 'usb' }))
    expect(level(usb, 'hap-player')).toBe('problem')
    expect(level(usb, 'usb-codec')).toBe('problem')
    expect(ids(analyzeMedia(mediaInfo(), profile({ target: 'usb' })))).not.toContain('longgop')
  })

  it('Long-GOP ist für Medienserver eine Warnung, für Laptop-Playout egal', () => {
    expect(level(analyzeMedia(mediaInfo(), profile({ target: 'mediaserver' })), 'longgop')).toBe(
      'warning'
    )
    expect(ids(analyzeMedia(mediaInfo(), profile({ target: 'laptop' })))).not.toContain('longgop')
  })

  it('FAT32-Grenze: USB = Problem, sonst Warnung', () => {
    const big = mediaInfo({ sizeBytes: 5_000_000_000 })
    expect(level(analyzeMedia(big, DEFAULT_PROFILE), 'fat32')).toBe('warning')
    expect(level(analyzeMedia(big, profile({ target: 'usb' })), 'fat32')).toBe('problem')
  })

  it('MKV: macOS = Problem, Medienserver = Warnung', () => {
    const mkv = mediaInfo({ formatName: 'matroska,webm', container: 'Matroska (MKV)' })
    expect(level(analyzeMedia(mkv, profile({ target: 'mac' })), 'container-mkv')).toBe('problem')
    expect(level(analyzeMedia(mkv, profile({ target: 'mediaserver' })), 'container-mkv')).toBe(
      'warning'
    )
  })

  it('Datenträger: 311 Mbit/s auf USB-Stick = Problem, auf NVMe ok', () => {
    const hq = mediaInfo({ bitRate: 311_000_000 })
    expect(level(analyzeMedia(hq, profile({ medium: 'usb-stick' })), 'bitrate-medium')).toBe(
      'problem'
    )
    expect(ids(analyzeMedia(hq, profile({ medium: 'nvme' })))).not.toContain('bitrate-medium')
    expect(level(analyzeMedia(hq, DEFAULT_PROFILE), 'bitrate-high')).toBe('info')
  })
})

describe('analyzeMedia – Show-Raster', () => {
  const at = (fps: number, raster: CheckProfile['raster']): MediaHint[] =>
    analyzeMedia(mediaInfo({ video: [videoTrack({ fps })] }), profile({ raster }))

  it('25 und 50 fps passen zum 25/50-Hz-Raster', () => {
    expect(ids(at(25, '25'))).not.toContain('fps-raster')
    expect(ids(at(50, '25'))).not.toContain('fps-raster')
  })

  it('29,97 fps bei 25/50 Hz ruckelt', () => {
    expect(at(30000 / 1001, '25').find((h) => h.id === 'fps-raster')?.title).toMatch(/passt nicht/)
  })

  it('59,94 fps bei 30/60 Hz: Bildsprung etwa alle 16,7 s', () => {
    const h = at(60000 / 1001, '30').find((x) => x.id === 'fps-raster')
    expect(h?.title).toMatch(/minimal/)
    expect(h?.text).toMatch(/16,7 s/)
  })

  it('ohne Raster: NTSC-Rate als Info', () => {
    expect(level(at(30000 / 1001, 'none'), 'fps-ntsc')).toBe('info')
  })
})

describe('analyzeMedia – Bild, Ton, Metadaten', () => {
  it('Interlaced, VFR, Rotation, anamorph, HDR, Alpha-Erwartung', () => {
    const info = mediaInfo({
      name: 'logo_alpha.mov',
      video: [
        videoTrack({
          scan: 'tff',
          fpsMode: 'vfr',
          rotation: 90,
          sar: '4:3',
          width: 1440,
          displayWidth: 1080,
          displayHeight: 1440,
          hdr: 'hlg'
        })
      ]
    })
    const got = ids(analyzeMedia(info, DEFAULT_PROFILE))
    for (const id of ['interlaced', 'vfr', 'rotation', 'sar', 'hdr', 'alpha-expected', 'portrait'])
      expect(got).toContain(id)
  })

  it('HAP-Teilbarkeit und ungerade Maße', () => {
    const odd = mediaInfo({
      video: [videoTrack({ width: 1366, height: 767, displayWidth: 1366, displayHeight: 767 })]
    })
    const hints = analyzeMedia(odd, DEFAULT_PROFILE)
    expect(hints.find((h) => h.id === 'hap-mod4')?.title).toMatch(/1\.368 × 768/)
    expect(level(hints, 'res-odd')).toBe('warning')
  })

  it('H.264 4:2:2 10 bit über 4096 px', () => {
    const cam = mediaInfo({
      video: [
        videoTrack({
          chroma: '4:2:2',
          bitDepth: 10,
          width: 7680,
          height: 1080,
          displayWidth: 7680,
          displayHeight: 1080
        })
      ]
    })
    const got = ids(analyzeMedia(cam, DEFAULT_PROFILE))
    expect(got).toEqual(expect.arrayContaining(['hw-chroma', 'hw-h264-10bit', 'h264-4096']))
  })

  it('Ton: 44,1 kHz, 5.1, AC-3, mehrere Spuren, fehlender Ton', () => {
    const info = mediaInfo({
      audio: [
        audioTrack({
          codecName: 'ac3',
          codec: 'Dolby Digital (AC-3)',
          sampleRate: 44100,
          channels: 6,
          channelLayout: '5.1(side)'
        }),
        audioTrack({ index: 2 })
      ]
    })
    const got = ids(analyzeMedia(info, profile({ target: 'mediaserver' })))
    expect(got).toEqual(
      expect.arrayContaining(['audio-441', 'audio-multich', 'audio-codec', 'audio-tracks'])
    )
    expect(ids(analyzeMedia(mediaInfo({ audio: [] }), DEFAULT_PROFILE))).toContain('audio-none')
  })

  it('Timecode ≠ 0, Drop-Frame, GPS', () => {
    const got = ids(
      analyzeMedia(
        mediaInfo({ timecode: '01:00:00;00', location: '+52.52+013.40/' }),
        DEFAULT_PROFILE
      )
    )
    expect(got).toEqual(expect.arrayContaining(['tc-start', 'tc-df', 'gps']))
    expect(
      ids(analyzeMedia(mediaInfo({ timecode: '00:00:00:00' }), DEFAULT_PROFILE))
    ).not.toContain('tc-start')
  })

  it('lange GOP aus der Tiefenanalyse', () => {
    const info = mediaInfo({
      video: [
        videoTrack({
          frames: 9000, // langer Clip: der Scan (300 Pakete) deckt nur den Anfang ab
          gop: {
            packets: 300,
            keyframes: 1,
            keyframeInterval: 300,
            keyframeIntervalAtLeast: true,
            allIntra: false,
            vfr: false
          }
        })
      ]
    })
    const h = analyzeMedia(info, profile({ target: 'mediaserver' })).find(
      (x) => x.id === 'gop-long'
    )
    expect(h?.level).toBe('warning')
    expect(h?.title).toMatch(/mindestens alle 12 s/)
    // kurzer Clip, komplett gescannt: nur ein Keyframe am Anfang
    const short = mediaInfo({
      video: [
        videoTrack({
          frames: 75,
          gop: {
            packets: 75,
            keyframes: 1,
            keyframeInterval: 75,
            keyframeIntervalAtLeast: true,
            allIntra: false,
            vfr: false
          }
        })
      ]
    })
    expect(analyzeMedia(short, DEFAULT_PROFILE).find((x) => x.id === 'gop-long')?.title).toMatch(
      /nur ein Keyframe im ganzen Clip/
    )
  })

  it('unvollständige Datei und unbekannter Codec sind Probleme', () => {
    const info = mediaInfo({
      incomplete: true,
      video: [videoTrack({ codecName: null, fourcc: 'Hap7' })]
    })
    const hints = analyzeMedia(info, DEFAULT_PROFILE)
    expect(level(hints, 'incomplete')).toBe('problem')
    expect(level(hints, 'codec-unknown')).toBe('problem')
    expect(hints[0].level).toBe('problem') // sortiert: schlimmstes zuerst
  })
})

describe('mehrere Dateien', () => {
  const a = mediaInfo({ path: '/a.mp4', name: 'a.mp4' })
  const b = mediaInfo({ path: '/b.mp4', name: 'b.mp4' })
  const c = mediaInfo({
    path: '/c.mp4',
    name: 'c.mp4',
    video: [
      videoTrack({
        width: 1280,
        height: 720,
        displayWidth: 1280,
        displayHeight: 720,
        fps: 30000 / 1001
      })
    ]
  })

  it('Abweichungen gegen den Mehrheitswert', () => {
    const { byPath, majority } = findDeviations([a, b, c])
    expect(majority.resolution).toBe('1920x1080')
    expect([...(byPath.get('/c.mp4') ?? [])].sort()).toEqual(['fps', 'resolution'])
    expect(byPath.has('/a.mp4')).toBe(false)
  })

  it('Playlist-Hinweise: gemischte Auflösungen und Bildraten', () => {
    expect(ids(playlistHints([a, b, c]))).toEqual(['mix-res', 'mix-fps'])
    expect(playlistHints([a, b])).toEqual([])
  })
})

describe('hapInputHints', () => {
  it('Alpha-Quelle mit HAP Q -> Warnung, ungerade Maße -> Auffüllen', () => {
    const info = mediaInfo({
      video: [videoTrack({ alpha: true, width: 1918, height: 1080, displayWidth: 1918 })]
    })
    const got = hapInputHints(info, 'hap_q')
    expect(ids(got)).toEqual(['hap-alpha-lost', 'hap-pad'])
    expect(got[1].title).toBe('Wird auf 1.920 × 1.080 aufgefüllt')
  })

  it('reine Audiodatei ist nicht konvertierbar, HAP-Quelle wird erkannt', () => {
    expect(ids(hapInputHints(mediaInfo({ video: [] }), 'hap_q'))).toEqual(['hap-novideo'])
    const hap = mediaInfo({
      video: [videoTrack({ codecName: 'hap', codec: 'HAP Q', codecClass: 'gpu' })]
    })
    expect(ids(hapInputHints(hap, 'hap_q'))).toEqual(['hap-already'])
  })
})
