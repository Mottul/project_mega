import { catmullRom, TAU } from '../core/math'
import { Rng, seedFrom } from '../core/rng'
import { SURFACE, TEX_SCALE, TEX_SIZE } from './config'
import type { TrackDef } from './tracks'

export interface Waypoint {
  x: number
  y: number
  /** Fahrtrichtung an dieser Stelle. */
  dir: number
  /** Zurückgelegte Strecke bis hierher. */
  dist: number
}

/** Sichtbares Mauersegment (nur Arenen) - die Kollision liegt in der Karte. */
export interface WallPost {
  x: number
  y: number
  height: number
}

export interface DecorObject {
  x: number
  y: number
  kind: TrackDef['theme']['decor']
  /** Höhe in Welteinheiten. */
  height: number
  variant: number
}

export interface BuiltTrack {
  def: TrackDef
  /** RGBA-Textur der Fahrbahn, TEX_SIZE x TEX_SIZE. */
  color: Uint8ClampedArray
  /** Oberflächen-ID je Textur-Pixel. */
  surface: Uint8Array
  waypoints: Waypoint[]
  length: number
  decor: DecorObject[]
  walls: WallPost[]
  itemBoxes: { x: number; y: number }[]
  startGrid: { x: number; y: number; angle: number }[]
  minimap: HTMLCanvasElement
  /** Mittelpunkt/Radius für die Arena-Kamera. */
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
}

const CURB_WIDTH = 34

function makeCanvas(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('2D-Kontext nicht verfügbar')
  return { canvas, ctx }
}

/** Verdichtet die Stützpunkte zu einer weichen, geschlossenen Mittellinie. */
function buildCenterline(points: [number, number][], step = 26): Waypoint[] {
  const n = points.length
  const raw: { x: number; y: number }[] = []
  const at = (i: number) => points[((i % n) + n) % n]!

  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1)
    const p1 = at(i)
    const p2 = at(i + 1)
    const p3 = at(i + 2)
    const segLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1])
    const steps = Math.max(2, Math.round(segLen / step))
    for (let s = 0; s < steps; s++) {
      const t = s / steps
      raw.push({
        x: catmullRom(p0[0], p1[0], p2[0], p3[0], t),
        y: catmullRom(p0[1], p1[1], p2[1], p3[1], t),
      })
    }
  }

  const wps: Waypoint[] = []
  let dist = 0
  for (let i = 0; i < raw.length; i++) {
    const cur = raw[i]!
    const next = raw[(i + 1) % raw.length]!
    const prev = raw[(i - 1 + raw.length) % raw.length]!
    if (i > 0) dist += Math.hypot(cur.x - prev.x, cur.y - prev.y)
    wps.push({ x: cur.x, y: cur.y, dir: Math.atan2(next.y - cur.y, next.x - cur.x), dist })
  }
  return wps
}

function pathFrom(ctx: CanvasRenderingContext2D, wps: Waypoint[]): void {
  ctx.beginPath()
  ctx.moveTo(wps[0]!.x * TEX_SCALE, wps[0]!.y * TEX_SCALE)
  for (let i = 1; i < wps.length; i++) ctx.lineTo(wps[i]!.x * TEX_SCALE, wps[i]!.y * TEX_SCALE)
  ctx.closePath()
}

/** Zeichnet die Ziellinie als Schachbrett quer zur Fahrtrichtung. */
function drawStartLine(
  ctx: CanvasRenderingContext2D,
  wp: Waypoint,
  width: number,
  colors: [string, string]
): void {
  const cells = 10
  const cell = (width * TEX_SCALE) / cells
  ctx.save()
  ctx.translate(wp.x * TEX_SCALE, wp.y * TEX_SCALE)
  ctx.rotate(wp.dir)
  for (let row = 0; row < 2; row++) {
    for (let c = 0; c < cells; c++) {
      ctx.fillStyle = (row + c) % 2 === 0 ? colors[0] : colors[1]
      ctx.fillRect(row * cell - cell, c * cell - (cells * cell) / 2, cell, cell)
    }
  }
  ctx.restore()
}

