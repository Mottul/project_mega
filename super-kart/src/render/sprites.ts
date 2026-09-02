/**
 * Alle Sprites werden beim Start prozedural gerendert - kein einziges
 * Bild-Asset. Karts entstehen als Mini-3D-Modell aus Quadern, das für 32
 * Blickwinkel abgezeichnet wird (wie die vorgerenderten SNES-Frames).
 */

type Vec3 = readonly [number, number, number]

interface Face {
  pts: Vec3[]
  normal: Vec3
  color: [number, number, number]
}

const LIGHT: Vec3 = [-0.42, -0.58, 0.7]
const PITCH = 0.44

function rgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

function box(
  cx: number,
  cy: number,
  cz: number,
  hx: number,
  hy: number,
  hz: number,
  color: [number, number, number]
): Face[] {
  const x0 = cx - hx
  const x1 = cx + hx
  const y0 = cy - hy
  const y1 = cy + hy
  const z0 = cz - hz
  const z1 = cz + hz
  const p = (x: number, y: number, z: number): Vec3 => [x, y, z]
  return [
    { pts: [p(x0, y0, z1), p(x1, y0, z1), p(x1, y1, z1), p(x0, y1, z1)], normal: [0, 0, 1], color },
    { pts: [p(x0, y1, z0), p(x1, y1, z0), p(x1, y1, z1), p(x0, y1, z1)], normal: [0, 1, 0], color },
    { pts: [p(x0, y0, z0), p(x1, y0, z0), p(x1, y0, z1), p(x0, y0, z1)], normal: [0, -1, 0], color },
    { pts: [p(x1, y0, z0), p(x1, y1, z0), p(x1, y1, z1), p(x1, y0, z1)], normal: [1, 0, 0], color },
    { pts: [p(x0, y0, z0), p(x0, y1, z0), p(x0, y1, z1), p(x0, y0, z1)], normal: [-1, 0, 0], color },
    { pts: [p(x0, y0, z0), p(x1, y0, z0), p(x1, y1, z0), p(x0, y1, z0)], normal: [0, 0, -1], color },
  ]
}

function rotZ(v: Vec3, s: number, c: number): Vec3 {
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]]
}

/**
 * Zeichnet ein Quader-Modell aus einem gegebenen Gierwinkel in ein Canvas.
 * Malerdealgorithmus: hinten zuerst - bei konvexen Quadern völlig ausreichend.
 */
function renderModel(
  faces: Face[],
  yaw: number,
  size: number,
  unit: number,
  originY: number
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const s = Math.sin(yaw)
  const c = Math.cos(yaw)
  const cp = Math.cos(PITCH)
  const sp = Math.sin(PITCH)

  const projected = faces.map((face) => {
    const n = rotZ(face.normal, s, c)
    const pts = face.pts.map((p) => rotZ(p, s, c))
    const depth = pts.reduce((acc, p) => acc + p[1] * cp + p[2] * sp, 0) / pts.length
    const screen = pts.map((p) => [size / 2 + p[0] * unit, originY - (p[2] * cp - p[1] * sp) * unit])
    const lambert = Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2])
    const shade = 0.42 + 0.58 * lambert
    return { screen, depth, color: face.color, shade, facing: n[1] * cp + n[2] * sp }
  })

  projected.sort((a, b) => b.depth - a.depth)
  for (const f of projected) {
    // Rückseiten weglassen - spart Füllfläche und vermeidet Farbsäume.
    if (f.facing > 0.02) continue
    ctx.beginPath()
    ctx.moveTo(f.screen[0]![0]!, f.screen[0]![1]!)
    for (let i = 1; i < f.screen.length; i++) ctx.lineTo(f.screen[i]![0]!, f.screen[i]![1]!)
    ctx.closePath()
    const [r, g, b] = f.color
    ctx.fillStyle = `rgb(${Math.round(r * f.shade)},${Math.round(g * f.shade)},${Math.round(b * f.shade)})`
    ctx.fill()
  }
  return canvas
}

export interface KartSpriteSet {
  /** Frames für Gierwinkel 0..2PI, Index 0 = Blick auf das Heck. */
  frames: HTMLCanvasElement[]
  /** Gleiche Frames, aber weiß überstrahlt (Treffer-Blinken). */
  flash: HTMLCanvasElement[]
}

