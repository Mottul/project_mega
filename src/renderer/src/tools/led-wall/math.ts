// Geometrie & Kennzahlen des LED-Wall-Konfigurators (reine Funktionen, getestet
// gegen den bestehenden HTML-Konfigurator – identische Ergebnisse).

import { BALLAST, MODULE_D, MODULE_W } from './data'

export function getBallastPerBase(heightM: number): number {
  if (heightM <= BALLAST[0].h) return BALLAST[0].kg
  for (const b of BALLAST) if (heightM <= b.h) return b.kg
  return BALLAST[BALLAST.length - 1].kg
}

export function gcd(a: number, b: number): number {
  a = Math.round(a)
  b = Math.round(b)
  while (b) [a, b] = [b, a % b]
  return a
}

export interface Fit169 {
  match: boolean
  side?: 'lr' | 'tb'
  barPx?: number
  cw?: number
  ch?: number
}

/** Passt 16:9-Content auf die Wandauflösung? Sonst: Balkenbreite + Nutzfläche. */
export function calc169(rx: number, ry: number): Fit169 | null {
  if (!rx || !ry) return null
  const a = rx / ry
  const t = 16 / 9
  if (Math.abs(a - t) < 0.01) return { match: true }
  if (a > t) {
    const cw = Math.round(ry * t)
    return { match: false, side: 'lr', barPx: Math.round((rx - cw) / 2), cw, ch: ry }
  }
  const ch = Math.round(rx / t)
  return { match: false, side: 'tb', barPx: Math.round((ry - ch) / 2), cw: rx, ch }
}

const deg2rad = (d: number): number => (d * Math.PI) / 180

export interface AngleDistribution {
  angles: number[]
  achieved: number
}

/** Verteilt einen Gesamtwinkel auf n Module in 2,5°-Schritten (max. 45°/Modul);
 *  größere Winkel in der Mitte, kleinere außen. */
export function distributeAngles(totalDeg: number, numModules: number): AngleDistribution {
  const step = 2.5
  const maxA = 45
  if (numModules <= 0) return { angles: [], achieved: 0 }
  totalDeg = Math.min(totalDeg, numModules * maxA)
  totalDeg = Math.round(totalDeg / step) * step
  if (totalDeg <= 0) return { angles: Array(numModules).fill(0), achieved: 0 }
  const base = Math.min(Math.floor(totalDeg / numModules / step) * step, maxA)
  const bump = Math.min(base + step, maxA)
  const rem = totalDeg - base * numModules
  let nBump = bump > base ? Math.round(rem / step) : 0
  nBump = Math.max(0, Math.min(nBump, numModules))
  const nLow = numModules - nBump
  const startLow = Math.floor(nLow / 2)
  const endLow = nLow - startLow
  const angles: number[] = []
  for (let i = 0; i < numModules; i++) {
    if (i < startLow || i >= numModules - endLow) angles.push(base)
    else angles.push(bump)
  }
  return { angles, achieved: angles.reduce((s, a) => s + a, 0) }
}

export interface Pt {
  x: number
  y: number
}

export interface ModuleShape {
  frontPts: Pt[]
  backPts: Pt[]
  angle: number
  cx: number
  cy: number
}

/** Draufsicht-Geometrie: Module als Polygonzüge (gebogene weich unterteilt). */
export function computeModuleShapes(angles: number[], mw = MODULE_W, md = MODULE_D): ModuleShape[] {
  const shapes: ModuleShape[] = []
  let x = 0
  let y = 0
  let heading = 0
  const SUBDIV = 8
  for (const aDeg of angles) {
    const aRad = deg2rad(aDeg)
    const frontPts: Pt[] = []
    const backPts: Pt[] = []
    if (Math.abs(aDeg) < 0.01) {
      const fl = { x, y }
      const fr = { x: x + mw * Math.cos(heading), y: y + mw * Math.sin(heading) }
      const bx = -Math.sin(heading) * md
      const by = Math.cos(heading) * md
      frontPts.push(fl, fr)
      backPts.push({ x: fl.x + bx, y: fl.y + by }, { x: fr.x + bx, y: fr.y + by })
      x = fr.x
      y = fr.y
    } else {
      const N = SUBDIV
      for (let s = 0; s <= N; s++) {
        const h = heading + aRad * (s / N)
        if (s === 0) frontPts.push({ x, y })
        else {
          const mH = heading + (aRad * (s - 0.5)) / N
          const step = mw / N
          x += step * Math.cos(mH)
          y += step * Math.sin(mH)
          frontPts.push({ x, y })
        }
        const bx = -Math.sin(h) * md
        const by = Math.cos(h) * md
        backPts.push({ x: frontPts[s].x + bx, y: frontPts[s].y + by })
      }
      heading += aRad
    }
    const allPts = [...frontPts, ...backPts]
    const cx = allPts.reduce((s, p) => s + p.x, 0) / allPts.length
    const cy = allPts.reduce((s, p) => s + p.y, 0) / allPts.length
    shapes.push({ frontPts, backPts, angle: aDeg, cx, cy })
  }
  return shapes
}

