import { describe, expect, it } from 'vitest'
import { analyzeFit, playerOptions } from './playerPlan'

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
