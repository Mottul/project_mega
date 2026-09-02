import { CAMERA } from '../game/config'
import type { Kart } from '../game/kart'
import type { World } from '../game/world'
import { damp, TAU } from '../core/math'
import { Mode7Renderer, type Camera, type Viewport } from './mode7'
import {
  buildBalloonSprite,
  buildDecorSprites,
  buildItemBoxFrames,
  buildKartSprites,
  buildMineSprite,
  buildOilSprite,
  buildProjectileSprite,
  buildWallSprite,
  kartFrameIndex,
  type KartSpriteSet,
} from './sprites'
import { DRIVERS } from '../game/drivers'

/** Muss zum Pfostenabstand in trackgen.buildWalls passen. */
const WALL_SEGMENT_WIDTH = 104

interface Billboard {
  image: CanvasImageSource
  x: number
  y: number
  z: number
  /** Höhe in Welteinheiten. */
  height: number
  depth: number
  alpha: number
  /** Breite in Welteinheiten; ohne Angabe aus dem Seitenverhältnis abgeleitet. */
  width?: number
  /** Am Boden verankert (Schatten/Ölfleck) statt hochkant. */
  flat?: boolean
}

/** Kamera pro Spieler, damit sie nachlaufen kann statt hart am Kart zu kleben. */
export interface ChaseCamera extends Camera {
  smoothAngle: number
}

export function createChaseCamera(kart: Kart): ChaseCamera {
  return {
    x: kart.x - Math.cos(kart.angle) * CAMERA.distance,
    y: kart.y - Math.sin(kart.angle) * CAMERA.distance,
    angle: kart.angle,
    height: CAMERA.height,
    pitchOffset: 0,
    smoothAngle: kart.angle,
  }
}

export function updateChaseCamera(cam: ChaseCamera, kart: Kart, dt: number): void {
  // Der Blickwinkel folgt weich; im Drift schaut die Kamera leicht in die Kurve.
  const bias = kart.drifting ? kart.driftDir * 0.22 : 0
  const target = kart.angle + bias
  let delta = target - cam.smoothAngle
  while (delta > Math.PI) delta -= TAU
  while (delta < -Math.PI) delta += TAU
  cam.smoothAngle += delta * (1 - Math.pow(2, -dt / 0.07))
  cam.angle = cam.smoothAngle

  const dist = CAMERA.distance
  cam.x = kart.x - Math.cos(cam.angle) * dist
  cam.y = kart.y - Math.sin(cam.angle) * dist
  cam.height = damp(cam.height, CAMERA.height + kart.z * 0.8, 0.08, dt)
  cam.pitchOffset = damp(cam.pitchOffset, kart.z * 0.22, 0.08, dt)
}

export class SceneRenderer {
  readonly mode7: Mode7Renderer
  private kartSprites = new Map<string, KartSpriteSet>()
  private itemBoxFrames = buildItemBoxFrames()
  private decorSprites = buildDecorSprites()
  private oil = buildOilSprite()
  private mine = buildMineSprite()
  private rocket = buildProjectileSprite('#e5473a')
  private shell = buildProjectileSprite('#6fd0ff')
  private balloons = ['#ff5b6e', '#5bd0ff', '#ffe15b', '#7dff9c'].map(buildBalloonSprite)
  private wallSprites = new Map<string, HTMLCanvasElement>()
  private billboards: Billboard[] = []

  constructor(width: number, height: number) {
    this.mode7 = new Mode7Renderer(width, height)
    for (const d of DRIVERS) this.kartSprites.set(d.id, buildKartSprites(d.body, d.accent, d.skin))
  }

  resize(width: number, height: number): void {
    this.mode7.resize(width, height)
  }

  /** Zeichnet Boden und Himmel aller Ansichten in den Pixelpuffer. */
  renderGround(view: Viewport, cam: Camera, world: World): void {
    this.mode7.render(view, cam, world.track)
  }

