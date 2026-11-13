import { describe, expect, it } from 'vitest'
import { parseRange } from './range'

describe('parseRange – Byte-Bereich einer Anfrage', () => {
  it('ohne Kopfzeile oder mit Unlesbarem: ganze Datei', () => {
    expect(parseRange(undefined, 1000)).toBeNull()
    expect(parseRange(null, 1000)).toBeNull()
    expect(parseRange('', 1000)).toBeNull()
    expect(parseRange('bytes=a-b', 1000)).toBeNull()
    expect(parseRange('bytes=-', 1000)).toBeNull()
    expect(parseRange('seiten=1-2', 1000)).toBeNull()
  })

  it('von–bis, beide eingeschlossen', () => {
    expect(parseRange('bytes=0-99', 1000)).toEqual({ start: 0, end: 99 })
    expect(parseRange('bytes=100-199', 1000)).toEqual({ start: 100, end: 199 })
    expect(parseRange('bytes=999-999', 1000)).toEqual({ start: 999, end: 999 })
  })

  it('offenes Ende: bis zum letzten Byte (so fragt ein <video> beim Start)', () => {
    expect(parseRange('bytes=0-', 1000)).toEqual({ start: 0, end: 999 })
    expect(parseRange('bytes=250-', 1000)).toEqual({ start: 250, end: 999 })
  })

  it('„bytes=-500“ sind die letzten 500 Bytes – nicht die ersten 501', () => {
    expect(parseRange('bytes=-500', 1000)).toEqual({ start: 500, end: 999 })
    expect(parseRange('bytes=-1', 1000)).toEqual({ start: 999, end: 999 })
    // mehr verlangt, als da ist: die ganze Datei
    expect(parseRange('bytes=-5000', 1000)).toEqual({ start: 0, end: 999 })
  })

  it('kappt ein Ende hinter der Datei', () => {
    expect(parseRange('bytes=900-5000', 1000)).toEqual({ start: 900, end: 999 })
    expect(parseRange(`bytes=0-${'9'.repeat(400)}`, 1000)).toEqual({ start: 0, end: 999 })
  })

  it('nicht erfüllbar: Anfang hinter der Datei, Anfang nach dem Ende, nichts verlangt', () => {
    expect(parseRange('bytes=1000-', 1000)).toBe('unerfuellbar')
    expect(parseRange('bytes=5000-6000', 1000)).toBe('unerfuellbar')
    expect(parseRange('bytes=500-100', 1000)).toBe('unerfuellbar')
    expect(parseRange('bytes=-0', 1000)).toBe('unerfuellbar')
    expect(parseRange(`bytes=${'9'.repeat(400)}-`, 1000)).toBe('unerfuellbar')
  })

  it('leere Datei: jeder Bereich ist unerfüllbar, ohne Angabe bleibt es die ganze Datei', () => {
    expect(parseRange('bytes=0-', 0)).toBe('unerfuellbar')
    expect(parseRange('bytes=-10', 0)).toBe('unerfuellbar')
    expect(parseRange(undefined, 0)).toBeNull()
  })

  it('mehrere Bereiche: der erste zählt', () => {
    expect(parseRange('bytes=0-99,200-299', 1000)).toEqual({ start: 0, end: 99 })
  })
})
