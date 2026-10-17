// Platzhalter in geschweiften Klammern, z. B. {pc.name}, {prozessor.ip}, {wand.aufloesung},
// {kontakt.mobil}, {projekt.ort}. Quellen: Deckblatt, Geräteliste (Kurznamen), LED-Wall-Kopie,
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

  const w = a.ledWall?.kennzahlen
  if (w) {
    put('wand.modul', w.modul)
    put('wand.module', w.module)
    put('wand.spalten', w.spalten)
    put('wand.reihen', w.reihen)
    put('wand.breite', `${fmtM(w.breiteM)} m`)
    put('wand.hoehe', `${fmtM(w.hoeheM)} m`)
    put('wand.groesse', `${fmtM(w.breiteM)} × ${fmtM(w.hoeheM)} m`)
    put('wand.aufloesung', `${w.aufloesungX} × ${w.aufloesungY}`)
    put('wand.gewicht', `${fmtM(w.gewichtKg)} kg`)
    put('wand.leistung', `${w.leistungMaxW} W`)
    put('wand.strom', `${fmtM(w.stromMaxA)} A`)
  }

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
  for (const g of a.geraete) {
    if (g.kurzname) keys.push(`${g.kurzname}.name`, `${g.kurzname}.standort`, `${g.kurzname}.ip`)
  }
  return [...new Set(keys)]
}
