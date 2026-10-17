// Prüfung und Migration der Anleitung – EINE Funktion für Projektdatei, gespeicherten Arbeitsstand
// und Bausteine (Vorbild sanitizeVgenProject). Fremde Dateien sind fremde Eingaben: jedes Feld
// geprüft, Längen und Anzahlen gekappt (nicht verworfen – was die App selbst erzeugt, muss die
// Prüfung immer bestehen), Unbekanntes fällt auf die Vorgabe.

import { isFotoHash } from '@shared/fotos'
import type { FirmenKontakt } from '@shared/types'
import {
  BEREICHE,
  DEFAULT_TITEL,
  KAPITEL,
  ROLLEN,
  hatBloecke,
  leereAnleitung,
  uid,
  type Anleitung,
  type Ausgang,
  type Ausschnitt,
  type Bereich,
  type Block,
  type Fehlerfall,
  type FSchritt,
  type Geraet,
  type GeraetRolle,
  type Herkunft,
  type KapitelEintrag,
  type KapitelId,
  type LedWallKopie,
  type Schritt,
  type Stufe,
  type WandKennzahlen,
  type WandKopie,
  type Zugang,
  type Ziel
} from './model'

/**
 * Schema-Version des Abschnitts „anleitung“ – 2: LED-Wall-Kopie mit mehreren Wänden; 3: Geräte
 * mit „bespielt“ (Prozessor) und Ausgängen samt Signalweg (Zuspieler), Rolle „Verteiler“.
 * Eine ältere Mottulbox öffnet neuere Abschnitte nicht – sonst fielen die Felder beim Speichern weg.
 */
export const ANLEITUNG_VERSION = 3

export const GRENZEN = {
  kurz: 200,
  text: 20_000,
  bloecke: 200,
  schritte: 200,
  geraete: 200,
  zugaenge: 100,
  fehlerfaelle: 300,
  kontakte: 50,
  // wie WALLS_MAX im LED-Wall-Konfigurator
  waende: 20,
  ausgaenge: 16
} as const

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown, max: number = GRENZEN.kurz): string =>
  typeof v === 'string' ? v.slice(0, max) : ''
const bool = (v: unknown, fallback = false): boolean => (typeof v === 'boolean' ? v : fallback)
const num = (v: unknown, min: number, max: number, fallback = 0): number =>
  typeof v === 'number' && Number.isFinite(v)
    ? Math.min(max, Math.max(min, Math.round(v)))
    : fallback
const list = (v: unknown, max: number): unknown[] => (Array.isArray(v) ? v.slice(0, max) : [])
const id = (v: unknown): string => (typeof v === 'string' && /^[\w:.-]{1,64}$/.test(v) ? v : uid())
const foto = (v: unknown): string | null => (isFotoHash(v) ? v : null)

export function stufe(v: unknown, fallback: Stufe = 1): Stufe {
  return v === 1 || v === 2 || v === 3 ? v : fallback
}

/** Kurzname für Platzhalter: klein, nur a–z, 0–9, - und _ */
export function kurzname(v: unknown): string {
  return str(v, 40)
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9_-]+/g, '')
}

function herkunft(v: unknown): Herkunft | undefined {
  if (!isObj(v) || typeof v.baustein !== 'string') return undefined
  return { baustein: str(v.baustein, 80), version: num(v.version, 0, 1_000_000) }
}

function schritt(v: unknown): Schritt | null {
  if (!isObj(v)) return null
  return {
    id: id(v.id),
    text: str(v.text, GRENZEN.text),
    stufe: stufe(v.stufe),
    foto: foto(v.foto)
  }
}

export function block(v: unknown): Block | null {
  if (!isObj(v)) return null
  const base = { id: id(v.id), stufe: stufe(v.stufe) }
  const h = herkunft(v.herkunft)
  const her = h ? { herkunft: h } : {}
  switch (v.typ) {
    case 'text':
      return { ...base, typ: 'text', text: str(v.text, GRENZEN.text), ...her }
    case 'schritte':
      return {
        ...base,
        typ: 'schritte',
        titel: str(v.titel),
        schritte: list(v.schritte, GRENZEN.schritte)
          .map(schritt)
          .filter((s): s is Schritt => !!s),
        ...her
      }
    case 'hinweis':
      return {
        ...base,
        typ: 'hinweis',
        art: v.art === 'warnung' ? 'warnung' : 'info',
        text: str(v.text, GRENZEN.text),
        ...her
      }
    case 'foto':
      return { ...base, typ: 'foto', foto: foto(v.foto), text: str(v.text) }
    default:
      return null
  }
}

