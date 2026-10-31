import { describe, expect, it } from 'vitest'
import { griffAusWert, HEBEL_START, hebelFolgen, wertAusGriff } from './atemHebel'

/** Folge von Meldungen des Mischers: [läuft, Wert] */
function folge(meldungen: [boolean, number][], start = HEBEL_START): typeof HEBEL_START {
  return meldungen.reduce((s, [u, w]) => hebelFolgen(s, u, w), start)
}

describe('hebelFolgen', () => {
  it('dreht die Ruhelage nach jedem fertigen Übergang', () => {
    const ein = folge([
      [true, 2000],
      [true, 9000],
      [false, 0]
    ])
    expect(ein.oben).toBe(true)
    const zwei = folge(
      [
        [true, 5000],
        [false, 0]
      ],
      ein
    )
    expect(zwei.oben).toBe(false)
  })

  it('bleibt am selben Ende, wenn der Griff zurückgezogen wurde', () => {
    const s = folge([
      [true, 3000],
      [true, 1000],
      [false, 0]
    ])
    expect(s.oben).toBe(false)
  })

  it('bleibt stehen, solange nichts läuft (ein Cut geht nicht über den Hebel)', () => {
    expect(folge([[false, 0]])).toEqual(HEBEL_START)
  })
})

describe('Griff und Wert', () => {
  it('läuft aus der Ruhelage heraus immer von 0 bis zum Ende', () => {
    expect(wertAusGriff(0, false)).toBe(0)
    expect(wertAusGriff(0.5, false)).toBe(5000)
    expect(wertAusGriff(1, false)).toBe(10000)
    expect(wertAusGriff(1, true)).toBe(0)
    expect(wertAusGriff(0.25, true)).toBe(7500)
    expect(wertAusGriff(0, true)).toBe(10000)
  })

  it('zählt knapp vor dem Ende als Ende', () => {
    expect(wertAusGriff(0.996, false)).toBe(10000)
    expect(wertAusGriff(0.99, false)).toBe(9900)
    expect(wertAusGriff(0.004, true)).toBe(10000)
  })

  it('begrenzt den Griff', () => {
    expect(wertAusGriff(1.2, false)).toBe(10000)
    expect(wertAusGriff(-0.2, false)).toBe(0)
  })

  it('findet aus dem Wert dieselbe Lage zurück', () => {
    expect(griffAusWert(2500, false)).toBe(0.25)
    expect(griffAusWert(2500, true)).toBe(0.75)
    expect(griffAusWert(0, true)).toBe(1)
  })
})