export interface ArcMeasure {
  chord: number
  sag: number
  first: Pt
  last: Pt
  chordAngle: number
}

/** Misst Sehne + Stichhöhe der tatsächlich gebauten Form.
 *  Hinweis: Der alte HTML-Konfigurator hatte hier einen Vorzeichenfehler in der
 *  Rotation („Erreichte Höhe“ zu groß angezeigt) – hier korrekt: Punkt um
 *  −chordAngle drehen, dann ist |y| der Abstand zur Sehne. */
export function measureArc(shapes: ModuleShape[]): ArcMeasure {
  if (!shapes.length) return { chord: 0, sag: 0, first: { x: 0, y: 0 }, last: { x: 0, y: 0 }, chordAngle: 0 }
  const first = shapes[0].frontPts[0]
  const lastShape = shapes[shapes.length - 1]
  const last = lastShape.frontPts[lastShape.frontPts.length - 1]
  const chordLen = Math.hypot(last.x - first.x, last.y - first.y)
  const chordAngle = Math.atan2(last.y - first.y, last.x - first.x)
  let maxDev = 0
  for (const s of shapes) {
    for (const p of s.frontPts) {
      const dx = p.x - first.x
      const dy = p.y - first.y
      const rotY = -dx * Math.sin(chordAngle) + dy * Math.cos(chordAngle)
      maxDev = Math.max(maxDev, Math.abs(rotY))
    }
  }
  return { chord: chordLen, sag: maxDev, first, last, chordAngle }
}

/** Grundfläche (Draufsicht-Bounding-Box) der gebauten Form: Breite × Tiefe in m.
 *  `chordHorizontal` misst in der Aufstell-Lage „Sehne waagrecht“ (Kreissegment) –
 *  identisch zur gezeichneten Draufsicht. */
export function measureFootprint(
  angles: number[],
  opts: { chordHorizontal?: boolean } = {}
): { width: number; depth: number } {
  if (!angles.length) return { width: 0, depth: 0 }
  const shapes = computeModuleShapes(angles)
  let rot = 0
  let origin: Pt = { x: 0, y: 0 }
  if (opts.chordHorizontal) {
    const measured = measureArc(shapes)
    rot = -measured.chordAngle
    origin = measured.first
  }
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const s of shapes) {
    for (const p of [...s.frontPts, ...s.backPts]) {
      const dx = p.x - origin.x
      const dy = p.y - origin.y
      const x = dx * Math.cos(rot) - dy * Math.sin(rot)
      const y = dx * Math.sin(rot) + dy * Math.cos(rot)
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }
  }
  return { width: maxX - minX, depth: maxY - minY }
}

export interface ArcResult {
  r: number
  totalDeg: number
  arcLen: number
  mods: number
  dist: AngleDistribution
  ca: number // geometrische Sehne der gebauten Form
  sa: number // geometrische Stichhöhe der gebauten Form
}

/** Kreissegment, das auf eine Bühne der Größe maxWidth × maxDepth passt.
 *  Liefert den GRÖSSTEN Bogen (meiste Module), dessen tatsächliche Grundfläche
 *  (Draufsicht-Bounding-Box in Aufstell-Lage, inkl. Modultiefe) noch in die Bühne
 *  passt. Anders als eine reine Sehne/Stich-Prüfung bleibt das auch über den
 *  Halbkreis hinaus korrekt: dort begrenzt nicht mehr die Sehne, sondern die
 *  Breite/Tiefe der belegten Fläche (≈ Durchmesser). 2,5°-Raster, max. 45°/Modul,
 *  0,5 m Modulbreite. ca/sa = geometrische Sehne/Stichhöhe der gebauten Form. */
