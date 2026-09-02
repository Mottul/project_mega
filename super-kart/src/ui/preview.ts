import { catmullRom } from '../core/math'
import type { TrackDef } from '../game/tracks'

/**
 * Zeichnet den Streckenverlauf aus den Stützpunkten - ohne die (teure) volle
 * Texturgenerierung. Reicht für die Vorschau in der Streckenwahl.
 */
export function drawTrackPreview(
  ctx: CanvasRenderingContext2D,
  def: TrackDef,
  x: number,
  y: number,
  size: number
): void {
  ctx.save()
  ctx.fillStyle = 'rgba(10,14,26,0.6)'
  ctx.beginPath()
  ctx.roundRect(x, y, size, size, 6)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'
  ctx.lineWidth = 1
  ctx.stroke()

  const pad = size * 0.12
  const inner = size - pad * 2
  const map = (wx: number, wy: number): [number, number] => [
    x + pad + (wx / 4096) * inner,
    y + pad + (wy / 4096) * inner,
  ]

  if (def.kind === 'battle') {
    const [a, , c] = [def.points[0]!, def.points[1]!, def.points[2]!]
    const [ax, ay] = map(a[0], a[1])
    const [cx, cy] = map(c[0], c[1])
    ctx.fillStyle = def.theme.road[0]
    ctx.fillRect(ax, ay, cx - ax, cy - ay)
    ctx.fillStyle = def.theme.curb[0]
    for (const [bx, by, bw, bh] of def.blocks ?? []) {
      const [px, py] = map(bx - bw, by - bh)
      const [qx, qy] = map(bx + bw, by + bh)
      ctx.fillRect(px, py, qx - px, qy - py)
    }
    ctx.restore()
    return
  }

  const pts = def.points
  const at = (i: number) => pts[((i % pts.length) + pts.length) % pts.length]!
  ctx.beginPath()
  for (let i = 0; i < pts.length; i++) {
    const p0 = at(i - 1)
    const p1 = at(i)
    const p2 = at(i + 1)
    const p3 = at(i + 2)
    for (let s = 0; s <= 8; s++) {
      const t = s / 8
      const [px, py] = map(
        catmullRom(p0[0], p1[0], p2[0], p3[0], t),
        catmullRom(p0[1], p1[1], p2[1], p3[1], t)
      )
      if (i === 0 && s === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
  }
  ctx.closePath()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = def.theme.curb[0]
  ctx.lineWidth = Math.max(3, size * 0.055)
  ctx.stroke()
  ctx.strokeStyle = def.theme.road[0]
  ctx.lineWidth = Math.max(2, size * 0.038)
  ctx.stroke()

  const [sx, sy] = map(pts[0]![0], pts[0]![1])
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(sx - 2, sy - 2, 4, 4)
  ctx.restore()
}
