import { describe, expect, it } from 'vitest'
import { SpiegelAnteil } from './spiegelAnteil'

/** Medianwerte im Takt der Tonblöcke (alle 33 ms) ab `ab` ms: `wert(sekunde)` */
function lauf(
  a: SpiegelAnteil,
  vonS: number,
  bisS: number,
  wert: (s: number) => number
): { ms: number[]; wandert: [number, number][] } {
  const ms: number[] = []
  const wandert: [number, number][] = []
  for (let t = vonS * 1000; t < bisS * 1000; t += 33) {
    const r = a.neu(wert(t / 1000), 1_000_000 + t)
    ms.push(r.ms)
    if (r.wandert) wandert.push(r.wandert)
  }
  return { ms, wandert }
}

describe('Anteil des Spiegels am Weg des Bildes', () => {
  it('der erste Wert gilt sofort, Wackeln bis 10 ms ändert nichts', () => {
    const a = new SpiegelAnteil()
    expect(a.ms).toBeNull()
    const r = lauf(a, 0, 5, (s) => 33 + Math.round(4 * Math.sin(s * 7)))
    expect(new Set(r.ms)).toEqual(new Set([33]))
    expect(r.wandert).toEqual([])
  })

  it('Sprung nach einem Hänger (Linux: +33 ms in zwei Sekunden): gilt', () => {
    const a = new SpiegelAnteil()
    // Median kippt zwischen 12 und 14 s von −17 auf +16
    const r = lauf(a, 0, 20, (s) =>
      s < 12 ? -17 : s < 14 ? -17 + Math.round((s - 12) * 16.5) : 16
    )
    expect(r.ms.at(-1)).toBe(16)
    expect(r.wandert).toEqual([])
  })

  it('langsames Wandern (Medien-Uhr geht anders, 1,1 ms/s): bleibt beim ersten Wert, einmal gemeldet', () => {
    const a = new SpiegelAnteil()
    // macOS-Runner: 33 ms, dann gleichmäßig weniger – nach 25 s 6 ms
    const r = lauf(a, 0, 25, (s) => Math.round(33 - 1.1 * s))
    expect(new Set(r.ms)).toEqual(new Set([33]))
    expect(r.wandert).toHaveLength(1)
    expect(r.wandert[0][0]).toBe(33)
  })

  it('erst gewandert, dann gesprungen: der Sprung gilt', () => {
    const a = new SpiegelAnteil()
    lauf(a, 0, 15, (s) => Math.round(33 - 1.1 * s)) // wandert auf 17
    const r = lauf(a, 15, 20, (s) => (s < 16 ? 17 : 50))
    expect(r.ms.at(-1)).toBe(50)
  })
})
