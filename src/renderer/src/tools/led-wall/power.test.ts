import { describe, expect, it } from 'vitest'
import { computeWall } from './compute'
import { sanitizeLedWallConfig, type LedWallConfig, type PwrChainMeta } from './config'
import { analyzePower, circuitLabel } from './power'

/** Raster mit Ketten aus [Kette, Anzahl Module] in einer Reihe */
const reihe = (...ketten: [number, number][]): number[][] => [
  ketten.flatMap(([k, n]) => Array<number>(n).fill(k))
]
const wand = (
  pwr: number[][],
  pwrMeta: Record<string, PwrChainMeta> = {},
  p: Partial<LedWallConfig> = {}
): LedWallConfig => ({ ...sanitizeLedWallConfig({ moduleKey: '496-2,0', ...p }), pwr, pwrMeta })
const texte = (w: { text: string }[]): string => w.map((x) => x.text).join('\n')

describe('Strom je Kette', () => {
  it('Last bei Maximalleistung, Grenze der Absicherung, Vorschlag der Phasen', () => {
    // 496-2,0: 180 W max – bei 230 V / 16 A trägt ein Kreis 20 Module
    const a = analyzePower(wand(reihe([0, 20], [1, 21], [2, 10])))
    expect(a.maxModules).toBe(20)
    expect(a.chains.map((l) => [l.modules, +l.amps.toFixed(2), l.phase, l.phaseAuto])).toEqual([
      [20, 15.65, 'L1', true],
      [21, 16.43, 'L2', true],
      [10, 7.83, 'L3', true]
    ])
    expect(a.chains.map((l) => l.over)).toEqual([false, true, false])
    expect(a.warnings.filter((w) => w.level === 'danger').map((w) => w.text)).toEqual([
      'P2: 21 Module = 16,4 A – über der Absicherung (16 A). Kette teilen, höchstens 20 Module je Kreis.'
    ])
  })

  it('Netz einstellbar: 120 V / 20 A', () => {
    const c = wand(reihe([0, 10]), {}, { mains: { voltage: 120, breakerA: 20 } })
    const a = analyzePower(c)
    expect(a.maxModules).toBe(13)
    expect(a.chains[0].amps).toBe(15)
    // die Kennzahlen der Wand rechnen mit derselben Spannung
    expect(computeWall({ ...c, widthM: '1', heightM: '0,5' }).ampsMax).toBe(
      ((2 * 180) / 120).toFixed(1)
    )
  })

  it('festgelegte Phasen bleiben, der Rest geht auf die schwächste', () => {
    const a = analyzePower(wand(reihe([0, 10], [1, 10], [2, 10]), { '0': { phase: 'L2' } }))
    expect(a.chains.map((l) => circuitLabel(l))).toEqual(['L2', '(L1)', '(L3)'])
  })

  it('Ketten an einem Kreis zählen zusammen und teilen die Phase', () => {
    const a = analyzePower(
      wand(reihe([0, 10], [1, 10], [2, 10]), {
        '0': { circuit: 'F3' },
        '1': { circuit: ' f3 ' },
        '2': { circuit: 'F4' }
      })
    )
    expect(a.circuits.map((k) => [k.name, k.chains, +k.amps.toFixed(2), k.over])).toEqual([
      ['F3', [0, 1], 15.65, false],
      ['F4', [2], 7.83, false]
    ])
    expect(a.chains.map((l) => circuitLabel(l))).toEqual(['F3 · (L1)', 'f3 · (L1)', 'F4 · (L2)'])
    expect(+a.phases.L1.toFixed(2)).toBe(15.65)
  })

  it('Kreis über der Absicherung – gemeldet am Kreis, nicht je Kette', () => {
    const a = analyzePower(
      wand(reihe([0, 12], [1, 12]), { '0': { circuit: 'F3' }, '1': { circuit: 'F3' } })
    )
    expect(texte(a.warnings)).toContain('Kreis F3 (P1 + P2): 18,8 A – über der Absicherung (16 A).')
    expect(texte(a.warnings)).not.toContain('P1:')
  })

  it('ein Kreis auf zwei Phasen wird gemeldet', () => {
    const a = analyzePower(
      wand(reihe([0, 5], [1, 5]), {
        '0': { circuit: 'F3', phase: 'L1' },
        '1': { circuit: 'F3', phase: 'L2' }
      })
    )
    expect(texte(a.warnings)).toContain('Kreis F3: Ketten auf L1 und L2')
  })

  it('Schieflage nur, wenn es merklich besser ginge', () => {
    const alleL1 = { '0': { phase: 'L1' }, '1': { phase: 'L1' }, '2': { phase: 'L1' } } as const
    const schief = analyzePower(wand(reihe([0, 10], [1, 10], [2, 10]), alleL1))
    expect(texte(schief.warnings)).toContain('Phasen ungleich belastet: L1 23,5 A · L2 0,0 A')
    // zwei gleiche Ketten: L3 bleibt zwangsläufig leer – kein Hinweis
    const zwei = analyzePower(wand(reihe([0, 10], [1, 10])))
    expect(texte(zwei.warnings)).not.toContain('ungleich')
  })

  it('Einschaltstrom als Hinweis bei vollen Kreisen, nicht neben einer Überlast', () => {
    expect(analyzePower(wand(reihe([0, 18]))).warnings.map((w) => w.level)).toEqual(['info'])
    expect(analyzePower(wand(reihe([0, 5]))).warnings).toEqual([])
    expect(analyzePower(wand(reihe([0, 25]))).warnings.map((w) => w.level)).toEqual(['danger'])
  })

  it('fremde Schlüssel und unbekanntes Modul', () => {
    const meta = JSON.parse('{"constructor": {"circuit": "X"}}') as Record<string, PwrChainMeta>
    const a = analyzePower({ ...wand(reihe([0, 2]), meta), moduleKey: 'gibt-es-nicht' })
    expect([a.maxModules, a.chains[0].amps, a.chains[0].circuit]).toEqual([0, 0, ''])
  })
})
