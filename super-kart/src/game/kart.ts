import type { ControlState } from '../core/input'
import { clamp, damp, wrapAngle } from '../core/math'
import { PHYSICS, SURFACE } from './config'
import type { Driver } from './drivers'
import type { ItemKind } from './items'
import type { BuiltTrack } from './trackgen'
import { surfaceAt } from './trackgen'

export interface Kart {
  index: number
  driver: Driver
  /** -1 = KI, sonst Index des lokalen Spielers. */
  player: number

  x: number
  y: number
  angle: number
  vx: number
  vy: number
  /** Höhe über der Fahrbahn (Hopser/Sprung). */
  z: number
  vz: number

  drifting: boolean
  driftDir: number
  driftCharge: number
  hopping: boolean

  boostTimer: number
  spinTimer: number
  squashTimer: number
  shieldTimer: number
  invulnTimer: number
  fallTimer: number
  respawnTimer: number

  item: ItemKind | null
  itemUses: number
  itemRoll: number

  lap: number
  waypoint: number
  /** Monoton wachsender Streckenfortschritt in Einheiten. */
  progress: number
  lapStart: number
  lapTimes: number[]
  finished: boolean
  finishTime: number
  rank: number

  balloons: number
  score: number

  /** Visuelle Neigung des Sprites, geglättet. */
  lean: number
  /** Gummiband-Faktor der KI auf die Höchstgeschwindigkeit. */
  speedBias: number
  surface: number
  /** Nur KI: Zielversatz zur Ideallinie und Reaktionszähler. */
  aiOffset: number
  aiSkill: number
  aiTimer: number
  aiItemTimer: number
  /** Wie lange die KI schon fast steht - löst Rückwärtsrangieren aus. */
  aiStuck: number
  aiReverse: number
  /** Lenkrichtung beim Rangieren, damit sie über die Dauer gleich bleibt. */
  aiStuckSteer: number
}

export function createKart(
  index: number,
  driver: Driver,
  player: number,
  spawn: { x: number; y: number; angle: number }
): Kart {
  return {
    index,
    driver,
    player,
    x: spawn.x,
    y: spawn.y,
    angle: spawn.angle,
    vx: 0,
    vy: 0,
    z: 0,
    vz: 0,
    drifting: false,
    driftDir: 0,
    driftCharge: 0,
    hopping: false,
    boostTimer: 0,
    spinTimer: 0,
    squashTimer: 0,
    shieldTimer: 0,
    invulnTimer: 0,
    fallTimer: 0,
    respawnTimer: 0,
    item: null,
    itemUses: 0,
    itemRoll: 0,
    lap: 0,
    waypoint: 0,
    progress: 0,
    lapStart: 0,
    lapTimes: [],
    finished: false,
    finishTime: 0,
    rank: index + 1,
    balloons: 0,
    score: 0,
    lean: 0,
    speedBias: 1,
    surface: SURFACE.ROAD,
    aiOffset: 0,
    aiSkill: 1,
    aiTimer: 0,
    aiItemTimer: 2,
    aiStuck: 0,
    aiReverse: 0,
    aiStuckSteer: 0.7,
  }
}

export function kartSpeed(kart: Kart): number {
  return Math.hypot(kart.vx, kart.vy)
}

/** Vorzeichenbehaftete Geschwindigkeit in Blickrichtung. */
export function forwardSpeed(kart: Kart): number {
  return kart.vx * Math.cos(kart.angle) + kart.vy * Math.sin(kart.angle)
}

export function giveBoost(kart: Kart, seconds: number): void {
  kart.boostTimer = Math.max(kart.boostTimer, seconds)
}

/** Treffer: Kart dreht sich, verliert Tempo und lässt sein Item fallen. */
export function spinOut(kart: Kart, duration: number = PHYSICS.hitSpinDuration): boolean {
  if (kart.invulnTimer > 0 || kart.spinTimer > 0 || kart.respawnTimer > 0) return false
  if (kart.shieldTimer > 0) {
    kart.shieldTimer = 0
    kart.invulnTimer = 0.6
    return false
  }
  kart.spinTimer = duration
  kart.boostTimer = 0
  kart.drifting = false
  kart.driftCharge = 0
  kart.vx *= 0.25
  kart.vy *= 0.25
  return true
}

