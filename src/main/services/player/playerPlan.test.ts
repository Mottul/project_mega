import { describe, expect, it } from 'vitest'
import { audioTrack, mediaInfo, videoTrack } from '@renderer/tools/media-info/testFactory'
import {
  analyzeFit,
  directKind,
  directPlayProblem,
  directStoredExt,
  playerOptions
} from './playerPlan'

describe('convertManager – analyzeFit (Namens-Zusatz + effektiver Fit)', () => {
  it('exakt gleiche Auflösung -> „Original", kein Blur-Graph', () => {
    expect(analyzeFit('blur', 1920, 1080, 1920, 1080)).toEqual({
      suffix: 'Original',
      effectiveFit: 'stretch'
    })
  })
  it('gleiches Seitenverhältnis -> „Scale" (nur skalieren, Fit egal)', () => {
    expect(analyzeFit('blur', 1280, 720, 1920, 1080)).toEqual({
      suffix: 'Scale',
      effectiveFit: 'stretch'
    })
  })
  it('anderes Seitenverhältnis -> gewählter Fit greift sichtbar', () => {
    expect(analyzeFit('blur', 1080, 1920, 1920, 1080)).toEqual({
      suffix: 'Blur',
      effectiveFit: 'blur'
    })
    expect(analyzeFit('bars', 1080, 1920, 1920, 1080)).toEqual({
      suffix: 'Letterbox',
      effectiveFit: 'bars'
    })
    expect(analyzeFit('stretch', 1080, 1920, 1920, 1080)).toEqual({
      suffix: 'Stretch',
      effectiveFit: 'stretch'
    })
  })
  it('unbekannte Quell-Auflösung -> Fit anwenden (kein Original/Scale)', () => {
    expect(analyzeFit('blur', null, null, 1920, 1080)).toEqual({
      suffix: 'Blur',
      effectiveFit: 'blur'
    })
  })
  it('anamorph: passende Anzeige-Größe ist „Scale" statt „Original"', () => {
    expect(analyzeFit('bars', 1920, 1080, 1920, 1080, true)).toEqual({
      suffix: 'Scale',
      effectiveFit: 'stretch'
    })
  })
})

describe('convertManager – Optionen für den gemeinsamen Plan', () => {
  const spec = { fit: 'blur' as const, width: 1920, height: 1080, blurStrength: 40, blurDarken: 10 }
  it('Video: H.264 in Wandgröße, alle Korrekturen, Umverpacken erlaubt, Lautheit', () => {
    const o = playerOptions('video', spec, { i: -16, tp: -1.5, lra: 11 })
    expect(o).toMatchObject({
      format: 'h264',
      size: { mode: 'exact', width: 1920, height: 1080, fit: 'blur' },
      deinterlace: true,
      toSdr: true,
      allowCopy: true,
      blur: { strength: 40, darken: 10 },
      loudnorm: { i: -16, tp: -1.5, lra: 11 }
    })
  })
  it('Standbild: JPG, ohne Lautheit', () => {
    const o = playerOptions('image', spec, { i: -16, tp: -1.5, lra: 11 })
    expect(o.format).toBe('jpg')
    expect(o.loudnorm).toBeNull()
  })
})

describe('Import „Unverändert“: spielt der Player die Datei direkt?', () => {
  const vid = (p = {}, a: Parameters<typeof audioTrack>[0] | null = {}) =>
    mediaInfo({ video: [videoTrack(p)], audio: a ? [audioTrack(a)] : [] })

  it('Titel-Zusatz und Art: unverändert, GIF als Bild, Endung klein', () => {
    expect(analyzeFit('original', 1080, 1920, 1920, 1080)).toEqual({
      suffix: 'Unverändert',
      effectiveFit: 'original'
    })
    expect(directKind('/a/Clip.MOV')).toBe('video')
    expect(directKind('/a/loop.gif')).toBe('image')
    expect(directKind('/a/foto.JPG')).toBe('image')
    expect(directStoredExt('/a/Clip.MOV')).toBe('.mov')
    // „unverändert“ geht nie in den Plan – falls doch: Ränder statt eines unbekannten Fits
    const o = playerOptions(
      'video',
      { fit: 'original', width: 1920, height: 1080, blurStrength: 0, blurDarken: 0 },
      null
    )
    expect(o.size).toMatchObject({ fit: 'bars' })
  })

  it('direkt spielbar: H.264 4:2:0 in MP4/MOV mit AAC, VP9 in WebM, Bilder', () => {
    expect(directPlayProblem(vid(), '/a/clip.mp4', 'win32')).toBeNull()
    expect(directPlayProblem(vid({}, null), '/a/clip.mov', 'linux')).toBeNull()
    expect(
      directPlayProblem(vid({ codecName: 'vp9' }, { codecName: 'opus' }), '/a/c.webm', 'linux')
    ).toBeNull()
    expect(
      directPlayProblem(vid({ codecName: 'av1' }, { codecName: 'aac' }), '/a/c.mp4', 'linux')
    ).toBeNull()
    expect(
      directPlayProblem(mediaInfo({ video: [], audio: [] }), '/a/foto.png', 'linux')
    ).toBeNull()
  })

  it('H.265 nur unter Windows und macOS (Hardware-Dekodierung der Grafikkarte)', () => {
    const hevc = vid({ codecName: 'hevc', pixFmt: 'yuv420p10le' })
    expect(directPlayProblem(hevc, '/a/handy.mov', 'darwin')).toBeNull()
    expect(directPlayProblem(hevc, '/a/handy.mov', 'win32')).toBeNull()
    expect(directPlayProblem(hevc, '/a/handy.mov', 'linux')).toMatch(/^H.265 unter Linux/)
  })

  it('nicht direkt spielbar: klare Absage mit Ausweg', () => {
    const other = /mit einer anderen Einpass-Art importieren/
    expect(directPlayProblem(vid({ codecName: 'prores' }), '/a/c.mov', 'darwin')).toMatch(
      /^ProRes kann der Player nicht direkt abspielen – mit einer anderen Einpass-Art/
    )
    expect(directPlayProblem(vid({ codecName: 'hap' }), '/a/c.mov', 'win32')).toMatch(/^HAP /)
    expect(directPlayProblem(vid(), '/a/c.avi', 'win32')).toMatch(/^AVI kann/)
    expect(directPlayProblem(vid(), '/a/c.mkv', 'win32')).toMatch(/^MKV kann/)
    // H.264 in 10 bit oder 4:2:2 (Kamera-Material) dekodiert Chromium nicht
    expect(directPlayProblem(vid({ pixFmt: 'yuv422p10le' }), '/a/c.mov', 'win32')).toMatch(
      /^H.264 mit yuv422p10le/
    )
    // H.264 im WebM-Container gibt es nicht
    expect(directPlayProblem(vid(), '/a/c.webm', 'win32')).toMatch(other)
    // Ton: PCM (Kamera-MOV) und AC-3 spielt Chromium nicht
    expect(directPlayProblem(vid({}, { codecName: 'pcm_s16le' }), '/a/c.mov', 'win32')).toMatch(
      /^Ton im Format PCM/
    )
    expect(directPlayProblem(vid({}, { codecName: 'ac3' }), '/a/c.mp4', 'win32')).toMatch(/AC-3/)
    expect(directPlayProblem(mediaInfo({ video: [], audio: [] }), '/a/c.mp4', 'win32')).toMatch(
      /^Keine Videospur/
    )
  })
})
