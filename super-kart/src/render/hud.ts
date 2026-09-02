import { formatTime } from '../core/math'
import { ITEMS } from '../game/items'
import type { Kart } from '../game/kart'
import type { World } from '../game/world'
import { TEX_SCALE, TEX_SIZE } from '../game/config'
import { displayLap } from '../game/progress'
import type { Viewport } from './mode7'

const FONT = '700 __PX__px "Trebuchet MS", "Segoe UI", system-ui, sans-serif'

export function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size: number,
  color = '#ffffff',
  align: CanvasTextAlign = 'left'
): void {
  ctx.font = FONT.replace('__PX__', String(size))
  ctx.textAlign = align
  ctx.textBaseline = 'top'
  ctx.lineJoin = 'round'
  ctx.lineWidth = Math.max(2, size * 0.3)
  ctx.strokeStyle = 'rgba(8,8,16,0.85)'
  ctx.strokeText(value, x, y)
  ctx.fillStyle = color
  ctx.fillText(value, x, y)
}

function panel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  alpha = 0.42
): void {
  ctx.fillStyle = `rgba(10,12,24,${alpha})`
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, 4)
  ctx.fill()
}

const ORDINAL = ['1.', '2.', '3.', '4.', '5.', '6.', '7.', '8.']

/** HUD einer einzelnen Ansicht (Splitscreen: zweimal pro Bild). */
export function drawHud(
  ctx: CanvasRenderingContext2D,
  view: Viewport,
  world: World,
  kart: Kart,
  label: string,
  compact: boolean
): void {
  ctx.save()
  ctx.beginPath()
  ctx.rect(view.x, view.y, view.w, view.h)
  ctx.clip()

  const pad = 5
  const big = compact ? 15 : 20
  const small = compact ? 8 : 10

  // Platzierung
  const rankColor = kart.rank === 1 ? '#ffe14a' : '#ffffff'
  text(ctx, ORDINAL[kart.rank - 1] ?? `${kart.rank}.`, view.x + pad, view.y + pad, big, rankColor)
  text(ctx, label, view.x + pad, view.y + pad + big + 1, small, 'rgba(255,255,255,0.7)')

  if (world.mode === 'race') {
    const lap = displayLap(kart.lap, world.laps)
    text(
      ctx,
      `RUNDE ${lap}/${world.laps}`,
      view.x + view.w - pad,
      view.y + pad,
      small + 2,
      '#ffffff',
      'right'
    )
    text(
      ctx,
      formatTime(world.currentLapTime(kart)),
      view.x + view.w - pad,
      view.y + pad + small + 4,
      small,
      'rgba(255,255,255,0.85)',
      'right'
    )
  } else {
    for (let i = 0; i < 3; i++) {
      const x = view.x + view.w - pad - 9 - i * 11
      ctx.fillStyle = i < kart.balloons ? '#ff6b7d' : 'rgba(255,255,255,0.2)'
      ctx.beginPath()
      ctx.ellipse(x, view.y + pad + 6, 4.2, 5.2, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    text(ctx, `TREFFER ${kart.score}`, view.x + view.w - pad, view.y + pad + 14, small, '#ffffff', 'right')
  }

  drawItemSlot(ctx, view, kart, compact)
  drawMinimap(ctx, view, world, kart, compact)

  if (kart.boostTimer > 0) {
    text(
      ctx,
      'TURBO!',
      view.x + view.w / 2,
      view.y + view.h - (compact ? 22 : 30),
      small + 2,
      '#ffca4a',
      'center'
    )
  }

  ctx.restore()
}

function drawItemSlot(ctx: CanvasRenderingContext2D, view: Viewport, kart: Kart, compact: boolean): void {
  const size = compact ? 26 : 34
  const x = view.x + view.w / 2 - size / 2
  const y = view.y + 4
  panel(ctx, x, y, size, size, 0.5)
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(x + 0.5, y + 0.5, size - 1, size - 1, 4)
  ctx.stroke()

  if (!kart.item) return
  const info = ITEMS[kart.item]
  if (kart.itemRoll > 0) {
    // Rouletteanzeige beim Ziehen.
    const keys = Object.keys(ITEMS)
    const idx = Math.floor(performance.now() / 60) % keys.length
    text(
      ctx,
      ITEMS[keys[idx] as keyof typeof ITEMS]!.short,
      x + size / 2,
      y + size / 2 - 5,
      compact ? 9 : 11,
      '#ffffff',
      'center'
    )
    return
  }
  text(ctx, info.short, x + size / 2, y + size / 2 - 5, compact ? 9 : 11, info.color, 'center')
  if (kart.itemUses > 1) {
    text(ctx, `x${kart.itemUses}`, x + size - 2, y + size - 11, 8, '#ffffff', 'right')
  }
}

function drawMinimap(
  ctx: CanvasRenderingContext2D,
  view: Viewport,
  world: World,
  self: Kart,
  compact: boolean
): void {
  const size = compact ? 42 : 58
  const x = view.x + 4
  const y = view.y + view.h - size - 4
  ctx.save()
  ctx.globalAlpha = 0.82
  ctx.drawImage(world.track.minimap, x, y, size, size)
  ctx.globalAlpha = 1
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'
  ctx.lineWidth = 1
  ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1)

  const toMap = (wx: number, wy: number): [number, number] => [
    x + (wx * TEX_SCALE * size) / TEX_SIZE,
    y + (wy * TEX_SCALE * size) / TEX_SIZE,
  ]

  for (const kart of world.karts) {
    const [mx, my] = toMap(kart.x, kart.y)
    const isSelf = kart === self
    ctx.fillStyle = isSelf ? '#ffffff' : kart.driver.body
    ctx.beginPath()
    ctx.arc(mx, my, isSelf ? 2.6 : 1.9, 0, Math.PI * 2)
    ctx.fill()
    if (isSelf) {
      ctx.strokeStyle = 'rgba(0,0,0,0.8)'
      ctx.lineWidth = 1
      ctx.stroke()
    }
  }
  ctx.restore()
}

/**
 * Rangliste für das freie Feld im Viererraster (bei drei Spielern).
 * Sonst bliebe dort ein toter schwarzer Block.
 */
export function drawStandings(ctx: CanvasRenderingContext2D, view: Viewport, world: World): void {
  ctx.save()
  ctx.beginPath()
  ctx.rect(view.x, view.y, view.w, view.h)
  ctx.clip()
  ctx.fillStyle = 'rgba(8,10,20,0.92)'
  ctx.fillRect(view.x, view.y, view.w, view.h)

  text(
    ctx,
    world.mode === 'race' ? 'RANGLISTE' : 'BALLONS',
    view.x + view.w / 2,
    view.y + 6,
    11,
    '#ffe14a',
    'center'
  )

  const rows = [...world.karts].sort((a, b) => a.rank - b.rank)
  const step = Math.min(12, (view.h - 26) / Math.max(1, rows.length))
  rows.forEach((kart, i) => {
    const y = view.y + 22 + i * step
    const human = kart.player >= 0
    const color = human ? '#ffffff' : 'rgba(255,255,255,0.55)'
    text(ctx, `${kart.rank}.`, view.x + 6, y, 8, color)
    ctx.fillStyle = kart.driver.body
    ctx.fillRect(view.x + 18, y + 1, 5, 6)
    text(ctx, `${kart.driver.name}${human ? ` P${kart.player + 1}` : ''}`, view.x + 27, y, 8, color)
    const detail =
      world.mode === 'race' ? `${displayLap(kart.lap, world.laps)}/${world.laps}` : `${kart.balloons}`
    text(ctx, detail, view.x + view.w - 6, y, 8, 'rgba(255,255,255,0.7)', 'right')
  })
  ctx.restore()
}

/**
 * Startampel und Zieldurchfahrt - im Splitscreen pro Ansicht, damit die Ziffer
 * nicht ausgerechnet das eigene Kart verdeckt.
 */
export function drawOverlays(ctx: CanvasRenderingContext2D, world: World, views: Viewport[]): void {
  for (const view of views) {
    const cx = view.x + view.w / 2
    // Tiefer als der Item-Kasten oben in der Mitte, sonst überdecken sie sich.
    const cy = view.y + view.h * 0.45
    const size = Math.min(40, view.h * 0.19)
    if (world.state === 'countdown') {
      const n = Math.ceil(world.countdown)
      const frac = world.countdown - Math.floor(world.countdown)
      ctx.save()
      ctx.translate(cx, cy)
      ctx.scale(1 + (1 - frac) * 0.3, 1 + (1 - frac) * 0.3)
      text(
        ctx,
        n > 0 ? String(Math.min(3, n)) : 'LOS!',
        0,
        -size / 2,
        size,
        n > 0 ? '#ffffff' : '#8affc0',
        'center'
      )
      ctx.restore()
    } else if (world.state === 'running' && world.time < 1.1) {
      ctx.save()
      ctx.globalAlpha = Math.max(0, 1 - world.time / 1.1)
      text(ctx, 'LOS!', cx, cy - size / 2, size, '#8affc0', 'center')
      ctx.restore()
    }
  }
}

export function drawPause(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  selection: number,
  entries: string[]
): void {
  ctx.fillStyle = 'rgba(6,8,18,0.72)'
  ctx.fillRect(0, 0, w, h)
  text(ctx, 'PAUSE', w / 2, h * 0.24, 26, '#ffffff', 'center')
  entries.forEach((entry, i) => {
    const active = i === selection
    text(
      ctx,
      `${active ? '> ' : '  '}${entry}`,
      w / 2,
      h * 0.42 + i * 22,
      14,
      active ? '#ffe14a' : 'rgba(255,255,255,0.75)',
      'center'
    )
  })
}