export function squash(kart: Kart): boolean {
  if (kart.invulnTimer > 0 || kart.respawnTimer > 0) return false
  if (kart.shieldTimer > 0) {
    kart.shieldTimer = 0
    return false
  }
  kart.squashTimer = PHYSICS.squashDuration
  kart.boostTimer = 0
  kart.drifting = false
  kart.driftCharge = 0
  kart.vx *= 0.4
  kart.vy *= 0.4
  return true
}

export function respawn(kart: Kart, track: BuiltTrack): void {
  const wp = track.waypoints[kart.waypoint]!
  kart.x = wp.x
  kart.y = wp.y
  kart.angle = wp.dir
  kart.vx = 0
  kart.vy = 0
  kart.z = 0
  kart.vz = 0
  kart.spinTimer = 0
  kart.squashTimer = 0
  kart.fallTimer = 0
  kart.drifting = false
  kart.driftCharge = 0
  kart.invulnTimer = 1.2
}

/** Prüft die Oberfläche etwas vor dem Kart - so schleift man nicht durch Wände. */
function probeSurface(track: BuiltTrack, kart: Kart): number {
  return surfaceAt(track, kart.x, kart.y)
}

export function updateKart(
  kart: Kart,
  ctrl: ControlState,
  dt: number,
  track: BuiltTrack,
  frozen: boolean
): void {
  if (kart.respawnTimer > 0) {
    kart.respawnTimer -= dt
    if (kart.respawnTimer <= 0) respawn(kart, track)
    return
  }

  kart.invulnTimer = Math.max(0, kart.invulnTimer - dt)
  kart.shieldTimer = Math.max(0, kart.shieldTimer - dt)
  kart.squashTimer = Math.max(0, kart.squashTimer - dt)
  kart.boostTimer = Math.max(0, kart.boostTimer - dt)

  const stats = kart.driver
  const spinning = kart.spinTimer > 0
  if (spinning) {
    kart.spinTimer -= dt
    // Zwei volle Drehungen über die Trefferdauer.
    kart.angle += (dt / PHYSICS.hitSpinDuration) * Math.PI * 4
  }

  const cos = Math.cos(kart.angle)
  const sin = Math.sin(kart.angle)
  let fwd = kart.vx * cos + kart.vy * sin
  let lat = -kart.vx * sin + kart.vy * cos

  const surface = probeSurface(track, kart)
  kart.surface = surface
  const offroad = surface === SURFACE.OFFROAD || surface === SURFACE.CURB
  const inAir = kart.z > 0.5

  // ---- Antrieb
  let maxSpeed = PHYSICS.maxSpeed * stats.topSpeed * kart.speedBias
  if (kart.squashTimer > 0) maxSpeed *= 0.5
  if (offroad && !inAir)
    maxSpeed = Math.min(maxSpeed, PHYSICS.offroadMaxSpeed * (surface === SURFACE.CURB ? 1.6 : 1))
  if (kart.boostTimer > 0) maxSpeed = PHYSICS.boostSpeed

  const canDrive = !frozen && !spinning && kart.squashTimer <= 0
  if (kart.boostTimer > 0) {
    fwd += PHYSICS.boostAccel * dt
  } else if (canDrive && ctrl.accel) {
    // Rückwärtsfahrt zuerst abbremsen, dann beschleunigen.
    fwd += PHYSICS.acceleration * stats.acceleration * dt * (fwd < 0 ? 2.2 : 1)
  } else if (canDrive && ctrl.brake) {
    fwd -= PHYSICS.brakeForce * dt
  } else {
    fwd -= fwd * PHYSICS.drag * dt
  }
  if (offroad && !inAir) fwd -= fwd * PHYSICS.offroadDrag * dt

  if (fwd > maxSpeed) fwd = damp(fwd, maxSpeed, 0.28, dt)
  if (fwd < PHYSICS.reverseSpeed) fwd = PHYSICS.reverseSpeed

  // ---- Hopser und Drift
  if (canDrive && !inAir && ctrl.drift && !kart.drifting && !kart.hopping && fwd > 120) {
    kart.hopping = true
    kart.vz = 190
  }
  if (kart.hopping || kart.z > 0) {
    kart.vz -= 900 * dt
    kart.z += kart.vz * dt
    if (kart.z <= 0) {
      kart.z = 0
      kart.vz = 0
      if (kart.hopping) {
        kart.hopping = false
        if (ctrl.drift && Math.abs(ctrl.steer) > 0.25) {
          kart.drifting = true
          kart.driftDir = Math.sign(ctrl.steer)
          kart.driftCharge = 0
        }
      }
    }
  }

  if (kart.drifting) {
    if (!ctrl.drift || fwd < 90 || spinning) {
      releaseDrift(kart)
    } else {
      kart.driftCharge += dt
    }
  }

  // ---- Lenkung
  let steerRate = PHYSICS.steerRate * stats.handling
  let steer = canDrive ? ctrl.steer : 0
  if (kart.drifting) {
    steerRate += PHYSICS.driftSteerBonus
    // Im Drift bleibt eine Grundkrümmung in Driftrichtung erhalten.
    steer = clamp(kart.driftDir * 0.62 + ctrl.steer * 0.5, -1, 1)
  }
  const speedFactor = clamp(Math.abs(fwd) / (PHYSICS.maxSpeed * 0.3), 0, 1)
  const airFactor = inAir ? 0.35 : 1
  kart.angle += steer * steerRate * dt * speedFactor * airFactor * (fwd < 0 ? -1 : 1)
  kart.angle = wrapAngle(kart.angle)
  kart.lean = damp(kart.lean, kart.drifting ? kart.driftDir : steer * 0.5, 0.09, dt)

  // ---- Seitenführung: im Drift rutscht das Kart deutlich weiter.
  const grip = kart.drifting ? PHYSICS.driftGripHalfLife : PHYSICS.gripHalfLife
  lat = damp(lat, 0, inAir ? 0.9 : grip, dt)

  const nc = Math.cos(kart.angle)
  const ns = Math.sin(kart.angle)
  kart.vx = nc * fwd - ns * lat
  kart.vy = ns * fwd + nc * lat

  moveWithCollision(kart, dt, track)

  // ---- Oberflächen-Ereignisse
  const after = probeSurface(track, kart)
  if (after === SURFACE.BOOST && !inAir) giveBoost(kart, 1.05)
  if (after === SURFACE.VOID) {
    kart.fallTimer += dt
    if (kart.fallTimer > 0.35) {
      kart.respawnTimer = 1.1
      kart.fallTimer = 0
    }
  } else {
    kart.fallTimer = 0
  }
}

