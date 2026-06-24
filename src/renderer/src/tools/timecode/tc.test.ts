import { describe, expect, it } from 'vitest'
import {
  TC_RATES,
  framesToSeconds,
  framesToTc,
  formatRealtime,
  formatTc,
  parseTc,
  secondsToFrames,
  tcToFrames,
  type TcRate
} from './tc'

const rate = (key: string): TcRate => {
  const r = TC_RATES.find((x) => x.key === key)
  if (!r) throw new Error(`unbekannte Rate ${key}`)
  return r
}
const R25 = rate('25')
const R30 = rate('30')
const DF = rate('29.97df') // Drop-Frame, dp=2
const DF60 = rate('59.94df') // Drop-Frame, dp=4

describe('framesToTc / formatTc – Nondrop', () => {
  it('Frame 0 @25 → 00:00:00:00', () => {
    expect(formatTc(framesToTc(0, R25), R25)).toBe('00:00:00:00')
  })
  it('1 Sekunde = Frame 25 @25 → 00:00:01:00', () => {
    expect(formatTc(framesToTc(25, R25), R25)).toBe('00:00:01:00')
  })
  it('negative/gebrochene Framenummern werden gerundet', () => {
    expect(framesToTc(-5, R25)).toMatchObject({ hh: 0, mm: 0, ss: 0, ff: 0 })
    expect(framesToTc(25.4, R25)).toMatchObject({ hh: 0, mm: 0, ss: 1, ff: 0 })
  })
})

describe('Drop-Frame 29,97 – die ausgelassenen Frame-Nummern', () => {
  it('Minutenwechsel überspringt Nummern 00/01 → 00:01:00;02', () => {
    expect(formatTc(framesToTc(1800, DF), DF)).toBe('00:01:00;02')
  })
  it('jede 10. Minute wird NICHT gedroppt → 00:10:00;00', () => {
    expect(formatTc(framesToTc(17982, DF), DF)).toBe('00:10:00;00')
  })
  it('letzter Frame vor dem ersten Sprung → 00:00:59;29', () => {
    expect(formatTc(framesToTc(1799, DF), DF)).toBe('00:00:59;29')
  })
  it('formatTc setzt nur den LETZTEN Separator auf ; ', () => {
    expect(formatTc({ hh: 1, mm: 2, ss: 3, ff: 4 }, DF)).toBe('01:02:03;04')
  })
  it('tcToFrames repariert ungültigen DF-Code (00 am Minutenanfang → 02)', () => {
    expect(tcToFrames({ hh: 0, mm: 1, ss: 0, ff: 0 }, DF)).toBe(1800)
  })
})

describe('Roundtrips', () => {
  it('parse(format(tc)) === tc für gültige Nondrop-Werte', () => {
    for (const tc of [
      { hh: 0, mm: 0, ss: 0, ff: 0 },
      { hh: 1, mm: 23, ss: 45, ff: 12 },
      { hh: 99, mm: 59, ss: 59, ff: 24 }
    ]) {
      expect(parseTc(formatTc(tc, R25), R25)).toEqual(tc)
    }
  })
  it('framesToTc → tcToFrames === Identität über einen 10-Minuten-Block (29,97 DF)', () => {
    for (let n = 0; n <= 18000; n++) {
      expect(tcToFrames(framesToTc(n, DF), DF)).toBe(n)
    }
  })
  it('framesToTc → tcToFrames === Identität (59,94 DF, Stichprobe)', () => {
    for (let n = 0; n <= 36000; n += 7) {
      expect(tcToFrames(framesToTc(n, DF60), DF60)).toBe(n)
    }
  })
  it('secondsToFrames(framesToSeconds(f)) === f bei ganzzahliger fps', () => {
    for (let f = 0; f <= 5000; f += 13) {
      expect(secondsToFrames(framesToSeconds(f, R30), R30)).toBe(f)
    }
  })
})

describe('Properties', () => {
  it('framesToTc: ff<nominal, ss/mm in 0..59 für jede Rate', () => {
    for (const r of TC_RATES) {
      for (const n of [0, 1, 999, 100000, 5184000]) {
        const tc = framesToTc(n, r)
        expect(tc.ff).toBeGreaterThanOrEqual(0)
        expect(tc.ff).toBeLessThan(r.nominal)
        expect(tc.ss).toBeGreaterThanOrEqual(0)
        expect(tc.ss).toBeLessThanOrEqual(59)
        expect(tc.mm).toBeLessThanOrEqual(59)
        expect(tc.hh).toBeGreaterThanOrEqual(0)
      }
    }
  })
  it('secondsToFrames ist monoton nicht-fallend', () => {
    let prev = -1
    for (let s = 0; s <= 100; s += 0.37) {
      const f = secondsToFrames(s, R25)
      expect(f).toBeGreaterThanOrEqual(prev)
      prev = f
    }
  })
})

describe('parseTc – Validierung & Trennzeichen', () => {
  it('ff an/über der nominalen Grenze → null', () => {
    expect(parseTc('25', R25)).toBeNull() // ff=25 >= 25
  })
  it('leer und >4 Gruppen → null', () => {
    expect(parseTc('', R25)).toBeNull()
    expect(parseTc('1:2:3:4:5', R25)).toBeNull()
  })
  it('Komma wird (laut Regex) als Trenner akzeptiert', () => {
    expect(parseTc('01,02,03,04', R25)).toEqual({ hh: 1, mm: 2, ss: 3, ff: 4 })
  })
})

describe('formatRealtime', () => {
  it('negative Zeit mit mathematischem Minus U+2212', () => {
    expect(formatRealtime(-1.25)).toBe('−00:00:01.250')
  })
  it('positiv ohne Vorzeichen', () => {
    expect(formatRealtime(1.25)).toBe('00:00:01.250')
  })
})
