// LED-Wall-Daten fürs Mini-Manual: immer eine Kopie mit Herkunft (Stand und Prüfsumme der Quelle
// in derselben Projektdatei) – eine Kunden-Anleitung ändert sich nie still. Dazu die daraus
// gerechneten Kennzahlen: Ändert sich später der Modulkatalog, fällt der Unterschied auf.

import { computeWall } from '../led-wall/compute'
import { sanitizeLedWallConfig } from '../led-wall/config'
import type { LedWallKopie, WandKennzahlen } from './model'

export function kennzahlenAus(data: unknown): WandKennzahlen {
  const c = sanitizeLedWallConfig(data)
  const d = computeWall(c)
  return {
    projekt: c.projectName.trim(),
    kunde: c.customerName.trim(),
    modulKey: c.moduleKey,
    modul: d.mod.name,
    spalten: d.cols,
    reihen: d.rows,
    module: d.total,
    breiteM: d.actualW,
    hoeheM: d.actualH,
    aufloesungX: d.resX,
    aufloesungY: d.resY,
    gewichtKg: d.weightKg,
    leistungTypW: d.powerTypW,
    leistungMaxW: d.powerMaxW,
    stromMaxA: d.ampsMax
  }
}

export function kopieAus(
  data: unknown,
  quelle: { rev: number; sha256: string } | null,
  jetzt = new Date()
): LedWallKopie {
  return {
    daten: structuredClone(data && typeof data === 'object' ? data : {}),
    kennzahlen: kennzahlenAus(data),
    quelle,
    uebernommen: jetzt.toISOString()
  }
}

const FELDER: { key: keyof WandKennzahlen; label: string; einheit?: string }[] = [
  { key: 'projekt', label: 'Projekt' },
  { key: 'kunde', label: 'Kunde' },
  { key: 'modul', label: 'Modul' },
  { key: 'spalten', label: 'Spalten' },
  { key: 'reihen', label: 'Reihen' },
  { key: 'breiteM', label: 'Breite', einheit: 'm' },
  { key: 'hoeheM', label: 'Höhe', einheit: 'm' },
  { key: 'aufloesungX', label: 'Auflösung (Breite)', einheit: 'px' },
  { key: 'aufloesungY', label: 'Auflösung (Höhe)', einheit: 'px' },
  { key: 'gewichtKg', label: 'Gewicht', einheit: 'kg' },
  { key: 'leistungMaxW', label: 'Leistung max.', einheit: 'W' }
]

/** Was sich zwischen Kopie und Quelle geändert hat (für „Unterschiede ansehen“) */
export function unterschiede(
  alt: WandKennzahlen,
  neu: WandKennzahlen
): { feld: string; alt: string; neu: string }[] {
  const f = (v: string | number, e?: string): string =>
    `${String(v).replace('.', ',')}${e && v !== '' ? ` ${e}` : ''}`
  return FELDER.filter((x) => String(alt[x.key]) !== String(neu[x.key])).map((x) => ({
    feld: x.label,
    alt: f(alt[x.key], x.einheit),
    neu: f(neu[x.key], x.einheit)
  }))
}
