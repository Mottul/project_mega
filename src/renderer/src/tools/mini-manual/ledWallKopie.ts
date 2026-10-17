// LED-Wall-Daten fürs Mini-Manual: immer eine Kopie mit Herkunft (Stand und Prüfsumme der Quelle
// in derselben Projektdatei) – eine Kunden-Anleitung ändert sich nie still. Dazu die daraus
// gerechneten Kennzahlen: Ändert sich später der Modulkatalog, fällt der Unterschied auf.
// Mehrere Wände (Abschnitt ab Version 3): je Wand eine Kopie mit Kennung und Namen.

import { computeWall } from '../led-wall/compute'
import { wallSection, wallsOf, type LedWallConfig } from '../led-wall/config'
import type { LedWallKopie, WandKennzahlen, WandKopie } from './model'

export function kennzahlenAus(c: LedWallConfig): WandKennzahlen {
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

/** Wände eines Abschnitts (jede Version) als Kopien; null = Abschnitt unbrauchbar */
export function waendeAus(data: unknown): WandKopie[] | null {
  const p = wallsOf(data)
  return p
    ? p.walls.map((w) => ({
        id: w.id,
        name: w.name,
        daten: structuredClone(wallSection(w.config)),
        kennzahlen: kennzahlenAus(w.config)
      }))
    : null
}

export function kopieAus(
  data: unknown,
  quelle: { rev: number; sha256: string } | null,
  jetzt = new Date()
): LedWallKopie | null {
  const waende = waendeAus(data)
  return waende ? { waende, quelle, uebernommen: jetzt.toISOString() } : null
}

/** Alle Modul-Kennungen der Kopie (für Fehlerfälle, die vom Modul abhängen) */
export function modulKeys(k: LedWallKopie | null): string[] {
  return [...new Set((k?.waende ?? []).map((w) => w.kennzahlen.modulKey))]
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

export interface Unterschied {
  feld: string
  alt: string
  neu: string
}

/** Was sich an den Kennzahlen einer Wand geändert hat */
export function unterschiede(alt: WandKennzahlen, neu: WandKennzahlen): Unterschied[] {
  const f = (v: string | number, e?: string): string =>
    `${String(v).replace('.', ',')}${e && v !== '' ? ` ${e}` : ''}`
  return FELDER.filter((x) => String(alt[x.key]) !== String(neu[x.key])).map((x) => ({
    feld: x.label,
    alt: f(alt[x.key], x.einheit),
    neu: f(neu[x.key], x.einheit)
  }))
}

/**
 * Unterschiede zwischen Kopie und Quelle über alle Wände (für „Unterschiede ansehen“): Wände
 * werden über ihre Kennung zugeordnet; bei mehreren steht der Name der Wand vor dem Feld.
 */
export function wandUnterschiede(alt: WandKopie[], neu: WandKopie[]): Unterschied[] {
  const mehrere = alt.length > 1 || neu.length > 1
  const out: Unterschied[] = []
  for (const n of neu) {
    const a = alt.find((x) => x.id === n.id)
    if (!a) {
      out.push({ feld: 'Wand', alt: '', neu: `${n.name} (neu)` })
      continue
    }
    if (a.name !== n.name) out.push({ feld: 'Name der Wand', alt: a.name, neu: n.name })
    for (const u of unterschiede(a.kennzahlen, n.kennzahlen))
      out.push(mehrere ? { ...u, feld: `${n.name}: ${u.feld}` } : u)
  }
  for (const a of alt)
    if (!neu.some((x) => x.id === a.id)) out.push({ feld: 'Wand', alt: a.name, neu: 'entfernt' })
  return out
}
