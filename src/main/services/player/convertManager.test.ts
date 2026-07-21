import { describe, expect, it, vi } from 'vitest'

// convertManager zieht über log/store/ffmpegPath nur `electron` (app.getPath)
// herein – kein natives Modul. Ein schlanker Mock genügt, um die reinen
// Entscheidungs-Funktionen zu importieren und zu testen.
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp', isPackaged: false }
}))

const { analyzeFit, canStreamCopy } = await import('./convertManager')
import type { ProbeInfo } from './convertManager'

const probe = (over: Partial<ProbeInfo>): ProbeInfo => ({
  width: 1920,
  height: 1080,
  durationSec: 10,
  hasVideo: true,
  hasAudio: false,
  codecName: 'h264',
  pixFmt: 'yuv420p',
  ...over
})

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
})

describe('convertManager – canStreamCopy (Re-Encode vermeiden)', () => {
  it('H.264 8-Bit 4:2:0 in exakter Auflösung -> Stream-Copy', () => {
    expect(canStreamCopy('video', probe({ pixFmt: 'yuv420p' }), 1920, 1080)).toBe(true)
    expect(canStreamCopy('video', probe({ pixFmt: 'yuvj420p' }), 1920, 1080)).toBe(true)
  })
  it('10-Bit oder anderer Codec -> Re-Encode', () => {
    expect(canStreamCopy('video', probe({ pixFmt: 'yuv420p10le' }), 1920, 1080)).toBe(false)
    expect(canStreamCopy('video', probe({ codecName: 'hevc' }), 1920, 1080)).toBe(false)
  })
  it('falsche Auflösung oder Bild -> kein Stream-Copy', () => {
    expect(canStreamCopy('video', probe({ width: 1280, height: 720 }), 1920, 1080)).toBe(false)
    expect(canStreamCopy('image', probe({}), 1920, 1080)).toBe(false)
  })
})
