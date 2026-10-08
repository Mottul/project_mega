import { describe, expect, it } from 'vitest'
import { transitionLook } from './transitionCss'

// Sollwerte aus der Messung am gebündelten ffmpeg (rot -> blau, 25 Bilder, Bild k: p = k/25)
describe('Live-Vorschau – Übergänge wie xfade', () => {
  it('über Schwarz: a nach einem Fünftel weg, b steigt weich', () => {
    // gemessen: Bild 2 (p 0,08) Rot 150/255, Bild 5 (0,2) Rot 0, Bild 12 (0,48) Blau 79/255
    expect(Number(transitionLook('fadeblack', 0.08).a.opacity)).toBeCloseTo(150 / 255, 1)
    expect(Number(transitionLook('fadeblack', 0.2).a.opacity)).toBeCloseTo(0, 5)
    expect(Number(transitionLook('fadeblack', 0.48).b.opacity)).toBeCloseTo(79 / 255, 1)
    expect(transitionLook('fadewhite', 0.5).under).toBe('#ffffff')
  })

  it('Wischen und Schieben: das neue Bild kommt von rechts (←) bzw. unten (↑)', () => {
    expect(transitionLook('wipeleft', 0.25).b.clipPath).toBe('inset(0 0 0 75%)')
    expect(transitionLook('wiperight', 0.25).b.clipPath).toBe('inset(0 75% 0 0)')
    expect(transitionLook('slideleft', 0.25).b.transform).toBe('translateX(75%)')
    expect(transitionLook('slideup', 0.25).a.transform).toBe('translateY(-25%)')
    expect(transitionLook('slidedown', 0.25).b.transform).toBe('translateY(-75%)')
  })

  it('Kreis, weiches Wischen, Zoom', () => {
    // Kreis: bei p = 0,5 gerade ganz in der Mitte gedeckt
    expect(transitionLook('circleopen', 0.5).b.maskImage).toContain('#000 0%, transparent 100%')
    expect(transitionLook('smoothleft', 0.5).b.maskImage).toBe(
      'linear-gradient(to right, transparent 0%, #000 100%)'
    )
    // Zoom: gemessen ≈ 1,9× bei p 0,24; b bei p 0,72 ≈ 0,41
    const z = /scale\(([\d.]+)\)/.exec(String(transitionLook('zoomin', 0.24).a.transform))
    expect(Number(z?.[1])).toBeCloseTo(1.89, 1)
    expect(Number(transitionLook('zoomin', 0.72).b.opacity)).toBeCloseTo(0.41, 1)
  })

  it('Überblenden und Auflösen: b mit Deckkraft p', () => {
    expect(transitionLook('fade', 0.3).b.opacity).toBe(0.3)
    expect(transitionLook('dissolve', 0.6).b.opacity).toBe(0.6)
  })
})