export function calcArc(maxWidth: number, maxDepth: number): ArcResult | null {
  if (maxWidth <= 0 || maxDepth <= 0) return null
  const eps = 0.001
  // Obergrenze der Modulzahl: längster Bogen, der überhaupt in W×T passen kann
  // (grobe Schranke; nach unten wird iteriert, harter Deckel gegen Extremwerte).
  const nMax = Math.min(400, Math.max(1, Math.ceil((maxWidth + Math.PI * maxDepth) / MODULE_W) + 3))
  for (let n = nMax; n >= 1; n--) {
    const L = n * MODULE_W
    const tdCap = Math.min(n * 45, 360)
    let found: { td: number; dist: AngleDistribution; r: number } | null = null
    for (let td = 0; td <= tdCap + eps; td += 2.5) {
      const tr = deg2rad(td)
      const r = td < eps ? Infinity : L / tr
      // Sehne als billige Untergrenze der Grundflächenbreite (Breite ≥ |Sehne|):
      // klar zu breite Bögen ohne Geometrieberechnung überspringen (mit Spielraum
      // für die Diskretisierung, damit nie ein echter Treffer verworfen wird).
      const chordLB = td < eps ? L : 2 * r * Math.abs(Math.sin(tr / 2))
      if (chordLB > maxWidth + 0.2) continue
      const dist = distributeAngles(td, n)
      const fp = measureFootprint(dist.angles, { chordHorizontal: true })
      if (fp.width <= maxWidth + eps && fp.depth <= maxDepth + eps) {
        found = { td, dist, r }
        break // sanftester (kleinster) passender Bogen
      }
    }
    if (found) {
      const m = measureArc(computeModuleShapes(found.dist.angles))
      return { r: found.r, totalDeg: found.td, arcLen: L, mods: n, dist: found.dist, ca: m.chord, sa: m.sag }
    }
  }
  return null
}

export type BuilderSegment =
  | { type: 'straight'; count: number }
  | { type: 'curved'; count: number; angle: number; dir: 'convex' | 'concave' }

/** Builder-Segmente -> Winkel je Modul (konkav = negative Winkel). */
export function segsToAngles(segs: BuilderSegment[]): number[] {
  const angles: number[] = []
  for (const s of segs) {
    if (s.type === 'straight') {
      for (let i = 0; i < s.count; i++) angles.push(0)
    } else {
      const dir = s.dir === 'concave' ? -1 : 1
      const d = distributeAngles(Math.abs(s.angle || 0), s.count)
      for (const a of d.angles) angles.push(a * dir)
    }
  }
  return angles
}

export interface Squircle {
  segs: BuilderSegment[]
  cornerDist: AngleDistribution
  cornerR: number
  straightW: number
  straightD: number
  totalMods: number
}

/** Rechteck mit runden 90°-Ecken („Squircle“) aus Breite, Tiefe, Eck-Modulen. */
export function buildSquircle(widthM: number, depthM: number, cornerMods: number): Squircle {
  const cornerDist = distributeAngles(90, cornerMods)
  const cornerArc = cornerMods * MODULE_W
  const cornerR = cornerArc / (Math.PI / 2)
  const straightW = Math.max(0, Math.round((widthM - 2 * cornerR) / MODULE_W))
  const straightD = Math.max(0, Math.round((depthM - 2 * cornerR) / MODULE_W))
  const segs: BuilderSegment[] = (
    [
      { type: 'straight', count: straightW },
      { type: 'curved', count: cornerMods, angle: 90, dir: 'convex' },
      { type: 'straight', count: straightD },
      { type: 'curved', count: cornerMods, angle: 90, dir: 'convex' },
      { type: 'straight', count: straightW },
      { type: 'curved', count: cornerMods, angle: 90, dir: 'convex' },
      { type: 'straight', count: straightD },
      { type: 'curved', count: cornerMods, angle: 90, dir: 'convex' }
    ] as BuilderSegment[]
  ).filter((s) => s.count > 0)
  const totalMods = segs.reduce((s, seg) => s + seg.count, 0)
  return { segs, cornerDist, cornerR, straightW, straightD, totalMods }
}

/** Grid-Größe anpassen, vorhandene Zuordnungen im Überlappungsbereich behalten. */
export function resizeGrid(grid: number[][], rows: number, cols: number): number[][] {
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => grid[r]?.[c] ?? -1)
  )
}
