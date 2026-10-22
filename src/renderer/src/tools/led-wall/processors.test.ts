import { describe, expect, it } from 'vitest'
import { sanitizeLedWallConfig, type LedWallConfig, type PlannedWall } from './config'
import { analyzeProcessors, faserAusLager, processorGroups, resolveProcessor } from './processors'

const cfg = (p: Partial<LedWallConfig> | Record<string, unknown> = {}): LedWallConfig =>
  sanitizeLedWallConfig(p)
const wall = (id: string, c: LedWallConfig, name = id): PlannedWall => ({ id, name, config: c })
/** Raster mit Ketten aus [Kette, Anzahl Module] in einer Reihe */
const reihe = (...ketten: [number, number][]): number[][] => [
  ketten.flatMap(([k, n]) => Array<number>(n).fill(k))
]

describe('Prozessor und Grenze je Port', () => {
  it('Vorbelegung je Modul; Grenze = kleinerer Wert aus Prozessor und Empfangskarte', () => {
    const p = resolveProcessor(cfg({ moduleKey: '496-2,0' }))
    expect([p.model, p.ports, p.portPx, p.limitBy]).toEqual([
      'novapro-uhd-jr',
      16,
      650_000,
      'prozessor'
    ])
    // 120 Hz: die Karte A10s Pro begrenzt (329.861 px)
    const fast = resolveProcessor(
      cfg({ moduleKey: '496-2,0', processor: { model: null, bitDepth: 8, hz: 120 } })
    )
    expect([fast.portPx, fast.limitBy, fast.card]).toEqual([329_861, 'karte', 'NovaStar A10s Pro'])
    // 10 bit: UHD Jr 320.000 (Karte 494.792)
    expect(resolveProcessor(cfg({ processor: { model: null, bitDepth: 10, hz: 60 } })).portPx).toBe(
      320_000
    )
    expect(resolveProcessor(cfg({ moduleKey: 'uS2+' })).model).toBe('tessera-s8')
  })

  it('Tessera: Grenze skaliert mit der Bildrate (Handbuch-Tabelle)', () => {
    const t = (bitDepth: 8 | 10 | 12, hz: number) =>
      resolveProcessor(cfg({ moduleKey: 'uS2+', processor: { model: null, bitDepth, hz } })).portPx
    expect([t(8, 60), t(10, 60), t(12, 60), t(8, 50), t(8, 120)]).toEqual([
      525_000, 420_000, 350_000, 630_000, 262_500
    ])
  })

  it('VX4S kennt nur 8 bit; eigener Prozessor mit eigenen Werten', () => {
    expect(
      resolveProcessor(cfg({ processor: { model: 'vx4s', bitDepth: 10, hz: 60 } })).bitDepth
    ).toBe(8)
    const frei = resolveProcessor(
      cfg({
        processor: { model: 'frei', bitDepth: 8, hz: 60, ports: 2, portPx: 100, totalPx: 200 }
      })
    )
    expect([frei.ports, frei.portPx, frei.totalPx, frei.limitBy]).toEqual([2, 100, 200, 'eigene'])
  })
})

describe('Ports, Backup und Warnungen', () => {
  it('Ports fortlaufend; feste Ports zuerst; Backup auf dem nächsten freien Port (NovaStar)', () => {
    const c = cfg({
      sig: reihe([0, 4], [1, 4], [2, 4]),
      sigMeta: { '1': { port: '1' }, '2': { backup: {} } }
    })
    const [g] = analyzeProcessors([wall('a', c)])
    expect(g.walls[0].chains.map((x) => [x.port, x.backupPort])).toEqual([
      [2, null],
      [1, null],
      [3, 4]
    ])
    expect(g.portsUsed).toBe(4)
    expect(g.warnings).toEqual([])
  })

  it('zu viele Module je Port, zu viele Ports, doppelter Port', () => {
    // 12 × 496 = 691.200 px > 650.000; VX4S hat 4 Ports, belegt 6: S1 2+3, S2 1+4, S3 1 (doppelt), S4 5+6
    const c = cfg({
      processor: { model: 'vx4s', bitDepth: 8, hz: 60 },
      sig: reihe([0, 12], [1, 1], [2, 1], [3, 1]),
      redundancy: true,
      sigMeta: { '1': { port: '1' }, '2': { port: '1', backup: null } }
    })
    const [g] = analyzeProcessors([wall('a', c)])
    const t = g.warnings.map((w) => w.text)
    expect(t).toEqual(
      expect.arrayContaining([
        'Port 1 doppelt belegt (S2 und S3).',
        'S1: 12 Module = 691.200 px – über der Grenze je Port (650.000 px).',
        '6 Ports belegt (Haupt- und Backup-Leitungen), VX4S hat 4.'
      ])
    )
    expect(g.walls[0].chains[0].over).toBe(true)
  })

  it('Tessera: Backup über Portpaare, Last zählt doppelt, höchstens 50 Module mit Redundanz', () => {
    const c = cfg({
      moduleKey: 'uS2+',
      sig: reihe([0, 3], [1, 2], [2, 51]),
      sigMeta: { '0': { backup: {} }, '2': { backup: {} } }
    })
    const [g] = analyzeProcessors([wall('a', c)])
    expect(g.walls[0].chains.map((x) => [x.port, x.backupPort])).toEqual([
      [1, 2],
      [3, null],
      [5, 6]
    ])
    // 36.864 px je Modul: (3 + 51) × 2 + 2 Module
    expect(g.totalPx).toBe(((3 + 51) * 2 + 2) * 36_864)
    expect(g.warnings.map((w) => w.text)).toEqual(
      expect.arrayContaining([
        'S3: Paar 5 → 6 – das Handbuch nennt nur 1 → 2 und 3 → 4; am Gerät prüfen.',
        'S3: 51 Module – mit Redundanz höchstens 50 je Kette.',
        'S3: 51 Module = 1.880.064 px – über der Grenze je Port (525.000 px).'
      ])
    )
    // Backup fest auf einem falschen Port
    const falsch = cfg({
      moduleKey: 'uS2+',
      sig: reihe([0, 2]),
      sigMeta: { '0': { port: '1', backup: { port: '3' } } }
    })
    expect(analyzeProcessors([wall('a', falsch)])[0].warnings[0].text).toBe(
      'S1: Die Backup-Leitung muss am Partner-Port liegen (Paar 1 → 2).'
    )
  })
})

