import { clamp } from './math'

/**
 * Gamepad-Verwaltung für bis zu vier Spieler.
 *
 * Zwei Dinge machen USB-Pads unangenehm: Sie melden sich oft nicht als
 * "standard"-Layout (dann stimmen die Knopfnummern nicht mit dem
 * Xbox-Schema überein), und beim Ab- und Anstecken verschieben sich die
 * Steckplätze. Deshalb werden Pads fest an Spielerplätze gebunden und die
 * vier Aktionstasten lassen sich pro Pad-Modell anlernen.
 */

export interface PadBinding {
  accel: number
  brake: number
  drift: number
  item: number
}

export type PadBindings = Record<string, PadBinding>

/** Fallback für Pads ohne eigene Belegung (Xbox-/Standard-Layout). */
export const DEFAULT_BINDING: PadBinding = { accel: 0, brake: 1, drift: 5, item: 2 }

const DEADZONE = 0.28

export interface PadState {
  /** Steckplatz des Browsers. */
  index: number
  id: string
  standard: boolean
  steer: number
  accel: boolean
  brake: boolean
  drift: boolean
  item: boolean
  up: boolean
  down: boolean
  left: boolean
  right: boolean
  confirm: boolean
  back: boolean
  /** Index der zuletzt neu gedrückten Taste, sonst -1 (fürs Anlernen). */
  justPressed: number
  pressedCount: number
  axes: number[]
}

/** Kürzt lange Gamepad-Namen auf etwas Anzeigbares. */
export function padLabel(id: string): string {
  return id
    .replace(/\s*\((STANDARD GAMEPAD|Vendor|Product)[^)]*\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 28)
}

/**
 * Manche Pads liefern das Steuerkreuz nicht als Tasten 12-15, sondern als
 * "Hat"-Achse mit acht Rastungen. Diese Umrechnung deckt den verbreiteten
 * Wertebereich ab; außerhalb davon (Ruhelage) kommt nichts zurück.
 */
export function hatToDirections(value: number): {
  up: boolean
  down: boolean
  left: boolean
  right: boolean
} {
  const none = { up: false, down: false, left: false, right: false }
  if (!Number.isFinite(value) || value > 1.05 || value < -1.05) return none
  // Acht Rastungen liegen gleichmäßig auf [-1, 1]: -1 = oben, dann im
  // Uhrzeigersinn, +1 = oben-links. Die Ruhelage liegt außerhalb (oft 3,28).
  const step = Math.min(7, Math.max(0, Math.round(((value + 1) / 2) * 7)))
  switch (step) {
    case 0:
      return { ...none, up: true }
    case 1:
      return { ...none, up: true, right: true }
    case 2:
      return { ...none, right: true }
    case 3:
      return { ...none, down: true, right: true }
    case 4:
      return { ...none, down: true }
    case 5:
      return { ...none, down: true, left: true }
    case 6:
      return { ...none, left: true }
    case 7:
      return { ...none, up: true, left: true }
    default:
      return none
  }
}

export class Gamepads {
  /** Spielerplatz -> Steckplatz des Browsers. */
  private slots: (number | null)[] = [null, null, null, null]
  private states = new Map<number, PadState>()
  private previous = new Map<number, boolean[]>()
  bindings: PadBindings = {}

