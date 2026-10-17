// Kabelverlauf des LED-Wall-Konfigurators – rein und getestet (cabling.test.ts), eine Quelle für
// Bildschirm und PDF (wie topdown.ts). Der Verlauf wird nur von Hand festgelegt (Plan, Festlegung
// 24): je Kette eine Startecke ihres Bereichs plus Richtung (Schlange wie die 8 Muster in NovaLCT)
// oder eine gezeichnete Reihenfolge. Ohne beides hat eine Kette keinen Verlauf – keine Pfeile.
//
// Alles steht in der Ansicht von vorne (Zeile 0 oben, Spalte 0 links). Die Ansicht von hinten
// spiegelt nur die Darstellung (`mirror`), nie die Daten.

import type { ChainRoute, Corner } from './config'

/** [Zeile, Spalte] */
export type Cell = [number, number]

const key = (c: Cell): string => `${c[0]},${c[1]}`

/** Module je Kette (Zeile für Zeile) – die eine Zählung für Raster, Legende, PDF und Packliste */
export function chainCells(grid: number[][]): Map<number, Cell[]> {
  const out = new Map<number, Cell[]>()
  grid.forEach((row, r) =>
    row.forEach((v, c) => {
      if (v < 0) return
      const l = out.get(v)
      if (l) l.push([r, c])
      else out.set(v, [[r, c]])
    })
  )
  return out
}

export function chainCounts(grid: number[][]): Map<number, number> {
  return new Map([...chainCells(grid)].map(([k, v]) => [k, v.length]))
}

/** Ketten und Brücken für die Packliste: je Kette 1 Einspeisung + (Module − 1) Brücken */
export function chainStats(grid: number[][]): { chains: number; jumpers: number } {
  let jumpers = 0
  const counts = chainCounts(grid)
  for (const n of counts.values()) jumpers += Math.max(0, n - 1)
  return { chains: counts.size, jumpers }
}

/**
 * Schlange über die Module einer Kette: Linien (Reihen bei „waagrecht“, Spalten bei „senkrecht“)
 * von der Startecke aus, jede zweite rückwärts. Auch für Bereiche, die kein Rechteck sind:
 * Linien ohne Modul der Kette zählen nicht mit.
 */
export function snake(cells: Cell[], start: Corner, axis: 'row' | 'col' = 'row'): Cell[] {
  if (!cells.length) return []
  const top = start[0] === 't'
  const left = start[1] === 'l'
  const lineOf = (c: Cell): number => (axis === 'row' ? c[0] : c[1])
  const posOf = (c: Cell): number => (axis === 'row' ? c[1] : c[0])
  const firstLineAsc = axis === 'row' ? top : left
  const firstPosAsc = axis === 'row' ? left : top
  const lines = new Map<number, Cell[]>()
  for (const c of cells) {
    const l = lines.get(lineOf(c))
    if (l) l.push(c)
    else lines.set(lineOf(c), [c])
  }
  const order = [...lines.keys()].sort((a, b) => (firstLineAsc ? a - b : b - a))
  const out: Cell[] = []
  order.forEach((ln, i) => {
    const asc = i % 2 === 0 ? firstPosAsc : !firstPosAsc
    out.push(...lines.get(ln)!.sort((a, b) => (asc ? posOf(a) - posOf(b) : posOf(b) - posOf(a))))
  })
  return out
}

export interface ChainRouteResult {
  /** Reihenfolge der Module; leer = kein Verlauf festgelegt */
  order: Cell[]
  source: 'drawn' | 'snake' | null
  /** beim Abgleich hinten angehängt (seit dem Zeichnen neu in der Kette) – „nachzeichnen“ */
  appended: Cell[]
}

/**
 * Verlauf einer Kette: die gezeichnete Reihenfolge hat Vorrang (Module, die nicht mehr in der
 * Kette sind, fallen weg; neue hängen hinten an und sind markiert), sonst die Schlange aus
 * Startecke und Richtung, sonst keiner. So müssen Klicks auf Module die Reihenfolge nie mitpflegen.
 */
export function chainRoute(cells: Cell[], meta: ChainRoute | undefined): ChainRouteResult {
  if (meta?.order?.length) {
    const inChain = new Set(cells.map(key))
    const seen = new Set<string>()
    const order: Cell[] = []
    for (const c of meta.order) {
      const k = key(c)
      if (inChain.has(k) && !seen.has(k)) {
        seen.add(k)
        order.push([c[0], c[1]])
      }
    }
    const appended = cells.filter((c) => !seen.has(key(c)))
    if (order.length) return { order: [...order, ...appended], source: 'drawn', appended }
  }
  if (meta?.start)
    return { order: snake(cells, meta.start, meta.axis ?? 'row'), source: 'snake', appended: [] }
  return { order: [], source: null, appended: [] }
}

/** Verlauf aller Ketten eines Rasters */
export function chainRoutes(
  grid: number[][],
  meta: Record<string, ChainRoute>
): Map<number, ChainRouteResult & { cells: Cell[] }> {
  const out = new Map<number, ChainRouteResult & { cells: Cell[] }>()
  for (const [chain, cells] of chainCells(grid)) {
    const m = Object.hasOwn(meta, String(chain)) ? meta[String(chain)] : undefined
    out.set(chain, { ...chainRoute(cells, m), cells })
  }
  return out
}

