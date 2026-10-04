// Reine Entscheidungen des Player-Imports (ohne Datenbank/Electron -> testbar): welche
// Optionen der gemeinsame Konvertierungs-Plan bekommt und welcher Namens-Zusatz ins
// Bibliotheks-Medium wandert.

import type { ConvertOptions, MediaKind, PlayerImportRequest } from '@shared/types'

// Dieselbe Quelle kann mit unterschiedlicher Aufbereitung mehrfach in der
// Bibliothek liegen (eigene conv_key je Fit-Modus). Damit die Einträge nicht
// gleich aussehen, wandert der Fit in den Titel (das Thumbnail wird ohnehin aus
// dem aufbereiteten Ergebnis erzeugt, zeigt also Blur/Balken/Streckung direkt).
type Fit = PlayerImportRequest['fitMode']
const FIT_TITLE: Record<Fit, string> = {
  blur: 'Blur',
  bars: 'Letterbox',
  stretch: 'Stretch'
}

// Namens-Zusatz aus der Quell-Auflösung – nicht aus dem gewählten Fit-Modus allein:
//  - gleiche Auflösung  -> Bild unverändert        -> „Original"
//  - gleiches Seitenverh.-> reine Skalierung        -> „Scale"
//  - anderes Seitenverh. -> Fit greift sichtbar     -> Blur/Letterbox/Stretch
// srcW/srcH sind Anzeige-Maße in quadratischen Pixeln. Anamorphe Quellen sind auch bei
// passenden Anzeige-Maßen nie „Original": sie werden auf quadratische Pixel umgerechnet.
// (Den billigen Weg – Skalieren statt Blur-Graph bei gleichem Seitenverhältnis – wählt
// der Konvertierungs-Plan selbst.)
export function analyzeFit(
  fit: Fit,
  srcW: number | null,
  srcH: number | null,
  tgtW: number,
  tgtH: number,
  anamorphic = false
): { suffix: string; effectiveFit: Fit } {
  const known = !!srcW && !!srcH
  const exact = known && srcW === tgtW && srcH === tgtH
  const sameAspect = known && Math.abs(srcW! / srcH! - tgtW / tgtH) < 0.01
  if (exact && !anamorphic) return { suffix: 'Original', effectiveFit: 'stretch' }
  if (sameAspect) return { suffix: 'Scale', effectiveFit: 'stretch' }
  return { suffix: FIT_TITLE[fit], effectiveFit: fit }
}

export interface PlayerSpec {
  fit: Fit
  width: number
  height: number
  blurStrength: number
  blurDarken: number
}

/**
 * Optionen für den gemeinsamen Plan: H.264 in Wandgröße (bzw. JPG für Standbilder),
 * alle Korrekturen an, unverändertes H.264 nur umverpacken.
 */
export function playerOptions(
  kind: MediaKind,
  spec: PlayerSpec,
  loudnorm: ConvertOptions['loudnorm']
): ConvertOptions {
  return {
    format: kind === 'image' ? 'jpg' : 'h264',
    quality: 'standard',
    compat: false,
    keepAlpha: false,
    size: { mode: 'exact', width: spec.width, height: spec.height, fit: spec.fit },
    fps: { mode: 'original' },
    deinterlace: true,
    toSdr: true,
    audio: 'auto',
    hapCompressor: 'snappy',
    hapChunks: { kind: 'auto' },
    loudnorm: kind === 'image' ? null : (loudnorm ?? null),
    blur: { strength: spec.blurStrength, darken: spec.blurDarken },
    allowCopy: true
  }
}
