// Signalwege der Anleitung: welcher Zuspieler (Ausgang) über welchen Verteiler welchen Prozessor
// speist und welche Wand der bespielt – abgeleitet aus der Geräteliste (rein, getestet).
//
// Eindeutige Fälle brauchen keine Eingabe: Mit nur einer Wand bespielt jeder Prozessor sie, mit
// nur einem Prozessor geht jeder Zuspieler ohne eigene Angabe an ihn. Alles andere muss in der
// Geräteliste stehen – die Prüfung meldet, was fehlt.

import { sanitizeLedWallConfig } from '../led-wall/config'
import { processorGroups, resolveProcessor } from '../led-wall/processors'
import {
  leeresGeraet,
  type Anleitung,
  type Ausgang,
  type Ausschnitt,
  type Geraet,
  type WandKopie
} from './model'

export interface Signalweg {
  wand: WandKopie
  prozessor: Geraet | null
  zuspieler: Geraet | null
  /** null = Zuspieler ohne eingetragenen Ausgang (eindeutig über die Vorgabe verbunden) */
  ausgang: Ausgang | null
  verteiler: Geraet | null
  ausschnitt: Ausschnitt | null
}

const nach = (a: Anleitung, rolle: Geraet['rolle']): Geraet[] =>
  a.geraete.filter((g) => g.rolle === rolle)

/** Wände, die ein Prozessor bespielt (nur vorhandene; bei einer Wand ohne Angabe: diese) */
export function bespielt(p: Geraet, a: Anleitung): WandKopie[] {
  const waende = a.ledWall?.waende ?? []
  const eigene = waende.filter((w) => p.waende.includes(w.id))
  return eigene.length || waende.length !== 1 ? eigene : waende
}

/** Ausgänge eines Zuspielers mit ihren Prozessoren (ohne Angabe bei nur einem Prozessor: dieser) */
export function ziele(z: Geraet, a: Anleitung): { ausgang: Ausgang | null; an: Geraet[] }[] {
  const prozessoren = nach(a, 'prozessor')
  const einziger = prozessoren.length === 1 ? prozessoren : []
  const finde = (ids: string[]): Geraet[] => prozessoren.filter((p) => ids.includes(p.id))
  if (!z.ausgaenge.length) return einziger.length ? [{ ausgang: null, an: einziger }] : []
  return z.ausgaenge.map((o) => ({ ausgang: o, an: o.an.length ? finde(o.an) : einziger }))
}

/** Alle Wege, je Wand in der Reihenfolge der Kopie; eine Wand ohne Prozessor steht allein da. */
export function signalwege(a: Anleitung): Signalweg[] {
  const waende = a.ledWall?.waende ?? []
  const prozessoren = nach(a, 'prozessor')
  const zuspieler = nach(a, 'zuspieler')
  const verteiler = new Map(nach(a, 'verteiler').map((v) => [v.id, v]))
  const out: Signalweg[] = []
  for (const wand of waende) {
    const ps = prozessoren.filter((p) => bespielt(p, a).some((w) => w.id === wand.id))
    if (!ps.length) {
      out.push({
        wand,
        prozessor: null,
        zuspieler: null,
        ausgang: null,
        verteiler: null,
        ausschnitt: null
      })
      continue
    }
    for (const p of ps) {
      const rein = zuspieler.flatMap((z) =>
        ziele(z, a)
          .filter((t) => t.an.some((x) => x.id === p.id))
          .map((t) => ({ z, o: t.ausgang }))
      )
      if (!rein.length)
        out.push({
          wand,
          prozessor: p,
          zuspieler: null,
          ausgang: null,
          verteiler: null,
          ausschnitt: null
        })
      for (const { z, o } of rein)
        out.push({
          wand,
          prozessor: p,
          zuspieler: z,
          ausgang: o,
          verteiler: (o?.ueber && verteiler.get(o.ueber)) || null,
          ausschnitt: o?.ausschnitte.find((x) => x.wand === wand.id) ?? null
        })
    }
  }
  return out
}

