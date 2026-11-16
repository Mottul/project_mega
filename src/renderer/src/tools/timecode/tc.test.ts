import { describe, expect, it } from 'vitest'
import {
  TC_RATES,
  framesFrom,
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
  it('mit Trennzeichen wie bisher: fehlende Gruppen links = 0, Gruppen bis drei Ziffern', () => {
    expect(parseTc('1:2:3:4', R25)).toEqual({ hh: 1, mm: 2, ss: 3, ff: 4 })
    expect(parseTc('03:12', R25)).toEqual({ hh: 0, mm: 0, ss: 3, ff: 12 })
    expect(parseTc('100:00:00:00', R25)).toEqual({ hh: 100, mm: 0, ss: 0, ff: 0 })
    expect(parseTc('01:00:00;12', DF)).toEqual({ hh: 1, mm: 0, ss: 0, ff: 12 })
    expect(parseTc('1:0203:12', R25)).toBeNull()
  })
})

// Die Zifferntastatur am Handy hat keinen Doppelpunkt: Reine Ziffern liest parseTc paarweise von
// rechts – Frames, Sekunden, Minuten, der Rest sind Stunden.
describe('parseTc – nur Ziffern', () => {
  it.each<[string, [number, number, number, number]]>([
    ['01020312', [1, 2, 3, 12]],
    ['1020312', [1, 2, 3, 12]],
    ['20312', [0, 2, 3, 12]],
    ['0312', [0, 0, 3, 12]],
    ['312', [0, 0, 3, 12]],
    ['1000000', [1, 0, 0, 0]],
    ['000', [0, 0, 0, 0]],
    ['100020312', [100, 2, 3, 12]],
    [' 1020312 ', [1, 2, 3, 12]]
  ])('„%s“ → %j', (text, [hh, mm, ss, ff]) => {
    expect(parseTc(text, R25)).toEqual({ hh, mm, ss, ff })
  })

  it('ein oder zwei Ziffern bleiben Frames wie bisher', () => {
    expect(parseTc('5', R25)).toEqual({ hh: 0, mm: 0, ss: 0, ff: 5 })
    expect(parseTc('12', R25)).toEqual({ hh: 0, mm: 0, ss: 0, ff: 12 })
    expect(parseTc('24', R25)).toEqual({ hh: 0, mm: 0, ss: 0, ff: 24 })
    expect(parseTc('25', R25)).toBeNull()
  })

  it('dieselben Grenzen wie mit Trennzeichen', () => {
    expect(parseTc('1006000', R25)).toBeNull() // 60 Sekunden
    expect(parseTc('1600000', R25)).toBeNull() // 60 Minuten
    expect(parseTc('1000025', R25)).toBeNull() // Frame 25 bei 25 fps
    expect(parseTc('1000029', DF)).toEqual({ hh: 1, mm: 0, ss: 0, ff: 29 })
  })

  it('mehr als neun Ziffern (Stunden über drei Stellen) → null', () => {
    expect(parseTc('1000020312', R25)).toBeNull()
  })

  it('stimmt mit der Schreibweise mit Doppelpunkten überein', () => {
    for (const tc of ['00:00:00:00', '01:02:03:12', '23:59:59:24', '99:00:00:01']) {
      expect(parseTc(tc.replace(/:/g, ''), R25), tc).toEqual(parseTc(tc, R25))
    }
  })
})

describe('framesFrom – Quelle der verknüpften Felder → Framenummer', () => {
  it('Timecode als Text, auch nur aus Ziffern', () => {
    expect(framesFrom({ field: 'tc', text: '01:00:00:00' }, R25)).toEqual({
      frames: 90000,
      invalid: []
    })
    // 3.723 s × 25 + 12
    expect(framesFrom({ field: 'tc', text: '01020312' }, R25).frames).toBe(93087)
  })

  it('ungültiger Timecode: keine Framenummer – rot macht ihn das Feld selbst (parse)', () => {
    expect(framesFrom({ field: 'tc', text: '01:00:00:25' }, R25)).toEqual({
      frames: null,
      invalid: []
    })
  })

  it('Frames gesamt: auf ganze gerundet', () => {
    expect(framesFrom({ field: 'frames', value: 90000 }, R25).frames).toBe(90000)
    expect(framesFrom({ field: 'frames', value: 1.5 }, R25).frames).toBe(2)
  })

  it('Echtzeit in Sekunden', () => {
    expect(framesFrom({ field: 'real', value: 3600 }, R25).frames).toBe(90000)
    expect(framesFrom({ field: 'real', value: 3600 }, DF).frames).toBe(107892)
  })

  it('0 ist erlaubt, leer ergibt nichts und ist nicht rot', () => {
    expect(framesFrom({ field: 'frames', value: 0 }, R25)).toEqual({ frames: 0, invalid: [] })
    expect(framesFrom({ field: 'real', value: null }, R25)).toEqual({ frames: null, invalid: [] })
  })

  it('negativ: keine Framenummer, das Feld ist rot', () => {
    expect(framesFrom({ field: 'frames', value: -5 }, R25)).toEqual({
      frames: null,
      invalid: ['frames']
    })
    expect(framesFrom({ field: 'real', value: -0.5 }, R25)).toEqual({
      frames: null,
      invalid: ['real']
    })
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
