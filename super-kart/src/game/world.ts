import type { ControlState } from '../core/input'
import { angleDelta, clamp, TAU } from '../core/math'
import { Rng, seedFrom } from '../core/rng'
import { aiControl, aiWantsItem, type AiContext } from './ai'
import { BATTLE, PHYSICS, RACE, SURFACE } from './config'
import { driverById, DRIVERS, type Driver } from './drivers'
import { ITEMS, rollItem, type ItemKind } from './items'
import {
  createKart,
  forwardSpeed,
  giveBoost,
  releaseDrift,
  spinOut,
  squash,
  updateKart,
  type Kart,
} from './kart'
import type { TrackDef } from './tracks'
import { buildTrack, nearestWaypoint, surfaceAt, type BuiltTrack } from './trackgen'
import { isFinished, lapDelta } from './progress'

export type Mode = 'race' | 'battle'

export interface Projectile {
  kind: 'rakete' | 'kugel'
  x: number
  y: number
  angle: number
  speed: number
  owner: number
  target: number
  life: number
  bounces: number
}

export interface Hazard {
  kind: 'oel' | 'mine'
  x: number
  y: number
  owner: number
  life: number
  /** Kurze Anlaufzeit, damit man nicht sein eigenes Item auslöst. */
  arm: number
}

export interface ItemBox {
  x: number
  y: number
  timer: number
}

export interface Particle {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  life: number
  maxLife: number
  size: number
  color: string
}

export type WorldEventKind =
  | 'itemBox'
  | 'itemRoll'
  | 'boost'
  | 'shoot'
  | 'drop'
  | 'hit'
  | 'pop'
  | 'lap'
  | 'finish'
  | 'countdown'
  | 'go'
  | 'skid'

export interface WorldEvent {
  kind: WorldEventKind
  kart?: number
}

export interface WorldOptions {
  mode: Mode
  trackDef: TrackDef
  /** Fahrer-IDs der lokalen Spieler (1 oder 2). */
  playerDrivers: string[]
  cpuCount: number
  laps: number
  /** 0 = leicht, 1 = normal, 2 = schwer. */
  difficulty: number
}

const AI_SKILL = [0.82, 0.95, 1.06]
const AI_SPEED = [0.9, 0.98, 1.045]

export class World {
  readonly track: BuiltTrack
  readonly karts: Kart[]
  readonly mode: Mode
  readonly laps: number
  readonly players: Kart[]

  projectiles: Projectile[] = []
  hazards: Hazard[] = []
  boxes: ItemBox[] = []
  particles: Particle[] = []
  events: WorldEvent[] = []

  time = 0
  countdown = RACE.countdownSeconds
  state: 'countdown' | 'running' | 'over' = 'countdown'
  /** Zeit nach Zieleinlauf, in der die KI weiterfährt. */
  private overDelay = 0
  private rng: Rng
  private lastBeep = 4
  /** Grund-Geschwindigkeitsfaktor der KI (Schwierigkeitsgrad). */
  private baseBias: number

  constructor(options: WorldOptions) {
    this.mode = options.mode
    this.laps = options.laps
    this.rng = new Rng(seedFrom(options.trackDef.id + Date.now().toString(36)))
    this.baseBias = AI_SPEED[options.difficulty] ?? 1

    const total = options.playerDrivers.length + options.cpuCount
    this.track = buildTrack(options.trackDef, total)

    const used = new Set(options.playerDrivers)
    const pool: Driver[] = DRIVERS.filter((d) => !used.has(d.id))

    this.karts = []
    for (let i = 0; i < total; i++) {
      const spawn = this.track.startGrid[i] ?? { x: 2048, y: 2048, angle: 0 }
      const isPlayer = i < options.playerDrivers.length
      const driver = isPlayer
        ? driverById(options.playerDrivers[i]!)
        : pool[(i - options.playerDrivers.length) % pool.length]!
      const kart = createKart(i, driver, isPlayer ? i : -1, spawn)
      kart.waypoint = nearestWaypoint(this.track, kart.x, kart.y, 0)
      kart.aiSkill = AI_SKILL[options.difficulty] ?? 1
      kart.speedBias = isPlayer ? 1 : this.baseBias
      if (this.mode === 'battle') kart.balloons = BATTLE.balloons
      this.karts.push(kart)
    }
    this.players = this.karts.filter((k) => k.player >= 0)

    this.boxes = this.track.itemBoxes.map((b) => ({ x: b.x, y: b.y, timer: 0 }))
    this.updateRanks()
  }

