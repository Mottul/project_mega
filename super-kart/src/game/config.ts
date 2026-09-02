/** Globale Weltkonstanten. Weltkoordinaten sind "Einheiten" (u). */

/** Kantenlänge der Spielwelt in Einheiten. */
export const WORLD_SIZE = 4096
/** Kantenlänge der Streckentextur in Pixeln (Zweierpotenz für schnelles Wrapping). */
export const TEX_SIZE = 1024
/** Textur-Pixel pro Welteinheit. */
export const TEX_SCALE = TEX_SIZE / WORLD_SIZE

/** Oberflächen-IDs, wie sie in der Kollisionskarte stehen. */
export const SURFACE = {
  VOID: 0,
  ROAD: 1,
  OFFROAD: 2,
  CURB: 3,
  BOOST: 4,
  WALL: 5,
} as const

export type SurfaceId = (typeof SURFACE)[keyof typeof SURFACE]

/** Fahrphysik. Geschwindigkeiten in Einheiten/Sekunde. */
export const PHYSICS = {
  maxSpeed: 620,
  acceleration: 430,
  reverseSpeed: -200,
  brakeForce: 900,
  /** Rollwiderstand ohne Gas. */
  drag: 0.55,
  offroadMaxSpeed: 250,
  offroadDrag: 3.2,
  steerRate: 2.35,
  /** Zusätzliche Lenkrate beim Driften. */
  driftSteerBonus: 1.5,
  /** Wie stark das Kart seitlich wegrutscht (0 = auf Schienen). */
  gripHalfLife: 0.11,
  driftGripHalfLife: 0.34,
  boostSpeed: 900,
  boostAccel: 1500,
  /** Sekunden Drift bis Stufe 1 / Stufe 2 des Mini-Turbos. */
  miniTurboStage1: 0.85,
  miniTurboStage2: 1.7,
  miniTurboDuration: [0, 0.75, 1.45],
  hitSpinDuration: 1.35,
  squashDuration: 1.6,
  kartRadius: 34,
} as const

/** Rennregeln. */
export const RACE = {
  countdownSeconds: 3.6,
  finishLingerSeconds: 3,
  itemBoxRespawn: 6,
  maxItemBoxesPerRow: 5,
} as const

export const BATTLE = {
  balloons: 3,
  respawnSeconds: 2.2,
  itemBoxRespawn: 4,
} as const

/** Kamera / Mode-7-Projektion. */
export const CAMERA = {
  height: 158,
  /** Abstand der Kamera hinter dem Kart. */
  distance: 258,
  /** Brennweite in Pixeln der internen Auflösung. */
  focalRatio: 1.05,
  horizonRatio: 0.33,
  /** Sichtweite in Einheiten - dahinter nur Nebel. */
  far: 3400,
  fogStart: 1500,
} as const
