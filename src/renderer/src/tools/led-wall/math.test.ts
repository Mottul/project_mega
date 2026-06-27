import { describe, expect, it } from 'vitest'
import {
  buildSquircle,
  calc169,
  calcArc,
  computeModuleShapes,
  distributeAngles,
  gcd,
  getBallastPerBase,
  measureArc,
  measureFootprint,
  resizeGrid,
  segsToAngles
} from './math'
import { MODULE_D, MODULE_W } from './data'

describe('getBallastPerBase (kg pro LSU-Fuß nach Höhe, Stufengrenze zur unteren Stufe)', () => {
  it.each([
    [1.5, 17],
    [2.0, 17], // exakt an erster Stufe
    [2.3, 38],
    [2.5, 38], // exakt an Stufengrenze
    [6.0, 226],
    [7.0, 226] // über Tabellenende -> geklemmt
  ])('h=%s m → %s kg', (h, kg) => {
    expect(getBallastPerBase(h)).toBe(kg)
  })
})

describe('gcd', () => {
  it('1920/1080 → 120 (ergibt 16:9)', () => {
    const g = gcd(1920, 1080)
    expect(g).toBe(120)
    expect(1920 / g).toBe(16)
    expect(1080 / g).toBe(9)
  })
  it('gcd(x,0) === x', () => {
    expect(gcd(7, 0)).toBe(7)
  })
})

describe('calc169 (16:9-Einpassung)', () => {
  it('1920×1080 passt exakt', () => {
    expect(calc169(1920, 1080)).toEqual({ match: true })
  })
  it('zu breit → seitliche Balken (lr)', () => {
    expect(calc169(2000, 1080)).toEqual({ match: false, side: 'lr', barPx: 40, cw: 1920, ch: 1080 })
  })
  it('zu hoch → Balken oben/unten (tb)', () => {
    expect(calc169(1920, 1200)).toEqual({ match: false, side: 'tb', barPx: 60, cw: 1920, ch: 1080 })
  })
  it('Nullmaß → null', () => {
    expect(calc169(0, 1080)).toBeNull()
  })
})

describe('distributeAngles (2,5°-Raster, Bump mittig)', () => {
  it('exakt teilbar → gleichmäßig', () => {
    expect(distributeAngles(90, 6)).toEqual({ angles: [15, 15, 15, 15, 15, 15], achieved: 90 })
  })
  it('Rest als +2,5°-Bump symmetrisch in die Mitte', () => {
    expect(distributeAngles(55, 4)).toEqual({ angles: [12.5, 15, 15, 12.5], achieved: 55 })
  })
  it('Vollkreis 360° auf 8 Module → je 45°', () => {
    expect(distributeAngles(360, 8)).toEqual({ angles: [45, 45, 45, 45, 45, 45, 45, 45], achieved: 360 })
  })
  it('0° oder 0 Module → keine Biegung', () => {
    expect(distributeAngles(0, 4)).toEqual({ angles: [0, 0, 0, 0], achieved: 0 })
    expect(distributeAngles(90, 0)).toEqual({ angles: [], achieved: 0 })
  })
})

describe('measureArc (Sehne + Stichhöhe der gebauten Form)', () => {
  it('90°-Bogen aus 6 Modulen ≈ Kreisbogen (r=L/θ=3/(π/2))', () => {
    // Ideal: r=1,9099 m; Sehne=2r·sin45°=2,7009; Stich=r(1−cos45°)=0,5594.
    const { chord, sag } = measureArc(computeModuleShapes(distributeAngles(90, 6).angles))
    expect(chord).toBeCloseTo(2.701, 2)
    expect(sag).toBeCloseTo(0.559, 2)
  })
  it('gerade Wand → Stichhöhe 0', () => {
    expect(measureArc(computeModuleShapes([0, 0, 0])).sag).toBeCloseTo(0, 10)
  })
  it('leere Form → alles 0', () => {
    expect(measureArc([])).toMatchObject({ chord: 0, sag: 0 })
  })
})