  /** Vor dem Rennen steht alles still; die Startampel läuft trotzdem. */
  private get frozen(): boolean {
    return this.state === 'countdown'
  }

  update(dt: number, controls: (ControlState | null)[]): void {
    this.events.length = 0

    if (this.state === 'countdown') {
      this.countdown -= dt
      const beep = Math.ceil(this.countdown)
      if (beep < this.lastBeep) {
        this.lastBeep = beep
        if (beep > 0) this.events.push({ kind: 'countdown' })
      }
      if (this.countdown <= 0) {
        this.state = 'running'
        this.events.push({ kind: 'go' })
        for (const k of this.karts) k.lapStart = 0
      }
    } else {
      this.time += dt
    }

    const aiCtx: AiContext = {
      track: this.track,
      karts: this.karts,
      hazards: this.hazards,
      boxes: this.boxes,
      battle: this.mode === 'battle',
    }

    for (const kart of this.karts) {
      const ctrl = kart.player >= 0 ? (controls[kart.player] ?? null) : aiControl(kart, aiCtx, dt)
      const input: ControlState = ctrl ?? {
        steer: 0,
        accel: false,
        brake: false,
        drift: false,
        item: false,
        itemPressed: false,
      }

      const wasDrifting = kart.drifting
      const boostBefore = kart.boostTimer
      updateKart(kart, input, dt, this.track, this.frozen || kart.finished)
      if (wasDrifting && !kart.drifting && kart.boostTimer > boostBefore) {
        this.events.push({ kind: 'boost', kart: kart.index })
        this.burst(kart, 16, '#ffd76a')
      }
      if (kart.drifting && Math.random() < dt * 22) {
        this.events.push({ kind: 'skid', kart: kart.index })
        this.driftSpark(kart)
      }
      if (kart.boostTimer > 0) this.flame(kart, dt)

      if (kart.player >= 0 && input.itemPressed) this.useItem(kart)
      if (kart.player < 0 && aiWantsItem(kart, aiCtx, dt)) this.useItem(kart)

      this.trackProgress(kart)
    }

    // KI-Gummiband: Abstand zur Spitze wird sanft ausgeglichen.
    if (this.mode === 'race') this.rubberBand()

    this.updateItemBoxes(dt)
    this.updateProjectiles(dt)
    this.updateHazards(dt)
    this.updateParticles(dt)
    this.resolveKartCollisions()
    this.updateRanks()
    this.checkEnd(dt)
  }

  // ------------------------------------------------------------- Fortschritt

  private trackProgress(kart: Kart): void {
    const wps = this.track.waypoints
    const n = wps.length
    const prev = kart.waypoint
    const next = nearestWaypoint(this.track, kart.x, kart.y, prev)
    kart.waypoint = next

    if (this.mode !== 'race' || kart.finished) return

    const delta = lapDelta(prev, next, n)
    kart.lap += delta
    kart.progress = kart.lap * this.track.length + wps[next]!.dist

    if (delta > 0) {
      // Die erste Durchfahrt ist nur der Weg vom Startfeld zur Linie - die
      // zählt nicht als Rundenzeit.
      if (kart.lap >= 2) kart.lapTimes.push(this.time - kart.lapStart)
      kart.lapStart = this.time
      if (isFinished(kart.lap, this.laps)) {
        kart.finished = true
        kart.finishTime = this.time
        if (kart.player >= 0) this.events.push({ kind: 'finish', kart: kart.index })
      } else if (kart.player >= 0) {
        this.events.push({ kind: 'lap', kart: kart.index })
      }
    }
  }

  /**
   * Gummiband: KI weit hinten wird minimal schneller, direkt an der Spitze
   * minimal langsamer. Bewusst schwach - es soll Anschluss halten, nicht
   * das Rennergebnis diktieren.
   */
  private rubberBand(): void {
    let lead = -Infinity
    for (const k of this.karts) lead = Math.max(lead, k.progress)
    for (const k of this.karts) {
      if (k.player >= 0) continue
      const behind = lead - k.progress
      const target = clamp(
        this.baseBias + behind / 14000 - (behind < 120 ? 0.05 : 0),
        this.baseBias - 0.07,
        this.baseBias + 0.11
      )
      k.speedBias += (target - k.speedBias) * 0.03
    }
  }

