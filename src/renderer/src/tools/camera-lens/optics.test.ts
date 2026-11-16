import { describe, expect, it } from 'vitest'
import {
  FULL_FRAME_DIAG,
  angleOfView,
  diag,
  equiv35,
  fovAtDistance,
  framingLabel,
  lensView,
  type LensInput
} from './optics'

describe('diag', () => {
  it('3-4-5-Dreieck', () => {
    expect(diag(3, 4)).toBe(5)
  })
  it('Vollformat-Diagonale ≈ 43,27 mm', () => {
    expect(diag(36, 24)).toBeCloseTo(FULL_FRAME_DIAG, 10)
    expect(FULL_FRAME_DIAG).toBeCloseTo(43.2666, 3)
  })
})

describe('fovAtDistance (Sichtfeld = Entfernung × Sensormaß ÷ Brennweite)', () => {
  it('200 mm auf Vollformat-Höhe in 25 m → 3,0 m', () => {
    expect(fovAtDistance(25, 24, 200)).toBeCloseTo(3.0, 10)
  })
  it('2×-Telekonverter (400 mm) halbiert das Sichtfeld → 1,5 m', () => {
    expect(fovAtDistance(25, 24, 400)).toBeCloseTo(1.5, 10)
  })
  it('linear in der Entfernung: doppelte Distanz → doppeltes Sichtfeld', () => {
    expect(fovAtDistance(50, 24, 200)).toBeCloseTo(2 * fovAtDistance(25, 24, 200), 10)
  })
})

describe('angleOfView', () => {
  it('36 mm Maß bei 36 mm Brennweite → 53,13°', () => {
    expect(angleOfView(36, 36)).toBeCloseTo(53.1301, 3)
  })
  it('Vollformat-Breite bei 50 mm → ~39,6°', () => {
    expect(angleOfView(36, 50)).toBeCloseTo(39.5978, 3)
  })
  it('längere Brennweite → engerer Bildwinkel', () => {
    expect(angleOfView(36, 100)).toBeLessThan(angleOfView(36, 50))
  })
})

describe('equiv35 (Kleinbild-Äquivalent)', () => {
  it('Vollformat ist sein eigenes Äquivalent', () => {
    expect(equiv35(50, FULL_FRAME_DIAG)).toBeCloseTo(50, 10)
  })
  it('APS-C (Crop ~1,53) → 50 mm wirken wie ~76,7 mm', () => {
    expect(equiv35(50, diag(23.5, 15.6))).toBeCloseTo(76.7, 1)
  })
})

describe('framingLabel (Rahmenhöhe in Personenhöhen)', () => {
  it.each([
    [1.5, 'Totale (ganze Person + Luft)'],
    [1.25, 'Totale (ganze Person + Luft)'], // Grenze inklusive
    [1.0, 'Ganzkörper'],
    [0.9, 'Amerikanisch (ab Knie)'],
    [0.6, 'Halbnah (ab Hüfte)'],
    [0.4, 'Halbnah/Nah (ab Brust)'],
    [0.18, 'Großaufnahme (Kopf & Schultern)'], // Grenze inklusive
    [0.1, 'Detail (Gesicht)']
  ])('r=%s → %s', (r, label) => {
    expect(framingLabel(r as number)).toBe(label)
  })
})

// Vorgabe des Rechners: Vollformat, 200 mm, kein Telekonverter, Person (1,75 m) in 25 m
const VORGABE: LensInput = {
  sensorW: 36,
  sensorH: 24,
  focal: 200,
  teleconverter: 1,
  dist: 25,
  person: 1.75
}

