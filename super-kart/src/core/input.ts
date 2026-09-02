import { clamp } from './math'

/** Ein Frame Steuerzustand für genau ein Kart. */
export interface ControlState {
  steer: number
  accel: boolean
  brake: boolean
  drift: boolean
  item: boolean
  /** Nur im Frame des Tastendrucks true - für Item-Auslösung. */
  itemPressed: boolean
}

export interface MenuInput {
  up: boolean
  down: boolean
  left: boolean
  right: boolean
  confirm: boolean
  back: boolean
  /** Irgendeine Taste/Button - für "Beliebige Taste drücken". */
  any: boolean
}

/** Virtueller Zustand aus der Touch-Oberfläche; wird von ui/touch.ts gefüllt. */
export interface TouchState {
  steer: number
  accel: boolean
  brake: boolean
  drift: boolean
  item: boolean
}

const EMPTY_CONTROL: ControlState = {
  steer: 0,
  accel: false,
  brake: false,
  drift: false,
  item: false,
  itemPressed: false,
}

/** Tastenbelegung je Spieler. Mehrere Codes pro Aktion sind Absicht. */
const KEYMAP: ReadonlyArray<
  Record<keyof Omit<ControlState, 'steer' | 'itemPressed'> | 'left' | 'right', string[]>
> = [
  {
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    accel: ['ArrowUp'],
    brake: ['ArrowDown'],
    drift: ['Space', 'ShiftRight', 'Comma'],
    item: ['Enter', 'Period', 'Numpad0', 'ControlRight'],
  },
  {
    left: ['KeyA'],
    right: ['KeyD'],
    accel: ['KeyW'],
    brake: ['KeyS'],
    drift: ['ShiftLeft', 'KeyQ'],
    item: ['KeyE', 'KeyR', 'Tab'],
  },
]

/** Standard-Gamepad-Belegung (Xbox-Layout). */
const PAD = {
  accel: [0, 7],
  brake: [1, 6],
  drift: [4, 5],
  item: [2, 3],
  left: [14],
  right: [15],
  up: [12],
  down: [13],
  confirm: [0, 9],
  back: [1, 8],
} as const

export class Input {
  private readonly down = new Set<string>()
  private readonly pressedThisFrame = new Set<string>()
  private readonly queued = new Set<string>()
  private prevItem = [false, false]
  private prevMenu: Record<string, boolean> = {}
  private repeatAt: Record<string, number> = {}
  readonly touch: TouchState[] = [
    { steer: 0, accel: false, brake: false, drift: false, item: false },
    { steer: 0, accel: false, brake: false, drift: false, item: false },
  ]
  /** Zeigt an, ob je eine Taste/ein Pad benutzt wurde (blendet Touch-UI aus). */
  usedKeyboard = false
  usedTouch = false

  private pads: (Gamepad | null)[] = []

  attach(target: Window = window): () => void {
    const onDown = (e: KeyboardEvent) => {
      if (e.repeat) return
      this.usedKeyboard = true
      this.down.add(e.code)
      this.queued.add(e.code)
      // Pfeiltasten/Leertaste würden sonst die Seite scrollen.
      if (SWALLOW.has(e.code)) e.preventDefault()
    }
    const onUp = (e: KeyboardEvent) => {
      this.down.delete(e.code)
      if (SWALLOW.has(e.code)) e.preventDefault()
    }
    const onBlur = () => this.down.clear()
    target.addEventListener('keydown', onDown)
    target.addEventListener('keyup', onUp)
    target.addEventListener('blur', onBlur)
    return () => {
      target.removeEventListener('keydown', onDown)
      target.removeEventListener('keyup', onUp)
      target.removeEventListener('blur', onBlur)
    }
  }

  /** Einmal pro Frame vor der Abfrage aufrufen. */
  beginFrame(): void {
    this.pressedThisFrame.clear()
    for (const code of this.queued) this.pressedThisFrame.add(code)
    this.queued.clear()
    this.pads = typeof navigator !== 'undefined' && navigator.getGamepads ? [...navigator.getGamepads()] : []
  }

  private pad(player: number): Gamepad | null {
    // Pads werden in Reihenfolge ihrer Slots auf die Spieler verteilt.
    const connected = this.pads.filter((p): p is Gamepad => !!p && p.connected)
    return connected[player] ?? null
  }

  private padButton(pad: Gamepad | null, indices: readonly number[]): boolean {
    if (!pad) return false
    return indices.some((i) => pad.buttons[i]?.pressed)
  }

