// Baustein-Vorschläge nach Stichworten (rein, getestet): Was das Projekt über sich sagt – Geräte mit
// Name, Modell und Notiz, die LED-Wand mit Modul und Prozessor – gegen die Stichworte der Bausteine.
// Nur ganze Wörter: „pc“ trifft „Medien-PC“, aber nicht „PCIe-Karte“.

import type { ProcessorModel } from '../led-wall/config'
import { resolveProcessor } from '../led-wall/processors'
import { BAUSTEINE, type Baustein } from './bibliothek'
import { geplanteWaende } from './ledWallKopie'
import type { Anleitung, KapitelEintrag } from './model'

/** Hersteller je Prozessor – Bausteine nennen oft nur ihn */
const HERSTELLER: Record<ProcessorModel, string> = {
  'novapro-uhd-jr': 'NovaStar',
  vx4s: 'NovaStar',
  'tessera-s8': 'Brompton',
  frei: ''
}

/** Alles, was das Projekt über sich sagt – klein geschrieben, ein Eintrag je Zeile */
export function projektText(a: Pick<Anleitung, 'geraete' | 'ledWall'>): string {
  const t: string[] = []
  for (const g of a.geraete) t.push(g.name, g.modell, g.notiz)
  const waende = a.ledWall?.waende ?? []
  if (waende.length) t.push('LED-Wand')
  for (const w of waende) t.push(w.kennzahlen.modulKey, w.kennzahlen.modul)
  for (const w of geplanteWaende(a.ledWall)) {
    const p = resolveProcessor(w.config)
    if (p.model !== 'frei') t.push(p.name, HERSTELLER[p.model])
  }
  return t.join('\n').toLowerCase()
}

const wortZeichen = (c: string | undefined): boolean => !!c && /[\p{L}\p{N}]/u.test(c)

function enthaeltWort(text: string, wort: string): boolean {
  for (let i = text.indexOf(wort); i >= 0; i = text.indexOf(wort, i + 1))
    if (!wortZeichen(text[i - 1]) && !wortZeichen(text[i + wort.length])) return true
  return false
}

/** Stichworte des Bausteins, die im Projekt vorkommen */
export function treffer(b: Baustein, text: string): string[] {
  return b.stichworte.filter((s) => s.trim() && enthaeltWort(text, s.trim().toLowerCase()))
}

export interface Vorschlag {
  baustein: Baustein
  treffer: string[]
}

/** Mitgelieferte Bausteine des Kapitels, die zum Projekt passen und dort noch fehlen */
export function vorschlaege(
  text: string,
  k: KapitelEintrag,
  bausteine: Baustein[] = BAUSTEINE
): Vorschlag[] {
  const drin = new Set(k.bloecke.map((b) => ('herkunft' in b ? b.herkunft?.baustein : undefined)))
  return bausteine
    .filter((b) => b.kapitel === k.id && !drin.has(b.id))
    .map((b) => ({ baustein: b, treffer: treffer(b, text) }))
    .filter((v) => v.treffer.length > 0)
}