function kapitel(v: unknown): KapitelEintrag[] {
  const def = new Map(KAPITEL.map((k) => [k.id, k]))
  const out: KapitelEintrag[] = []
  const seen = new Set<KapitelId>()
  for (const raw of list(v, 64)) {
    if (!isObj(raw) || typeof raw.id !== 'string' || !def.has(raw.id as KapitelId)) continue
    const k = def.get(raw.id as KapitelId)!
    if (seen.has(k.id)) continue
    seen.add(k.id)
    out.push({
      id: k.id,
      an: bool(raw.an, k.an),
      stufe: stufe(raw.stufe, k.stufe),
      bloecke: hatBloecke(k.id)
        ? list(raw.bloecke, GRENZEN.bloecke)
            .map(block)
            .filter((b): b is Block => !!b)
        : []
    })
  }
  // neue Kapitel einer späteren Version: hinten anhängen, ab Werk angehakt wie vorgesehen
  for (const k of KAPITEL) {
    if (!seen.has(k.id)) out.push({ id: k.id, an: k.an, stufe: k.stufe, bloecke: [] })
  }
  return out
}

/** Kennungen (Geräte, Wände): nur gültige, ohne Doppelte */
function kennungen(v: unknown, max: number): string[] {
  return [
    ...new Set(list(v, max).filter((x): x is string => typeof x === 'string' && KENNUNG.test(x)))
  ]
}
const KENNUNG = /^[\w:.-]{1,64}$/
const PX = 100_000

function ausschnitt(v: unknown): Ausschnitt | null {
  if (!isObj(v) || typeof v.wand !== 'string' || !KENNUNG.test(v.wand)) return null
  return {
    wand: v.wand,
    x: num(v.x, 0, PX),
    y: num(v.y, 0, PX),
    b: num(v.b, 0, PX),
    h: num(v.h, 0, PX)
  }
}

function ausgang(v: unknown): Ausgang | null {
  if (!isObj(v)) return null
  const ausschnitte: Ausschnitt[] = []
  for (const a of list(v.ausschnitte, GRENZEN.waende).map(ausschnitt))
    if (a && !ausschnitte.some((x) => x.wand === a.wand)) ausschnitte.push(a)
  return {
    id: id(v.id),
    name: str(v.name, 60),
    breite: num(v.breite, 0, PX),
    hoehe: num(v.hoehe, 0, PX),
    ueber: typeof v.ueber === 'string' && KENNUNG.test(v.ueber) ? v.ueber : null,
    an: kennungen(v.an, GRENZEN.geraete),
    ausschnitte
  }
}

function geraet(v: unknown): Geraet | null {
  if (!isObj(v)) return null
  const rolle = ROLLEN.some((r) => r.value === v.rolle) ? (v.rolle as GeraetRolle) : 'sonstiges'
  return {
    id: id(v.id),
    rolle,
    kurzname: kurzname(v.kurzname),
    name: str(v.name),
    modell: str(v.modell),
    standort: str(v.standort),
    ip: str(v.ip, 60),
    foto: foto(v.foto),
    notiz: str(v.notiz, 2000),
    waende: kennungen(v.waende, GRENZEN.waende),
    ausgaenge: list(v.ausgaenge, GRENZEN.ausgaenge)
      .map(ausgang)
      .filter((x): x is Ausgang => !!x)
  }
}

/**
 * Verweise zwischen Geräten nur auf vorhandene mit passender Rolle (ein gelöschter Verteiler, ein
 * Prozessor, der jetzt „Sonstiges“ ist). Wand-Kennungen bleiben stehen – die LED-Wall-Kopie kann
 * neu übernommen werden; was keine Wand mehr findet, übergeht die Ausgabe.
 */
function geraeteVerweise(geraete: Geraet[]): Geraet[] {
  const rolle = new Map(geraete.map((g) => [g.id, g.rolle]))
  return geraete.map((g) => ({
    ...g,
    ausgaenge: g.ausgaenge.map((o) => ({
      ...o,
      ueber: o.ueber && rolle.get(o.ueber) === 'verteiler' ? o.ueber : null,
      an: o.an.filter((x) => rolle.get(x) === 'prozessor')
    }))
  }))
}

function zugang(v: unknown): Zugang | null {
  if (!isObj(v)) return null
  return {
    id: id(v.id),
    wofuer: str(v.wofuer),
    benutzer: str(v.benutzer),
    passwort: str(v.passwort),
    notiz: str(v.notiz, 2000),
    stufe: stufe(v.stufe, 2)
  }
}

export function ziel(v: unknown): Ziel {
  if (!isObj(v)) return { art: 'anrufen' }
  switch (v.art) {
    case 'schritt':
      return { art: 'schritt', id: id(v.id) }
    case 'fall':
      return { art: 'fall', id: id(v.id) }
    case 'loesung':
      return { art: 'loesung', text: str(v.text, 2000) }
    case 'geloest':
      return { art: 'geloest' }
    default:
      return { art: 'anrufen' }
  }
}

function fSchritt(v: unknown): FSchritt | null {
  if (!isObj(v)) return null
  return {
    id: id(v.id),
    stufe: stufe(v.stufe),
    text: str(v.text, 2000),
    hinweis: str(v.hinweis, 2000),
    foto: foto(v.foto),
    ruecksprache: bool(v.ruecksprache),
    stufeAus: v.stufeAus === 'im-tausch' ? 'im-tausch' : null,
    ja: ziel(v.ja),
    nein: v.nein === null ? null : ziel(v.nein)
  }
}

