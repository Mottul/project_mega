import { describe, expect, it } from 'vitest'
import {
  autoCell,
  axisBand,
  cardLayout,
  cellName,
  clockText,
  contrast,
  discLayout,
  fieldSlots,
  isLight,
  ratioText,
  type Rect
} from './mappingCard'

describe('Mapping-Testbild: Raster und Beschriftung', () => {
  it('automatische Zelle = kürzere Kante ÷ 9 auf runde Pixelwerte', () => {
    expect(autoCell(1920, 1080)).toBe(120) // 16 × 9 Zellen
    expect(autoCell(3840, 2160)).toBe(240)
    expect(autoCell(1280, 720)).toBe(80)
    expect(autoCell(1080, 1920)).toBe(120) // Hochformat
    expect(autoCell(1920, 1200)).toBe(128)
    expect(autoCell(512, 256)).toBe(30)
    expect(autoCell(64, 32)).toBe(16) // kleinster Wert
  })

  it('feste Rastergröße (z. B. LED-Cabinet), unsinnige Werte -> automatisch', () => {
    expect(cardLayout(1920, 1080, { w: 128, h: 256 })).toMatchObject({ u: 120, cw: 128, ch: 256 })
    expect(cardLayout(1920, 1080, { w: 0, h: Number.NaN })).toMatchObject({ cw: 120, ch: 120 })
    expect(cardLayout(1920, 1080, { w: 1, h: 99999 })).toMatchObject({ cw: 4, ch: 4096 })
    expect(cardLayout(1920, 1080, null)).toMatchObject({ cw: 120, ch: 120, R: 480 })
  })

  it('Zellnamen wie in der Tabellenkalkulation', () => {
    expect(cellName(0, 0)).toBe('A1')
    expect(cellName(15, 8)).toBe('P9')
    expect(cellName(25, 0)).toBe('Z1')
    expect(cellName(26, 1)).toBe('AA2')
    expect(cellName(27, 11)).toBe('AB12')
  })

  it('Seitenverhältnis mit den üblichen Namen, krumme als Dezimalzahl', () => {
    expect(ratioText(1920, 1080)).toBe('16:9')
    expect(ratioText(1920, 1200)).toBe('16:10')
    expect(ratioText(1440, 1080)).toBe('4:3')
    expect(ratioText(2560, 1080)).toBe('21:9')
    expect(ratioText(1080, 1920)).toBe('9:16')
    expect(ratioText(1366, 768)).toBe('1,78:1')
  })

  it('Mittelachse trifft genau die Mitte: 2 px bei gerader, 1 px bei ungerader Länge', () => {
    expect(axisBand(1920)).toEqual({ start: 959, size: 2 })
    expect(axisBand(1079)).toEqual({ start: 539, size: 1 })
  })

  it('Uhrzeit zweistellig, Linienfarbe passt sich dem Grund an', () => {
    expect(clockText(new Date(2026, 0, 1, 7, 5, 9))).toBe('07:05:09')
    expect(isLight('#1e1e1e')).toBe(false)
    expect(isLight('#ffffff')).toBe(true)
    expect(isLight('#ffce2e')).toBe(true) // Gold -> dunkle Ziffern in den Ecken
    expect(contrast('#ffce2e', '#1e1e1e')).toBeGreaterThan(8) // Gold auf Anthrazit: gut lesbar
    expect(contrast('#ffce2e', '#ffffff')).toBeLessThan(2) // Gold auf Weiß -> Linienfarbe
  })
})

