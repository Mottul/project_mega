// Wand-Kennzahlen aus dem Konfigurator-Zustand – als reine Funktion, damit sie
// die Hauptansicht UND die Packliste teilen (eine Quelle der Wahrheit).

import { parseNum } from '../_calc/ui'
import { computeCurve, type CurveComputed } from './curve'
import { MODULES } from './data'
import { calc169, gcd, getBallastPerBase, type Fit169 } from './math'
import type { BuilderSegment } from './math'
import type { CurveMode } from './store'

export interface WallInput {
  moduleKey: string
  widthM: string
  heightM: string
  curveMode: CurveMode
  segSag: string
  builderSegs: BuilderSegment[]
  sqD: string
  sqCorner: number
  selectedCircle: number
}

export interface WallMetrics {
  mod: (typeof MODULES)[string]
  curve: CurveComputed | null
  cols: number
  rows: number
  total: number
  actualW: string
  actualH: string
  resX: number
  resY: number
  ratioW: number
  ratioH: number
  fit169: Fit169 | null
  weightKg: string
  powerTypW: number
  powerMaxW: number
  ampsTyp: string
  ampsMax: string
  ballastPerBase: number
  baseUnits: number
  totalBallast: number
}

export function computeWall(s: WallInput): WallMetrics {
  const mod = MODULES[s.moduleKey] ?? MODULES['496-2,0']
  const wM = parseNum(s.widthM) ?? 0.5
  const hM = parseNum(s.heightM) ?? 0.5

  const curve = mod.canCurve
    ? computeCurve({
        curveMode: s.curveMode,
        widthM: parseNum(s.widthM),
        segSag: parseNum(s.segSag),
        builderSegs: s.builderSegs,
        sqD: parseNum(s.sqD),
        sqCorner: s.sqCorner,
        selectedCircle: s.selectedCircle
      })
    : null

  const cols = curve ? Math.max(1, curve.mods) : Math.max(1, Math.round(wM / (mod.dimW / 1000)))
  const rows = Math.max(1, Math.round(hM / (mod.dimH / 1000)))
  const total = cols * rows
  const floorWidthM = curve ? curve.footprintW : (cols * mod.dimW) / 1000
  const actualW = floorWidthM.toFixed(3)
  const actualH = ((rows * mod.dimH) / 1000).toFixed(3)
  const resX = cols * mod.resX
  const resY = rows * mod.resY
  const g = gcd(resX, resY)
  const powerTypW = total * mod.powerTyp
  const powerMaxW = total * mod.powerMax
  const ballastPerBase = getBallastPerBase(parseFloat(actualH))
  const baseUnits = Math.max(1, Math.ceil(floorWidthM))
  return {
    mod,
    curve,
    cols,
    rows,
    total,
    actualW,
    actualH,
    resX,
    resY,
    ratioW: resX / g,
    ratioH: resY / g,
    fit169: calc169(resX, resY),
    weightKg: (total * mod.weight).toFixed(1),
    powerTypW,
    powerMaxW,
    ampsTyp: (powerTypW / 230).toFixed(1),
    ampsMax: (powerMaxW / 230).toFixed(1),
    ballastPerBase,
    baseUnits,
    totalBallast: ballastPerBase * baseUnits
  }
}