export function fehlerfall(v: unknown): Fehlerfall | null {
  if (!isObj(v)) return null
  const bereich = BEREICHE.some((b) => b.value === v.bereich) ? (v.bereich as Bereich) : 'signal'
  const h = herkunft(v.herkunft)
  return {
    id: id(v.id),
    titel: str(v.titel),
    symptom: str(v.symptom, 2000),
    bereich,
    stufe: stufe(v.stufe),
    schritte: list(v.schritte, GRENZEN.schritte)
      .map(fSchritt)
      .filter((s): s is FSchritt => !!s),
    ...(h ? { herkunft: h } : {})
  }
}

export function kontakt(v: unknown): FirmenKontakt | null {
  if (!isObj(v)) return null
  return {
    id: id(v.id),
    name: str(v.name),
    funktion: str(v.funktion),
    mobil: str(v.mobil, 40),
    buero: str(v.buero, 40),
    mail: str(v.mail),
    erreichbarkeit: str(v.erreichbarkeit),
    whatsapp: bool(v.whatsapp)
  }
}

function kennzahlen(v: unknown): WandKennzahlen | null {
  if (!isObj(v)) return null
  const n = (x: unknown): number => num(x, 0, 100_000_000)
  return {
    projekt: str(v.projekt),
    kunde: str(v.kunde),
    modulKey: str(v.modulKey, 40),
    modul: str(v.modul, 40),
    spalten: n(v.spalten),
    reihen: n(v.reihen),
    module: n(v.module),
    breiteM: str(v.breiteM, 20),
    hoeheM: str(v.hoeheM, 20),
    aufloesungX: n(v.aufloesungX),
    aufloesungY: n(v.aufloesungY),
    gewichtKg: str(v.gewichtKg, 20),
    leistungTypW: n(v.leistungTypW),
    leistungMaxW: n(v.leistungMaxW),
    stromMaxA: str(v.stromMaxA, 20)
  }
}

const WAND_ID = /^[a-z0-9-]{1,40}$/

function wand(v: unknown, i: number): WandKopie | null {
  if (!isObj(v)) return null
  const k = kennzahlen(v.kennzahlen)
  if (!k) return null
  return {
    id: typeof v.id === 'string' && WAND_ID.test(v.id) ? v.id : `wand-${i + 1}`,
    name: str(v.name, 60).trim() || `Wand ${i + 1}`,
    daten: isObj(v.daten) ? v.daten : {},
    kennzahlen: k
  }
}

/**
 * Kopie der LED-Wall-Planung. Bis Version 1 eine Wand ohne Liste (`daten`/`kennzahlen` direkt) –
 * sie wird zur Wand „wand-1“, wie im Konfigurator (FIRST_WALL_ID).
 */
function ledWall(v: unknown): LedWallKopie | null {
  if (!isObj(v)) return null
  const liste = Array.isArray(v.waende) ? v.waende.slice(0, GRENZEN.waende) : [v]
  const waende: WandKopie[] = []
  for (const [i, w] of liste.entries()) {
    const k = wand(w, i)
    if (k && !waende.some((x) => x.id === k.id)) waende.push(k)
  }
  if (!waende.length) return null
  const q = v.quelle
  return {
    waende,
    quelle:
      isObj(q) && typeof q.sha256 === 'string' && /^[0-9a-f]{64}$/.test(q.sha256)
        ? { rev: num(q.rev, 0, Number.MAX_SAFE_INTEGER), sha256: q.sha256 }
        : null,
    uebernommen: str(v.uebernommen, 40)
  }
}

export function sanitizeAnleitung(raw: unknown): Anleitung {
  const d = leereAnleitung()
  if (!isObj(raw)) return d
  const db = isObj(raw.deckblatt) ? raw.deckblatt : {}
  const aus = isObj(raw.ausgabe) ? raw.ausgabe : {}
  const st = isObj(raw.stand) ? raw.stand : {}
  return {
    titel: typeof raw.titel === 'string' ? str(raw.titel) : DEFAULT_TITEL,
    deckblatt: {
      projekt: str(db.projekt),
      kunde: str(db.kunde),
      ort: str(db.ort),
      zeitraum: str(db.zeitraum),
      foto: foto(db.foto)
    },
    kapitel: kapitel(raw.kapitel),
    geraete: geraeteVerweise(
      list(raw.geraete, GRENZEN.geraete)
        .map(geraet)
        .filter((g): g is Geraet => !!g)
    ),
    zugaenge: list(raw.zugaenge, GRENZEN.zugaenge)
      .map(zugang)
      .filter((z): z is Zugang => !!z),
    fehlerfaelle: list(raw.fehlerfaelle, GRENZEN.fehlerfaelle)
      .map(fehlerfall)
      .filter((f): f is Fehlerfall => !!f),
    kontakte: list(raw.kontakte, GRENZEN.kontakte)
      .map(kontakt)
      .filter((k): k is FirmenKontakt => !!k),
    ledWall: ledWall(raw.ledWall),
    ausgabe: {
      passwoerter:
        aus.passwoerter === 'drucken' || aus.passwoerter === 'schwaerzen'
          ? aus.passwoerter
          : 'separat'
    },
    stand: { bearbeitet: str(st.bearbeitet), aenderungen: str(st.aenderungen, 4000) }
  }
}