  private updateRanks(): void {
    const order = [...this.karts]
    if (this.mode === 'race') {
      order.sort((a, b) => {
        if (a.finished && b.finished) return a.finishTime - b.finishTime
        if (a.finished) return -1
        if (b.finished) return 1
        return b.progress - a.progress
      })
    } else {
      order.sort((a, b) => b.balloons - a.balloons || b.score - a.score)
    }
    order.forEach((k, i) => (k.rank = i + 1))
  }

  // ------------------------------------------------------------------- Items

  private updateItemBoxes(dt: number): void {
    const respawn = this.mode === 'battle' ? BATTLE.itemBoxRespawn : RACE.itemBoxRespawn
    for (const box of this.boxes) {
      if (box.timer > 0) {
        box.timer -= dt
        continue
      }
      for (const kart of this.karts) {
        if (kart.respawnTimer > 0 || kart.item) continue
        if ((kart.x - box.x) ** 2 + (kart.y - box.y) ** 2 > 72 ** 2) continue
        box.timer = respawn
        const rank01 = this.karts.length > 1 ? (kart.rank - 1) / (this.karts.length - 1) : 0
        kart.item = rollItem(this.rng, rank01, this.mode === 'battle')
        kart.itemUses = ITEMS[kart.item].uses
        kart.itemRoll = 0.9
        this.events.push({ kind: 'itemBox', kart: kart.index })
        break
      }
    }
    for (const kart of this.karts) {
      if (kart.itemRoll > 0) {
        kart.itemRoll = Math.max(0, kart.itemRoll - dt)
        if (Math.random() < dt * 18) this.events.push({ kind: 'itemRoll', kart: kart.index })
      }
    }
  }

  private useItem(kart: Kart): void {
    if (!kart.item || kart.itemRoll > 0 || kart.respawnTimer > 0 || this.frozen) return
    const kind: ItemKind = kart.item
    const cos = Math.cos(kart.angle)
    const sin = Math.sin(kart.angle)

    switch (kind) {
      case 'turbo':
      case 'turbo3':
        giveBoost(kart, 1.35)
        this.events.push({ kind: 'boost', kart: kart.index })
        this.burst(kart, 14, '#ffb43a')
        break
      case 'rakete':
        this.projectiles.push({
          kind: 'rakete',
          x: kart.x + cos * 70,
          y: kart.y + sin * 70,
          angle: kart.angle,
          speed: 760,
          owner: kart.index,
          target: this.targetAhead(kart),
          life: 8,
          bounces: 0,
        })
        this.events.push({ kind: 'shoot', kart: kart.index })
        break
      case 'kugel':
        this.projectiles.push({
          kind: 'kugel',
          x: kart.x + cos * 70,
          y: kart.y + sin * 70,
          angle: kart.angle,
          speed: 880,
          owner: kart.index,
          target: -1,
          life: 6,
          bounces: 4,
        })
        this.events.push({ kind: 'shoot', kart: kart.index })
        break
      case 'oel':
      case 'mine':
        this.hazards.push({
          kind,
          x: kart.x - cos * 110,
          y: kart.y - sin * 110,
          owner: kart.index,
          life: kind === 'oel' ? 26 : 34,
          arm: 0.8,
        })
        this.events.push({ kind: 'drop', kart: kart.index })
        break
      case 'schild':
        kart.shieldTimer = 9
        this.events.push({ kind: 'boost', kart: kart.index })
        break
      case 'blitz':
        for (const other of this.karts) {
          if (other === kart) continue
          if (squash(other)) {
            this.events.push({ kind: 'hit', kart: other.index })
            if (this.mode === 'battle') this.popBalloon(other, kart)
          }
        }
        break
    }

    kart.itemUses--
    if (kart.itemUses <= 0) kart.item = null
    // Die KI feuerte sonst in dem Moment, in dem sie ein Item bekommt. Mit
    // acht Karts wurde daraus Dauerbeschuss, und das Rennen entschied nur noch
    // das Item-Glück. Eine Pause danach macht daraus wieder ein Rennen.
    if (kart.player < 0) kart.aiItemTimer = 1.4 + this.rng.next() * 1.8
  }

  /** Nächstes Kart in Fahrtrichtung - Ziel für die Rakete. */
  private targetAhead(kart: Kart): number {
    let best = -1
    let bestScore = Infinity
    for (const other of this.karts) {
      if (other === kart || other.respawnTimer > 0) continue
      const dx = other.x - kart.x
      const dy = other.y - kart.y
      const d = Math.hypot(dx, dy)
      if (d < 1 || d > 2600) continue
      const ahead = (dx * Math.cos(kart.angle) + dy * Math.sin(kart.angle)) / d
      if (ahead < 0.2) continue
      const score = d * (2 - ahead)
      if (score < bestScore) {
        bestScore = score
        best = other.index
      }
    }
    return best
  }