describe('measureFootprint (Grundfläche der Draufsicht)', () => {
  it('gerade 4er-Wand → 4·0,5 m breit, Modultiefe tief', () => {
    const { width, depth } = measureFootprint([0, 0, 0, 0])
    expect(width).toBeCloseTo(4 * MODULE_W, 10)
    expect(depth).toBeCloseTo(MODULE_D, 10)
  })
  it('leere Winkel → {0,0}', () => {
    expect(measureFootprint([])).toEqual({ width: 0, depth: 0 })
  })
})

describe('calcArc (größtes Segment, das auf Bühne max. Breite × Tiefe passt)', () => {
  const eps = 0.001
  it('4 × 1 m (flach): substanzielles Segment, Grundfläche bleibt in der Bühne', () => {
    const r = calcArc(4, 1)
    expect(r).not.toBeNull()
    if (!r) return
    expect(r.mods).toBeGreaterThanOrEqual(8)
    expect(r.arcLen).toBeCloseTo(r.mods * MODULE_W, 10)
    // Kerngarantie: die ECHTE belegte Grundfläche passt auf die Bühne.
    const fp = measureFootprint(r.dist.angles, { chordHorizontal: true })
    expect(fp.width).toBeLessThanOrEqual(4 + eps)
    expect(fp.depth).toBeLessThanOrEqual(1 + eps)
  })
  it('über den Halbkreis (2,5 × 2,5 m): Sehne ist NICHT mehr die begrenzende Breite', () => {
    const r = calcArc(2.5, 2.5)
    expect(r).not.toBeNull()
    if (!r) return
    expect(r.totalDeg).toBeGreaterThan(180)
    const fp = measureFootprint(r.dist.angles, { chordHorizontal: true })
    expect(fp.width).toBeLessThanOrEqual(2.5 + eps)
    expect(fp.depth).toBeLessThanOrEqual(2.5 + eps)
    // die geometrische Sehne ist deutlich kleiner als die belegte Breite.
    expect(r.ca).toBeLessThan(fp.width)
  })
  it('ungültige Vorgaben → null', () => {
    expect(calcArc(0, 1)).toBeNull()
    expect(calcArc(4, 0)).toBeNull()
  })
})

describe('buildSquircle (Rechteck mit runden Ecken)', () => {
  it('4×2 m, 3 Eck-Module', () => {
    const sq = buildSquircle(4, 2, 3)
    expect(sq.cornerR).toBeCloseTo(0.955, 3) // 3·0,5 / (π/2)
    expect(sq.straightW).toBe(4)
    expect(sq.straightD).toBe(0) // 0-Segmente entfallen
    expect(sq.totalMods).toBe(20) // 2·4 Geraden + 4·3 Ecken
    expect(sq.segs.every((s) => s.count > 0)).toBe(true)
  })
})

describe('segsToAngles (Builder-Segmente → Winkel je Modul)', () => {
  it('gerade → 0°, konkav → negative Winkel, Modulzahl erhalten', () => {
    const angles = segsToAngles([
      { type: 'straight', count: 2 },
      { type: 'curved', count: 4, angle: 90, dir: 'concave' }
    ])
    expect(angles.length).toBe(6)
    expect(angles.slice(0, 2)).toEqual([0, 0])
    expect(angles.slice(2).every((a) => a < 0)).toBe(true)
    expect(angles.slice(2).reduce((s, a) => s + a, 0)).toBeCloseTo(-90, 6)
  })
})

describe('resizeGrid (Belegung im Überlapp behalten, neue Zellen frei=-1)', () => {
  it('2×2 → 3×3', () => {
    const orig = [
      [5, 6],
      [7, 8]
    ]
    expect(resizeGrid(orig, 3, 3)).toEqual([
      [5, 6, -1],
      [7, 8, -1],
      [-1, -1, -1]
    ])
    expect(orig).toEqual([
      [5, 6],
      [7, 8]
    ]) // Original unverändert
  })
})