const KART_FRAMES = 32
const KART_SIZE = 72

function kartFaces(body: string, accent: string, skin: string): Face[] {
  const bodyC = rgb(body)
  const accentC = rgb(accent)
  const skinC = rgb(skin)
  const tyre: [number, number, number] = [30, 30, 36]
  const dark: [number, number, number] = [22, 24, 34]

  return [
    // Räder
    ...box(-0.74, 0.66, 0.28, 0.17, 0.3, 0.28, tyre),
    ...box(0.74, 0.66, 0.28, 0.17, 0.3, 0.28, tyre),
    ...box(-0.78, -0.66, 0.32, 0.19, 0.34, 0.32, tyre),
    ...box(0.78, -0.66, 0.32, 0.19, 0.34, 0.32, tyre),
    // Chassis
    ...box(0, 0, 0.32, 0.6, 1.0, 0.2, bodyC),
    ...box(0, 0.78, 0.36, 0.4, 0.3, 0.15, accentC),
    // Sitz und Fahrer
    ...box(0, -0.34, 0.62, 0.34, 0.3, 0.16, dark),
    ...box(0, -0.24, 0.78, 0.3, 0.26, 0.2, accentC),
    ...box(0, -0.22, 1.06, 0.27, 0.26, 0.22, skinC),
    ...box(0, -0.22, 1.16, 0.3, 0.29, 0.16, bodyC),
    ...box(0, 0.06, 1.06, 0.2, 0.05, 0.09, [46, 120, 210]),
    // Heckflügel
    ...box(0, -1.02, 0.66, 0.66, 0.07, 0.05, accentC),
    ...box(-0.4, -1.0, 0.5, 0.06, 0.05, 0.16, dark),
    ...box(0.4, -1.0, 0.5, 0.06, 0.05, 0.16, dark),
  ]
}

/**
 * Beschneidet alle Frames auf dieselbe, gemeinsame Bounding-Box. Ohne das
 * bleibt oben viel leerer Rand stehen und das Sprite wirkt zu klein bzw.
 * Aufbauten wie Ballons schweben über dem Kart.
 */
