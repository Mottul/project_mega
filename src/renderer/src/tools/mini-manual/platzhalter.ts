// Platzhalter in geschweiften Klammern, z. B. {pc.name}, {prozessor.ip}, {wand.aufloesung}
// (weitere Wände {wand2.…}), {kontakt.mobil}, {projekt.ort}. Quellen: Deckblatt, Geräteliste (Kurznamen), LED-Wall-Kopie,
// Kontakte, Firmenprofil. Leere Platzhalter zeigt die Vorschau gestrichelt rot, die Prüfung vor
// dem Export meldet sie, im PDF wird daraus eine Linie zum Ausfüllen.

import type { FirmenProfil } from '@shared/types'
import { ROLLEN, type Anleitung } from './model'

/** Syntax: {quelle.feld}; Quelle und Feld klein, a–z, 0–9, - und _ (Kurznamen der Geräte) */
export const PLATZHALTER_RE = /\{([a-z0-9_-]{1,40})\.([a-z0-9_-]{1,40})\}/g

export type PlatzhalterWerte = Map<string, string>

const fmtM = (s: string): string => s.replace('.', ',')

/** Alle bekannten Platzhalter mit ihrem Wert (leere Werte fehlen in der Karte). */
export function platzhalterWerte(a: Anleitung, firma: FirmenProfil): PlatzhalterWerte {
  const m: PlatzhalterWerte = new Map()
  const put = (key: string, v: string | number | undefined | null): void => {
    const s = v === undefined || v === null ? '' : String(v).trim()
    if (s) m.set(key, s)
  }
  const d = a.deckblatt
  put('projekt.titel', a.titel)
  put('projekt.name', d.projekt)
  put('projekt.kunde', d.kunde)
  put('projekt.ort', d.ort)
  put('projekt.zeitraum', d.zeitraum)

  // erste Wand: {wand.…}, weitere: {wand2.…}, {wand3.…} – in der Reihenfolge des Konfigurators
  ;(a.ledWall?.waende ?? []).slice(0, 20).forEach(({ name, kennzahlen: w }, i) => {
    const pre = i === 0 ? 'wand' : `wand${i + 1}`
    put(`${pre}.name`, name)
    put(`${pre}.modul`, w.modul)
    put(`${pre}.module`, w.module)
    put(`${pre}.spalten`, w.spalten)
    put(`${pre}.reihen`, w.reihen)
    put(`${pre}.breite`, `${fmtM(w.breiteM)} m`)
    put(`${pre}.hoehe`, `${fmtM(w.hoeheM)} m`)
    put(`${pre}.groesse`, `${fmtM(w.breiteM)} × ${fmtM(w.hoeheM)} m`)
    put(`${pre}.aufloesung`, `${w.aufloesungX} × ${w.aufloesungY}`)
    put(`${pre}.gewicht`, `${fmtM(w.gewichtKg)} kg`)
    put(`${pre}.leistung`, `${w.leistungMaxW} W`)
    put(`${pre}.strom`, `${fmtM(w.stromMaxA)} A`)
  })

  for (const g of a.geraete) {
    if (!g.kurzname) continue
    put(`${g.kurzname}.name`, g.name)
    put(`${g.kurzname}.modell`, g.modell)
    put(`${g.kurzname}.standort`, g.standort)
    put(`${g.kurzname}.ip`, g.ip)
    put(`${g.kurzname}.rolle`, ROLLEN.find((r) => r.value === g.rolle)?.label)
  }

  a.kontakte.slice(0, 3).forEach((k, i) => {
    const pre = i === 0 ? 'kontakt' : `kontakt${i + 1}`
    put(`${pre}.name`, k.name)
    put(`${pre}.funktion`, k.funktion)
    put(`${pre}.mobil`, k.mobil)
    put(`${pre}.buero`, k.buero)
    put(`${pre}.mail`, k.mail)
    put(`${pre}.erreichbarkeit`, k.erreichbarkeit)
  })

  put('firma.name', firma.name)
  put('firma.fernwartung', firma.fernwartung)
  return m
}

/** Namen aller Platzhalter im Text (ohne Doppelte) */
export function platzhalterIn(text: string): string[] {
  return [...new Set(Array.from(text.matchAll(PLATZHALTER_RE), (x) => `${x[1]}.${x[2]}`))]
}

/** Für die Hilfe im Editor: welche Platzhalter es gibt (mit Beispiel aus den Werten) */
export function platzhalterListe(a: Anleitung): string[] {
  const keys = [
    'projekt.name',
    'projekt.kunde',
    'projekt.ort',
    'projekt.zeitraum',
    'wand.groesse',
    'wand.aufloesung',
    'wand.modul',
    'wand.module',
    'kontakt.name',
    'kontakt.mobil',
    'firma.name',
    'firma.fernwartung'
  ]
  ;(a.ledWall?.waende ?? []).slice(1, 20).forEach((_, i) => {
    keys.push(`wand${i + 2}.name`, `wand${i + 2}.groesse`, `wand${i + 2}.aufloesung`)
  })
  for (const g of a.geraete) {
    if (g.kurzname) keys.push(`${g.kurzname}.name`, `${g.kurzname}.standort`, `${g.kurzname}.ip`)
  }
  return [...new Set(keys)]
}
