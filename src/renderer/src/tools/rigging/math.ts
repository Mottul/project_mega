// Rechenkern der Rigging-Last: zwei Alltagsfälle.
// 1) Traverse auf zwei Hängepunkten (einfacher Träger): Auflagerkräfte aus Punktlast-Position und
//    Eigengewicht. A = F·(L−a)/L + w·L/2, B = F·a/L + w·L/2.
// 2) Bridle (zweisträngiges Anschlagmittel): Kraft je Strang = F / (2·cos β), β aus Höhe und
//    Punktabstand. Der Faktor 1/cos β explodiert bei flachen Winkeln -> Warnstufen ab 45°/60°.
// Richtwerte OHNE Dynamik- und Sicherheitsfaktoren – ersetzt keinen Sachkundigen.

/** Erdbeschleunigung (m/s²) für die Angabe in kN */
const G = 9.81

/** Masse (kg) als Gewichtskraft in kN – die zweite Angabe neben dem kg-Wert. */
export function kgToKn(kg: number): number {
  return (kg * G) / 1000
}

export interface Truss {
  /** Kraft an Punkt A und B in kg */
  fA: number | null
  fB: number | null
  /** Die Lastposition liegt hinter Punkt B – dafür steht eine Meldung in der Seite. */
  outside: boolean
}

/**
 * Traverse auf zwei Punkten: Spannweite A–B (m) über 0, Lastposition ab A (m) von 0 bis zur
 * Spannweite, Punktlast (kg) ab 0. Das Eigengewicht (kg/m) tragen A und B je zur Hälfte; leer
 * zählt es als 0.
 */
export function trussLoads(
  span: number | null,
  pos: number | null,
  load: number | null,
  ownPerM: number | null
): Truss {
  const outside = span != null && pos != null && pos > span
  const valid =
    span != null && span > 0 && pos != null && pos >= 0 && pos <= span && load != null && load >= 0
  if (!valid) return { fA: null, fB: null, outside }
  const own = ((ownPerM ?? 0) * span) / 2
  return {
    fA: (load * (span - pos)) / span + own,
    fB: (load * pos) / span + own,
    outside
  }
}

export type BridleLevel = 'ok' | 'gelb' | 'rot'

/** Warnstufe nach dem Winkel eines Strangs zur Senkrechten: ab 45° gelb, ab 60° rot. */
export function bridleLevel(betaDeg: number | null): BridleLevel | null {
  return betaDeg == null ? null : betaDeg >= 60 ? 'rot' : betaDeg >= 45 ? 'gelb' : 'ok'
}

export interface Bridle {
  /** Winkel eines Strangs zur Senkrechten (β) und zwischen den Strängen (2β), in Grad */
  betaDeg: number | null
  spreadDeg: number | null
  /** Lastfaktor 1 ÷ cos β */
  factor: number | null
  /** Kraft je Strang in kg */
  legForce: number | null
  /** Stranglänge in m */
  legLen: number | null
  level: BridleLevel | null
}

const NO_BRIDLE: Bridle = {
  betaDeg: null,
  spreadDeg: null,
  factor: null,
  legForce: null,
  legLen: null,
  level: null
}

/**
 * Symmetrisches Bridle, statisch: Last (kg) und Höhe (m) über 0, Punktabstand der Anschlagpunkte
 * (m) ab 0. Kraft je Strang = halbe Last ÷ cos β.
 */
export function bridle(load: number | null, height: number | null, width: number | null): Bridle {
  const valid =
    load != null && load > 0 && height != null && height > 0 && width != null && width >= 0
  if (!valid) return NO_BRIDLE
  const beta = Math.atan(width / 2 / height) // Winkel von der Senkrechten
  const betaDeg = (beta * 180) / Math.PI
  const factor = 1 / Math.cos(beta)
  return {
    betaDeg,
    spreadDeg: betaDeg * 2,
    factor,
    legForce: (load / 2) * factor,
    legLen: Math.hypot(height, width / 2),
    level: bridleLevel(betaDeg)
  }
}
