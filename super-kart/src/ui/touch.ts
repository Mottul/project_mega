import type { Input } from '../core/input'
import { clamp } from '../core/math'
import { text } from '../render/hud'
import type { Viewport } from '../render/mode7'

type ZoneId = 'steer' | 'accel' | 'brake' | 'drift' | 'item' | 'pause'

interface Zone {
  id: ZoneId
  player: number
  x: number
  y: number
  w: number
  h: number
  label: string
}

export interface Pointer {
  x: number
  y: number
}

/**
 * Bildschirmsteuerung für Touchgeräte. Das Lenkfeld arbeitet analog (Abstand
 * zur Mitte), die übrigen Flächen sind einfache Tasten. Im Splitscreen bekommt
 * jede Ansicht ihren eigenen Satz.
 */
export class TouchControls {
  private zones: Zone[] = []
  visible = false

  layout(views: Viewport[]): void {
    this.zones = []
    views.forEach((view, player) => {
      const pad = Math.max(4, view.h * 0.04)
      const btn = Math.min(view.h * 0.26, view.w * 0.1)
      const bottom = view.y + view.h - pad

      this.zones.push({
        id: 'steer',
        player,
        x: view.x + pad,
        y: bottom - view.h * 0.42,
        w: view.w * 0.34,
        h: view.h * 0.42,
        label: '',
      })

      const rx = view.x + view.w - pad
      this.zones.push({ id: 'accel', player, x: rx - btn, y: bottom - btn, w: btn, h: btn, label: 'GAS' })
      this.zones.push({
        id: 'drift',
        player,
        x: rx - btn * 2.15,
        y: bottom - btn * 0.9,
        w: btn * 0.95,
        h: btn * 0.9,
        label: 'DRIFT',
      })
      this.zones.push({
        id: 'item',
        player,
        x: rx - btn,
        y: bottom - btn * 2.15,
        w: btn,
        h: btn * 0.9,
        label: 'ITEM',
      })
      this.zones.push({
        id: 'brake',
        player,
        x: rx - btn * 2.15,
        y: bottom - btn * 2.05,
        w: btn * 0.95,
        h: btn * 0.9,
        label: 'BREMSE',
      })
    })
  }

  /** Überträgt die aktiven Berührungen in den virtuellen Eingabezustand. */
  apply(pointers: Iterable<Pointer>, input: Input): void {
    for (const t of input.touch) {
      t.steer = 0
      t.accel = false
      t.brake = false
      t.drift = false
      t.item = false
    }
    for (const p of pointers) {
      for (const zone of this.zones) {
        if (p.x < zone.x || p.x > zone.x + zone.w || p.y < zone.y || p.y > zone.y + zone.h) continue
        const state = input.touch[zone.player]
        if (!state) continue
        switch (zone.id) {
          case 'steer':
            state.steer = clamp(((p.x - (zone.x + zone.w / 2)) / (zone.w / 2)) * 1.25, -1, 1)
            break
          case 'accel':
            state.accel = true
            break
          case 'brake':
            state.brake = true
            break
          case 'drift':
            state.drift = true
            break
          case 'item':
            state.item = true
            break
          case 'pause':
            break
        }
        break
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (!this.visible) return
    ctx.save()
    for (const zone of this.zones) {
      ctx.fillStyle = zone.id === 'steer' ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.13)'
      ctx.strokeStyle = 'rgba(255,255,255,0.28)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.roundRect(zone.x, zone.y, zone.w, zone.h, zone.id === 'steer' ? 8 : 6)
      ctx.fill()
      ctx.stroke()
      if (zone.id === 'steer') {
        // Mittellinie als Orientierung für den Daumen.
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'
        ctx.beginPath()
        ctx.moveTo(zone.x + zone.w / 2, zone.y + 4)
        ctx.lineTo(zone.x + zone.w / 2, zone.y + zone.h - 4)
        ctx.stroke()
        text(
          ctx,
          '‹ LENKEN ›',
          zone.x + zone.w / 2,
          zone.y + zone.h / 2 - 5,
          9,
          'rgba(255,255,255,0.5)',
          'center'
        )
      } else {
        text(
          ctx,
          zone.label,
          zone.x + zone.w / 2,
          zone.y + zone.h / 2 - 5,
          8,
          'rgba(255,255,255,0.8)',
          'center'
        )
      }
    }
    ctx.restore()
  }
}