function drawBoostPad(ctx: CanvasRenderingContext2D, wp: Waypoint, width: number, paint: string): void {
  const w = width * 0.62 * TEX_SCALE
  const l = 130 * TEX_SCALE
  ctx.save()
  ctx.translate(wp.x * TEX_SCALE, wp.y * TEX_SCALE)
  ctx.rotate(wp.dir)
  ctx.fillStyle = paint
  ctx.fillRect(-l / 2, -w / 2, l, w)
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  for (let i = 0; i < 3; i++) {
    const x = -l / 2 + 6 + i * (l / 3)
    ctx.beginPath()
    ctx.moveTo(x, -w / 2 + 3)
    ctx.lineTo(x + l / 5, 0)
    ctx.lineTo(x, w / 2 - 3)
    ctx.lineTo(x + l / 12, 0)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
}

/** Bemalt eine Fläche mit feinem Rauschen, damit die Textur nicht flach wirkt. */
function speckle(ctx: CanvasRenderingContext2D, rng: Rng, count: number, color: string, size: number): void {
  ctx.fillStyle = color
  for (let i = 0; i < count; i++) {
    const x = rng.range(0, TEX_SIZE)
    const y = rng.range(0, TEX_SIZE)
    ctx.fillRect(x, y, size, size)
  }
}

function buildRaceGeometry(
  def: TrackDef,
  wps: Waypoint[],
  ctx: CanvasRenderingContext2D,
  paint: (colorValue: string, surfaceId: number) => string,
  mode: 'color' | 'surface',
  rng: Rng
): void {
  const roadPx = def.roadWidth * TEX_SCALE
  const curbPx = roadPx + CURB_WIDTH * 2 * TEX_SCALE

  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  // Randstein: zwei Durchgänge, der zweite gestrichelt -> Wechselmuster.
  pathFrom(ctx, wps)
  ctx.lineWidth = curbPx
  ctx.strokeStyle = paint(def.theme.curb[0], SURFACE.CURB)
  ctx.stroke()
  ctx.save()
  ctx.setLineDash([26, 26])
  ctx.strokeStyle = paint(def.theme.curb[1], SURFACE.CURB)
  ctx.stroke()
  ctx.restore()

  // Fahrbahn
  pathFrom(ctx, wps)
  ctx.lineWidth = roadPx
  ctx.strokeStyle = paint(def.theme.road[0], SURFACE.ROAD)
  ctx.stroke()

  // Asphalt-Struktur: nur in der Farbtextur und nur innerhalb der Fahrbahn.
  if (mode === 'color') {
    ctx.save()
    pathFrom(ctx, wps)
    ctx.lineWidth = roadPx
    // Der Strich selbst dient als Clip-Region.
    ctx.strokeStyle = def.theme.road[1]
    ctx.setLineDash([90, 140])
    ctx.lineDashOffset = rng.range(0, 230)
    ctx.lineWidth = roadPx * 0.5
    ctx.globalAlpha = 0.35
    ctx.stroke()
    ctx.globalAlpha = 1
    ctx.restore()
  }
}

/** Zeichnet die Streckenoberfläche in eine der beiden Ebenen (Farbe/Kollision). */
function paintTrack(
  def: TrackDef,
  wps: Waypoint[],
  ctx: CanvasRenderingContext2D,
  mode: 'color' | 'surface'
): void {
  const rng = new Rng(seedFrom(def.id + mode))
  const theme = def.theme
  const idColor = (id: number) => `rgb(${id},0,0)`
  const paint = (colorValue: string, surfaceId: number) =>
    mode === 'color' ? colorValue : idColor(surfaceId)

  // Untergrund
  ctx.fillStyle = paint(
    theme.abyss ? '#05030d' : theme.ground[0],
    theme.abyss ? SURFACE.VOID : SURFACE.OFFROAD
  )
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE)

  if (mode === 'color' && !theme.abyss) {
    // Grober Schachbrett-Untergrund im 16-Bit-Stil plus Rauschen.
    // Der zweite Geländeton wird nur angedeutet - ein hartes Schachbrett
    // lenkt vom Streckenverlauf ab.
    ctx.save()
    ctx.globalAlpha = 0.5
    ctx.fillStyle = theme.ground[1]
    const cell = 24
    for (let y = 0; y < TEX_SIZE; y += cell) {
      for (let x = 0; x < TEX_SIZE; x += cell) {
        if (((x / cell + y / cell) & 1) === 0) continue
        ctx.fillRect(x, y, cell, cell)
      }
    }
    ctx.restore()
    speckle(ctx, rng, 6000, 'rgba(255,255,255,0.05)', 2)
    speckle(ctx, rng, 4000, 'rgba(0,0,0,0.07)', 2)
  }

  if (def.kind === 'battle') {
    paintArena(def, ctx, mode, paint, rng)
    return
  }

  buildRaceGeometry(def, wps, ctx, paint, mode, rng)

  // Boost-Felder
  for (const p of def.boostAt) {
    const wp = wps[Math.floor(p * wps.length) % wps.length]!
    if (mode === 'color') drawBoostPad(ctx, wp, def.roadWidth, '#2f6bd8')
    else {
      ctx.save()
      ctx.translate(wp.x * TEX_SCALE, wp.y * TEX_SCALE)
      ctx.rotate(wp.dir)
      ctx.fillStyle = idColor(SURFACE.BOOST)
      ctx.fillRect(
        (-130 * TEX_SCALE) / 2,
        (-def.roadWidth * 0.62 * TEX_SCALE) / 2,
        130 * TEX_SCALE,
        def.roadWidth * 0.62 * TEX_SCALE
      )
      ctx.restore()
    }
  }

  if (mode === 'color') {
    drawStartLine(ctx, wps[0]!, def.roadWidth, ['#f6f6f8', '#22222c'])
    // Fahrbahnmarkierung in der Mitte
    ctx.save()
    pathFrom(ctx, wps)
    ctx.setLineDash([18, 30])
    ctx.lineWidth = Math.max(1, 6 * TEX_SCALE * 4)
    ctx.strokeStyle = 'rgba(255,255,255,0.16)'
    ctx.stroke()
    ctx.restore()
  }
}

