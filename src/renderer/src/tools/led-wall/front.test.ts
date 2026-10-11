import { describe, expect, it } from 'vitest'
import { calc169 } from './math'
import { GRID_GAP, GRID_HEADER, footPositions, frontAreas, gridCellSize } from './front'

describe('frontAreas', () => {
  it('16:9 exakt: Nutzfläche = ganze Wand, keine Balken', () => {
    const a = frontAreas(1920, 1080, calc169(1920, 1080))
    expect(a.exact).toBe(true)
    expect(a.content).toEqual({ x: 0, y: 0, w: 1, h: 1 })
    expect(a.bars).toEqual([])
  })

  it('breite Wand: Balken links und rechts, Nutzfläche mittig', () => {
    // 2304 × 1152 -> 16:9 = 2048 × 1152, je 128 px Rand
    const a = frontAreas(2304, 1152, calc169(2304, 1152))
    expect(a.exact).toBe(false)
    expect(a.content?.w).toBeCloseTo(2048 / 2304)
    expect(a.content?.x).toBeCloseTo(128 / 2304)
    expect(a.bars).toHaveLength(2)
    expect(a.bars[0]).toMatchObject({ x: 0, y: 0, h: 1 })
    expect(a.bars[1].x + a.bars[1].w).toBeCloseTo(1)
  })

  it('hohe Wand: Balken oben und unten', () => {
    // 1920 × 1200 -> 16:9 = 1920 × 1080, je 60 px Rand
    const a = frontAreas(1920, 1200, calc169(1920, 1200))
    expect(a.content).toMatchObject({ x: 0, w: 1 })
    expect(a.content?.y).toBeCloseTo(60 / 1200)
    expect(a.content?.h).toBeCloseTo(1080 / 1200)
    expect(a.bars.map((b) => b.y)).toEqual([0, 1 - 60 / 1200])
  })

  it('ohne Einpassung: nichts zu zeichnen', () => {
    expect(frontAreas(0, 0, null)).toEqual({ content: null, bars: [], exact: false })
  })
})

describe('footPositions', () => {
  it('verteilt die Füße gleichmäßig, je einer mittig in seinem Feld', () => {
    expect(footPositions(1)).toEqual([0.5])
    expect(footPositions(4)).toEqual([0.125, 0.375, 0.625, 0.875])
    expect(footPositions(0)).toEqual([])
  })
})

describe('gridCellSize', () => {
  it('füllt die Breite, wenn die Höhe reicht', () => {
    const cell = gridCellSize(600, 1000, 12, 6)
    expect(GRID_HEADER + 12 * cell + 13 * GRID_GAP).toBeLessThanOrEqual(600)
    expect(GRID_HEADER + 12 * (cell + 1) + 13 * GRID_GAP).toBeGreaterThan(600)
  })

  it('richtet sich nach der Höhe, wenn sie knapper ist', () => {
    expect(gridCellSize(2000, 300, 12, 6)).toBe(Math.floor((300 - GRID_HEADER - 7 * GRID_GAP) / 6))
  })

  it('bleibt in den Grenzen: kleine Wand nicht riesig, große Wand noch anklickbar', () => {
    expect(gridCellSize(1600, 1000, 2, 1)).toBe(64)
    expect(gridCellSize(400, 300, 60, 30)).toBe(18)
  })

  it('ohne bekannte Höhe zählt nur die Breite', () => {
    expect(gridCellSize(600, 0, 12, 6)).toBe(gridCellSize(600, 10_000, 12, 6))
  })
})
