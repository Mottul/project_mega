import { describe, expect, it } from 'vitest'
import {
  gesehenCodec,
  hatNeues,
  NEUIGKEITEN,
  neuesterTag,
  tagKurz,
  tagLang,
  type Neuigkeit
} from './neuigkeiten'

/** Gibt es den Tag im Kalender (kein 31.11.)? */
function echterTag(datum: string): boolean {
  const [j, m, t] = datum.split('-').map(Number)
  const d = new Date(Date.UTC(j, m - 1, t))
  return d.getUTCFullYear() === j && d.getUTCMonth() === m - 1 && d.getUTCDate() === t
}

describe('„Was ist neu“ der Rechner-PWA', () => {
  it('jeder Eintrag hat einen echten Tag, der neueste steht oben, kein Tag doppelt', () => {
    expect(NEUIGKEITEN.length).toBeGreaterThan(0)
    for (const n of NEUIGKEITEN) {
      expect(n.datum).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(echterTag(n.datum), n.datum).toBe(true)
    }
    for (let i = 1; i < NEUIGKEITEN.length; i++) {
      expect(NEUIGKEITEN[i].datum < NEUIGKEITEN[i - 1].datum, NEUIGKEITEN[i].datum).toBe(true)
    }
  })

  it('kurze Sätze für Anwender: ohne Paket-Kennungen, Dateinamen und Code', () => {
    for (const n of NEUIGKEITEN) {
      expect(n.punkte.length, n.datum).toBeGreaterThan(0)
      for (const p of n.punkte) {
        expect(p, p).toBe(p.trim())
        expect(p.length, p).toBeLessThanOrEqual(140)
        expect(p, p).toMatch(/[.!?]$/)
        // K8, B6, F18 … sagen nur dem Plan etwas
        expect(p, p).not.toMatch(/\b[A-Z]{1,2}\d{1,2}\b/)
        expect(p, p).not.toMatch(/`|\.(tsx?|css|md|json)\b/)
      }
    }
  })

  it('merkt nur einen gültigen Tag', () => {
    expect(gesehenCodec.parse('2026-11-27')).toBe('2026-11-27')
    expect(gesehenCodec.parse('27.11.2026')).toBeNull()
    expect(gesehenCodec.parse('')).toBeNull()
    expect(gesehenCodec.parse(gesehenCodec.format('2026-11-01'))).toBe('2026-11-01')
  })

  it('zeigt den Punkt nur bei Neuem seit dem letzten Blick, nie beim ersten Start', () => {
    const liste: Neuigkeit[] = [
      { datum: '2026-12-02', punkte: ['B.'] },
      { datum: '2026-11-27', punkte: ['A.'] }
    ]
    expect(neuesterTag(liste)).toBe('2026-12-02')
    expect(hatNeues('', liste)).toBe(false)
    expect(hatNeues('2026-11-27', liste)).toBe(true)
    expect(hatNeues('2026-12-02', liste)).toBe(false)
    expect(hatNeues('', [])).toBe(false)
    expect(hatNeues('2026-11-27', [])).toBe(false)
  })

  it('schreibt den Tag deutsch, ohne Zeitzone', () => {
    expect(tagKurz('2026-11-27')).toBe('27.11.2026')
    expect(tagLang('2026-11-27')).toBe('27. November 2026')
    expect(tagLang('2027-03-01')).toBe('1. März 2027')
  })
})