function paintArena(
  def: TrackDef,
  ctx: CanvasRenderingContext2D,
  mode: 'color' | 'surface',
  paint: (c: string, s: number) => string,
  rng: Rng
): void {
  const [a, b, c] = [def.points[0]!, def.points[1]!, def.points[2]!]
  const x0 = Math.min(a[0], b[0], c[0])
  const y0 = Math.min(a[1], b[1], c[1])
  const x1 = Math.max(a[0], b[0], c[0])
  const y1 = Math.max(a[1], b[1], c[1])
  const wall = 120

  const rect = (wx: number, wy: number, ww: number, wh: number) =>
    ctx.fillRect(wx * TEX_SCALE, wy * TEX_SCALE, ww * TEX_SCALE, wh * TEX_SCALE)

  // Boden
  ctx.fillStyle = paint(def.theme.road[0], SURFACE.ROAD)
  rect(x0, y0, x1 - x0, y1 - y0)

  if (mode === 'color') {
    ctx.fillStyle = def.theme.road[1]
    const cell = 64
    for (let y = y0; y < y1; y += cell * 4) {
      for (let x = x0; x < x1; x += cell * 4) {
        if ((((x - x0) / (cell * 4) + (y - y0) / (cell * 4)) & 1) === 0) continue
        rect(x, y, cell * 4, cell * 4)
      }
    }
    speckle(ctx, rng, 3000, 'rgba(255,255,255,0.04)', 2)
  }

  // Außenmauern
  ctx.fillStyle = paint(def.theme.curb[0], SURFACE.WALL)
  rect(x0 - wall, y0 - wall, x1 - x0 + wall * 2, wall)
  rect(x0 - wall, y1, x1 - x0 + wall * 2, wall)
  rect(x0 - wall, y0, wall, y1 - y0)
  rect(x1, y0, wall, y1 - y0)

  // Hindernisse
  for (const [bx, by, bw, bh] of def.blocks ?? []) {
    ctx.fillStyle = paint(def.theme.curb[0], SURFACE.WALL)
    rect(bx - bw, by - bh, bw * 2, bh * 2)
    if (mode === 'color') {
      ctx.fillStyle = def.theme.curb[1]
      rect(bx - bw + 18, by - bh + 18, bw * 2 - 36, bh * 2 - 36)
    }
  }
}

function extractSurface(ctx: CanvasRenderingContext2D): Uint8Array {
  const data = ctx.getImageData(0, 0, TEX_SIZE, TEX_SIZE).data
  const out = new Uint8Array(TEX_SIZE * TEX_SIZE)
  for (let i = 0, p = 0; i < out.length; i++, p += 4) out[i] = data[p]!
  return out
}

