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

/** Eigengewicht (kg/m), mit dem ein leeres Feld rechnet – das Feld zeigt es als Platzhalter */
export const DEFAULT_OWN = 0

/** Eingaben der Traverse, die rot sein können */
export type TrussField = 'span' | 'pos' | 'load' | 'ownPerM'

export interface Truss {
  /** Kraft an Punkt A und B in kg */
  fA: number | null
  fB: number | null
  /** Die Lastposition liegt hinter Punkt B – dafür steht eine Meldung in der Seite. */
  outside: boolean
  /** Eingaben mit lesbarem, aber unbrauchbarem Wert – mit ihnen wird nicht gerechnet */
  invalid: TrussField[]
}

/**
 * Traverse auf zwei Punkten: Spannweite A–B (m) über 0, Lastposition ab A (m) von 0 bis zur
 * Spannweite, Punktlast (kg) ab 0. Das Eigengewicht (kg/m, ab 0) tragen A und B je zur Hälfte;
 * leer (`null`) zählt es als 0, unlesbar (`NaN`) gar nicht. Ein negatives Eigengewicht senkte
 * früher die Kräfte – jetzt gibt es kein Ergebnis.
 */
export function trussLoads(
  span: number | null,
  pos: number | null,
  load: number | null,
  ownPerM: number | null
): Truss {
  const outside = span != null && pos != null && pos > span
  const own = ownPerM ?? DEFAULT_OWN
  const invalid: TrussField[] = []
  if (span != null && !(span > 0)) invalid.push('span')
  if (pos != null && (!(pos >= 0) || outside)) invalid.push('pos')
  if (load != null && !(load >= 0)) invalid.push('load')
  if (!(own >= 0)) invalid.push('ownPerM')
  if (span == null || pos == null || load == null || invalid.length > 0) {
    return { fA: null, fB: null, outside, invalid }
  }
  const half = (own * span) / 2
  return {
    fA: (load * (span - pos)) / span + half,
    fB: (load * pos) / span + half,
    outside,
    invalid
  }
}

export type BridleLevel = 'ok' | 'gelb' | 'rot'

/** Warnstufe nach dem Winkel eines Strangs zur Senkrechten: ab 45° gelb, ab 60° rot. */
export function bridleLevel(betaDeg: number | null): BridleLevel | null {
  return betaDeg == null ? null : betaDeg >= 60 ? 'rot' : betaDeg >= 45 ? 'gelb' : 'ok'
}

/** Eingaben des Bridle, die rot sein können */
export type BridleField = 'load' | 'height' | 'width'

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
  /** Eingaben mit lesbarem, aber unbrauchbarem Wert – mit ihnen wird nicht gerechnet */
  invalid: BridleField[]
}

/**
 * Symmetrisches Bridle, statisch: Last (kg) und Höhe (m) über 0, Punktabstand der Anschlagpunkte
 * (m) ab 0. Kraft je Strang = halbe Last ÷ cos β.
 */
export function bridle(load: number | null, height: number | null, width: number | null): Bridle {
  const invalid: BridleField[] = []
  if (load != null && !(load > 0)) invalid.push('load')
  if (height != null && !(height > 0)) invalid.push('height')
  if (width != null && !(width >= 0)) invalid.push('width')
  if (load == null || height == null || width == null || invalid.length > 0) {
    return {
      betaDeg: null,
      spreadDeg: null,
      factor: null,
      legForce: null,
      legLen: null,
      level: null,
      invalid
    }
  }
  const beta = Math.atan(width / 2 / height) // Winkel von der Senkrechten
  const betaDeg = (beta * 180) / Math.PI
  const factor = 1 / Math.cos(beta)
  return {
    betaDeg,
    spreadDeg: betaDeg * 2,
    factor,
    legForce: (load / 2) * factor,
    legLen: Math.hypot(height, width / 2),
    level: bridleLevel(betaDeg),
    invalid
  }
}