function cropUniform(frames: HTMLCanvasElement[]): HTMLCanvasElement[] {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const frame of frames) {
    const { data } = frame.getContext('2d')!.getImageData(0, 0, frame.width, frame.height)
    for (let y = 0; y < frame.height; y++) {
      for (let x = 0; x < frame.width; x++) {
        if (data[(y * frame.width + x) * 4 + 3]! < 8) continue
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (minX > maxX || minY > maxY) return frames
  const w = maxX - minX + 1
  const h = maxY - minY + 1
  return frames.map((frame) => {
    const out = document.createElement('canvas')
    out.width = w
    out.height = h
    out.getContext('2d')!.drawImage(frame, -minX, -minY)
    return out
  })
}

export function buildKartSprites(body: string, accent: string, skin = '#f4d3ae'): KartSpriteSet {
  const faces = kartFaces(body, accent, skin)
  const raw: HTMLCanvasElement[] = []
  for (let i = 0; i < KART_FRAMES; i++) {
    raw.push(renderModel(faces, (i / KART_FRAMES) * Math.PI * 2, KART_SIZE, 22, KART_SIZE * 0.78))
  }
  const frames = cropUniform(raw)
  return { frames, flash: frames.map(whiteout) }
}

function whiteout(src: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = src.width
  canvas.height = src.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(src, 0, 0)
  ctx.globalCompositeOperation = 'source-atop'
  ctx.fillStyle = 'rgba(255,255,255,0.72)'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  return canvas
}

/** Wählt den Frame für den Winkel zwischen Kart- und Kameraausrichtung. */
export function kartFrameIndex(relativeYaw: number): number {
  const t = relativeYaw / (Math.PI * 2)
  return ((Math.round(t * KART_FRAMES) % KART_FRAMES) + KART_FRAMES) % KART_FRAMES
}

// ------------------------------------------------------------- Objekt-Sprites

function sprite(size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  draw(canvas.getContext('2d')!, size)
  return canvas
}

export function buildItemBoxFrames(): HTMLCanvasElement[] {
  const faces = [...box(0, 0, 0, 0.5, 0.5, 0.5, [250, 214, 74])]
  const out: HTMLCanvasElement[] = []
  for (let i = 0; i < 16; i++) {
    const canvas = renderModel(faces, (i / 16) * Math.PI * 2, 48, 26, 34)
    const ctx = canvas.getContext('2d')!
    ctx.font = 'bold 20px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = 'rgba(60,40,10,0.85)'
    ctx.fillText('?', 24, 24)
    out.push(canvas)
  }
  return cropUniform(out)
}

/** Mauersegment für Arenen - als Billboard aneinandergereiht ergibt es eine Wand. */
export function buildWallSprite(top: string, face: string): HTMLCanvasElement {
  return sprite(64, (ctx, s) => {
    const grad = ctx.createLinearGradient(0, 0, 0, s)
    grad.addColorStop(0, top)
    grad.addColorStop(0.22, face)
    grad.addColorStop(1, shadeHex(face, 0.55))
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, s, s)
    ctx.fillStyle = 'rgba(0,0,0,0.22)'
    for (let y = s * 0.28; y < s; y += s * 0.24) ctx.fillRect(0, y, s, 1.5)
    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    ctx.fillRect(0, 0, s, s * 0.1)
  })
}

function shadeHex(hex: string, factor: number): string {
  const [r, g, b] = rgb(hex)
  return `rgb(${Math.round(r * factor)},${Math.round(g * factor)},${Math.round(b * factor)})`
}

export function buildProjectileSprite(color: string): HTMLCanvasElement {
  return sprite(32, (ctx, s) => {
    const c = s / 2
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.ellipse(c, c, s * 0.3, s * 0.26, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.75)'
    ctx.beginPath()
    ctx.ellipse(c - s * 0.08, c - s * 0.08, s * 0.11, s * 0.08, -0.4, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.ellipse(c, c, s * 0.3, s * 0.26, 0, 0, Math.PI * 2)
    ctx.stroke()
  })
}

export function buildOilSprite(): HTMLCanvasElement {
  return sprite(48, (ctx, s) => {
    const grad = ctx.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, s / 2)
    grad.addColorStop(0, 'rgba(40,36,52,0.95)')
    grad.addColorStop(0.7, 'rgba(24,22,34,0.85)')
    grad.addColorStop(1, 'rgba(24,22,34,0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.ellipse(s / 2, s * 0.62, s * 0.46, s * 0.26, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(120,110,180,0.35)'
    ctx.beginPath()
    ctx.ellipse(s * 0.38, s * 0.56, s * 0.12, s * 0.06, 0.3, 0, Math.PI * 2)
    ctx.fill()
  })
}

export function buildMineSprite(): HTMLCanvasElement {
  return sprite(40, (ctx, s) => {
    const c = s / 2
    ctx.strokeStyle = '#2b2b38'
    ctx.lineWidth = 3
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      ctx.beginPath()
      ctx.moveTo(c + Math.cos(a) * s * 0.2, c + Math.sin(a) * s * 0.2)
      ctx.lineTo(c + Math.cos(a) * s * 0.36, c + Math.sin(a) * s * 0.36)
      ctx.stroke()
    }
    ctx.fillStyle = '#3a3a4a'
    ctx.beginPath()
    ctx.arc(c, c, s * 0.24, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ff4d4d'
    ctx.beginPath()
    ctx.arc(c, c - s * 0.06, s * 0.07, 0, Math.PI * 2)
    ctx.fill()
  })
}

export function buildBalloonSprite(color: string): HTMLCanvasElement {
  return sprite(24, (ctx, s) => {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.ellipse(s / 2, s * 0.42, s * 0.28, s * 0.34, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.beginPath()
    ctx.ellipse(s * 0.42, s * 0.3, s * 0.07, s * 0.1, -0.3, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(s / 2, s * 0.76)
    ctx.lineTo(s / 2, s * 0.95)
    ctx.stroke()
  })
}

/** Deko am Streckenrand: einfache, aber gut lesbare Silhouetten. */
export function buildDecorSprites(): Record<string, HTMLCanvasElement[]> {
  const tree = (leaf: string, trunk: string, round: boolean) =>
    sprite(64, (ctx, s) => {
      ctx.fillStyle = trunk
      ctx.fillRect(s * 0.44, s * 0.6, s * 0.12, s * 0.4)
      ctx.fillStyle = leaf
      if (round) {
        ctx.beginPath()
        ctx.arc(s / 2, s * 0.4, s * 0.3, 0, Math.PI * 2)
        ctx.fill()
      } else {
        for (let i = 0; i < 3; i++) {
          const y = s * (0.24 + i * 0.16)
          const w = s * (0.16 + i * 0.11)
          ctx.beginPath()
          ctx.moveTo(s / 2, y - s * 0.18)
          ctx.lineTo(s / 2 + w, y + s * 0.12)
          ctx.lineTo(s / 2 - w, y + s * 0.12)
          ctx.closePath()
          ctx.fill()
        }
      }
    })

  const cactus = (arms: number) =>
    sprite(64, (ctx, s) => {
      ctx.fillStyle = '#2f7a45'
      ctx.fillRect(s * 0.42, s * 0.2, s * 0.16, s * 0.8)
      if (arms > 0) {
        ctx.fillRect(s * 0.2, s * 0.45, s * 0.24, s * 0.11)
        ctx.fillRect(s * 0.2, s * 0.3, s * 0.11, s * 0.2)
      }
      if (arms > 1) {
        ctx.fillRect(s * 0.56, s * 0.55, s * 0.24, s * 0.11)
        ctx.fillRect(s * 0.69, s * 0.38, s * 0.11, s * 0.24)
      }
    })

  const rock = (bright: boolean) =>
    sprite(64, (ctx, s) => {
      ctx.fillStyle = bright ? '#6b4a3c' : '#4a3630'
      ctx.beginPath()
      ctx.moveTo(s * 0.1, s)
      ctx.lineTo(s * 0.28, s * 0.35)
      ctx.lineTo(s * 0.55, s * 0.15)
      ctx.lineTo(s * 0.82, s * 0.45)
      ctx.lineTo(s * 0.92, s)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = 'rgba(255,150,80,0.35)'
      ctx.beginPath()
      ctx.moveTo(s * 0.55, s * 0.15)
      ctx.lineTo(s * 0.82, s * 0.45)
      ctx.lineTo(s * 0.6, s * 0.5)
      ctx.closePath()
      ctx.fill()
    })

  const ice = (tall: boolean) =>
    sprite(64, (ctx, s) => {
      ctx.fillStyle = 'rgba(180,220,245,0.92)'
      ctx.beginPath()
      ctx.moveTo(s * 0.5, tall ? s * 0.05 : s * 0.25)
      ctx.lineTo(s * 0.78, s)
      ctx.lineTo(s * 0.22, s)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.6)'
      ctx.beginPath()
      ctx.moveTo(s * 0.5, tall ? s * 0.05 : s * 0.25)
      ctx.lineTo(s * 0.6, s)
      ctx.lineTo(s * 0.46, s)
      ctx.closePath()
      ctx.fill()
    })

  const pylon = (hue: string) =>
    sprite(64, (ctx, s) => {
      const grad = ctx.createLinearGradient(0, 0, 0, s)
      grad.addColorStop(0, hue)
      grad.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = grad
      ctx.fillRect(s * 0.42, 0, s * 0.16, s)
      ctx.fillStyle = hue
      ctx.fillRect(s * 0.34, s * 0.86, s * 0.32, s * 0.1)
    })

  return {
    trees: [
      tree('#2f8a44', '#5a3a22', true),
      tree('#256e37', '#5a3a22', false),
      tree('#3aa055', '#6b4527', true),
    ],
    cactus: [cactus(2), cactus(1), cactus(0)],
    rock: [rock(true), rock(false), rock(true)],
    ice: [ice(true), ice(false), ice(true)],
    pylon: [pylon('#ff3fb4'), pylon('#3fe9ff'), pylon('#ffe23f')],
    none: [],
  }
}