  /** Einmal pro Frame vor jeder Abfrage aufrufen. */
  poll(): void {
    this.states.clear()
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? [...navigator.getGamepads()] : []

    const live = new Set<number>()
    for (const pad of pads) {
      if (!pad || !pad.connected) continue
      live.add(pad.index)
      this.states.set(pad.index, this.read(pad))
    }

    // Abgezogene Pads geben ihren Platz frei, damit ein neues Pad ihn bekommt.
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i]
      if (slot !== null && !live.has(slot)) this.slots[i] = null
    }
    for (const index of live) {
      if (this.slots.includes(index)) continue
      const free = this.slots.indexOf(null)
      if (free >= 0) this.slots[free] = index
    }
  }

  private read(pad: Gamepad): PadState {
    const custom = this.bindings[padLabel(pad.id)]
    const binding = custom ?? DEFAULT_BINDING
    // Ohne eigene Belegung wird großzügig geraten (Schultertasten, Trigger).
    // Mit eigener Belegung gilt ausschließlich das Angelernte - sonst würde
    // eine geratene Taste die bewusste Zuordnung wieder überstimmen.
    const alt = custom
      ? { accel: -1, brake: -1, drift: -1, item: -1 }
      : { accel: 7, brake: 6, drift: 4, item: 3 }
    const pressed = pad.buttons.map((b) => b.pressed)
    const before = this.previous.get(pad.index) ?? []
    let justPressed = -1
    for (let i = 0; i < pressed.length; i++) {
      if (pressed[i] && !before[i]) justPressed = i
    }
    this.previous.set(pad.index, pressed)

    const button = (i: number) => (i >= 0 ? (pressed[i] ?? false) : false)
    const axis = (i: number) => {
      const v = pad.axes[i] ?? 0
      return Math.abs(v) > DEADZONE ? v : 0
    }

    // Steuerkreuz: bevorzugt die Standardtasten, sonst die Hat-Achse.
    let dpad = { up: button(12), down: button(13), left: button(14), right: button(15) }
    if (pad.buttons.length < 16 && pad.axes.length > 9) {
      dpad = hatToDirections(pad.axes[9] ?? 2)
    }

    const stickX = axis(0)
    const stickY = axis(1)

    return {
      index: pad.index,
      id: padLabel(pad.id),
      standard: pad.mapping === 'standard',
      steer: clamp(stickX + (dpad.left ? -1 : 0) + (dpad.right ? 1 : 0), -1, 1),
      accel: button(binding.accel) || button(alt.accel),
      brake: button(binding.brake) || button(alt.brake),
      drift: button(binding.drift) || button(alt.drift),
      item: button(binding.item) || button(alt.item),
      up: dpad.up || stickY < -0.5,
      down: dpad.down || stickY > 0.5,
      left: dpad.left || stickX < -0.5,
      right: dpad.right || stickX > 0.5,
      confirm: button(binding.accel) || button(9),
      back: button(binding.brake) || button(8),
      justPressed,
      pressedCount: pressed.filter(Boolean).length,
      axes: [...pad.axes],
    }
  }

  forPlayer(player: number): PadState | null {
    const index = this.slots[player]
    return index === null || index === undefined ? null : (this.states.get(index) ?? null)
  }

  /** Alle erkannten Pads mit ihrem Spielerplatz - für die Anzeige. */
  list(): { player: number; state: PadState }[] {
    const out: { player: number; state: PadState }[] = []
    this.slots.forEach((index, player) => {
      if (index === null) return
      const state = this.states.get(index)
      if (state) out.push({ player, state })
    })
    return out
  }

  count(): number {
    return this.states.size
  }

  /** Beliebiges Pad, das gerade eine Taste neu gedrückt hat (fürs Anlernen). */
  anyJustPressed(): { state: PadState; button: number } | null {
    for (const state of this.states.values()) {
      if (state.justPressed >= 0) return { state, button: state.justPressed }
    }
    return null
  }

  /** Tauscht die Zuordnung zweier Spielerplätze. */
  swap(a: number, b: number): void {
    const tmp = this.slots[a] ?? null
    this.slots[a] = this.slots[b] ?? null
    this.slots[b] = tmp
  }

  /** Kurzes Rumpeln, sofern das Pad es unterstützt. */
  rumble(player: number, strength: number, ms: number): void {
    const index = this.slots[player]
    if (index === null || index === undefined) return
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []
    const pad = pads[index] as (Gamepad & { vibrationActuator?: GamepadHapticActuator }) | null
    const actuator = pad?.vibrationActuator
    if (!actuator || typeof actuator.playEffect !== 'function') return
    void actuator
      .playEffect('dual-rumble', {
        duration: ms,
        strongMagnitude: clamp(strength, 0, 1),
        weakMagnitude: clamp(strength * 0.7, 0, 1),
      })
      .catch(() => {
        // Rumpeln ist Zugabe - fehlende Unterstützung ist kein Fehler.
      })
  }
}