describe('lensView – Vorgabe des Rechners', () => {
  it('KB-Äquivalent 200 mm · Bildwinkel 10,3° × 6,9° · Sichtfeld 4,5 × 3 m · ganze Person im Bild', () => {
    const v = lensView(VORGABE)
    expect(v.focalEff).toBe(200)
    expect(v.equiv).toBeCloseTo(200, 10)
    expect(v.aovH).toBeCloseTo(10.29, 2)
    expect(v.aovV).toBeCloseTo(6.87, 2)
    expect(v.fovW).toBeCloseTo(4.5, 10)
    expect(v.fovH).toBeCloseTo(3, 10)
    expect(v.ratio).toBeCloseTo(3 / 1.75, 10)
    expect(v.visiblePct).toBe(100)
    expect(v.aspect).toBe(1.5)
    expect(v.invalid).toEqual([])
  })

  it('2×-Telekonverter: 400 mm, nur noch 1,5 m Sichtfeld – 86 % der Person', () => {
    const v = lensView({ ...VORGABE, teleconverter: 2 })
    expect(v.focalEff).toBe(400)
    expect(v.fovH).toBeCloseTo(1.5, 10)
    expect(v.visiblePct).toBeCloseTo(85.71, 2)
    expect(framingLabel(v.ratio!)).toBe('Amerikanisch (ab Knie)')
  })

  it('APS-C: kleinerer Sensor, längeres Äquivalent', () => {
    expect(lensView({ ...VORGABE, sensorW: 23.5, sensorH: 15.6 }).equiv).toBeCloseTo(306.8, 1)
  })
})

describe('lensView – Ränder', () => {
  it('leere Felder: kein Ergebnis, das davon abhängt – aber nichts rot', () => {
    const v = lensView({ ...VORGABE, focal: null, person: null })
    expect(v.focalEff).toBeNull()
    expect(v.equiv).toBeNull()
    expect(v.fovH).toBeNull()
    expect(v.visiblePct).toBeNull()
    expect(v.invalid).toEqual([])
  })

  it('Brennweite 0: nichts rechenbar, das Feld ist rot', () => {
    const v = lensView({ ...VORGABE, focal: 0 })
    expect(v).toEqual({
      focalEff: null,
      equiv: null,
      aovH: null,
      aovV: null,
      fovW: null,
      fovH: null,
      ratio: null,
      visiblePct: null,
      aspect: 1.5,
      invalid: ['focal']
    })
  })

  it('Sensorbreite 0: Äquivalent, Bildwinkel und Sichtfeld der Breite fehlen; die Höhe rechnet weiter', () => {
    const v = lensView({ ...VORGABE, sensorW: 0 })
    expect(v.equiv).toBeNull()
    expect(v.aovH).toBeNull()
    expect(v.fovW).toBeNull()
    expect(v.aspect).toBeNull()
    expect(v.aovV).toBeCloseTo(6.87, 2)
    expect(v.fovH).toBeCloseTo(3, 10)
    expect(v.invalid).toEqual(['sensorW'])
  })

  it('negative Sensorhöhe ergibt kein negatives Sichtfeld mehr, sondern nichts', () => {
    const v = lensView({ ...VORGABE, sensorH: -24 })
    expect(v.fovH).toBeNull()
    expect(v.ratio).toBeNull()
    expect(v.visiblePct).toBeNull()
    expect(v.invalid).toEqual(['sensorH'])
  })

  it.each<[keyof LensInput, string[]]>([
    ['dist', ['dist']],
    ['person', ['person']]
  ])('%s 0: kein Bildausschnitt, das Feld ist rot', (field, invalid) => {
    const v = lensView({ ...VORGABE, [field]: 0 })
    expect(v.ratio).toBeNull()
    expect(v.visiblePct).toBeNull()
    expect(v.equiv).toBeCloseTo(200, 10)
    expect(v.invalid).toEqual(invalid)
  })

  it('alles unbrauchbar: alle Felder rot', () => {
    const v = lensView({
      sensorW: -1,
      sensorH: 0,
      focal: -200,
      teleconverter: 1,
      dist: 0,
      person: -1
    })
    expect(v.invalid).toEqual(['sensorW', 'sensorH', 'focal', 'dist', 'person'])
  })
})