describe('Geteilter Prozessor', () => {
  it('Wand B nutzt den Prozessor von A mit: Ports fortlaufend, Last gemeinsam', () => {
    const a = wall('a', cfg({ sig: reihe([0, 4], [1, 4]) }), 'Bühne')
    const b = wall(
      'b',
      cfg({
        sig: reihe([0, 4]),
        processor: { model: 'vx4s', bitDepth: 8, hz: 60, shareWith: 'a' }
      }),
      'Bar'
    )
    const c = wall('c', cfg({ sig: reihe([0, 2]) }), 'Foyer')
    expect(processorGroups([b, a, c]).map((g) => g.map((w) => w.id))).toEqual([['a', 'b'], ['c']])
    const [g, h] = analyzeProcessors([a, b, c])
    // der Prozessor kommt von A (UHD Jr), nicht aus Bs eigener Einstellung
    expect(g.processor.model).toBe('novapro-uhd-jr')
    expect(g.walls.map((w) => w.chains.map((x) => x.port))).toEqual([[1, 2], [3]])
    expect(g.portsUsed).toBe(3)
    expect(g.totalPx).toBe(12 * 57_600)
    expect(h.walls[0].chains[0].port).toBe(1)
  })

  it('Kreise und fehlende Wände: eigener Prozessor; verschiedene Module warnen', () => {
    const a = wall('a', cfg({ processor: { model: null, bitDepth: 8, hz: 60, shareWith: 'b' } }))
    const b = wall('b', cfg({ processor: { model: null, bitDepth: 8, hz: 60, shareWith: 'a' } }))
    expect(processorGroups([a, b]).flat()).toHaveLength(2)
    const x = wall('x', cfg({ processor: { model: null, bitDepth: 8, hz: 60, shareWith: 'weg' } }))
    expect(processorGroups([x])).toHaveLength(1)
    const d = wall(
      'd',
      cfg({ moduleKey: 'uS2+', processor: { model: null, bitDepth: 8, hz: 60, shareWith: 'e' } })
    )
    const e = wall('e', cfg())
    expect(analyzeProcessors([d, e])[0].warnings.map((w) => w.text)).toContain(
      'Wände mit verschiedenen Modulen teilen sich einen Prozessor – das geht nur bei gleichem Typ.'
    )
  })

  it('Breite und Höhe über dem, was der Prozessor schafft', () => {
    // VX4S höchstens 3840 px breit: 17 Spalten × 240 px = 4080
    const c = cfg({
      processor: { model: 'vx4s', bitDepth: 8, hz: 60 },
      sig: [Array<number>(17).fill(-1)]
    })
    expect(analyzeProcessors([wall('a', c)])[0].warnings.map((w) => w.text)).toEqual([
      '4.080 × 240 px – VX4S schafft höchstens 3.840 × 1.920 px.'
    ])
  })

  it('die Prüfung behält die Kennung des geteilten Prozessors, verwirft Ungültiges', () => {
    expect(
      cfg({ processor: { model: null, bitDepth: 8, hz: 60, shareWith: 'wand-1' } }).processor
        .shareWith
    ).toBe('wand-1')
    expect(
      cfg({ processor: { model: null, bitDepth: 8, hz: 60, shareWith: 'Bühne!' } }).processor
    ).not.toHaveProperty('shareWith')
  })
})

