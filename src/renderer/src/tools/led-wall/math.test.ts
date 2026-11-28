import { describe, expect, it } from 'vitest'
import {
  arcOptions,
  buildSquircle,
  calc169,
  calcArc,
  computeModuleShapes,
  distributeAngles,
  fitArcLength,
  gcd,
  getBallastPerBase,
  measureArc,
  measureFootprint,
  resizeGrid,
  sagInputFor,
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
    expect(distributeAngles(360, 8)).toEqual({
      angles: [45, 45, 45, 45, 45, 45, 45, 45],
      achieved: 360
    })
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

describe('calcArc (Kreissegment aus Sehne+Stichhöhe, bleibt INNERHALB der Vorgaben)', () => {
  it('Sehne 4 m / Stich 1 m: passendes Segment, gebaute Form im Toleranzband', () => {
    const r = calcArc(4, 1)
    expect(r).not.toBeNull()
    if (!r) return
    expect(r.mods).toBe(9)
    expect(r.arcLen).toBeCloseTo(r.mods * MODULE_W, 10)
    // Kerngarantie: die ECHTE gebaute Form überschreitet die Vorgabe nur um die Toleranz.
    expect(r.ca).toBeLessThanOrEqual(4 + 0.001)
    expect(r.sa).toBeLessThanOrEqual(1 + 0.001)
  })
  it('ungültige Vorgaben → null', () => {
    expect(calcArc(0, 1)).toBeNull()
    expect(calcArc(4, 0)).toBeNull()
  })
})

describe('arcOptions / fitArcLength (Kreissegment aus Bogenlänge + Stichhöhe, F18)', () => {
  const sechs = arcOptions(12) // 6 m Bogenlänge

  it('6 m = 12 Module: 72 baubare Formen von 2,5° bis zum Halbkreis', () => {
    expect(sechs).toHaveLength(72)
    expect(sechs[0].totalDeg).toBe(2.5)
    expect(sechs.at(-1)?.totalDeg).toBe(180)
  })

  it('alle Zeilen haben dieselbe Bogenlänge, die Stichhöhe steigt mit dem Gesamtwinkel', () => {
    for (const o of sechs) {
      expect(o.mods).toBe(12)
      expect(o.arcLen).toBeCloseTo(12 * MODULE_W, 10)
    }
    for (let i = 1; i < sechs.length; i++) {
      expect(sechs[i].totalDeg).toBeGreaterThan(sechs[i - 1].totalDeg)
      expect(sechs[i].sa).toBeGreaterThan(sechs[i - 1].sa)
    }
  })

  it('jede Zeile baut: Messung der echten Form gleich der Angabe, höchstens 45° je Modul', () => {
    for (const o of sechs) {
      expect(o.dist.angles).toHaveLength(12)
      expect(o.dist.achieved).toBe(o.totalDeg)
      expect(Math.max(...o.dist.angles)).toBeLessThanOrEqual(45)
      const m = measureArc(computeModuleShapes(o.dist.angles))
      expect(o.ca).toBeCloseTo(m.chord, 9)
      expect(o.sa).toBeCloseTo(m.sag, 9)
      // Radius wie bei calcArc: Idealkreis mit dieser Bogenlänge und diesem Winkel
      expect(o.r).toBeCloseTo(o.arcLen / ((o.totalDeg * Math.PI) / 180), 9)
    }
  })

  it('gewählt wird die nächste baubare Stichhöhe; es bleiben 12 Module, Sehne und Radius ändern sich', () => {
    const at = (sag: number): { deg: number; mods: number; ca: number; r: number } => {
      const fit = fitArcLength(6, sag)
      if (!fit) throw new Error('kein Ergebnis')
      const o = fit.options[fit.index]
      return { deg: o.totalDeg, mods: o.mods, ca: o.ca, r: o.r }
    }
    const a = at(0.5)
    const b = at(1)
    const c = at(1.5)
    expect([a.deg, b.deg, c.deg]).toEqual([35, 72.5, 122.5])
    expect([a.mods, b.mods, c.mods]).toEqual([12, 12, 12])
    expect(a.ca).toBeCloseTo(5.893, 3)
    expect(b.ca).toBeCloseTo(5.55, 3)
    expect(c.ca).toBeCloseTo(4.899, 3)
    expect(a.r).toBeCloseTo(9.822, 3)
    expect(c.r).toBeCloseTo(2.806, 3)
    expect(fitArcLength(6, 0.5)?.outside).toBeNull()
  })

  it('Bogenlänge wird auf ganze Module gerundet', () => {
    const fit = fitArcLength(6.2, 0.5)
    expect(fit?.options[0].mods).toBe(12)
    expect(fit?.options[0].arcLen).toBeCloseTo(6, 10)
  })

  it('Grenzen: Stichhöhe 0, negativ oder keine Zahl → keine Zeile gewählt, die Liste bleibt', () => {
    for (const sag of [0, -0.3, Number.NaN]) {
      const fit = fitArcLength(6, sag)
      expect(fit?.index).toBe(-1)
      expect(fit?.options).toHaveLength(72)
      expect(fit?.outside).toBeNull()
    }
  })

  it('Grenzen: weniger als ein Modul, keine Zahl, größer als das größte Raster → keine Form', () => {
    expect(fitArcLength(0.2, 0.5)).toBeNull()
    expect(fitArcLength(Number.POSITIVE_INFINITY, 0.5)).toBeNull()
    expect(fitArcLength(Number.NaN, 0.5)).toBeNull()
    expect(fitArcLength(1000 * MODULE_W + 1, 0.5)).toBeNull()
    expect(arcOptions(0)).toEqual([])
    expect(arcOptions(2.5)).toEqual([])
  })

  it('Grenze Halbkreis: nie mehr als 180°; tiefer gewünscht → Halbkreis mit Hinweis', () => {
    const tief = fitArcLength(6, 2.5)
    expect(tief?.index).toBe(71)
    expect(tief?.outside).toBe('tiefer')
    const flach = fitArcLength(6, 0.01)
    expect(flach?.index).toBe(0)
    expect(flach?.outside).toBe('flacher')
    expect(arcOptions(40).at(-1)?.totalDeg).toBe(180)
  })

  it('Grenze 45° je Modul: 1 Modul endet bei 45°, 2 Module bei 90°', () => {
    expect(arcOptions(1).at(-1)?.totalDeg).toBe(45)
    expect(arcOptions(1)).toHaveLength(18)
    expect(arcOptions(2).at(-1)?.totalDeg).toBe(90)
    for (const o of arcOptions(2)) expect(Math.max(...o.dist.angles)).toBeLessThanOrEqual(45)
  })

  it('sagInputFor: kurzer Text, der beim Eintippen genau diese Zeile wieder trifft', () => {
    const i35 = sechs.findIndex((o) => o.totalDeg === 35)
    expect(sagInputFor(sechs, i35)).toBe('0,509')
    sechs.forEach((_, i) => {
      const text = sagInputFor(sechs, i)
      expect(fitArcLength(6, Number(text.replace(',', '.')))?.index).toBe(i)
    })
    // 175° und 177,5° liegen nur 0,5 mm auseinander: dort braucht es eine Stelle mehr
    const i1775 = sechs.findIndex((o) => o.totalDeg === 177.5)
    expect(sagInputFor(sechs, i1775)).toMatch(/^1,909\d$/)
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
