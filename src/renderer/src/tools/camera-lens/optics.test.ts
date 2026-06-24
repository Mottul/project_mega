import { describe, expect, it } from 'vitest'
import { FULL_FRAME_DIAG, angleOfView, diag, equiv35, fovAtDistance, framingLabel } from './optics'

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