/** Beendet den Drift und vergibt je nach Ladung einen Mini-Turbo. */
export function releaseDrift(kart: Kart): number {
  const charge = kart.driftCharge
  kart.drifting = false
  kart.driftCharge = 0
  kart.driftDir = 0
  let stage = 0
  if (charge >= PHYSICS.miniTurboStage2) stage = 2
  else if (charge >= PHYSICS.miniTurboStage1) stage = 1
  if (stage > 0) giveBoost(kart, PHYSICS.miniTurboDuration[stage]!)
  return stage
}

/**
 * Bewegt das Kart und lässt es an Wänden abprallen. Die Achsen werden einzeln
 * geprüft, damit man an einer Wand entlanggleiten kann statt hängen zu bleiben.
 */
function moveWithCollision(kart: Kart, dt: number, track: BuiltTrack): void {
  const nx = kart.x + kart.vx * dt
  const ny = kart.y + kart.vy * dt
  const r = PHYSICS.kartRadius

  // Auch etwas voraus prüfen, damit der Kart-Radius nicht in der Wand steckt.
  const blocked = (x: number, y: number) =>
    surfaceAt(track, x, y) === SURFACE.WALL ||
    surfaceAt(track, x + Math.sign(kart.vx) * r, y) === SURFACE.WALL ||
    surfaceAt(track, x, y + Math.sign(kart.vy) * r) === SURFACE.WALL

  if (!blocked(nx, ny)) {
    kart.x = nx
    kart.y = ny
    return
  }

  let hit = false
  if (!blocked(nx, kart.y)) {
    kart.x = nx
    kart.vy = -kart.vy * 0.35
    hit = true
  } else if (!blocked(kart.x, ny)) {
    kart.y = ny
    kart.vx = -kart.vx * 0.35
    hit = true
  } else {
    kart.vx = -kart.vx * 0.4
    kart.vy = -kart.vy * 0.4
    hit = true
  }

  if (hit) {
    kart.drifting = false
    kart.driftCharge = 0
    kart.boostTimer = 0
    kart.vx *= 0.55
    kart.vy *= 0.55
  }
}
