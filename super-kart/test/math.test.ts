import { describe, expect, it } from 'vitest'
import { angleDelta, catmullRom, clamp, damp, formatTime, lerp, wrapAngle } from '../src/core/math'

describe('math', () => {
  it('begrenzt Werte', () => {
    expect(clamp(5, 0, 3)).toBe(3)
    expect(clamp(-5, 0, 3)).toBe(0)
    expect(clamp(1.5, 0, 3)).toBe(1.5)
  })

  it('interpoliert linear', () => {
    expect(lerp(0, 10, 0.25)).toBe(2.5)
  })

  it('normalisiert Winkel auf [-PI, PI)', () => {
    expect(wrapAngle(0)).toBeCloseTo(0)
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(-Math.PI)
    expect(wrapAngle(-Math.PI * 3)).toBeCloseTo(-Math.PI)
    expect(wrapAngle(Math.PI * 1.5)).toBeCloseTo(-Math.PI * 0.5)
    expect(wrapAngle(Math.PI * 0.5)).toBeCloseTo(Math.PI * 0.5)
  })

  it('liefert die kürzeste Winkeldifferenz', () => {
    expect(angleDelta(Math.PI * 0.9, -Math.PI * 0.9)).toBeCloseTo(Math.PI * 0.2)
    expect(angleDelta(-Math.PI * 0.9, Math.PI * 0.9)).toBeCloseTo(-Math.PI * 0.2)
  })

  it('dämpft rahmenratenunabhängig', () => {
    // Eine Halbwertszeit halbiert den Abstand zum Ziel - unabhängig davon,
    // ob in einem oder zwei Schritten gerechnet wird.
    const one = damp(0, 1, 0.5, 0.5)
    let two = 0
    two = damp(two, 1, 0.5, 0.25)
    two = damp(two, 1, 0.5, 0.25)
    expect(one).toBeCloseTo(0.5, 6)
    expect(two).toBeCloseTo(one, 6)
  })

  it('trifft an den Stützstellen die Eingabewerte', () => {
    expect(catmullRom(0, 10, 20, 30, 0)).toBeCloseTo(10)
    expect(catmullRom(0, 10, 20, 30, 1)).toBeCloseTo(20)
  })

  it('formatiert Rundenzeiten', () => {
    expect(formatTime(0)).toBe("0'00''000")
    expect(formatTime(83.456)).toBe("1'23''456")
    expect(formatTime(Number.NaN)).toBe("--'--''---")
  })
})
