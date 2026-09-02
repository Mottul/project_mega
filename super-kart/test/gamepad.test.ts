import { describe, expect, it } from 'vitest'
import { DEFAULT_BINDING, Gamepads, hatToDirections, padLabel } from '../src/core/gamepad'

/** Baut ein Gamepad-Objekt, wie es der Browser liefern würde. */
function fakePad(options: {
  index?: number
  id?: string
  mapping?: string
  buttons?: number[]
  axes?: number[]
}): Gamepad {
  const count = options.mapping === 'standard' ? 17 : 12
  const pressed = new Set(options.buttons ?? [])
  return {
    index: options.index ?? 0,
    id: options.id ?? 'Test USB Pad (Vendor: 0001 Product: 0002)',
    mapping: (options.mapping ?? '') as GamepadMappingType,
    connected: true,
    timestamp: 0,
    axes: options.axes ?? [0, 0, 0, 0, 0, 0, 0, 0, 0, 3.28],
    buttons: Array.from({ length: count }, (_, i) => ({
      pressed: pressed.has(i),
      touched: pressed.has(i),
      value: pressed.has(i) ? 1 : 0,
    })),
    vibrationActuator: null,
  } as unknown as Gamepad
}

function withPads(pads: Gamepad[], run: (gamepads: Gamepads) => void, gamepads = new Gamepads()): void {
  const original = globalThis.navigator
  Object.defineProperty(globalThis, 'navigator', {
    value: { getGamepads: () => pads },
    configurable: true,
  })
  try {
    gamepads.poll()
    run(gamepads)
  } finally {
    Object.defineProperty(globalThis, 'navigator', { value: original, configurable: true })
  }
}

