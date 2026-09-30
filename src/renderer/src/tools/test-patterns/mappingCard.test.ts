import { describe, expect, it } from 'vitest'
import { clockText, mappingLayout, stripBlocks } from './mappingCard'

// Sollwerte aus Screenshots des MadMapper-Testbilds (1440×960, 1920×1080, 1080×1920).
describe('mappingLayout (Einheit s = kürzere Kante / 12, Hauptraster in 2s-Zellen)', () => {
  it.each([
    // w, h, s, Hauptraster x0..x1, y0..y1
    [1440, 960, 80, 240, 1200, 160, 800],
    [1920, 1080, 90, 240, 1680, 180, 900],
    [1080, 1920, 90, 180, 900, 240, 1680]
  ])('%s×%s', (w, h, s, x0, x1, y0, y1) => {
    const l = mappingLayout(w, h)
    expect(l.s).toBe(s)
    expect(l.cx - l.bigX * 2 * l.s).toBe(x0)
    expect(l.cx + l.bigX * 2 * l.s).toBe(x1)
    expect(l.cy - l.bigY * 2 * l.s).toBe(y0)
    expect(l.cy + l.bigY * 2 * l.s).toBe(y1)
  })

  it('bleibt bei krummen Maßen symmetrisch und innerhalb der Eck-Fadenkreuze', () => {
    const l = mappingLayout(1000, 1000)
    expect(l.bigX).toBe(2) // (500 - 2s) / 2s = 2 trotz Gleitkomma-Rest
    expect(l.cx - l.bigX * 2 * l.s).toBeGreaterThanOrEqual(2 * l.s - 1e-9)
  })
})

describe('stripBlocks (Randstreifen, Phase an der Bildmitte verankert)', () => {
  it('1440 breit, oben: erster Block (160..240) hell, dann dunkel', () => {
    const blocks = stripBlocks(720, 80, 160, 1280, true)
    expect(blocks).toHaveLength(14)
    expect(blocks[0]).toEqual({ a: 160, b: 240, dark: false })
    expect(blocks[1]).toEqual({ a: 240, b: 320, dark: true })
    expect(blocks[13]).toEqual({ a: 1200, b: 1280, dark: true })
  })

  it('unten gegenphasig zu oben (punktsymmetrisch)', () => {
    const top = stripBlocks(720, 80, 160, 1280, true)
    const bottom = stripBlocks(720, 80, 160, 1280, false)
    expect(bottom.map((b) => b.dark)).toEqual(top.map((b) => !b.dark))
  })

  it('schneidet Teilblöcke am Streifenende ab (1920 breit, s = 90)', () => {
    const blocks = stripBlocks(960, 90, 180, 1740, true)
    expect(blocks[0]).toEqual({ a: 180, b: 240, dark: false }) // Zelle 150..240
    expect(blocks.at(-1)).toEqual({ a: 1680, b: 1740, dark: true }) // Zelle 1680..1770
  })

  it('Hochformat 1080×1920, oben: erster Block (180..270) dunkel', () => {
    expect(stripBlocks(540, 90, 180, 900, true)[0]).toEqual({ a: 180, b: 270, dark: true })
  })
})

describe('clockText', () => {
  it('zweistellig mit führenden Nullen', () => {
    expect(clockText(new Date(2026, 0, 2, 3, 4, 5))).toBe('03:04:05')
    expect(clockText(new Date(2026, 0, 2, 17, 15, 7))).toBe('17:15:07')
  })
})
