import { describe, expect, it } from 'vitest'
import {
  DEFAULT_OPTIONS,
  FPS_CHOICES,
  fpsChoice,
  fpsFromChoice,
  fpsFromShowRaster,
  presetOptions,
  SIZE_CHOICES,
  sizeChoice,
  sizeFromChoice
} from './presets'

describe('Video-Konverter – Vorgaben', () => {
  it('Bildraten-Auswahl: jede Option übersetzt sich hin und zurück', () => {
    for (const g of FPS_CHOICES) {
      for (const o of g.options) expect(fpsChoice(fpsFromChoice(o.value))).toBe(o.value)
    }
    expect(fpsFromChoice('fixed-29.97')).toEqual({ mode: 'fixed', fps: 30000 / 1001 })
  })

  it('Größen-Auswahl: hin und zurück, „genau" behält vorhandene Maße', () => {
    for (const o of SIZE_CHOICES) {
      expect(sizeChoice(sizeFromChoice(o.value, { mode: 'original' }))).toBe(o.value)
    }
    const wall = { mode: 'exact', width: 2304, height: 1152, fit: 'crop' } as const
    expect(sizeFromChoice('exact', wall)).toBe(wall)
  })

  it('USB-Vorgabe: H.264 kompatibel, höchstens 1080p, Stereo – Bildrate bleibt', () => {
    const cur = { ...DEFAULT_OPTIONS, fps: { mode: 'raster', raster: '25' } as const }
    const usb = presetOptions('usb', cur)
    expect(usb).toMatchObject({
      format: 'h264',
      compat: true,
      size: { mode: 'max', width: 1920, height: 1080 },
      audio: 'stereo',
      fps: { mode: 'raster', raster: '25' }
    })
    expect(presetOptions('mac', usb)).toMatchObject({ format: 'prores_422', compat: false })
    expect(presetOptions('custom', usb)).toBe(usb)
  })

  it('Show-Raster der Medien-Info -> Bildraten-Option', () => {
    expect(fpsFromShowRaster('ntsc')).toEqual({ mode: 'raster', raster: 'ntsc' })
    expect(fpsFromShowRaster('none')).toEqual({ mode: 'original' })
  })
})