describe('Gamepad-Hilfen', () => {
  it('kürzt Gamepad-Namen auf etwas Anzeigbares', () => {
    expect(padLabel('Xbox 360 Controller (STANDARD GAMEPAD Vendor: 045e Product: 028e)')).toBe(
      'Xbox 360 Controller'
    )
    expect(padLabel('  Mega   USB  Pad  ')).toBe('Mega USB Pad')
    expect(padLabel('x'.repeat(60)).length).toBe(28)
  })

  it('übersetzt die acht Rastungen der Hat-Achse', () => {
    // Werte wie sie DirectInput-Pads liefern: -1 oben, dann im Uhrzeigersinn.
    expect(hatToDirections(-1)).toMatchObject({ up: true, down: false, left: false, right: false })
    expect(hatToDirections(-5 / 7)).toMatchObject({ up: true, right: true })
    expect(hatToDirections(-3 / 7)).toMatchObject({ right: true, up: false, down: false })
    expect(hatToDirections(-1 / 7)).toMatchObject({ down: true, right: true })
    expect(hatToDirections(1 / 7)).toMatchObject({ down: true, left: false, right: false })
    expect(hatToDirections(3 / 7)).toMatchObject({ down: true, left: true })
    expect(hatToDirections(5 / 7)).toMatchObject({ left: true, up: false, down: false })
    expect(hatToDirections(1)).toMatchObject({ up: true, left: true })
  })

  it('meldet in Ruhelage keine Richtung', () => {
    // Viele Pads liefern im Ruhezustand einen Wert außerhalb von [-1, 1].
    for (const idle of [2, 3.28, -1.5]) {
      expect(hatToDirections(idle)).toEqual({ up: false, down: false, left: false, right: false })
    }
  })

  it('erkennt Pads und verteilt sie der Reihe nach auf die Spieler', () => {
    withPads([fakePad({ index: 0 }), fakePad({ index: 3, id: 'Zweites Pad' })], (pads) => {
      expect(pads.count()).toBe(2)
      expect(pads.forPlayer(0)?.index).toBe(0)
      expect(pads.forPlayer(1)?.index).toBe(3)
      expect(pads.forPlayer(2)).toBeNull()
    })
  })

  it('behält die Zuordnung, wenn ein Pad abgezogen wird', () => {
    const pads = new Gamepads()
    withPads([fakePad({ index: 0 }), fakePad({ index: 1, id: 'Zweites Pad' })], () => {}, pads)
    // Pad 0 verschwindet - Pad 1 darf nicht auf Spieler 1 rutschen.
    withPads(
      [fakePad({ index: 1, id: 'Zweites Pad' })],
      (g) => {
        expect(g.forPlayer(1)?.id).toBe('Zweites Pad')
        expect(g.forPlayer(0)).toBeNull()
      },
      pads
    )
  })

  it('liest die Standardbelegung eines gewöhnlichen Pads', () => {
    withPads([fakePad({ mapping: 'standard', buttons: [0, 5] })], (pads) => {
      const state = pads.forPlayer(0)!
      expect(state.standard).toBe(true)
      expect(state.accel).toBe(true)
      expect(state.drift).toBe(true)
      expect(state.brake).toBe(false)
      expect(state.item).toBe(false)
    })
  })

  it('nutzt die angelernte Belegung eines USB-Pads', () => {
    const pads = new Gamepads()
    pads.bindings = { 'Test USB Pad': { accel: 3, brake: 2, drift: 1, item: 0 } }
    withPads(
      [fakePad({ buttons: [3] })],
      (g) => {
        const state = g.forPlayer(0)!
        expect(state.standard).toBe(false)
        expect(state.accel).toBe(true)
        expect(state.item).toBe(false)
      },
      pads
    )
    withPads(
      [fakePad({ buttons: [0] })],
      (g) => {
        expect(g.forPlayer(0)!.item).toBe(true)
        expect(g.forPlayer(0)!.accel).toBe(false)
      },
      pads
    )
  })

  it('liest das Steuerkreuz eines Pads ohne Standardlayout aus der Hat-Achse', () => {
    withPads([fakePad({ axes: [0, 0, 0, 0, 0, 0, 0, 0, 0, -3 / 7] })], (pads) => {
      const state = pads.forPlayer(0)!
      expect(state.right).toBe(true)
      expect(state.steer).toBeCloseTo(1)
    })
  })

  it('meldet neu gedrückte Tasten genau einmal', () => {
    const pads = new Gamepads()
    withPads([fakePad({ buttons: [] })], () => {}, pads)
    withPads(
      [fakePad({ buttons: [4] })],
      (g) => {
        expect(g.anyJustPressed()?.button).toBe(4)
      },
      pads
    )
    withPads(
      [fakePad({ buttons: [4] })],
      (g) => {
        // Halten ist kein neuer Druck - sonst würde das Anlernen durchrasen.
        expect(g.anyJustPressed()).toBeNull()
      },
      pads
    )
  })

  it('ignoriert Achsenrauschen unterhalb der Totzone', () => {
    withPads([fakePad({ axes: [0.15, 0, 0, 0, 0, 0, 0, 0, 0, 3.28] })], (pads) => {
      expect(pads.forPlayer(0)!.steer).toBe(0)
    })
    withPads([fakePad({ axes: [0.8, 0, 0, 0, 0, 0, 0, 0, 0, 3.28] })], (pads) => {
      expect(pads.forPlayer(0)!.steer).toBeCloseTo(0.8)
    })
  })

  it('tauscht Spielerplätze', () => {
    const pads = new Gamepads()
    withPads(
      [fakePad({ index: 0, id: 'Erstes' }), fakePad({ index: 1, id: 'Zweites' })],
      (g) => {
        g.swap(0, 1)
        expect(g.forPlayer(0)!.id).toBe('Zweites')
        expect(g.forPlayer(1)!.id).toBe('Erstes')
      },
      pads
    )
  })

  it('hat eine vollständige Standardbelegung', () => {
    for (const key of ['accel', 'brake', 'drift', 'item'] as const) {
      expect(DEFAULT_BINDING[key]).toBeGreaterThanOrEqual(0)
    }
  })
})
