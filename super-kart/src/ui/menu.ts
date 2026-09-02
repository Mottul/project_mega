import type { MenuInput } from '../core/input'
import { audio } from '../core/audio'
import { text } from '../render/hud'

export interface MenuItem {
  label: string
  /** Rechts angezeigter Wert für Auswahlzeilen. */
  value?: () => string
  onLeft?: () => void
  onRight?: () => void
  onSelect?: () => void
  hint?: () => string
}

export interface MenuPage {
  title: string
  subtitle?: () => string
  items: MenuItem[]
  /** Zusätzliche Zeichnung (z. B. Fahrervorschau) hinter der Liste. */
  render?: (ctx: CanvasRenderingContext2D, w: number, h: number, index: number, time: number) => void
  onBack?: () => void
}

interface Hotspot {
  x: number
  y: number
  w: number
  h: number
  index: number
}

/** Listenmenü, das mit Tastatur, Gamepad und Fingertipp gleichermaßen läuft. */
export class Menu {
  private stack: MenuPage[] = []
  private indices: number[] = []
  private hotspots: Hotspot[] = []

  push(page: MenuPage): void {
    this.stack.push(page)
    this.indices.push(0)
  }

  pop(): void {
    if (this.stack.length <= 1) return
    this.stack.pop()
    this.indices.pop()
  }

  reset(page: MenuPage): void {
    this.stack = [page]
    this.indices = [0]
  }

  get page(): MenuPage {
    return this.stack[this.stack.length - 1]!
  }

  get index(): number {
    return this.indices[this.indices.length - 1]!
  }

  set index(v: number) {
    this.indices[this.indices.length - 1] = v
  }

  get depth(): number {
    return this.stack.length
  }

  update(input: MenuInput): void {
    const page = this.page
    const count = page.items.length
    if (count === 0) return

    if (input.up) {
      this.index = (this.index - 1 + count) % count
      audio.sfx('menu')
    }
    if (input.down) {
      this.index = (this.index + 1) % count
      audio.sfx('menu')
    }
    const item = page.items[this.index]!
    if (input.left && item.onLeft) {
      item.onLeft()
      audio.sfx('menu')
    }
    if (input.right && item.onRight) {
      item.onRight()
      audio.sfx('menu')
    }
    if (input.confirm && item.onSelect) {
      item.onSelect()
      audio.sfx('confirm')
    }
    if (input.back) {
      if (page.onBack) page.onBack()
      else if (this.stack.length > 1) this.pop()
      audio.sfx('back')
    }
  }

  /** Tippen auf eine Zeile: erst auswählen, beim zweiten Tipp bestätigen. */
  tap(x: number, y: number): boolean {
    for (const spot of this.hotspots) {
      if (x < spot.x || x > spot.x + spot.w || y < spot.y || y > spot.y + spot.h) continue
      const item = this.page.items[spot.index]
      if (!item) return false
      if (this.index === spot.index) {
        if (item.onSelect) {
          item.onSelect()
          audio.sfx('confirm')
        } else if (item.onRight) {
          item.onRight()
          audio.sfx('menu')
        }
      } else {
        this.index = spot.index
        audio.sfx('menu')
      }
      return true
    }
    return false
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, time: number): void {
    const page = this.page
    this.hotspots = []

    page.render?.(ctx, w, h, this.index, time)

    text(ctx, page.title, w / 2, h * 0.09, 22, '#ffe14a', 'center')
    const sub = page.subtitle?.()
    if (sub) text(ctx, sub, w / 2, h * 0.09 + 26, 10, 'rgba(255,255,255,0.75)', 'center')

    const startY = h * 0.34
    const step = Math.min(24, (h * 0.52) / Math.max(1, page.items.length))
    const boxW = Math.min(w * 0.7, 300)
    const boxX = w / 2 - boxW / 2

    page.items.forEach((item, i) => {
      const y = startY + i * step
      const active = i === this.index
      this.hotspots.push({ x: boxX, y: y - 3, w: boxW, h: step - 2, index: i })

      if (active) {
        ctx.fillStyle = 'rgba(255,225,74,0.16)'
        ctx.beginPath()
        ctx.roundRect(boxX, y - 3, boxW, step - 2, 4)
        ctx.fill()
      }
      const color = active ? '#ffffff' : 'rgba(255,255,255,0.66)'
      text(ctx, item.label, boxX + 10, y, 12, color)
      const value = item.value?.()
      if (value)
        text(ctx, value, boxX + boxW - 10, y, 12, active ? '#ffe14a' : 'rgba(255,255,255,0.6)', 'right')
    })

    const hint = page.items[this.index]?.hint?.()
    if (hint) text(ctx, hint, w / 2, h - 22, 9, 'rgba(255,255,255,0.6)', 'center')
  }
}
