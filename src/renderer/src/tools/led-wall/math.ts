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
const rad2deg = (r: number): number => (r * 180) / Math.PI

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
  if (!shapes.length)
    return { chord: 0, sag: 0, first: { x: 0, y: 0 }, last: { x: 0, y: 0 }, chordAngle: 0 }
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
  ca: number // erreichte Sehne
  sa: number // erreichte Stichhöhe
}

/** Kreissegment aus Sehne + Stichhöhe – sucht den größten Bogen, der INNERHALB
 *  der Vorgaben bleibt (2,5°-Raster, max. 45°/Modul, 0,5 m Modulbreite). */
export function calcArc(chord: number, sag: number): ArcResult | null {
  if (chord <= 0 || sag <= 0) return null
  const rIdeal = (chord * chord) / (8 * sag) + sag / 2
  const thetaIdeal = 2 * Math.atan2(chord / 2, rIdeal - sag)
  const arcLenIdeal = rIdeal * thetaIdeal
  const nIdeal = Math.max(1, Math.round(arcLenIdeal / MODULE_W))
  for (let n = nIdeal + 2; n >= 1; n--) {
    const maxTd = Math.min(n * 45, Math.ceil(rad2deg(thetaIdeal) / 2.5) * 2.5 + 10)
    for (let td = maxTd; td >= 2.5; td -= 2.5) {
      const tr = deg2rad(td)
      const r = (n * MODULE_W) / tr
      const ca = 2 * r * Math.sin(tr / 2)
      const sa = r * (1 - Math.cos(tr / 2))
      // grobe Vorauswahl ueber die Idealkreis-Form (spart Geometrieberechnung) ...
      if (ca > chord + 0.1 || sa > sag + 0.1) continue
      // ... entschieden wird aber an der ECHTEN Form: die 2,5°-Verteilung (hoehere
      // Winkel mittig) baut minimal anders als der Idealkreis.
      const dist = distributeAngles(td, n)
      const measured = measureArc(computeModuleShapes(dist.angles))
      if (measured.chord <= chord + 0.001 && measured.sag <= sag + 0.001) {
        return {
          r,
          totalDeg: td,
          arcLen: n * MODULE_W,
          mods: n,
          dist,
          ca: measured.chord,
          sa: measured.sag
        }
      }
    }
  }
  return null
}

/** Größte Modulzahl, für die die Liste der Formen gerechnet wird (= größtes Raster je Seite in
 *  config.ts; darüber legt das Werkzeug ohnehin keine Wand an). */
const ARC_MODS_MAX = 1000
const arcCache = new Map<number, ArcResult[]>()

/**
 * Alle baubaren Kreissegmente aus `mods` Modulen (feste Bogenlänge), flachste zuerst: Gesamtwinkel
 * im 2,5°-Raster bis zum Halbkreis, höchstens 45° je Modul. Sehne und Stichhöhe gemessen an der
 * ECHTEN Form wie bei calcArc – die 2,5°-Verteilung (höhere Winkel mittig) baut tiefer als der
 * Idealkreis. Über den Halbkreis hinaus nicht: Dort würde die Stichhöhe wieder flacher, eine
 * Stichhöhe passte dann zu zwei Formen. Das Ergebnis wird zwischengespeichert – nicht verändern.
 */
export function arcOptions(mods: number): ArcResult[] {
  if (!Number.isInteger(mods) || mods < 1 || mods > ARC_MODS_MAX) return []
  const hit = arcCache.get(mods)
  if (hit) return hit
  const out: ArcResult[] = []
  const arcLen = mods * MODULE_W
  const maxDeg = Math.min(180, mods * 45)
  for (let i = 1; i * 2.5 <= maxDeg; i++) {
    const td = i * 2.5
    const dist = distributeAngles(td, mods)
    const measured = measureArc(computeModuleShapes(dist.angles))
    out.push({
      r: arcLen / deg2rad(td),
      totalDeg: td,
      arcLen,
      mods,
      dist,
      ca: measured.chord,
      sa: measured.sag
    })
  }
  if (arcCache.size >= 8) arcCache.delete(arcCache.keys().next().value as number)
  arcCache.set(mods, out)
  return out
}

/** Zeile, deren Stichhöhe der gewünschten am nächsten liegt (gleich nah: die flachere). */
function nearestArc(options: ArcResult[], sag: number): number {
  let best = 0
  for (let i = 1; i < options.length; i++) {
    if (Math.abs(options[i].sa - sag) < Math.abs(options[best].sa - sag)) best = i
  }
  return best
}

export interface ArcFit {
  /** alle baubaren Formen dieser Bogenlänge, flachste zuerst (arcOptions) */
  options: ArcResult[]
  /** gewählte Zeile: die Stichhöhe, die der gewünschten am nächsten liegt; −1 = keine gültige
   *  Stichhöhe (0, negativ, keine Zahl) – die Liste gibt es trotzdem, eine Zeile übernimmt eine */
  index: number
  /** Wunsch außerhalb der Liste: flacher als die flachste oder tiefer als die tiefste Form */
  outside: 'flacher' | 'tiefer' | null
}

/**
 * Kreissegment aus Bogenlänge (Breite der LED-Fläche entlang der Kurve, auf ganze Module
 * gerundet) und gewünschter Stichhöhe. Weil die Winkel im 2,5°-Raster liegen, gibt es zu einer
 * Modulzahl nur bestimmte Stichhöhen – gewählt wird die nächste baubare. null = keine Form mit
 * dieser Breite (weniger als ein Modul, keine Zahl, größer als das größte Raster).
 */
export function fitArcLength(arcLen: number, sag: number): ArcFit | null {
  if (!Number.isFinite(arcLen)) return null
  const options = arcOptions(Math.round(arcLen / MODULE_W))
  if (!options.length) return null
  if (!Number.isFinite(sag) || sag <= 0) return { options, index: -1, outside: null }
  const index = nearestArc(options, sag)
  const outside =
    sag < options[0].sa - 0.001
      ? 'flacher'
      : sag > options[options.length - 1].sa + 0.001
        ? 'tiefer'
        : null
  return { options, index, outside }
}

/**
 * Stichhöhe einer Zeile als Text fürs Eingabefeld: drei Nachkommastellen, mehr nur, wo zwei
 * Zeilen so nah liegen, dass der kurze Text die Nachbarzeile träfe (bei 12 Modulen 175° und
 * 177,5°: 0,5 mm). So markiert die Liste nach einem Tipp genau die getippte Zeile.
 */
export function sagInputFor(options: ArcResult[], index: number): string {
  const sa = options[index].sa
  let text = sa.toFixed(6)
  for (let digits = 3; digits < 6; digits++) {
    if (nearestArc(options, Number(sa.toFixed(digits))) === index) {
      text = sa.toFixed(digits)
      break
    }
  }
  return text.replace('.', ',')
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
