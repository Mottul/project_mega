import { describe, expect, it } from 'vitest'
import { digest } from '@shared/projectFile'
import { computeWall } from './compute'
import {
  DEFAULT_LED_WALL_CONFIG,
  describePlanning,
  isDefaultPlanning,
  ledWallSection,
  pickConfig,
  sanitizeLedWallConfig,
  type LedWallConfig
} from './config'

const v1 = {
  // Stand vor Version 2: ohne Kabelverlauf-Felder
  moduleKey: 'uS2+',
  widthM: '6',
  heightM: '3',
  projectName: 'Messe',
  customerName: 'Beispiel GmbH',
  buildMode: 'flying',
  sig: [
    [0, 0, 1],
    [0, -1, 1]
  ],
  pwr: [],
  sigChain: 1,
  pwrChain: 0,
  curveMode: 'segment',
  segSag: '0,4',
  builderSegs: [{ type: 'straight', count: 2 }],
  sqD: '2',
  sqCorner: 4,
  selectedCircle: 2,
  pdfLandscape: false
}

describe('LED-Wall-Planung prüfen', () => {
  it('Version 1 bleibt erhalten und bekommt die neuen Felder mit Vorgaben', () => {
    const c = sanitizeLedWallConfig(v1)
    expect(c).toMatchObject(v1)
    expect(c.sigMeta).toEqual({})
    expect(c.pwrMeta).toEqual({})
    expect(c.feed).toBe('bottom')
    expect(c.redundancy).toBe(false)
    expect(c.mains).toEqual({ voltage: 230, breakerA: 16 })
    expect(c.processor).toEqual({ model: null, bitDepth: 8, hz: 60 })
  })

  it('vollständige Planung übersteht den runden Weg unverändert', () => {
    const full: LedWallConfig = {
      ...sanitizeLedWallConfig(v1),
      sigMeta: {
        '0': { start: 'bl', axis: 'col', port: 'Port 1', backup: { port: 'Port 5' } },
        '1': {
          order: [
            [0, 2],
            [1, 2]
          ],
          backup: null
        }
      },
      pwrMeta: { '0': { circuit: 'F3', phase: 'L2' } },
      feed: 'center',
      redundancy: true,
      mains: { voltage: 230, breakerA: 32 },
      processor: { model: 'frei', bitDepth: 10, hz: 50, ports: 4, portPx: 500000 }
    }
    expect(sanitizeLedWallConfig(JSON.parse(JSON.stringify(full)))).toEqual(full)
  })

  it('Ungültiges wird feldweise zur Vorgabe', () => {
    const c = sanitizeLedWallConfig({
      moduleKey: 'gibt-es-nicht',
      widthM: 7,
      buildMode: 'gestapelt',
      sig: [[0, 'x']],
      sqCorner: 99,
      selectedCircle: -1,
      builderSegs: [{ type: 'curved', count: 2, angle: 30, dir: 'schief' }],
      feed: 'bottom-center', // Wert aus einem frühen Entwurf
      mains: { voltage: 'viel', breakerA: 16 },
      processor: { model: 'gibts-nicht', bitDepth: 9, hz: 50 }
    })
    const d = DEFAULT_LED_WALL_CONFIG
    expect(c.moduleKey).toBe(d.moduleKey)
    expect(c.widthM).toBe(d.widthM)
    expect(c.buildMode).toBe(d.buildMode)
    expect(c.sig).toEqual([])
    expect(c.sqCorner).toBe(d.sqCorner)
    expect(c.selectedCircle).toBe(d.selectedCircle)
    expect(c.builderSegs).toEqual(d.builderSegs)
    expect(c.feed).toBe(d.feed)
    expect(c.mains).toEqual({ voltage: 230, breakerA: 16 })
    expect(c.processor).toEqual({ model: null, bitDepth: 8, hz: 50 })
  })

  it('Ketten-Metadaten: nur Zahlen-Schlüssel und gültige Werte', () => {
    const c = sanitizeLedWallConfig({
      sigMeta: {
        '0': {
          start: 'mitte',
          port: 'x'.repeat(100),
          order: [
            [0, 1],
            [2, 'x']
          ]
        },
        abc: { port: 'P1' }
      }
    })
    expect(c.sigMeta).toEqual({ '0': {} })
  })

  it('Bogen mit Winkel über Anzahl × 45° wird gekappt, die Liste bleibt', () => {
    // entsteht in der Oberfläche: Bogen mit 200°, danach weniger Module
    const segs = [
      { type: 'straight', count: 10 },
      { type: 'curved', count: 2, angle: 200, dir: 'convex' },
      { type: 'straight', count: 4 }
    ]
    expect(sanitizeLedWallConfig({ builderSegs: segs }).builderSegs).toEqual([
      { type: 'straight', count: 10 },
      { type: 'curved', count: 2, angle: 90, dir: 'convex' },
      { type: 'straight', count: 4 }
    ])
  })

  it('große Wände, wie die App sie selbst erzeugt, überstehen die Prüfung', () => {
    // „Im Builder weiterbearbeiten“ aus einem 26-m-Kreissegment: 52 Module in einem Bogen
    const arc = [{ type: 'curved', count: 52, angle: 17.5, dir: 'convex' }]
    expect(sanitizeLedWallConfig({ builderSegs: arc }).builderSegs).toEqual(arc)
    // 100 m breite Wand aus 496-2,0: 202 Spalten, verkabelt
    const cols = computeWall({ ...DEFAULT_LED_WALL_CONFIG, widthM: '100' }).cols
    expect(cols).toBeGreaterThan(200)
    const sig = Array.from({ length: 6 }, (_, r) =>
      Array.from({ length: cols }, (_, c) => (r + c) % 3)
    )
    const c = sanitizeLedWallConfig(JSON.parse(JSON.stringify({ widthM: '100', sig, pwr: sig })))
    expect(c.sig).toEqual(sig)
    expect(c.pwr).toEqual(sig)
  })

  it('Builder: mehr Module als die Rastergrenze zusammen -> Vorgabe', () => {
    const many = Array.from({ length: 1000 }, () => ({ type: 'straight', count: 1000 }))
    expect(sanitizeLedWallConfig({ builderSegs: many }).builderSegs).toEqual(
      DEFAULT_LED_WALL_CONFIG.builderSegs
    )
  })

  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])(
    'Prototyp-Schlüssel „%s“ als Modul wird zur Vorgabe',
    (key) => {
      // JSON.parse: „__proto__“ kommt wie aus einer Datei als eigener Schlüssel an
      const c = sanitizeLedWallConfig(JSON.parse(JSON.stringify({ moduleKey: key })))
      expect(c.moduleKey).toBe(DEFAULT_LED_WALL_CONFIG.moduleKey)
    }
  )

  it('nichts Brauchbares -> Vorgabe', () => {
    expect(sanitizeLedWallConfig(null)).toEqual(DEFAULT_LED_WALL_CONFIG)
    expect(sanitizeLedWallConfig('Wand')).toEqual(DEFAULT_LED_WALL_CONFIG)
  })
})

