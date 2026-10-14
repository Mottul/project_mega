import { describe, expect, it } from 'vitest'
import { correctionAt, correctionGains, parseCorrection, type MicCorrection } from './calibration'

// So beginnt eine Kalibrierdatei des miniDSP UMIK-1 (Werte gekürzt)
const UMIK = [
  '"Sens Factor =-1.378dB, AGain =18dB, SERNO: 7012345"',
  '10.054\t-3.7031',
  '20.000\t-1.0000',
  '1000.0\t0.0000',
  '10000.0\t1.5000',
  '20000.0\t-2.0000'
].join('\r\n')

describe('Korrekturdatei', () => {
  it('liest UMIK-1: Punkte, Seriennummer, Sens Factor', () => {
    const c = parseCorrection(UMIK, 'umik.txt') as MicCorrection
    expect(c.points).toHaveLength(5)
    expect(c.serial).toBe('7012345')
    expect(c.sensDb).toBeCloseTo(-1.378, 3)
    expect(c.points[0]).toEqual([10.054, -3.7031])
  })

  it('liest auch Komma-/Semikolon-Spalten mit Phase und Kommentarzeilen (REW, Dayton)', () => {
    const c = parseCorrection(
      '* Dayton UMM-6\n* 1kHz -40dB\n20;-1.5;0\n1000,0.2,5\n',
      'x'
    ) as MicCorrection
    expect(c.points).toEqual([
      [20, -1.5],
      [1000, 0.2]
    ])
  })

  it('meldet unbrauchbare Dateien', () => {
    expect(typeof parseCorrection('hallo\nwelt', 'x')).toBe('string')
    expect(typeof parseCorrection('1000 0\n', 'x')).toBe('string')
  })

  it('Korrektur zwischen den Punkten linear über log f, außen der Randwert', () => {
    const p = (parseCorrection(UMIK, 'u') as MicCorrection).points
    expect(correctionAt(p, 1000)).toBeCloseTo(0, 6)
    // genau in der Mitte (log) zwischen 1 und 10 kHz: 3.162 Hz -> 0,75 dB
    expect(correctionAt(p, Math.sqrt(1000 * 10000))).toBeCloseTo(0.75, 6)
    expect(correctionAt(p, 5)).toBeCloseTo(-3.7031, 6)
    expect(correctionAt(p, 24000)).toBeCloseTo(-2, 6)
  })

  it('Faktoren je Bin: +1,5 dB laut -> Messung um 1,5 dB abgesenkt', () => {
    const p = (parseCorrection(UMIK, 'u') as MicCorrection).points
    const [g] = correctionGains(p, 48000, [4800])
    // Bin 1000 = 10 kHz bei 48 kHz / 4800
    expect(10 * Math.log10(g[1000])).toBeCloseTo(-1.5, 6)
    expect(g[0]).toBe(1)
  })
})
