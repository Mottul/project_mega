import type { ControlState } from '../core/input'
import { angleDelta, clamp } from '../core/math'
import { PHYSICS, SURFACE } from './config'
import type { Kart } from './kart'
import { forwardSpeed } from './kart'
import { surfaceAt, type BuiltTrack } from './trackgen'

export interface AiContext {
  track: BuiltTrack
  karts: Kart[]
  hazards: { x: number; y: number }[]
  /** Item-Boxen inkl. Nachladezeit - die KI steuert nur aktive an. */
  boxes: { x: number; y: number; timer: number }[]
  battle: boolean
}

const IDLE: ControlState = {
  steer: 0,
  accel: false,
  brake: false,
  drift: false,
  item: false,
  itemPressed: false,
}

export function aiControl(kart: Kart, ctx: AiContext, dt: number): ControlState {
  const stuck = handleStuck(kart, dt)
  if (stuck) return stuck
  return ctx.battle ? battleControl(kart, ctx, dt) : raceControl(kart, ctx, dt)
}

/**
 * Steht ein Kart längere Zeit fast still (Wand, Verkeilung), rangiert es kurz
 * rückwärts. Ohne das bleiben Gegner gelegentlich für immer hängen.
 */
function handleStuck(kart: Kart, dt: number): ControlState | null {
  const speed = Math.abs(forwardSpeed(kart))
  if (kart.aiReverse > 0) {
    kart.aiReverse -= dt
    return { ...IDLE, brake: true, steer: kart.aiStuckSteer }
  }
  if (speed < 70 && kart.spinTimer <= 0 && kart.respawnTimer <= 0) {
    kart.aiStuck += dt
    if (kart.aiStuck > 1.3) {
      kart.aiStuck = 0
      kart.aiReverse = 0.9
      kart.aiStuckSteer = Math.random() < 0.5 ? -0.8 : 0.8
    }
  } else {
    kart.aiStuck = 0
  }
  return null
}

/** Weicht Wänden aus, indem drei Fühler vorausgeschickt werden. */
function avoidWalls(kart: Kart, track: BuiltTrack, steer: number, reach: number): number {
  const hit = (offset: number) => {
    const a = kart.angle + offset
    return surfaceAt(track, kart.x + Math.cos(a) * reach, kart.y + Math.sin(a) * reach) === SURFACE.WALL
  }
  if (!hit(0)) return steer
  const left = hit(-0.7)
  const right = hit(0.7)
  if (left && !right) return 1
  if (right && !left) return -1
  return steer >= 0 ? 1 : -1
}

/**
 * Rennen: Die KI zielt auf einen Wegpunkt weit voraus (je schneller, desto
 * weiter) und weicht dabei Hindernissen aus. Kein Pfadfinder nötig - die
 * Strecke ist eine Schleife.
 */
function raceControl(kart: Kart, ctx: AiContext, dt: number): ControlState {
  const { track } = ctx
  const wps = track.waypoints
  const n = wps.length
  const speed = forwardSpeed(kart)

  kart.aiTimer -= dt
  if (kart.aiTimer <= 0) {
    // Der Zielversatz wandert langsam - so wirken die Gegner nicht wie auf Schienen.
    kart.aiTimer = 0.9 + Math.random() * 1.4
    kart.aiOffset = (Math.random() * 2 - 1) * track.def.roadWidth * 0.26
  }

  const lookahead = Math.round(4 + clamp(speed / 90, 0, 9))
  const targetWp = wps[(kart.waypoint + lookahead) % n]!
  const farWp = wps[(kart.waypoint + lookahead * 2) % n]!

  let tx = targetWp.x + Math.cos(targetWp.dir + Math.PI / 2) * kart.aiOffset
  let ty = targetWp.y + Math.sin(targetWp.dir + Math.PI / 2) * kart.aiOffset

  for (const h of ctx.hazards) {
    const dodge = sidestep(kart, h.x, h.y, 340)
    tx += dodge[0]
    ty += dodge[1]
  }

  const error = angleDelta(kart.angle, Math.atan2(ty - kart.y, tx - kart.x))
  let steer = clamp(error * 2.6 * kart.aiSkill, -1, 1)
  steer = avoidWalls(kart, track, steer, 260)

  const curve = Math.abs(angleDelta(targetWp.dir, farWp.dir))
  const tooFast = speed > 300 && curve > 0.55
  const offroad = kart.surface === SURFACE.OFFROAD

  const wantsDrift =
    speed > 260 && Math.abs(steer) > 0.55 && curve > 0.32 && kart.driftCharge < PHYSICS.miniTurboStage2 + 0.25

  return {
    steer,
    // Im Gelände wird nicht gebremst - das Kart soll zurück auf die Bahn,
    // nicht dort stehen bleiben.
    accel: !tooFast || offroad,
    brake: tooFast && !offroad,
    drift: wantsDrift,
    item: false,
    itemPressed: false,
  }
}