  private key(codes: readonly string[]): boolean {
    return codes.some((c) => this.down.has(c))
  }

  state(player: number): ControlState {
    const map = KEYMAP[player]
    if (!map) return { ...EMPTY_CONTROL }
    const pad = this.pad(player)
    const touch = this.touch[player]!

    let steer = 0
    if (this.key(map.left) || this.padButton(pad, PAD.left)) steer -= 1
    if (this.key(map.right) || this.padButton(pad, PAD.right)) steer += 1
    if (pad) {
      const axis = pad.axes[0] ?? 0
      if (Math.abs(axis) > 0.18) steer += axis
    }
    steer = clamp(steer + touch.steer, -1, 1)

    const item = this.key(map.item) || this.padButton(pad, PAD.item) || touch.item
    const itemPressed = item && !this.prevItem[player]
    this.prevItem[player] = item

    return {
      steer,
      accel: this.key(map.accel) || this.padButton(pad, PAD.accel) || touch.accel,
      brake: this.key(map.brake) || this.padButton(pad, PAD.brake) || touch.brake,
      drift: this.key(map.drift) || this.padButton(pad, PAD.drift) || touch.drift,
      item,
      itemPressed,
    }
  }

  /**
   * Flankengesteuerte Menü-Eingabe über alle Spieler und Pads.
   * Berücksichtigt auch Tasten, die innerhalb eines Frames wieder losgelassen
   * wurden - sonst verschluckt das Menü sehr kurze Tipper. Gehaltene Richtungen
   * wiederholen nach kurzer Verzögerung.
   */
  menu(): MenuInput {
    const padAny = (indices: readonly number[]) => [0, 1].some((p) => this.padButton(this.pad(p), indices))
    const padAxis = (dir: -1 | 1) =>
      [0, 1].some((p) => {
        const pad = this.pad(p)
        if (!pad) return false
        const y = pad.axes[1] ?? 0
        return dir < 0 ? y < -0.5 : y > 0.5
      })
    const tapped = (codes: readonly string[]) => codes.some((c) => this.pressedThisFrame.has(c))

    const raw: Record<string, boolean> = {
      up: this.key(MENU_KEYS.up) || tapped(MENU_KEYS.up) || padAny(PAD.up) || padAxis(-1),
      down: this.key(MENU_KEYS.down) || tapped(MENU_KEYS.down) || padAny(PAD.down) || padAxis(1),
      left: this.key(MENU_KEYS.left) || tapped(MENU_KEYS.left) || padAny(PAD.left),
      right: this.key(MENU_KEYS.right) || tapped(MENU_KEYS.right) || padAny(PAD.right),
      confirm: this.key(MENU_KEYS.confirm) || tapped(MENU_KEYS.confirm) || padAny(PAD.confirm),
      back: this.key(MENU_KEYS.back) || tapped(MENU_KEYS.back) || padAny(PAD.back),
    }

    const now = performance.now()
    const edge: MenuInput = {
      up: false,
      down: false,
      left: false,
      right: false,
      confirm: false,
      back: false,
      any: false,
    }

    for (const k of Object.keys(raw)) {
      const active = raw[k]!
      if (!active) {
        this.prevMenu[k] = false
        this.repeatAt[k] = 0
        continue
      }
      if (!this.prevMenu[k]) {
        edge[k as keyof MenuInput] = true
        // Bestätigen/Zurück wiederholen nie - nur Richtungen.
        this.repeatAt[k] = k === 'confirm' || k === 'back' ? Infinity : now + 380
      } else if (now >= (this.repeatAt[k] ?? Infinity)) {
        edge[k as keyof MenuInput] = true
        this.repeatAt[k] = now + 110
      }
      this.prevMenu[k] = true
    }

    edge.any = this.pressedThisFrame.size > 0 || Object.values(edge).some(Boolean)
    return edge
  }

  /** True genau in dem Frame, in dem die Taste gedrückt wurde. */
  wasPressed(code: string): boolean {
    return this.pressedThisFrame.has(code)
  }

  clear(): void {
    this.down.clear()
    this.queued.clear()
    this.pressedThisFrame.clear()
    for (const t of this.touch) {
      t.steer = 0
      t.accel = t.brake = t.drift = t.item = false
    }
  }
}

/** Menütasten sind absichtlich großzügig belegt - beide Spieler navigieren. */
const MENU_KEYS = {
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  confirm: ['Enter', 'Space', 'NumpadEnter', 'KeyE'],
  back: ['Escape', 'Backspace'],
} as const

const SWALLOW = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
  'Tab',
  'Enter',
  'Backspace',
])