/**
 * Prozessoren aus der LED-Wall-Kopie, die in der Geräteliste noch fehlen: je Prozessor der
 * Planung (geteilte einmal) ein Gerät mit Modell und „bespielt“ schon gesetzt.
 */
export function prozessorVorschlaege(a: Anleitung): Geraet[] {
  const waende = a.ledWall?.waende ?? []
  if (!waende.length) return []
  const geplant = waende.map((w) => ({
    id: w.id,
    name: w.name,
    config: sanitizeLedWallConfig(w.daten)
  }))
  const vorhanden = nach(a, 'prozessor')
  return processorGroups(geplant)
    .filter((g) => !vorhanden.some((p) => bespielt(p, a).some((w) => g.some((x) => x.id === w.id))))
    .map((g) => {
      const r = resolveProcessor(g[0].config)
      return {
        ...leeresGeraet('prozessor'),
        name: r.name,
        modell: r.name,
        waende: g.map((w) => w.id)
      }
    })
}

/** Wände, die ein Ausgang über seine Prozessoren erreicht (für die Eingabe der Ausschnitte) */
export function erreichteWaende(o: Ausgang, a: Anleitung): WandKopie[] {
  const prozessoren = nach(a, 'prozessor')
  const an = o.an.length
    ? prozessoren.filter((p) => o.an.includes(p.id))
    : prozessoren.length === 1
      ? prozessoren
      : []
  const ids = new Set(an.flatMap((p) => bespielt(p, a).map((w) => w.id)))
  return (a.ledWall?.waende ?? []).filter((w) => ids.has(w.id))
}

export interface WegProblem {
  schwere: 'warnung' | 'info'
  text: string
}

const name = (g: Geraet, fallback: string): string => g.name.trim() || fallback

/** Was an den Signalwegen fehlt oder nicht passt (für die Prüfung vor dem Export). */
export function pruefeSignalwege(a: Anleitung): WegProblem[] {
  const out: WegProblem[] = []
  const waende = a.ledWall?.waende ?? []
  const prozessoren = nach(a, 'prozessor')
  const mehrere = waende.length > 1
  if (mehrere && prozessoren.length) {
    for (const w of waende)
      if (!prozessoren.some((p) => bespielt(p, a).some((x) => x.id === w.id)))
        out.push({ schwere: 'warnung', text: `Wand „${w.name}“: kein Prozessor bespielt sie.` })
    for (const p of prozessoren)
      if (!bespielt(p, a).length)
        out.push({
          schwere: 'warnung',
          text: `Prozessor „${name(p, 'ohne Namen')}“: Welche Wand bespielt er?`
        })
  }
  if (prozessoren.length > 1)
    for (const z of nach(a, 'zuspieler'))
      if (!ziele(z, a).some((t) => t.an.length))
        out.push({
          schwere: 'warnung',
          text: `Zuspieler „${name(z, 'ohne Namen')}“: An welchen Prozessor geht er?`
        })
  for (const z of nach(a, 'zuspieler'))
    for (const o of z.ausgaenge)
      for (const s of o.ausschnitte) {
        const w = waende.find((x) => x.id === s.wand)
        if (!w) continue
        const wo = `„${name(z, 'Zuspieler')}“ ${o.name || 'Ausgang'} → „${w.name}“`
        if (o.breite && o.hoehe && (s.x + s.b > o.breite || s.y + s.h > o.hoehe))
          out.push({
            schwere: 'warnung',
            text: `${wo}: Der Ausschnitt ragt über das Bild (${o.breite} × ${o.hoehe} px).`
          })
        const k = w.kennzahlen
        if (s.b && s.h && (s.b !== k.aufloesungX || s.h !== k.aufloesungY))
          out.push({
            schwere: 'info',
            text: `${wo}: Ausschnitt ${s.b} × ${s.h} px, die Wand hat ${k.aufloesungX} × ${k.aufloesungY} px – das Bild wird skaliert.`
          })
      }
  return out
}
