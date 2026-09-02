import { CAMERA, TEX_SCALE, TEX_SIZE } from '../game/config'
import type { BuiltTrack } from '../game/trackgen'
import { clamp, TAU } from '../core/math'

export interface Camera {
  x: number
  y: number
  angle: number
  height: number
  /** Zusätzlicher Horizontversatz in Pixeln (Sprünge, Treffer). */
  pitchOffset: number
}

export interface Viewport {
  x: number
  y: number
  w: number
  h: number
}

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

/**
 * Software-Mode-7: pro Bildschirmzeile eine affine Abbildung auf die
 * Streckentextur. Genau wie beim SNES entsteht der Tiefeneindruck allein
 * dadurch, dass die Abtastschrittweite mit der Entfernung wächst.
 */
export class Mode7Renderer {
  private image: ImageData
  width: number
  height: number
  /** Pro Ansicht gemerkte Horizontzeile - Sprites brauchen sie zum Projizieren. */
  private ridgeCache = new Float32Array(0)

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.image = new ImageData(width, height)
  }

  resize(width: number, height: number): void {
    if (width === this.width && height === this.height) return
    this.width = width
    this.height = height
    this.image = new ImageData(width, height)
  }

  get buffer(): ImageData {
    return this.image
  }

  focalFor(view: Viewport): number {
    return view.h * CAMERA.focalRatio
  }

  horizonFor(view: Viewport, cam: Camera): number {
    return view.y + view.h * CAMERA.horizonRatio + cam.pitchOffset
  }

  /**
   * Projiziert eine Weltposition in die Ansicht.
   * Rückgabe: null, wenn hinter der Kamera oder außerhalb der Sichtweite.
   */
  project(
    view: Viewport,
    cam: Camera,
    wx: number,
    wy: number,
    wz = 0
  ): { sx: number; sy: number; scale: number; depth: number } | null {
    const dx = wx - cam.x
    const dy = wy - cam.y
    const cos = Math.cos(cam.angle)
    const sin = Math.sin(cam.angle)
    const forward = dx * cos + dy * sin
    if (forward < 40 || forward > CAMERA.far) return null
    const side = -dx * sin + dy * cos
    const focal = this.focalFor(view)
    const scale = focal / forward
    return {
      sx: view.x + view.w / 2 + side * scale,
      sy: this.horizonFor(view, cam) + (cam.height - wz) * scale,
      scale,
      depth: forward,
    }
  }

  /** Zeichnet Himmel und Fahrbahn einer Ansicht direkt in den Pixelpuffer. */
  render(view: Viewport, cam: Camera, track: BuiltTrack): void {
    const data = this.image.data
    const W = this.width
    const theme = track.def.theme
    const focal = this.focalFor(view)
    const horizon = this.horizonFor(view, cam)
    const [fogR, fogG, fogB] = theme.fog

    this.renderSky(view, cam, track, horizon)

    const cos = Math.cos(cam.angle)
    const sin = Math.sin(cam.angle)
    const color = track.color
    const outside = hexToRgb(theme.abyss ? theme.skyTop : theme.ground[0])

    const yStart = Math.max(view.y, Math.ceil(horizon))
    const yEnd = view.y + view.h

    for (let y = yStart; y < yEnd; y++) {
      const dz = y - horizon
      if (dz <= 0.5) continue
      const d = (cam.height * focal) / dz

      // Nebel wird pro Zeile konstant - spart drei Multiplikationen je Pixel.
      const fog = clamp((d - CAMERA.fogStart) / (CAMERA.far - CAMERA.fogStart), 0, 1)
      const inv = 1 - fog
      const fr = fogR * fog
      const fg = fogG * fog
      const fb = fogB * fog

      const stepX = (-sin * d) / focal
      const stepY = (cos * d) / focal
      let px = cam.x + cos * d - stepX * (view.w / 2)
      let py = cam.y + sin * d - stepY * (view.w / 2)

      let o = (y * W + view.x) * 4
      for (let x = 0; x < view.w; x++, o += 4) {
        const tx = (px * TEX_SCALE) | 0
        const ty = (py * TEX_SCALE) | 0
        let r: number
        let g: number
        let b: number
        if (tx < 0 || ty < 0 || tx >= TEX_SIZE || ty >= TEX_SIZE) {
          r = outside[0]
          g = outside[1]
          b = outside[2]
        } else {
          const t = (ty * TEX_SIZE + tx) << 2
          r = color[t]!
          g = color[t + 1]!
          b = color[t + 2]!
        }
        data[o] = r * inv + fr
        data[o + 1] = g * inv + fg
        data[o + 2] = b * inv + fb
        data[o + 3] = 255
        px += stepX
        py += stepY
      }
    }
  }

  /** Himmel mit Farbverlauf, Sonne und angedeuteter Bergsilhouette. */
  private renderSky(view: Viewport, cam: Camera, track: BuiltTrack, horizon: number): void {
    const data = this.image.data
    const W = this.width
    const theme = track.def.theme
    const top = hexToRgb(theme.skyTop)
    const bottom = hexToRgb(theme.skyBottom)
    const yEnd = Math.min(view.y + view.h, Math.ceil(horizon))

    for (let y = view.y; y < yEnd; y++) {
      const t = clamp((y - view.y) / Math.max(1, horizon - view.y), 0, 1)
      const r = top[0] + (bottom[0] - top[0]) * t
      const g = top[1] + (bottom[1] - top[1]) * t
      const b = top[2] + (bottom[2] - top[2]) * t
      let o = (y * W + view.x) * 4
      for (let x = 0; x < view.w; x++, o += 4) {
        data[o] = r
        data[o + 1] = g
        data[o + 2] = b
        data[o + 3] = 255
      }
    }

    const focal = this.focalFor(view)
    if (theme.sun) this.drawSun(view, cam, focal, horizon, hexToRgb(theme.sun))
    if (theme.ridge) this.drawRidge(view, cam, focal, horizon, hexToRgb(theme.ridge))
    if (theme.abyss) this.drawStars(view, cam, focal, horizon)
  }

  private drawSun(
    view: Viewport,
    cam: Camera,
    focal: number,
    horizon: number,
    rgb: [number, number, number]
  ): void {
    // Sonne steht fest im Weltkoordinatensystem (Azimut 0) und wandert daher
    // beim Lenken korrekt durchs Bild.
    const rel = Math.atan2(Math.sin(-cam.angle), Math.cos(-cam.angle))
    if (Math.abs(rel) > 1.2) return
    const cx = view.x + view.w / 2 + Math.tan(rel) * focal
    const cy = horizon - view.h * 0.16
    const radius = view.h * 0.11
    this.disc(view, cx, cy, radius, rgb, 0.95)
    this.disc(view, cx, cy, radius * 1.9, rgb, 0.16)
  }

  private disc(
    view: Viewport,
    cx: number,
    cy: number,
    radius: number,
    rgb: [number, number, number],
    alpha: number
  ): void {
    const data = this.image.data
    const W = this.width
    const x0 = Math.max(view.x, Math.floor(cx - radius))
    const x1 = Math.min(view.x + view.w, Math.ceil(cx + radius))
    const y0 = Math.max(view.y, Math.floor(cy - radius))
    const y1 = Math.min(view.y + view.h, Math.ceil(cy + radius))
    const r2 = radius * radius
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const dd = (x - cx) ** 2 + (y - cy) ** 2
        if (dd > r2) continue
        const a = alpha * (1 - dd / r2) ** 0.5
        const o = (y * W + x) * 4
        data[o] = data[o]! + (rgb[0] - data[o]!) * a
        data[o + 1] = data[o + 1]! + (rgb[1] - data[o + 1]!) * a
        data[o + 2] = data[o + 2]! + (rgb[2] - data[o + 2]!) * a
      }
    }
  }

  private drawRidge(
    view: Viewport,
    cam: Camera,
    focal: number,
    horizon: number,
    rgb: [number, number, number]
  ): void {
    const data = this.image.data
    const W = this.width
    if (this.ridgeCache.length < view.w) this.ridgeCache = new Float32Array(view.w)
    const amp = view.h * 0.13
    for (let x = 0; x < view.w; x++) {
      // Azimut der Spalte -> periodisches Profil; wiederholt sich alle 360°.
      const az = cam.angle + Math.atan((x - view.w / 2) / focal)
      const u = (az / TAU) * 9
      const h =
        Math.sin(u * TAU) * 0.5 + Math.sin(u * TAU * 2.3 + 1.7) * 0.3 + Math.sin(u * TAU * 5.1 + 0.4) * 0.2
      this.ridgeCache[x] = horizon - (0.35 + h * 0.5) * amp
    }
    for (let x = 0; x < view.w; x++) {
      const topY = Math.max(view.y, Math.floor(this.ridgeCache[x]!))
      const botY = Math.min(view.y + view.h, Math.ceil(horizon))
      for (let y = topY; y < botY; y++) {
        const o = (y * W + view.x + x) * 4
        const shade = 0.75 + 0.25 * ((y - topY) / Math.max(1, botY - topY))
        data[o] = rgb[0] * shade
        data[o + 1] = rgb[1] * shade
        data[o + 2] = rgb[2] * shade
      }
    }
  }

  private drawStars(view: Viewport, cam: Camera, focal: number, horizon: number): void {
    const data = this.image.data
    const W = this.width
    // Feste Sterne im Weltazimut - deterministisch aus dem Index berechnet.
    for (let i = 0; i < 90; i++) {
      const az = (i * 2.39996) % TAU
      const rel = Math.atan2(Math.sin(az - cam.angle), Math.cos(az - cam.angle))
      if (Math.abs(rel) > 1.1) continue
      const x = Math.round(view.x + view.w / 2 + Math.tan(rel) * focal)
      const y = Math.round(view.y + ((i * 37) % Math.max(1, Math.floor(horizon - view.y))))
      if (x < view.x || x >= view.x + view.w || y < view.y || y >= horizon) continue
      const o = (y * W + x) * 4
      const b = 170 + ((i * 53) % 85)
      data[o] = b
      data[o + 1] = b
      data[o + 2] = 255
    }
  }
}