/** Schiebt ein Ziel seitlich weg, wenn ein Hindernis direkt davor liegt. */
function sidestep(kart: Kart, hx: number, hy: number, reach: number): [number, number] {
  const dx = hx - kart.x
  const dy = hy - kart.y
  const d = Math.hypot(dx, dy)
  if (d > reach || d < 1) return [0, 0]
  const ahead = (dx * Math.cos(kart.angle) + dy * Math.sin(kart.angle)) / d
  if (ahead < 0.7) return [0, 0]
  const side = -dx * Math.sin(kart.angle) + dy * Math.cos(kart.angle)
  const push = (reach - d) * 1.1 * (side > 0 ? -1 : 1)
  return [Math.cos(kart.angle + Math.PI / 2) * push, Math.sin(kart.angle + Math.PI / 2) * push]
}

/**
 * Battle: Ohne Item wird die nächste Item-Box angesteuert, mit Item der
 * nächste Gegner gejagt. Wegpunkte helfen hier nicht - die Arena ist offen.
 */
function battleControl(kart: Kart, ctx: AiContext, dt: number): ControlState {
  kart.aiTimer -= dt
  const target = kart.item
    ? nearestOpponent(kart, ctx)
    : (nearestBox(kart, ctx) ?? nearestOpponent(kart, ctx))
  if (!target) return { ...IDLE, accel: true }

  const dx = target.x - kart.x
  const dy = target.y - kart.y
  const distance = Math.hypot(dx, dy)
  const error = angleDelta(kart.angle, Math.atan2(dy, dx))
  let steer = clamp(error * 2.4 * kart.aiSkill, -1, 1)

  for (const h of ctx.hazards) {
    const dodge = sidestep(kart, h.x, h.y, 260)
    if (dodge[0] !== 0 || dodge[1] !== 0) steer = clamp(steer + (dodge[0] + dodge[1] > 0 ? 0.6 : -0.6), -1, 1)
  }
  steer = avoidWalls(kart, ctx.track, steer, 240)

  // Vor einem Gegner nicht mit Vollgas hineinfahren - sonst rammt man nur.
  const closing = kart.item !== null && distance < 260
  return {
    steer,
    accel: !closing,
    brake: Math.abs(error) > 2.2 && Math.abs(forwardSpeed(kart)) > 260,
    drift: false,
    item: false,
    itemPressed: false,
  }
}

function nearestOpponent(kart: Kart, ctx: AiContext): Kart | null {
  let best: Kart | null = null
  let bestD = Infinity
  for (const other of ctx.karts) {
    if (other === kart || other.respawnTimer > 0) continue
    if (ctx.battle && other.balloons <= 0) continue
    const d = (other.x - kart.x) ** 2 + (other.y - kart.y) ** 2
    if (d < bestD) {
      bestD = d
      best = other
    }
  }
  return best
}

function nearestBox(kart: Kart, ctx: AiContext): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null
  let bestD = Infinity
  for (const box of ctx.boxes) {
    if (box.timer > 0) continue
    const d = (box.x - kart.x) ** 2 + (box.y - kart.y) ** 2
    if (d < bestD) {
      bestD = d
      best = box
    }
  }
  return best
}

/**
 * Entscheidet, ob die KI ihr Item einsetzt. Getrennt von der Fahrlogik, damit
 * beides unabhängig getestet und getunt werden kann.
 */
export function aiWantsItem(kart: Kart, ctx: AiContext, dt: number): boolean {
  if (!kart.item || kart.itemRoll > 0) return false
  kart.aiItemTimer -= dt
  if (kart.aiItemTimer > 0) return false
  kart.aiItemTimer = 0.3

  const others = ctx.karts.filter((k) => k !== kart && k.respawnTimer <= 0 && (!ctx.battle || k.balloons > 0))
  const cos = Math.cos(kart.angle)
  const sin = Math.sin(kart.angle)

  switch (kart.item) {
    case 'turbo':
    case 'turbo3':
      if (ctx.battle) return true
      return kart.surface === SURFACE.ROAD && !kart.drifting && forwardSpeed(kart) > 200
    case 'rakete':
    case 'kugel':
      return others.some((o) => {
        const dx = o.x - kart.x
        const dy = o.y - kart.y
        const d = Math.hypot(dx, dy)
        if (d > 1500 || d < 60) return false
        const ahead = (dx * cos + dy * sin) / d
        return ahead > (kart.item === 'rakete' ? 0.45 : 0.85)
      })
    case 'oel':
    case 'mine':
      return others.some((o) => {
        const dx = o.x - kart.x
        const dy = o.y - kart.y
        const d = Math.hypot(dx, dy)
        if (d > 900) return false
        return (dx * cos + dy * sin) / Math.max(1, d) < -0.3
      })
    case 'schild':
      return true
    case 'blitz':
      return kart.rank > 2 || ctx.battle
    default:
      return false
  }
}
