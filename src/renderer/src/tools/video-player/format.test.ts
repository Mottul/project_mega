import { describe, expect, it } from 'vitest'
import { fmtRest, fmtSekunden, fmtTime } from './format'

describe('fmtTime', () => {
  it('Minuten und Sekunden, Sekunden abgerundet', () => {
    expect(fmtTime(0)).toBe('0:00')
    expect(fmtTime(59.9)).toBe('0:59')
    expect(fmtTime(125)).toBe('2:05')
  })

  it('Unsinn zählt als 0', () => {
    expect(fmtTime(Number.NaN)).toBe('0:00')
    expect(fmtTime(-3)).toBe('0:00')
  })
})

describe('fmtRest', () => {
  it('Countdown mit echtem Minuszeichen', () => {
    expect(fmtRest(12, 60)).toBe('−0:48')
  })

  it('aufgerundet: „−0:00“ erst am Ende', () => {
    expect(fmtRest(59.2, 60)).toBe('−0:01')
    expect(fmtRest(12.3, 60)).toBe('−0:48')
    expect(fmtRest(60, 60)).toBe('−0:00')
  })

  it('nie negativ, auch wenn die Position über die Länge hinausläuft', () => {
    expect(fmtRest(61, 60)).toBe('−0:00')
    expect(fmtRest(5, 0)).toBe('−0:00')
    expect(fmtRest(Number.NaN, Number.NaN)).toBe('−0:00')
  })
})

describe('fmtSekunden', () => {
  it('Millisekunden als Sekunden mit Komma', () => {
    expect(fmtSekunden(500)).toBe('0,5')
    expect(fmtSekunden(1000)).toBe('1')
    expect(fmtSekunden(1250)).toBe('1,25')
    expect(fmtSekunden(100)).toBe('0,1')
  })
})
