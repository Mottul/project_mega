import { describe, expect, it } from 'vitest'
import {
  chainCells,
  chainCounts,
  chainRoute,
  chainRoutes,
  chainStats,
  mirrorCorner,
  routeHints,
  routeSvg,
  snake,
  type Cell
} from './cabling'

/** Rechteck als Zellen (Zeile für Zeile) */
const rect = (r0: number, c0: number, r1: number, c1: number): Cell[] => {
  const out: Cell[] = []
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) out.push([r, c])
  return out
}
const str = (cells: Cell[]): string => cells.map(([r, c]) => `${r}${c}`).join(' ')

describe('Kettenzählung', () => {
  it('Module je Kette, Ketten und Brücken', () => {
    const grid = [
      [0, 0, 1, -1],
      [0, 1, 1, -1]
    ]
    expect(chainCounts(grid)).toEqual(
      new Map([
        [0, 3],
        [1, 3]
      ])
    )
    expect(str(chainCells(grid).get(1)!)).toBe('02 11 12')
    expect(chainStats(grid)).toEqual({ chains: 2, jumpers: 4 })
  })
})

describe('Schlange – die 8 Muster auf 2 × 3', () => {
  const cells = rect(0, 0, 1, 2)
  it.each([
    ['tl', 'row', '00 01 02 12 11 10'],
    ['tr', 'row', '02 01 00 10 11 12'],
    ['bl', 'row', '10 11 12 02 01 00'],
    ['br', 'row', '12 11 10 00 01 02'],
    ['tl', 'col', '00 10 11 01 02 12'],
    ['tr', 'col', '02 12 11 01 00 10'],
    ['bl', 'col', '10 00 01 11 12 02'],
    ['br', 'col', '12 02 01 11 10 00']
  ] as const)('%s %s', (start, axis, want) => {
    expect(str(snake(cells, start, axis))).toBe(want)
  })

  it('Praxisbeispiel: Viertel unten links, Start innen unten, waagrecht – endet wieder in der Mitte', () => {
    // Wand 8 × 4, Viertel = Reihen 2–3, Spalten 0–3; Einspeisung unten Mitte
    const order = snake(rect(2, 0, 3, 3), 'br', 'row')
    expect(str(order)).toBe('33 32 31 30 20 21 22 23')
  })

  it('Bereich ohne Rechteck: Linien ohne Modul zählen nicht mit', () => {
    const cells: Cell[] = [
      [0, 0],
      [0, 1],
      [2, 0],
      [2, 1]
    ]
    expect(str(snake(cells, 'tl', 'row'))).toBe('00 01 21 20')
  })
})

describe('Verlauf einer Kette', () => {
  const cells = rect(0, 0, 0, 3)
  it('ohne Startecke und ohne Zeichnung: kein Verlauf', () => {
    expect(chainRoute(cells, undefined)).toEqual({ order: [], source: null, appended: [] })
    expect(chainRoute(cells, { axis: 'col' }).source).toBeNull()
  })
  it('gezeichnet hat Vorrang; fremde Module fallen weg, neue hängen hinten an', () => {
    const r = chainRoute([...cells, [1, 3]], {
      start: 'tl',
      order: [
        [0, 2],
        [0, 1],
        [5, 5],
        [0, 1],
        [0, 0]
      ]
    })
    expect(r.source).toBe('drawn')
    expect(str(r.order)).toBe('02 01 00 03 13')
    expect(str(r.appended)).toBe('03 13')
  })
  it('gezeichnete Reihenfolge ganz ohne gültige Zellen: zurück auf die Schlange', () => {
    expect(chainRoute(cells, { start: 'tr', order: [[9, 9]] }).source).toBe('snake')
  })
  it('Hinweise: ohne Verlauf, nachzeichnen, lange Brücke', () => {
    const grid = [
      [0, 0, -1, 0],
      [1, 1, 2, 2]
    ]
    const routes = chainRoutes(grid, {
      '0': { start: 'tl' },
      '1': { order: [[1, 0]] }
    })
    expect(routeHints(routes, 'S').map((h) => h.text)).toEqual([
      'S1: 1 lange Brücke(n)',
      'S2: 1 Modul(e) nachzeichnen',
      'S3 ohne Verlauf'
    ])
  })
  it('fremde Schlüssel in den Metadaten zählen nicht („constructor“)', () => {
    const routes = chainRoutes([[0]], {} as Record<string, never>)
    expect(routes.get(0)?.source).toBeNull()
  })
})

describe('Pfeile als SVG', () => {
  const routes = new Map([[0, { order: rect(0, 0, 0, 2) }]])
  const o = { cell: 40, gap: 2, x0: 0, y0: 0, cols: 3, colors: ['#f00'], id: 'sig', mirror: false }
  it('Startpunkt, ein Pfeil je Schritt in Kettenfarbe, Marker je Plan eindeutig', () => {
    const svg = routeSvg(routes, o)
    expect(svg).toContain('<marker id="sig-0"')
    expect(svg.match(/<line /g)).toHaveLength(2)
    expect(svg.match(/marker-end="url\(#sig-0\)"/g)).toHaveLength(2)
    expect(svg).toContain('<circle cx="8" cy="8"')
    expect(routeSvg(new Map([[0, { order: [] }]]), o)).toBe('')
  })
  it('Backup-Leitung: „B“ am letzten Modul, nur für Ketten mit Backup', () => {
    const svg = routeSvg(routes, { ...o, backups: new Set([0]) })
    // letzte Zelle: Mitte 104/20, Ecke unten rechts +12
    expect(svg).toContain('<g data-backup="0"><circle cx="116" cy="32"')
    expect(svg).toContain('>B</text>')
    expect(routeSvg(routes, { ...o, backups: new Set([1]) })).not.toContain('data-backup')
  })
  it('von hinten gespiegelt: der Start liegt rechts', () => {
    expect(routeSvg(routes, { ...o, mirror: true })).toContain('<circle cx="92" cy="8"')
    expect(mirrorCorner('bl')).toBe('br')
  })
  it('kleine Zellen: Spitzen nur am Richtungswechsel und am Ende; Sprung gestrichelt', () => {
    const order: Cell[] = [
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 2],
      [3, 2]
    ]
    const svg = routeSvg(new Map([[0, { order }]]), { ...o, cell: 20 })
    // 01→02 (danach geht es nach unten) und 12→32 (Sprung und Ende); 00→01, 02→12 laufen gerade weiter
    expect(svg.match(/marker-end/g)).toHaveLength(2)
    expect(svg.match(/stroke-dasharray/g)).toHaveLength(1)
  })
})
