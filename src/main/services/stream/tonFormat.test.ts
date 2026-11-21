import { describe, expect, it } from 'vitest'
import { stille, verschraenkt, zuStereo } from './tonFormat'

const f = (...v: number[]): Float32Array => new Float32Array(v)
const lesen = (b: Buffer): number[] =>
  Array.from({ length: b.length / 4 }, (_, i) => Math.round(b.readFloatLE(i * 4) * 1000) / 1000)

describe('Ton für den Stream – Stereo verschränkt', () => {
  it('Stereo: L R L R …', () => {
    expect(lesen(verschraenkt([f(0.1, 0.2), f(-0.1, -0.2)]))).toEqual([0.1, -0.1, 0.2, -0.2])
  })

  it('Mono auf beide Seiten', () => {
    expect(lesen(verschraenkt([f(0.5, -0.25)]))).toEqual([0.5, 0.5, -0.25, -0.25])
  })

  it('5.1: Mitte und Surround mit −3 dB dazu, LFE fällt weg', () => {
    // L R C LFE SL SR
    const [l, r] = zuStereo([f(0.1), f(0.2), f(0.4), f(0.9), f(0.2), f(0)])
    expect(l[0]).toBeCloseTo(0.1 + Math.SQRT1_2 * (0.4 + 0.2), 5)
    expect(r[0]).toBeCloseTo(0.2 + Math.SQRT1_2 * 0.4, 5)
  })

  it('Quad: vorn und hinten gemittelt', () => {
    const [l, r] = zuStereo([f(0.4), f(0.2), f(0), f(0.6)])
    expect(l[0]).toBeCloseTo(0.2, 5)
    expect(r[0]).toBeCloseTo(0.4, 5)
  })

  it('Ausschnitt eines Blocks (der Rest lag schon im Strom)', () => {
    const b = verschraenkt([f(1, 2, 3, 4).map((x) => x / 10)], 2, 1)
    expect(lesen(b)).toEqual([0.3, 0.3])
    expect(verschraenkt([f(0.1, 0.2)], 5).length).toBe(0)
  })

  it('Stille: 8 Bytes je Stereo-Sample, negativ = nichts', () => {
    expect(stille(3).length).toBe(24)
    expect(stille(-1).length).toBe(0)
  })
})