  /**
   * Zeichnet alle Objekte einer Ansicht. Muss nach putImageData laufen, weil
   * Sprites über den 2D-Kontext skaliert werden.
   */
  renderObjects(
    ctx: CanvasRenderingContext2D,
    view: Viewport,
    cam: Camera,
    world: World,
    time: number
  ): void {
    const list = this.billboards
    list.length = 0

    for (const d of world.track.decor) {
      const set = this.decorSprites[d.kind]
      if (!set || set.length === 0) continue
      list.push({
        image: set[d.variant % set.length]!,
        x: d.x,
        y: d.y,
        z: 0,
        height: d.height,
        depth: 0,
        alpha: 1,
      })
    }

    if (world.track.walls.length > 0) {
      const theme = world.track.def.theme
      const key = theme.curb[0] + theme.curb[1]
      let wall = this.wallSprites.get(key)
      if (!wall) {
        wall = buildWallSprite(theme.curb[0], theme.curb[1])
        this.wallSprites.set(key, wall)
      }
      for (const post of world.track.walls) {
        // Breite = Pfostenabstand, damit die Segmente eine Wand ergeben statt
        // sich zu einem undurchsichtigen Block zu stapeln.
        list.push({
          image: wall,
          x: post.x,
          y: post.y,
          z: 0,
          height: post.height,
          width: WALL_SEGMENT_WIDTH,
          depth: 0,
          alpha: 1,
        })
      }
    }

    for (const box of world.boxes) {
      if (box.timer > 0) continue
      const frame = this.itemBoxFrames[Math.floor(time * 6 + box.x * 0.01) % this.itemBoxFrames.length]!
      list.push({
        image: frame,
        x: box.x,
        y: box.y,
        z: 30 + Math.sin(time * 3 + box.x * 0.02) * 10,
        height: 54,
        depth: 0,
        alpha: 1,
      })
    }

    for (const h of world.hazards) {
      list.push({
        image: h.kind === 'oel' ? this.oil : this.mine,
        x: h.x,
        y: h.y,
        z: h.kind === 'oel' ? 2 : 16,
        height: h.kind === 'oel' ? 78 : 40,
        depth: 0,
        alpha: 1,
        flat: h.kind === 'oel',
      })
    }

    for (const p of world.projectiles) {
      list.push({
        image: p.kind === 'rakete' ? this.rocket : this.shell,
        x: p.x,
        y: p.y,
        z: 22,
        height: 42,
        depth: 0,
        alpha: 1,
      })
    }

    for (const kart of world.karts) {
      if (kart.respawnTimer > 0) continue
      this.pushKart(list, kart, cam, time, world)
    }

    for (const p of world.particles) {
      list.push({
        image: particleSprite(p.color),
        x: p.x,
        y: p.y,
        z: p.z,
        height: p.size * (p.life / p.maxLife) * 4,
        depth: 0,
        alpha: Math.min(1, p.life / p.maxLife),
      })
    }

    // Tiefensortierung: entferntes zuerst.
    const drawList: (Billboard & { sx: number; sy: number; scale: number })[] = []
    for (const b of list) {
      const proj = this.mode7.project(view, cam, b.x, b.y, b.z)
      if (!proj) continue
      drawList.push({ ...b, sx: proj.sx, sy: proj.sy, scale: proj.scale, depth: proj.depth })
    }
    drawList.sort((a, b) => b.depth - a.depth)

    ctx.save()
    ctx.beginPath()
    ctx.rect(view.x, view.y, view.w, view.h)
    ctx.clip()
    ctx.imageSmoothingEnabled = false
    for (const b of drawList) {
      const h = b.height * b.scale
      const img = b.image as HTMLCanvasElement
      const w = b.width !== undefined ? b.width * b.scale : h * (img.width / img.height)
      if (h < 0.8) continue
      ctx.globalAlpha = b.alpha
      if (b.flat) ctx.drawImage(img, b.sx - w / 2, b.sy - h * 0.25, w, h * 0.5)
      else ctx.drawImage(img, b.sx - w / 2, b.sy - h, w, h)
    }
    ctx.globalAlpha = 1
    ctx.restore()
  }

  private pushKart(list: Billboard[], kart: Kart, cam: Camera, time: number, world: World): void {
    const set = this.kartSprites.get(kart.driver.id)
    if (!set) return
    // Frame ergibt sich aus dem Winkel zwischen Kart- und Kameraausrichtung.
    const relative = kart.angle - cam.angle + Math.PI
    const flashing = kart.invulnTimer > 0 && Math.floor(time * 14) % 2 === 0
    const frames = flashing ? set.flash : set.frames
    const scaleY = kart.squashTimer > 0 ? 0.45 : 1

    // Schatten
    list.push({
      image: shadowSprite(),
      x: kart.x,
      y: kart.y,
      z: 1,
      height: 58,
      depth: 0,
      alpha: 0.45,
      flat: true,
    })

    list.push({
      image: frames[kartFrameIndex(relative)]!,
      x: kart.x,
      y: kart.y,
      z: kart.z,
      height: 76 * scaleY,
      depth: 0,
      alpha: 1,
    })

    if (kart.shieldTimer > 0) {
      list.push({
        image: shieldSprite(),
        x: kart.x,
        y: kart.y,
        z: kart.z + 20,
        height: 118,
        depth: 0,
        alpha: 0.55 + Math.sin(time * 8) * 0.15,
      })
    }

    if (world.mode === 'battle' && kart.balloons > 0) {
      for (let i = 0; i < kart.balloons; i++) {
        const a = time * 2.2 + (i / 3) * TAU
        list.push({
          image: this.balloons[kart.index % this.balloons.length]!,
          x: kart.x + Math.cos(a) * 22,
          y: kart.y + Math.sin(a) * 22,
          z: kart.z + 64,
          height: 34,
          depth: 0,
          alpha: 1,
        })
      }
    }
  }
}

// Kleine, einmalig erzeugte Hilfssprites (Cache über den Modulzustand).
const particleCache = new Map<string, HTMLCanvasElement>()
function particleSprite(color: string): HTMLCanvasElement {
  let c = particleCache.get(color)
  if (c) return c
  c = document.createElement('canvas')
  c.width = 16
  c.height = 16
  const ctx = c.getContext('2d')!
  const grad = ctx.createRadialGradient(8, 8, 0, 8, 8, 8)
  grad.addColorStop(0, color)
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 16, 16)
  particleCache.set(color, c)
  return c
}

let shadowCanvas: HTMLCanvasElement | null = null
function shadowSprite(): HTMLCanvasElement {
  if (shadowCanvas) return shadowCanvas
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 32
  const ctx = c.getContext('2d')!
  const grad = ctx.createRadialGradient(32, 16, 2, 32, 16, 30)
  grad.addColorStop(0, 'rgba(0,0,0,0.6)')
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 64, 32)
  shadowCanvas = c
  return c
}

let shieldCanvas: HTMLCanvasElement | null = null
function shieldSprite(): HTMLCanvasElement {
  if (shieldCanvas) return shieldCanvas
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 64
  const ctx = c.getContext('2d')!
  const grad = ctx.createRadialGradient(32, 32, 10, 32, 32, 31)
  grad.addColorStop(0, 'rgba(120,255,190,0)')
  grad.addColorStop(0.75, 'rgba(120,255,190,0.35)')
  grad.addColorStop(1, 'rgba(180,255,220,0.9)')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(32, 32, 31, 0, Math.PI * 2)
  ctx.fill()
  shieldCanvas = c
  return c
}