describe('Mapping-Testbild: Messfelder', () => {
  const overlaps = (a: Rect, b: Rect): boolean =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

  // Jede Lage muss die Regeln der Spezifikation erfüllen: im Bild, frei von Lineal und
  // Ecken, außerhalb des großen Kreises, ohne Überlappung untereinander
  function checkRules(w: number, h: number, cell?: { w: number; h: number }): Rect[] {
    const lay = cardLayout(w, h, cell)
    const { rects, snapped } = fieldSlots(lay)
    const m = Math.ceil(lay.u * 0.5)
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(m)
      expect(r.y).toBeGreaterThanOrEqual(m)
      expect(r.x + r.w).toBeLessThanOrEqual(w - m)
      expect(r.y + r.h).toBeLessThanOrEqual(h - m)
      const nx = Math.min(Math.max(lay.cx, r.x), r.x + r.w)
      const ny = Math.min(Math.max(lay.cy, r.y), r.y + r.h)
      expect(Math.hypot(lay.cx - nx, lay.cy - ny)).toBeGreaterThanOrEqual(lay.R)
      if (snapped) {
        expect(r.x % lay.cw).toBe(0)
        expect(r.y % lay.ch).toBe(0)
        expect(r.w % lay.cw).toBe(0)
        expect(r.h % lay.ch).toBe(0)
      }
    }
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) expect(overlaps(rects[i], rects[j])).toBe(false)
    }
    return rects
  }

  it('16:9: je drei mal zwei Zellen, symmetrisch neben dem Kreis', () => {
    const lay = cardLayout(1920, 1080)
    const { rects, snapped } = fieldSlots(lay)
    expect(snapped).toBe(true)
    // Farbe B2, Grau B7, Schärfe M2, Verlauf M7 (je 3 × 2 Zellen à 120 px)
    expect(rects).toEqual([
      { x: 120, y: 120, w: 360, h: 240 },
      { x: 120, y: 720, w: 360, h: 240 },
      { x: 1440, y: 120, w: 360, h: 240 },
      { x: 1440, y: 720, w: 360, h: 240 }
    ])
    checkRules(1920, 1080)
  })

  it('Hochformat: über und unter dem Kreis', () => {
    const rects = checkRules(1080, 1920)
    expect(rects).toHaveLength(4)
    expect(rects[0].y + rects[0].h).toBeLessThan(1920 / 2 - 480)
    expect(rects[2].y).toBeGreaterThan(1920 / 2 + 480)
  })

  it('alle Formate und LED-Raster halten die Regeln ein', () => {
    const cases: [number, number, { w: number; h: number }?][] = [
      [1920, 1200],
      [1440, 1080],
      [1080, 1080],
      [3840, 1080],
      [3840, 2160],
      [1152, 648],
      [512, 256],
      [2880, 1440, { w: 240, h: 240 }],
      [1920, 1080, { w: 128, h: 128 }],
      [1920, 1080, { w: 192, h: 192 }],
      [1920, 1080, { w: 128, h: 256 }],
      [1920, 1080, { w: 8, h: 8 }],
      [1366, 768],
      [7680, 4320]
    ]
    for (const [w, h, cell] of cases) checkRules(w, h, cell)
  })

  it('16:10-Beamer und Cabinet-Raster: Felder liegen in ganzen Zellen', () => {
    expect(fieldSlots(cardLayout(1920, 1200)).snapped).toBe(true)
    const cab = fieldSlots(cardLayout(2880, 1440, { w: 240, h: 240 }))
    expect(cab.snapped).toBe(true)
    expect(cab.rects[0].w % 240).toBe(0)
  })

  it('zu wenig Platz: lieber frei und größer als winzig im Raster; sonst keine Felder', () => {
    const fourThree = fieldSlots(cardLayout(1440, 1080))
    expect(fourThree.rects).toHaveLength(4)
    expect(fourThree.rects[0].w).toBeGreaterThan(200)
    expect(fieldSlots(cardLayout(400, 400)).rects).toHaveLength(0)
  })
})

describe('Mapping-Testbild: Mittelscheibe', () => {
  it('halber großer Kreis, Ring und Fadenkreuz wachsen mit', () => {
    const d = discLayout(cardLayout(1920, 1080))
    expect(d.r).toBe(240)
    expect(d.ring).toBe(8)
    expect(discLayout(cardLayout(3840, 2160)).r).toBe(480)
  })

  it('alle Zeilen liegen in der Scheibe und lassen das Fadenkreuz frei', () => {
    for (const [w, h] of [
      [1920, 1080],
      [1080, 1920],
      [1440, 1080],
      [512, 256],
      [3840, 2160]
    ]) {
      const lay = cardLayout(w, h)
      const d = discLayout(lay)
      const rows = [d.title, d.label, d.info, d.infoAlone]
      for (const row of rows) {
        const top = row.y - row.px * 0.78 - lay.cy
        const bottom = row.y + row.px * 0.22 - lay.cy
        expect(Math.max(Math.abs(top), Math.abs(bottom))).toBeLessThan(d.r)
        // Fadenkreuz (± cross) bleibt frei
        expect(bottom < -d.cross || top > d.cross).toBe(true)
        expect(row.maxW).toBeGreaterThan(0)
        expect(row.maxW).toBeLessThan(2 * d.r)
      }
      // Logo über dem Titel, beide über dem Fadenkreuz
      expect(d.logo.y + d.logo.h / 2).toBeLessThan(d.title.y - d.title.px * 0.78)
      expect(d.label.y).toBeLessThan(d.info.y - d.info.px * 0.78)
    }
  })

  it('Kennung passt bei Full HD ohne Verkleinerung in ihre Zeile', () => {
    const d = discLayout(cardLayout(1920, 1080))
    // „1920 × 1080 px · 16:9 · 12:34:56“: 31 Zeichen à ~0,55 em
    expect(31 * 0.55 * d.info.px).toBeLessThan(d.info.maxW)
  })
})
