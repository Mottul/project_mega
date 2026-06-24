import { describe, expect, it } from 'vitest'
import { fmtClock, fmtTimer, parseDuration } from './format'

describe('fmtTimer (M:SS bzw. H:MM:SS)', () => {
  it('Stundenfeld erscheint genau ab 3600 s', () => {
    expect(fmtTimer(3599)).toBe('59:59')
    expect(fmtTimer(3600)).toBe('1:00:00')
  })
  it('Null ohne Vorzeichen', () => {
    expect(fmtTimer(0)).toBe('0:00')
  })
  it('halbe Sekunden werden gerundet (half-up)', () => {
    expect(fmtTimer(89.5)).toBe('1:30')
    expect(fmtTimer(89.4)).toBe('1:29')
  })
  it('Überziehung: führendes mathematisches Minus U+2212', () => {
    const s = fmtTimer(-90)
    expect(s).toBe('−1:30')
    expect(s.charCodeAt(0)).toBe(0x2212) // NICHT ASCII-Hyphen 0x2D
  })
  it('Sekundenfeld immer zweistellig (Property 0..7200 s)', () => {
    for (let t = 0; t <= 7200; t += 17) {
      const out = fmtTimer(t)
      const re = t >= 3600 ? /^\d+:\d{2}:\d{2}$/ : /^\d+:\d{2}$/
      expect(out).toMatch(re)
    }
  })
})

describe('parseDuration (→ Sekunden, null bei ungültig/≤0)', () => {
  it('reine Zahl = Minuten; M:SS = Minuten+Sekunden', () => {
    expect(parseDuration('5')).toBe(300)
    expect(parseDuration('5:30')).toBe(330)
    expect(parseDuration('5:00')).toBe(300)
  })
  it('H:MM:SS summiert korrekt', () => {
    expect(parseDuration('1:05:00')).toBe(3900) // 1 h + 5 min = 3900 s
  })
  it('Komma und Punkt äquivalent, Ergebnis gerundet', () => {
    expect(parseDuration('1,5')).toBe(90)
    expect(parseDuration('1.5')).toBe(90)
  })
  it('keine Bereichsprüfung der Unterfelder (5:70 → 370)', () => {
    expect(parseDuration('5:70')).toBe(370)
  })
  it('nicht-positive / leere / falsche Teilzahl → null', () => {
    expect(parseDuration('0')).toBeNull()
    expect(parseDuration('0:00')).toBeNull()
    expect(parseDuration('')).toBeNull()
    expect(parseDuration('-5')).toBeNull()
    expect(parseDuration('1:2:3:4')).toBeNull()
  })
})

describe('fmtClock (lokale Uhrzeit HH:MM:SS)', () => {
  it('führende Nullen', () => {
    expect(fmtClock(new Date(2026, 5, 24, 9, 5, 3))).toBe('09:05:03')
  })
  it('Mitternacht', () => {
    expect(fmtClock(new Date(2026, 0, 1, 0, 0, 0))).toBe('00:00:00')
  })
})