describe('LED-Wall-Abschnitt der Projektdatei', () => {
  it('ohne Bedienzustand: aktive Kette und PDF-Format ändern die Datei nicht', () => {
    const a = sanitizeLedWallConfig(v1)
    const b = { ...a, sigChain: 3, pwrChain: 2, pdfLandscape: !a.pdfLandscape }
    expect(digest(ledWallSection(a))).toBe(digest(ledWallSection(b)))
    expect(ledWallSection(a)).not.toHaveProperty('sigChain')
    expect(ledWallSection(a)).not.toHaveProperty('pdfLandscape')
    expect(digest(ledWallSection({ ...a, widthM: '7' }))).not.toBe(digest(ledWallSection(a)))
  })

  it('pickConfig nimmt nur Konfiguration und kopiert tief', () => {
    const state = { ...sanitizeLedWallConfig(v1), presets: [1], file: { path: 'x' } }
    const c = pickConfig(state)
    expect(c).not.toHaveProperty('presets')
    expect(c).not.toHaveProperty('file')
    c.sig[0][0] = 9
    expect(state.sig[0][0]).toBe(0)
  })

  it('Vorgabe-Planung gilt als leer – auch mit Rastern ohne Ketten', () => {
    expect(isDefaultPlanning(DEFAULT_LED_WALL_CONFIG)).toBe(true)
    const grids = { ...DEFAULT_LED_WALL_CONFIG, sig: [[-1, -1]], pwr: [[-1]] }
    expect(isDefaultPlanning(grids)).toBe(true)
    expect(isDefaultPlanning({ ...DEFAULT_LED_WALL_CONFIG, projectName: 'Messe' })).toBe(false)
    expect(isDefaultPlanning({ ...DEFAULT_LED_WALL_CONFIG, sig: [[0]] })).toBe(false)
  })

  it('Beschreibung für Rückfragen', () => {
    expect(describePlanning(v1)).toBe('Messe · Beispiel GmbH, 6 × 3 m, uS2+')
    expect(describePlanning({})).toBe('ohne Projektnamen, 4 × 2,5 m, 496-2,0')
  })
})