/** Zwei Module berühren sich an einer Kante (Kabel von Modul zu Modul) */
export const adjacent = (a: Cell, b: Cell): boolean =>
  Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1

/** Ecke links/rechts tauschen – für die Ansicht von hinten */
export function mirrorCorner(c: Corner): Corner {
  return `${c[0]}${c[1] === 'l' ? 'r' : 'l'}` as Corner
}

export const CORNER_LABELS: Record<Corner, string> = {
  tl: 'oben links',
  tr: 'oben rechts',
  bl: 'unten links',
  br: 'unten rechts'
}

export interface RouteSvgOptions {
  /** Kantenlänge einer Zelle und Abstand zwischen Zellen (px) */
  cell: number
  gap: number
  /** Lage der ersten Zelle im SVG */
  x0: number
  y0: number
  cols: number
  colors: string[]
  /** eindeutig je Plan (Signal und Strom stehen im selben PDF): Marker-IDs */
  id: string
  /** Ansicht von hinten: Spalten gespiegelt */
  mirror: boolean
}

/**
 * Pfeile des Verlaufs als SVG-Teil (ohne <svg>): je Kette in ihrer Farbe, Start mit Punkt,
 * Sprünge zwischen nicht benachbarten Modulen gestrichelt („lange Brücke“). Bei kleinen Zellen
 * Pfeilspitzen nur an Richtungswechseln und am Ende – sonst sähe man nur Spitzen.
 */
export function routeSvg(routes: Map<number, { order: Cell[] }>, o: RouteSvgOptions): string {
  const step = o.cell + o.gap
  const n = (v: number): number => Math.round(v * 10) / 10
  const cx = (c: Cell): number => o.x0 + (o.mirror ? o.cols - 1 - c[1] : c[1]) * step + o.cell / 2
  const cy = (c: Cell): number => o.y0 + c[0] * step + o.cell / 2
  const small = o.cell < 26
  const sw = Math.max(1.2, Math.min(2.4, o.cell / 14))
  // Pfeile laufen zwischen den Modulen (wie die Kabel), nicht durch die Mitte – dort steht „S1“
  const inset = o.cell * 0.3
  let defs = ''
  let body = ''
  for (const [chain, { order }] of routes) {
    if (!order.length) continue
    const col = o.colors[chain % o.colors.length]
    const mid = `${o.id}-${chain}`
    defs += `<marker id="${mid}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="${small ? 4 : 5}" markerHeight="${small ? 4 : 5}" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${col}"/></marker>`
    // Start: Punkt in der oberen linken Ecke des ersten Moduls, die Beschriftung bleibt lesbar
    const r = Math.max(2.5, o.cell * 0.12)
    const off = o.cell * 0.3
    body += `<circle cx="${n(cx(order[0]) - off)}" cy="${n(cy(order[0]) - off)}" r="${n(r)}" fill="${col}" stroke="#fff" stroke-width="1"/>`
    for (let i = 0; i + 1 < order.length; i++) {
      const a = order[i]
      const b = order[i + 1]
      const len = Math.hypot(cx(b) - cx(a), cy(b) - cy(a)) || 1
      const ux = (cx(b) - cx(a)) / len
      const uy = (cy(b) - cy(a)) / len
      const ax = cx(a) + ux * inset
      const ay = cy(a) + uy * inset
      const ex = cx(b) - ux * inset
      const ey = cy(b) - uy * inset
      const next = order[i + 2]
      const turns =
        !next ||
        Math.sign(next[0] - b[0]) !== Math.sign(b[0] - a[0]) ||
        Math.sign(next[1] - b[1]) !== Math.sign(b[1] - a[1])
      const jump = !adjacent(a, b)
      const tip = !small || turns || jump ? ` marker-end="url(#${mid})"` : ''
      body += `<line x1="${n(ax)}" y1="${n(ay)}" x2="${n(ex)}" y2="${n(ey)}" stroke="${col}" stroke-width="${sw}" stroke-linecap="round"${jump ? ' stroke-dasharray="4 3"' : ''}${tip}/>`
    }
  }
  return defs ? `<defs>${defs}</defs>${body}` : ''
}

export interface ChainHint {
  chain: number
  text: string
}

/** Hinweise zum Verlauf: Ketten ohne Verlauf, nachzuzeichnende Module, Sprünge */
export function routeHints(
  routes: Map<number, ChainRouteResult & { cells: Cell[] }>,
  prefix: string
): ChainHint[] {
  const out: ChainHint[] = []
  for (const [chain, r] of [...routes].sort((a, b) => a[0] - b[0])) {
    const name = `${prefix}${chain + 1}`
    if (!r.source) out.push({ chain, text: `${name} ohne Verlauf` })
    else if (r.appended.length)
      out.push({ chain, text: `${name}: ${r.appended.length} Modul(e) nachzeichnen` })
    let jumps = 0
    for (let i = 0; i + 1 < r.order.length; i++) if (!adjacent(r.order[i], r.order[i + 1])) jumps++
    if (jumps) out.push({ chain, text: `${name}: ${jumps} lange Brücke(n)` })
  }
  return out
}
