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

  it('FAT32-Grenze: USB = Problem, Medienserver/schnelle Datenträger = Info, sonst Warnung', () => {
    const big = mediaInfo({ sizeBytes: 5_000_000_000 })
    const fat = (p: Partial<CheckProfile>): string | undefined =>
      level(analyzeMedia(big, profile(p)), 'fat32')
    expect(fat({})).toBe('warning')
    expect(fat({ target: 'usb' })).toBe('problem')
    expect(fat({ medium: 'usb-stick' })).toBe('problem')
    expect(fat({ target: 'mediaserver' })).toBe('info')
    expect(fat({ medium: 'nvme' })).toBe('info')
    // Stick schlägt Medienserver: auf FAT32 passt die Datei schlicht nicht drauf
    expect(fat({ target: 'mediaserver', medium: 'usb-stick' })).toBe('problem')
  })

  it('USB-Player: Pixelrate über 1080p60 bzw. unnötig hohes H.264-Level', () => {
    const usb = profile({ target: 'usb' })
    const title = (info: ReturnType<typeof mediaInfo>): string | undefined =>
      analyzeMedia(info, usb).find((h) => h.id === 'usb-level')?.title
    const uhd = videoTrack({ width: 3840, height: 2160, displayWidth: 3840, displayHeight: 2160 })
    expect(title(mediaInfo({ video: [uhd] }))).toBe('Über 1080p60 für USB-Player')
    expect(title(mediaInfo({ video: [videoTrack({ level: '5.1' })] }))).toBe(
      'H.264 Level 5.1 – viele USB-Player können höchstens 4.2'
    )
    expect(title(mediaInfo())).toBeUndefined()
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

  it('29,97 bei 30/60 Hz und 23,976 bei 24/48: minimaler Versatz statt „passt nicht"', () => {
    const ntsc = at(30000 / 1001, '30').find((h) => h.id === 'fps-raster')
    expect(ntsc?.title).toMatch(/minimal/)
    expect(ntsc?.text).toMatch(/16,7 s/)
    expect(at(24000 / 1001, 'film').find((h) => h.id === 'fps-raster')?.text).toMatch(/20,9 s/)
  })

  it('15 fps auf 30/60 Hz ist ein sauberer Teiler (nur Info: niedrige Bildrate)', () => {
    const got = at(15, '30')
    expect(ids(got)).not.toContain('fps-raster')
    expect(ids(got)).not.toContain('fps-unusual')
    expect(level(got, 'fps-low')).toBe('info')
  })

  it('ungewöhnliche Bildrate nur, wenn sie zu keinem Ausgang passt', () => {
    expect(level(at(20.463, 'none'), 'fps-unusual')).toBe('warning')
    expect(ids(at(12.5, 'none'))).not.toContain('fps-unusual')
  })

  it('ohne Raster: NTSC-Rate als Info', () => {
    expect(level(at(30000 / 1001, 'none'), 'fps-ntsc')).toBe('info')
  })

  it('vermutete VFR: keine Raster-/NTSC-Bewertung der Durchschnittsrate', () => {
    const info = mediaInfo({ video: [videoTrack({ fps: 20.463, fpsMode: 'vfr-suspect' })] })
    const got = ids(analyzeMedia(info, profile({ raster: '25' })))
    expect(got).toContain('vfr')
    expect(got).not.toContain('fps-raster')
    expect(got).not.toContain('fps-unusual')
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

  it('Rec.-601-Matrix bei HD: Hinweis, außer bei Motion-JPEG (dort Norm)', () => {
    const v601 = { colorSpace: 'smpte170m' }
    const hd = mediaInfo({ video: [videoTrack(v601)] })
    expect(level(analyzeMedia(hd, DEFAULT_PROFILE), 'color-601')).toBe('info')
    const mjpeg = mediaInfo({
      video: [
        videoTrack({ ...v601, codecName: 'mjpeg', codec: 'Motion JPEG', codecClass: 'intra' })
      ]
    })
    expect(ids(analyzeMedia(mjpeg, DEFAULT_PROFILE))).not.toContain('color-601')
  })

  it('Standbild: keine HAP-Teilbarkeit (wird nicht als Video konvertiert)', () => {
    const still = mediaInfo({
      isStill: true,
      durationSec: null,
      audio: [],
      video: [
        videoTrack({
          codecName: 'png',
          codec: 'PNG',
          codecClass: 'image',
          fpsMode: 'still',
          fps: null,
          width: 1918,
          height: 1078,
          displayWidth: 1918,
          displayHeight: 1078
        })
      ]
    })
    expect(ids(analyzeMedia(still, DEFAULT_PROFILE))).not.toContain('hap-mod4')
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
            vfr: false,
            complete: false,
            fps: 25
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
            vfr: false,
            complete: true,
            fps: 25
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
    const { byPath, majority, majorityLabel } = findDeviations([a, b, c])
    expect(majority.resolution).toBe('1920x1080')
    // Tooltip-Text in Anzeigeform statt interner Schlüssel („8-4:2:0")
    expect(majorityLabel.resolution).toBe('1920×1080')
    expect(majorityLabel.fps).toBe('25 fps')
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
