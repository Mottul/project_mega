import { describe, expect, it } from 'vitest'
import { qrMatrix } from './qr'

/** Finder oben links: 7 × 7 mit dunklem Rand und dunklem 3 × 3-Kern */
function finderOk(m: boolean[][], r: number, c: number): boolean {
  for (let i = 0; i < 7; i++)
    for (let j = 0; j < 7; j++) {
      const rand = i === 0 || i === 6 || j === 0 || j === 6
      const kern = i >= 2 && i <= 4 && j >= 2 && j <= 4
      if (m[r + i][c + j] !== (rand || kern)) return false
    }
  return true
}

describe('QR-Encoder', () => {
  it('kurzer Text bleibt Version 1 (21 Module)', () => {
    expect(qrMatrix('tel:+436641234567')?.length).toBe(21)
  })

  it('Online-Adresse einer Anleitung: Version 5 (37 Module) mit Mustern an der richtigen Stelle', () => {
    const url = 'https://filedn.eu/llBIn2VtMT8YMNyN4Vaac98/messe-dornbirn-2026-k7f3q2x9/index.html'
    expect(new TextEncoder().encode(url).length).toBeGreaterThan(78) // passt nicht mehr in V4
    const m = qrMatrix(url)!
    expect(m.length).toBe(37)
    expect(m.every((row) => row.length === 37)).toBe(true)
    expect([finderOk(m, 0, 0), finderOk(m, 0, 30), finderOk(m, 30, 0)]).toEqual([true, true, true])
    // Ausrichtungsmuster bei (30, 30): dunkle Mitte, heller Ring, dunkler Rand
    expect(m[30][30]).toBe(true)
    expect([m[29][30], m[31][30], m[30][29], m[30][31]]).toEqual([false, false, false, false])
    expect([m[28][28], m[32][32], m[28][32], m[32][28]]).toEqual([true, true, true, true])
    // Taktlinien wechseln ab
    for (let i = 8; i < 29; i++) {
      expect(m[6][i]).toBe(i % 2 === 0)
      expect(m[i][6]).toBe(i % 2 === 0)
    }
    // das dunkle Modul neben dem unteren Finder
    expect(m[37 - 8][8]).toBe(true)
  })

  it('Grenze: 106 Bytes gehen, 107 nicht', () => {
    expect(qrMatrix('x'.repeat(106))?.length).toBe(37)
    expect(qrMatrix('x'.repeat(107))).toBeNull()
  })
})
