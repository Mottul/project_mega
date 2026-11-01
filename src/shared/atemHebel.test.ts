import { describe, expect, it } from 'vitest'
import {
  griffAusWert,
  hebelAmEnde,
  HEBEL_START,
  hebelFolgen,
  hebelZiehen,
  wertAusGriff,
  type HebelZug
} from './atemHebel'

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

describe('hebelAmEnde', () => {
  it('dreht auch, wenn die Meldungen keinen hohen Wert zeigen (Griff schwungvoll ans Ende)', () => {
    const s = hebelAmEnde(folge([[true, 3000]]))
    expect(hebelFolgen(s, false, 0).oben).toBe(true)
  })

  it('dreht auch aus der Ruhelage: Ein einziger Sprung meldet gar keinen Übergang', () => {
    expect(hebelFolgen(hebelAmEnde(HEBEL_START), false, 0).oben).toBe(true)
  })

  it('lässt sich von einer alten Meldung nicht aufhalten', () => {
    const s = folge(
      [
        [true, 3000],
        [false, 0]
      ],
      hebelAmEnde(folge([[true, 2000]]))
    )
    expect(s.oben).toBe(true)
  })

  it('dreht nur einmal, auch wenn die Null danach noch eine Meldung auslöst', () => {
    const s = folge(
      [
        [false, 0],
        [false, 0]
      ],
      hebelAmEnde(HEBEL_START)
    )
    expect(s.oben).toBe(true)
  })
})

describe('hebelZiehen', () => {
  const start: HebelZug = { oben: false, wert: 0, fertig: false }

  /** Griff-Lagen nacheinander, mit gemeldeter Ruhelage: was geht hinaus? */
  function zug(lagen: [griff: number, oben: boolean][], z = start): [HebelZug, number[]] {
    const raus: number[] = []
    let jetzt = z
    for (const [griff, oben] of lagen) {
      const schritt = hebelZiehen(jetzt, griff, oben)
      jetzt = schritt.zug
      if (schritt.senden !== null) raus.push(schritt.senden)
    }
    return [jetzt, raus]
  }

  it('sendet jeden neuen Wert, einen gleichen nicht', () => {
    const [z, raus] = zug([
      [0.2, false],
      [0.2, false],
      [0.5, false]
    ])
    expect(raus).toEqual([2000, 5000])
    expect(z.fertig).toBe(false)
  })

  it('sendet am Ende nichts mehr, solange der Mischer das Ende nicht gemeldet hat', () => {
    const [z, raus] = zug([
      [1, false],
      [0.5, false],
      [0, false]
    ])
    expect(raus).toEqual([10000])
    expect(z.fertig).toBe(true)
  })

  it('zieht nach der Meldung ohne Absetzen zurück: nächster Übergang ab der neuen Ruhelage', () => {
    const [z, raus] = zug([
      [1, false],
      [0.75, true],
      [0.25, true]
    ])
    expect(raus).toEqual([10000, 2500, 7500])
    expect(z).toEqual({ oben: true, wert: 7500, fertig: false })
  })

  it('schiebt beim Zittern am Ende nichts an', () => {
    const [z, raus] = zug([
      [1, false],
      [1, true],
      [0.98, true]
    ])
    expect(raus).toEqual([10000])
    expect(z.fertig).toBe(true)
  })

  it('läuft hin und zurück beliebig oft, jede Richtung ein eigener Übergang', () => {
    const [z, raus] = zug([
      [1, false],
      [0.5, true],
      [0, true],
      [0.5, false],
      [1, false]
    ])
    expect(raus).toEqual([10000, 5000, 10000, 5000, 10000])
    expect(z.fertig).toBe(true)
  })

  it('verliert nichts, wenn der Griff in einem Sprung am anderen Ende ankommt', () => {
    const [, raus] = zug([
      [1, false],
      [0, true]
    ])
    expect(raus).toEqual([10000, 10000])
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