describe('Glasfasern aus dem Lager', () => {
  it('das kürzeste Stück, das reicht; Patchkabel für kurze Wege', () => {
    expect(faserAusLager(1)).toEqual([1])
    expect(faserAusLager(2)).toEqual([3])
    expect(faserAusLager(15)).toEqual([20])
    expect(faserAusLager(50)).toEqual([50])
    expect(faserAusLager(51)).toEqual([100])
  })
  it('über 100 m: so wenige Stücke wie möglich, dabei die kürzeste Summe', () => {
    expect(faserAusLager(120)).toEqual([100, 20])
    expect(faserAusLager(140)).toEqual([100, 50])
    expect(faserAusLager(160)).toEqual([100, 100])
    expect(faserAusLager(230)).toEqual([100, 100, 50])
    expect(faserAusLager(0)).toEqual([])
  })
})

describe('Glasfaser-Strecke (CVT10)', () => {
  const mitFaser = (
    fiber: Record<string, unknown>,
    p: Record<string, unknown> = {}
  ): LedWallConfig => cfg({ ...p, fiber: { box: 'cvt10', ...fiber } })
  const zehn = reihe(...Array.from({ length: 10 }, (_, k) => [k, 5] as [number, number]))

  it('Achtergruppen: Ports 1–8 an OPT1, 9–16 an OPT2 – je Gruppe eine Box und eine Faser', () => {
    const c = mitFaser({ variant: 'S', redundancy: 'none', lengthM: 120 }, { sig: zehn })
    const g = analyzeProcessors([wall('a', c)])[0]
    expect(g.fiber).toEqual({
      variant: 'S',
      redundancy: 'none',
      lengthM: 120,
      groups: [
        { name: 'A', opt: 'OPT1', spare: 'OPT3', ports: [1, 2, 3, 4, 5, 6, 7, 8] },
        { name: 'B', opt: 'OPT2', spare: 'OPT4', ports: [9, 10] }
      ],
      boxes: 2,
      fibers: 2,
      lines: 10
    })
    expect(g.warnings).toEqual([])
  })

  it('Faser redundant: zweite Faser in dieselbe Box', () => {
    const c = mitFaser({ redundancy: 'fiber' }, { sig: reihe([0, 5], [1, 5]) })
    const f = analyzeProcessors([wall('a', c)])[0].fiber!
    expect([f.groups.length, f.boxes, f.fibers, f.lines]).toEqual([1, 1, 2, 2])
  })

  it('Hot-Backup: zweite Box speist die Kettenenden vom selben Port – kein Port am Prozessor', () => {
    const c = mitFaser(
      { redundancy: 'hot-backup' },
      { sig: reihe([0, 5], [1, 5], [2, 5]), sigMeta: { '2': { backup: null } } }
    )
    const g = analyzeProcessors([wall('a', c)])[0]
    expect(g.walls[0].chains.map((l) => [l.port, l.backupPort, l.backupBox ?? false])).toEqual([
      [1, 1, true],
      [2, 2, true],
      [3, null, false]
    ])
    expect(g.portsUsed).toBe(3)
    expect([g.fiber!.boxes, g.fiber!.fibers, g.fiber!.lines]).toEqual([2, 2, 5])
    expect(g.warnings.map((w) => w.text)).toEqual([
      'Hot-Backup: S3 ohne Backup-Leitung – die zweite CVT10 speist nur Ketten mit Backup.'
    ])
  })

  it('nur am UHD Jr; Länge über der Reichweite der Variante', () => {
    const vx = mitFaser({}, { processor: { model: 'vx4s', bitDepth: 8, hz: 60 } })
    const g = analyzeProcessors([wall('a', vx)])[0]
    expect(g.fiber).toBeNull()
    expect(g.warnings.map((w) => w.text)).toEqual([
      'Glasfaser mit CVT10 gibt es nur am NovaPro UHD Jr – beim VX4S bleibt sie unberücksichtigt.'
    ])
    const lang = mitFaser({ variant: 'M', lengthM: 450 }, { sig: reihe([0, 5]) })
    expect(analyzeProcessors([wall('a', lang)])[0].warnings.map((w) => w.text)).toEqual([
      'Glasfaser 450 m – Multimode reicht bis 300 m; dafür die CVT10-S (Singlemode).'
    ])
  })

  it('geteilter Prozessor: es gilt die Strecke der Wand mit dem Prozessor', () => {
    const a = wall('a', mitFaser({ redundancy: 'fiber' }, { sig: reihe([0, 5]) }))
    const b = wall(
      'b',
      cfg({ sig: reihe([0, 5]), processor: { model: null, bitDepth: 8, hz: 60, shareWith: 'a' } })
    )
    const [g] = analyzeProcessors([a, b])
    expect(g.fiber?.redundancy).toBe('fiber')
    expect(g.fiber?.groups[0].ports).toEqual([1, 2])
  })

  it('Prüfung: Unbekanntes wird null, Fehlendes zur Vorgabe', () => {
    expect(cfg({}).fiber).toBeNull()
    expect(cfg({ fiber: { box: 'andere' } }).fiber).toBeNull()
    expect(cfg({ fiber: { box: 'cvt10', variant: 'X', lengthM: -3 } }).fiber).toEqual({
      box: 'cvt10',
      variant: 'S',
      redundancy: 'none'
    })
  })
})
