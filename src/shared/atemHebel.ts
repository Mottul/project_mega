// Der Hebel: Am Gerät läuft der Wert jedes Übergangs von 0 bis 10000, gleich in welche Richtung der
// Griff geschoben wird. Ein echter Griff bleibt am Ende aber oben stehen und kommt beim nächsten
// Übergang von dort zurück. Das bildet der Bildschirm nach, sonst spränge er nach jedem Übergang
// ans andere Ende. Die Ruhelage kennt der Mischer nicht, der Dienst führt sie je M/E mit.
//
// `griff` ist die Lage auf dem Bildschirm: 0 unten, 1 oben. Rein -> testbar.

import { ATEM_HEBEL_MAX } from './atem'

export interface HebelSpur {
  /** Ruhelage oben? Dann läuft der nächste Übergang nach unten */
  oben: boolean
  /** Lief zuletzt ein Übergang? */
  lief: boolean
  /** Letzter gemeldeter Wert des Übergangs */
  zuletzt: number
}

export const HEBEL_START: HebelSpur = { oben: false, lief: false, zuletzt: 0 }

/**
 * Meldung des Mischers verfolgen. Ein zu Ende gelaufener Übergang (Hebel, Auto, Hardware-Panel)
 * dreht die Ruhelage; wer den Griff zurückgezogen hat, landet am selben Ende. Beides meldet der
 * Mischer gleich (Wert 0, kein Übergang), deshalb entscheidet der letzte Wert davor. Ein Cut läuft
 * nicht über den Hebel und dreht nichts.
 */
export function hebelFolgen(s: HebelSpur, uebergang: boolean, wert: number): HebelSpur {
  if (uebergang) return { oben: s.oben, lief: true, zuletzt: wert }
  if (!s.lief) return s
  return { oben: s.zuletzt >= ATEM_HEBEL_MAX / 2 ? !s.oben : s.oben, lief: false, zuletzt: 0 }
}

/** Griff-Lage (0…1) aus Wert und Ruhelage */
export function griffAusWert(wert: number, oben: boolean): number {
  const anteil = wert / ATEM_HEBEL_MAX
  return oben ? 1 - anteil : anteil
}

/**
 * Wert aus der Griff-Lage. Knapp vor dem Ende zählt als Ende: Der Griff trifft mit der Maus sonst
 * die letzten Pixel nicht, und der Übergang bliebe kurz vor Schluss hängen.
 */
export function wertAusGriff(griff: number, oben: boolean): number {
  const g = Math.min(1, Math.max(0, griff))
  const wert = Math.round((oben ? 1 - g : g) * ATEM_HEBEL_MAX)
  return wert >= ATEM_HEBEL_MAX * 0.995 ? ATEM_HEBEL_MAX : wert
}