function buildDecor(def: TrackDef, wps: Waypoint[]): DecorObject[] {
  if (def.theme.decor === 'none') return []
  const rng = new Rng(seedFrom(def.id + 'decor'))
  const out: DecorObject[] = []
  const spacing = def.theme.decor === 'pylon' ? 9 : 7
  for (let i = 4; i < wps.length; i += spacing) {
    const wp = wps[i]!
    for (const side of [-1, 1] as const) {
      if (def.theme.decor !== 'pylon' && rng.next() < 0.35) continue
      const off = def.roadWidth / 2 + rng.range(70, 210)
      const nx = Math.cos(wp.dir + Math.PI / 2) * off * side
      const ny = Math.sin(wp.dir + Math.PI / 2) * off * side
      out.push({
        x: wp.x + nx,
        y: wp.y + ny,
        kind: def.theme.decor,
        height: rng.range(105, 185),
        variant: rng.int(0, 2),
      })
    }
  }
  return out
}

/**
 * Mode 7 kann keine Geometrie aufstellen - Wände wären sonst nur Bemalung.
 * Deshalb wird die Mauerkante mit Billboards abgesteckt.
 */
function buildWalls(def: TrackDef): WallPost[] {
  if (def.kind !== 'battle') return []
  const posts: WallPost[] = []
  const step = 88
  const height = 96

  const edge = (x0: number, y0: number, x1: number, y1: number) => {
    const len = Math.hypot(x1 - x0, y1 - y0)
    const n = Math.max(1, Math.round(len / step))
    for (let i = 0; i <= n; i++) {
      posts.push({ x: x0 + ((x1 - x0) * i) / n, y: y0 + ((y1 - y0) * i) / n, height })
    }
  }
  const rectEdges = (x0: number, y0: number, x1: number, y1: number) => {
    edge(x0, y0, x1, y0)
    edge(x1, y0, x1, y1)
    edge(x1, y1, x0, y1)
    edge(x0, y1, x0, y0)
  }

  const xs = def.points.map((p) => p[0])
  const ys = def.points.map((p) => p[1])
  rectEdges(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys))
  for (const [bx, by, bw, bh] of def.blocks ?? []) {
    rectEdges(bx - bw, by - bh, bx + bw, by + bh)
  }
  return posts
}

/** Innenmaße einer Arena: Mittelpunkt und kleinster Halbabstand zur Wand. */
function arenaMetrics(def: TrackDef): { cx: number; cy: number; half: number } {
  const xs = def.points.map((p) => p[0])
  const ys = def.points.map((p) => p[1])
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  const y0 = Math.min(...ys)
  const y1 = Math.max(...ys)
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, half: Math.min(x1 - x0, y1 - y0) / 2 }
}

/** True, wenn der Punkt in einem Hindernis (plus Sicherheitsabstand) liegt. */
function insideBlock(def: TrackDef, x: number, y: number, margin: number): boolean {
  for (const [bx, by, bw, bh] of def.blocks ?? []) {
    if (Math.abs(x - bx) < bw + margin && Math.abs(y - by) < bh + margin) return true
  }
  return false
}

function buildItemBoxes(def: TrackDef, wps: Waypoint[]): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = []
  if (def.kind === 'battle') {
    const { cx, cy, half } = arenaMetrics(def)
    for (let ring = 0; ring < 2; ring++) {
      const r = half * (ring === 0 ? 0.34 : 0.68)
      const count = 6 + ring * 6
      for (let i = 0; i < count; i++) {
        const a = (i / count) * TAU + ring * 0.35
        const x = cx + Math.cos(a) * r
        const y = cy + Math.sin(a) * r
        if (insideBlock(def, x, y, 70)) continue
        out.push({ x, y })
      }
    }
    return out
  }
  for (const p of def.itemsAt) {
    const wp = wps[Math.floor(p * wps.length) % wps.length]!
    const nx = Math.cos(wp.dir + Math.PI / 2)
    const ny = Math.sin(wp.dir + Math.PI / 2)
    for (let i = -2; i <= 2; i++) {
      const off = (i * def.roadWidth) / 6
      out.push({ x: wp.x + nx * off, y: wp.y + ny * off })
    }
  }
  return out
}

