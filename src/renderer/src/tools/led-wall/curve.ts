// Eine einzige Curve-Berechnung, die Steuer-UI (Curving), Hauptkennzahlen
// (Auflösung/Strom/Ballast) UND PDF speisen. Dadurch wird die im Curving
// eingegebene/ermittelte Größe automatisch überall übernommen – und umgekehrt
// (Wandbreite = Sehne bzw. Squircle-Breite).

import { CIRCLE_TABLE } from './data'
import {
  buildSquircle,
  calcArc,
  distributeAngles,
  measureFootprint,
  segsToAngles,
  type ArcResult,
  type BuilderSegment,
  type Squircle
} from './math'
import type { CurveMode } from './store'

export const CURVE_MODE_LABELS: Record<CurveMode, string> = {
  circle: 'Vollkreis',
  segment: 'Kreissegment',
  builder: 'Segment-Builder',
  squircle: 'Squircle'
}

export interface CurveComputed {
  mode: CurveMode
  /** Winkel je Modul (eine Reihe der gebogenen Wand). */
  angles: number[]
  /** Module pro Reihe (= Spalten der entwickelten/„abgewickelten" Wand). */
  mods: number
  /** Grundfläche der Draufsicht (m). Breite quer zur Bühne, Tiefe in Bühnenrichtung. */
  footprintW: number
  footprintD: number
  feasible: boolean
  /** Mit dem Curving belegte Reihenbreite (Sehne/Squircle-Breite); null = ergibt sich. */
  drivesWidth: number | null
  // modusspezifische Details für die Readouts
  arc?: ArcResult | null
  squircle?: Squircle
  circleRow?: (typeof CIRCLE_TABLE)[number]
}

export interface CurveParams {
  curveMode: CurveMode
  widthM: number | null
  segSag: number | null
  builderSegs: BuilderSegment[]
  sqD: number | null
  sqCorner: number
  selectedCircle: number
}

export function computeCurve(p: CurveParams): CurveComputed {
  if (p.curveMode === 'circle') {
    const row = CIRCLE_TABLE[Math.max(0, Math.min(p.selectedCircle, CIRCLE_TABLE.length - 1))]
    const angles = distributeAngles(360, row.mods).angles
    const fp = measureFootprint(angles)
    return {
      mode: 'circle',
      angles,
      mods: row.mods,
      footprintW: fp.width,
      footprintD: fp.depth,
      feasible: true,
      drivesWidth: null, // Vollkreis gibt seine eigene Größe vor (keine Breiten-Übernahme)
      circleRow: row
    }
  }

  if (p.curveMode === 'segment') {
    const arc = p.widthM != null && p.segSag != null ? calcArc(p.widthM, p.segSag) : null
    const angles = arc ? arc.dist.angles : []
    // In Aufstell-Lage (Sehne waagrecht) messen – wie die Draufsicht gezeichnet wird.
    const fp = measureFootprint(angles, { chordHorizontal: true })
    return {
      mode: 'segment',
      angles,
      mods: arc?.mods ?? 0,
      footprintW: fp.width,
      footprintD: fp.depth,
      feasible: arc != null,
      drivesWidth: p.widthM,
      arc
    }
  }

  if (p.curveMode === 'squircle') {
    const sq = buildSquircle(p.widthM ?? 2, p.sqD ?? 1, p.sqCorner)
    const angles = segsToAngles(sq.segs)
    const fp = measureFootprint(angles)
    return {
      mode: 'squircle',
      angles,
      mods: sq.totalMods,
      footprintW: fp.width,
      footprintD: fp.depth,
      feasible: Math.max(...sq.cornerDist.angles, 0) <= 45,
      drivesWidth: p.widthM,
      squircle: sq
    }
  }

  // builder
  const angles = segsToAngles(p.builderSegs)
  const fp = measureFootprint(angles)
  return {
    mode: 'builder',
    angles,
    mods: angles.length,
    footprintW: fp.width,
    footprintD: fp.depth,
    feasible: true,
    drivesWidth: null
  }
}