  // ------------------------------------------------------------- Geschosse

  private updateProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]!
      p.life -= dt

      if (p.kind === 'rakete' && p.target >= 0) {
        const t = this.karts[p.target]!
        const desired = Math.atan2(t.y - p.y, t.x - p.x)
        p.angle += clamp(angleDelta(p.angle, desired), -2.6 * dt, 2.6 * dt)
      }

      const nx = p.x + Math.cos(p.angle) * p.speed * dt
      const ny = p.y + Math.sin(p.angle) * p.speed * dt

      if (surfaceAt(this.track, nx, ny) === SURFACE.WALL) {
        if (p.kind === 'kugel' && p.bounces > 0) {
          // Achsenweise spiegeln: reicht für die rechtwinkligen Arenawände.
          const hitX = surfaceAt(this.track, nx, p.y) === SURFACE.WALL
          p.angle = hitX ? Math.PI - p.angle : -p.angle
          p.bounces--
          continue
        }
        this.explode(p.x, p.y)
        this.projectiles.splice(i, 1)
        continue
      }

      p.x = nx
      p.y = ny

      let consumed = false
      for (const kart of this.karts) {
        if (kart.index === p.owner && p.life > 5.4) continue
        if (kart.respawnTimer > 0) continue
        if ((kart.x - p.x) ** 2 + (kart.y - p.y) ** 2 > (PHYSICS.kartRadius + 26) ** 2) continue
        if (spinOut(kart)) {
          this.events.push({ kind: 'hit', kart: kart.index })
          this.explode(p.x, p.y)
          if (this.mode === 'battle') this.popBalloon(kart, this.karts[p.owner])
        } else {
          this.events.push({ kind: 'pop', kart: kart.index })
        }
        consumed = true
        break
      }

      if (consumed || p.life <= 0) this.projectiles.splice(i, 1)
    }
  }

  private updateHazards(dt: number): void {
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i]!
      h.life -= dt
      h.arm = Math.max(0, h.arm - dt)
      if (h.life <= 0) {
        this.hazards.splice(i, 1)
        continue
      }
      for (const kart of this.karts) {
        if (kart.respawnTimer > 0) continue
        if (h.arm > 0 && kart.index === h.owner) continue
        if ((kart.x - h.x) ** 2 + (kart.y - h.y) ** 2 > 62 ** 2) continue
        if (spinOut(kart, h.kind === 'mine' ? PHYSICS.hitSpinDuration : 1.0)) {
          this.events.push({ kind: 'hit', kart: kart.index })
          if (this.mode === 'battle') this.popBalloon(kart, this.karts[h.owner])
        } else {
          this.events.push({ kind: 'pop', kart: kart.index })
        }
        if (h.kind === 'mine') {
          this.explode(h.x, h.y)
          this.hazards.splice(i, 1)
        }
        break
      }
    }
  }

  private popBalloon(victim: Kart, attacker: Kart | undefined): void {
    if (victim.balloons <= 0) return
    victim.balloons--
    if (attacker && attacker !== victim) attacker.score++
    this.events.push({ kind: 'pop', kart: victim.index })
    if (victim.balloons <= 0) {
      // Ausgeschieden: dauerhaft aus dem Spielfeld nehmen (wird nicht gezeichnet).
      victim.finished = true
      victim.respawnTimer = Number.POSITIVE_INFINITY
    } else {
      victim.invulnTimer = BATTLE.respawnSeconds
    }
  }

  // --------------------------------------------------------------- Kollision

  private resolveKartCollisions(): void {
    const min = PHYSICS.kartRadius * 2
    for (let i = 0; i < this.karts.length; i++) {
      for (let j = i + 1; j < this.karts.length; j++) {
        const a = this.karts[i]!
        const b = this.karts[j]!
        if (a.respawnTimer > 0 || b.respawnTimer > 0) continue
        const dx = b.x - a.x
        const dy = b.y - a.y
        const d = Math.hypot(dx, dy)
        if (d >= min || d < 0.001) continue
        const nx = dx / d
        const ny = dy / d
        const overlap = min - d
        // Schwerere Karts werden weniger weit weggeschoben.
        const wa = b.driver.weight / (a.driver.weight + b.driver.weight)
        const wb = 1 - wa
        a.x -= nx * overlap * wa
        a.y -= ny * overlap * wa
        b.x += nx * overlap * wb
        b.y += ny * overlap * wb
        const push = 130
        a.vx -= nx * push * wa
        a.vy -= ny * push * wa
        b.vx += nx * push * wb
        b.vy += ny * push * wb
      }
    }
  }

  // -------------------------------------------------------------- Partikel

  private burst(kart: Kart, count: number, color: string): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU
      this.particles.push({
        x: kart.x,
        y: kart.y,
        z: 10 + Math.random() * 30,
        vx: Math.cos(a) * 120,
        vy: Math.sin(a) * 120,
        vz: 60 + Math.random() * 90,
        life: 0.5,
        maxLife: 0.5,
        size: 8 + Math.random() * 8,
        color,
      })
    }
  }

  private driftSpark(kart: Kart): void {
    const stage =
      kart.driftCharge >= PHYSICS.miniTurboStage2 ? 2 : kart.driftCharge >= PHYSICS.miniTurboStage1 ? 1 : 0
    const color = stage === 2 ? '#ff7ad9' : stage === 1 ? '#ffe14a' : '#c9d4e8'
    const back = kart.angle + Math.PI
    this.particles.push({
      x: kart.x + Math.cos(back) * 40 + Math.cos(kart.angle + Math.PI / 2) * kart.driftDir * 26,
      y: kart.y + Math.sin(back) * 40 + Math.sin(kart.angle + Math.PI / 2) * kart.driftDir * 26,
      z: 6,
      vx: Math.cos(back) * 70 + (Math.random() - 0.5) * 90,
      vy: Math.sin(back) * 70 + (Math.random() - 0.5) * 90,
      vz: 40 + Math.random() * 60,
      life: 0.32,
      maxLife: 0.32,
      size: 6 + Math.random() * 5,
      color,
    })
  }

  private flame(kart: Kart, dt: number): void {
    if (Math.random() > dt * 34) return
    const back = kart.angle + Math.PI
    this.particles.push({
      x: kart.x + Math.cos(back) * 46,
      y: kart.y + Math.sin(back) * 46,
      z: 18,
      vx: Math.cos(back) * 120,
      vy: Math.sin(back) * 120,
      vz: 30,
      life: 0.28,
      maxLife: 0.28,
      size: 12 + Math.random() * 10,
      color: Math.random() < 0.5 ? '#ff8a2e' : '#ffe36a',
    })
  }

  private explode(x: number, y: number): void {
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * TAU
      const s = 90 + Math.random() * 220
      this.particles.push({
        x,
        y,
        z: 12,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        vz: 90 + Math.random() * 140,
        life: 0.55,
        maxLife: 0.55,
        size: 10 + Math.random() * 12,
        color: Math.random() < 0.4 ? '#ffffff' : Math.random() < 0.6 ? '#ffb43a' : '#ff5b3a',
      })
    }
  }

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!
      p.life -= dt
      if (p.life <= 0) {
        this.particles.splice(i, 1)
        continue
      }
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.z += p.vz * dt
      p.vz -= 340 * dt
      if (p.z < 0) {
        p.z = 0
        p.vz *= -0.3
      }
    }
  }

  // ------------------------------------------------------------------- Ende

  private checkEnd(dt: number): void {
    if (this.state === 'over') return

    if (this.mode === 'battle') {
      const alive = this.karts.filter((k) => k.balloons > 0)
      const humansAlive = this.players.filter((k) => k.balloons > 0)
      if (alive.length <= 1 || humansAlive.length === 0) this.state = 'over'
      return
    }

    const humansDone = this.players.every((k) => k.finished)
    if (humansDone) {
      this.overDelay += dt
      if (this.overDelay > RACE.finishLingerSeconds || this.karts.every((k) => k.finished)) {
        this.state = 'over'
      }
    }
  }

  /** Für die HUD-Anzeige: aktuelle Rundenzeit eines Karts. */
  currentLapTime(kart: Kart): number {
    return kart.finished ? (kart.lapTimes[kart.lapTimes.length - 1] ?? 0) : this.time - kart.lapStart
  }

  /** Bricht einen laufenden Drift ab (z. B. beim Pausieren). */
  cancelDrifts(): void {
    for (const k of this.karts) if (k.drifting) releaseDrift(k)
  }

  speedRatio(kart: Kart): number {
    return clamp(forwardSpeed(kart) / PHYSICS.maxSpeed, 0, 1.5)
  }
}
