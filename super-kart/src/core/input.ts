import { Gamepads, type PadState } from './gamepad'
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

type KeyBlock = Record<'left' | 'right' | 'accel' | 'brake' | 'drift' | 'item', string[]>

/**
 * Tastenbelegung je Spieler. Mehrere Codes pro Aktion sind Absicht.
 * Für Spieler 3 und 4 wird es auf einer Tastatur eng - die beiden spielen
 * üblicherweise mit Gamepad; die Belegung ist der Notnagel.
 */
export const KEYMAP: ReadonlyArray<KeyBlock> = [
  {
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    accel: ['ArrowUp'],
    brake: ['ArrowDown'],
    drift: ['Space', 'ShiftRight', 'Comma'],
    item: ['Enter', 'Period', 'ControlRight'],
  },
  {
    left: ['KeyA'],
    right: ['KeyD'],
    accel: ['KeyW'],
    brake: ['KeyS'],
    drift: ['ShiftLeft', 'KeyQ'],
    item: ['KeyE', 'KeyR'],
  },
  {
    left: ['KeyJ'],
    right: ['KeyL'],
    accel: ['KeyI'],
    brake: ['KeyK'],
    drift: ['KeyU'],
    item: ['KeyO'],
  },
  {
    left: ['Numpad4'],
    right: ['Numpad6'],
    accel: ['Numpad8'],
    brake: ['Numpad5'],
    drift: ['Numpad7'],
    item: ['Numpad9'],
  },
]

export const MAX_PLAYERS = 4

export class Input {
  private readonly down = new Set<string>()
  private readonly pressedThisFrame = new Set<string>()
  private readonly queued = new Set<string>()
  private prevItem = new Array<boolean>(MAX_PLAYERS).fill(false)
  private prevMenu: Record<string, boolean> = {}
  private repeatAt: Record<string, number> = {}
  readonly gamepads = new Gamepads()
  readonly touch: TouchState[] = Array.from({ length: MAX_PLAYERS }, () => ({
    steer: 0,
    accel: false,
    brake: false,
    drift: false,
    item: false,
  }))
  /** Zeigt an, ob je eine Taste/ein Pad benutzt wurde (blendet Touch-UI aus). */
  usedKeyboard = false
  usedTouch = false

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
    this.gamepads.poll()
  }

  private pad(player: number): PadState | null {
    return this.gamepads.forPlayer(player)
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
    if (this.key(map.left)) steer -= 1
    if (this.key(map.right)) steer += 1
    if (pad) steer += pad.steer
    steer = clamp(steer + touch.steer, -1, 1)

    const item = this.key(map.item) || pad?.item === true || touch.item
    const itemPressed = item && !this.prevItem[player]
    this.prevItem[player] = item

    return {
      steer,
      accel: this.key(map.accel) || pad?.accel === true || touch.accel,
      brake: this.key(map.brake) || pad?.brake === true || touch.brake,
      drift: this.key(map.drift) || pad?.drift === true || touch.drift,
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
    // Im Menü darf jedes angeschlossene Pad navigieren, nicht nur Pad 1.
    const padAny = (field: keyof PadState) => this.gamepads.list().some(({ state }) => state[field] === true)
    const tapped = (codes: readonly string[]) => codes.some((c) => this.pressedThisFrame.has(c))

    const raw: Record<string, boolean> = {
      up: this.key(MENU_KEYS.up) || tapped(MENU_KEYS.up) || padAny('up'),
      down: this.key(MENU_KEYS.down) || tapped(MENU_KEYS.down) || padAny('down'),
      left: this.key(MENU_KEYS.left) || tapped(MENU_KEYS.left) || padAny('left'),
      right: this.key(MENU_KEYS.right) || tapped(MENU_KEYS.right) || padAny('right'),
      confirm: this.key(MENU_KEYS.confirm) || tapped(MENU_KEYS.confirm) || padAny('confirm'),
      back: this.key(MENU_KEYS.back) || tapped(MENU_KEYS.back) || padAny('back'),
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

    edge.any =
      this.pressedThisFrame.size > 0 ||
      Object.values(edge).some(Boolean) ||
      this.gamepads.list().some(({ state }) => state.justPressed >= 0)
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

const SWALLOW = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter', 'Backspace'])