function buildStartGrid(
  def: TrackDef,
  wps: Waypoint[],
  count: number
): { x: number; y: number; angle: number }[] {
  const grid: { x: number; y: number; angle: number }[] = []
  if (def.kind === 'battle') {
    const { cx, cy, half } = arenaMetrics(def)
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU
      // Startring innerhalb der Mauern; bei Bedarf nach innen ausweichen.
      let r = half * 0.78
      while (r > half * 0.25 && insideBlock(def, cx + Math.cos(a) * r, cy + Math.sin(a) * r, 90)) r -= 60
      grid.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, angle: a + Math.PI })
    }
    return grid
  }
  // Startaufstellung: zwei Spalten, versetzt hinter der Ziellinie.
  for (let i = 0; i < count; i++) {
    const back = 150 + Math.floor(i / 2) * 175
    const totalDist = wps[wps.length - 1]!.dist + 26
    const target = (totalDist - back) % totalDist
    const wp = nearestByDist(wps, target)
    const side = i % 2 === 0 ? -1 : 1
    const off = (side * def.roadWidth) / 5
    grid.push({
      x: wp.x + Math.cos(wp.dir + Math.PI / 2) * off,
      y: wp.y + Math.sin(wp.dir + Math.PI / 2) * off,
      angle: wp.dir,
    })
  }
  return grid
}

function nearestByDist(wps: Waypoint[], dist: number): Waypoint {
  let lo = 0
  let hi = wps.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (wps[mid]!.dist < dist) lo = mid + 1
    else hi = mid
  }
  return wps[lo]!
}

function buildMinimap(colorCanvas: HTMLCanvasElement): HTMLCanvasElement {
  const size = 160
  const { canvas, ctx } = makeCanvas(size)
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(colorCanvas, 0, 0, size, size)
  return canvas
}

export function buildTrack(def: TrackDef, kartCount: number): BuiltTrack {
  const wps = buildCenterline(def.points)

  const colorLayer = makeCanvas(TEX_SIZE)
  paintTrack(def, wps, colorLayer.ctx, 'color')
  const color = colorLayer.ctx.getImageData(0, 0, TEX_SIZE, TEX_SIZE).data as unknown as Uint8ClampedArray

  const surfaceLayer = makeCanvas(TEX_SIZE)
  surfaceLayer.ctx.imageSmoothingEnabled = false
  paintTrack(def, wps, surfaceLayer.ctx, 'surface')
  const surface = extractSurface(surfaceLayer.ctx)

  const xs = def.points.map((p) => p[0])
  const ys = def.points.map((p) => p[1])

  return {
    def,
    color,
    surface,
    waypoints: wps,
    length:
      wps[wps.length - 1]!.dist +
      Math.hypot(wps[0]!.x - wps[wps.length - 1]!.x, wps[0]!.y - wps[wps.length - 1]!.y),
    decor: buildDecor(def, wps),
    walls: buildWalls(def),
    itemBoxes: buildItemBoxes(def, wps),
    startGrid: buildStartGrid(def, wps, kartCount),
    minimap: buildMinimap(colorLayer.canvas),
    bounds: { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) },
  }
}

/** Oberfläche an einer Weltposition. Außerhalb der Karte gilt VOID. */
export function surfaceAt(track: BuiltTrack, x: number, y: number): number {
  const tx = Math.floor(x * TEX_SCALE)
  const ty = Math.floor(y * TEX_SCALE)
  if (tx < 0 || ty < 0 || tx >= TEX_SIZE || ty >= TEX_SIZE) return SURFACE.VOID
  return track.surface[ty * TEX_SIZE + tx]!
}

/**
 * Findet den nächstgelegenen Wegpunkt. Die Suche startet beim letzten Treffer,
 * damit sie O(1) bleibt und Abkürzungen quer über die Karte nicht zählen.
 */
export function nearestWaypoint(track: BuiltTrack, x: number, y: number, hint: number): number {
  const wps = track.waypoints
  const n = wps.length
  let best = hint
  let bestD = Infinity
  const span = 46
  for (let k = -span; k <= span; k++) {
    const i = (((hint + k) % n) + n) % n
    const wp = wps[i]!
    const d = (wp.x - x) ** 2 + (wp.y - y) ** 2
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

/** Vollständige Suche - für Respawn und Initialisierung. */
export function nearestWaypointGlobal(track: BuiltTrack, x: number, y: number): number {
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < track.waypoints.length; i++) {
    const wp = track.waypoints[i]!
    const d = (wp.x - x) ** 2 + (wp.y - y) ** 2
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}
