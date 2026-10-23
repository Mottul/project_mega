// Datenmodell des Mini-Manuals (docs/PLAN-MINI-MANUAL.md) – rein, ohne api und Electron, damit
// eine spätere eigene App oder PWA es mitnehmen könnte. Gespeichert wird es als Abschnitt
// „anleitung“ der Projektdatei (fileSection.ts) und als Arbeitsstand im Store.
//
// Grundsätze aus dem Plan:
// - Drei Kenntnisstufen. Die Stufe steuert nur, WAS erscheint – keine Textvarianten je Stufe.
// - Alles aus anderen Werkzeugen (LED-Wall, Kontakte, Bausteine) ist eine Kopie mit Herkunft:
//   Eine Kunden-Anleitung ändert sich nie still.
// - Fotos nur als Hash (shared/fotos).

import type { FirmenKontakt } from '@shared/types'

/** 1 Bedienung, 2 Betreuung, 3 Technik */
export type Stufe = 1 | 2 | 3

export const STUFEN: { value: Stufe; label: string; fuer: string }[] = [
  { value: 1, label: 'Bedienung', fuer: 'Kunde, Moderation, Aushilfe' },
  { value: 2, label: 'Betreuung', fuer: 'Haustechnik, Stagehand' },
  { value: 3, label: 'Technik', fuer: 'Techniker, Lehrlinge' }
]

export const stufeLabel = (s: Stufe): string => STUFEN[s - 1].label

/** Woher ein übernommener Inhalt stammt (Baustein der Bibliothek) */
export interface Herkunft {
  baustein: string
  version: number
}

export interface Schritt {
  id: string
  text: string
  stufe: Stufe
  foto: string | null
}

export type Block =
  | { id: string; typ: 'text'; stufe: Stufe; text: string; herkunft?: Herkunft }
  | {
      id: string
      typ: 'schritte'
      stufe: Stufe
      titel: string
      schritte: Schritt[]
      herkunft?: Herkunft
    }
  | {
      id: string
      typ: 'hinweis'
      stufe: Stufe
      art: 'info' | 'warnung'
      text: string
      herkunft?: Herkunft
    }
  | { id: string; typ: 'foto'; stufe: Stufe; foto: string | null; text: string }

export type BlockTyp = Block['typ']

/** Kapitel der Anleitung (Reihenfolge = Vorgabe; Verkabelung kommt mit Phase 2) */
export type KapitelId =
  | 'aufEinenBlick'
  | 'system'
  | 'geraete'
  | 'zugang'
  | 'einAus'
  | 'software'
  | 'bedienfeld'
  | 'inhalte'
  | 'ledWall'
  | 'verkabelung'
  | 'fehlersuche'
  | 'pflege'
  | 'ersatzteile'
  | 'kontakt'
  | 'dokumentstand'

/** Wie ein Kapitel entsteht: frei aus Blöcken oder aus festen Daten */
export type KapitelArt =
  | 'bloecke'
  | 'auto'
  | 'geraete'
  | 'zugang'
  | 'fehlersuche'
  | 'ledWall'
  | 'verkabelung'
  | 'bedienfeld'

export interface KapitelDef {
  id: KapitelId
  titel: string
  art: KapitelArt
  /** Mindeststufe ab Werk */
  stufe: Stufe
  /** ab Werk angehakt */
  an: boolean
  /** kurz: was hier hineingehört */
  info: string
}

export const KAPITEL: KapitelDef[] = [
  {
    id: 'aufEinenBlick',
    titel: 'Auf einen Blick',
    art: 'auto',
    stufe: 1,
    an: true,
    info: 'Einschalten, Inhalte wählen, Ausschalten, Notfall – zusammengestellt aus den anderen Kapiteln; zugleich die Kurzkarte.'
  },
  {
    id: 'system',
    titel: 'Systemübersicht',
    art: 'auto',
    stufe: 1,
    an: true,
    info: 'Signalweg als Grafik aus der Geräteliste: Zuspieler → Prozessor → Wand, Bedienfeld, Strom.'
  },
  {
    id: 'geraete',
    titel: 'Geräte und Standorte',
    art: 'geraete',
    stufe: 1,
    an: true,
    info: 'Was wo steht, mit Fotos. Die Kurznamen der Geräte sind Platzhalter, z. B. {pc.name}.'
  },
  {
    id: 'zugang',
    titel: 'Zugangsdaten',
    art: 'zugang',
    stufe: 2,
    an: true,
    info: 'PC, Software, WLAN, Fernwartung. Passwörter druckt, schwärzt oder verweist das PDF je nach Einstellung.'
  },
  {
    id: 'einAus',
    titel: 'Ein- und Ausschalten',
    art: 'bloecke',
    stufe: 1,
    an: true,
    info: 'Reihenfolge, Start nach Stromausfall, Nachtabschaltung.'
  },
  {
    id: 'software',
    titel: 'Software',
    art: 'bloecke',
    stufe: 1,
    an: true,
    info: 'Bedienung von MadMapper, Resolume, OBS, Mottulbox-Player …'
  },
  {
    id: 'bedienfeld',
    titel: 'Bedienfeld',
    art: 'bedienfeld',
    stufe: 1,
    an: false,
    info: 'Tastenbelegung von Stream Deck, Companion oder einem freien Raster – Seite für Seite, mit Funktion und Notiz je Taste.'
  },
  {
    id: 'inhalte',
    titel: 'Inhalte tauschen',
    art: 'bloecke',
    stufe: 2,
    an: false,
    info: 'Auflösung, Seitenverhältnis, Codec, Ablageort und Benennung neuer Videos.'
  },
  {
    id: 'ledWall',
    titel: 'LED-Wall',
    art: 'ledWall',
    stufe: 2,
    an: true,
    info: 'Kennzahlen aus der LED-Wall-Planung derselben Projektdatei (Kopie), Status-LEDs.'
  },
  {
    id: 'verkabelung',
    titel: 'Verkabelung',
    art: 'verkabelung',
    stufe: 2,
    an: true,
    info: 'Signal- und Strompläne der LED-Wall-Kopie mit Kabelverlauf, Ports, Stromkreisen und Glasfaser – von hinten oder von vorne gesehen.'
  },
  {
    id: 'fehlersuche',
    titel: 'Fehlersuche',
    art: 'fehlersuche',
    stufe: 1,
    an: true,
    info: '„Was siehst du?“ und dann Schritt für Schritt – bis „Gelöst“ oder „Bitte anrufen“.'
  },
  {
    id: 'pflege',
    titel: 'Pflege und Verbote',
    art: 'bloecke',
    stufe: 1,
    an: false,
    info: 'Reinigung, Helligkeit, Wetter, „bitte nicht …“.'
  },
  {
    id: 'ersatzteile',
    titel: 'Ersatzteile vor Ort',
    art: 'bloecke',
    stufe: 2,
    an: false,
    info: 'Ersatz-IMs, Kabel, Sicherungen und wo sie liegen.'
  },
  {
    id: 'kontakt',
    titel: 'Kontakt und Support',
    art: 'auto',
    stufe: 1,
    an: true,
    info: 'Ansprechpartner aus dem Firmenprofil, Erreichbarkeit, QR-Code zum Anrufen.'
  },
  {
    id: 'dokumentstand',
    titel: 'Dokumentstand',
    art: 'auto',
    stufe: 3,
    an: true,
    info: 'Datum, bearbeitet von, Änderungen – für die Technik.'
  }
]

export const kapitelDef = (id: KapitelId): KapitelDef =>
  KAPITEL.find((k) => k.id === id) ?? KAPITEL[0]

/** Kapitel mit den Vorgaben aus KAPITEL (neue Anleitung, neues Kapitel einer späteren Version) */
export function neuesKapitel(id: KapitelId): KapitelEintrag {
  const k = kapitelDef(id)
  return {
    id,
    an: k.an,
    stufe: k.stufe,
    bloecke: [],
    ...(k.art === 'verkabelung' ? { ansicht: 'hinten' as const } : {})
  }
}

/** Kapitel mit eigenen Blöcken (Bausteine): freie Kapitel, LED-Wall (Status-LEDs …), Bedienfeld */
export const hatBloecke = (id: KapitelId): boolean => {
  const art = kapitelDef(id).art
  return art === 'bloecke' || art === 'ledWall' || art === 'bedienfeld'
}

export interface KapitelEintrag {
  id: KapitelId
  an: boolean
  stufe: Stufe
  /** nur bei Kapiteln der Art „bloecke“ (sonst leer) */
  bloecke: Block[]
  /** nur Verkabelung: Blickrichtung der Pläne (ab Werk von hinten – dort wird gesteckt) */
  ansicht?: 'vorne' | 'hinten'
}

export type GeraetRolle =
  'zuspieler' | 'verteiler' | 'prozessor' | 'bedienfeld' | 'netzwerk' | 'strom' | 'sonstiges'

export const ROLLEN: { value: GeraetRolle; label: string }[] = [
  { value: 'zuspieler', label: 'Zuspieler' },
  { value: 'verteiler', label: 'Verteiler' },
  { value: 'prozessor', label: 'Prozessor' },
  { value: 'bedienfeld', label: 'Bedienfeld' },
  { value: 'netzwerk', label: 'Netzwerk' },
  { value: 'strom', label: 'Strom' },
  { value: 'sonstiges', label: 'Sonstiges' }
]

export interface Geraet {
  id: string
  rolle: GeraetRolle
  /** für Platzhalter: {kurzname.name}; nur a–z, 0–9, - und _ */
  kurzname: string
  name: string
  modell: string
  standort: string
  ip: string
  foto: string | null
  notiz: string
  /** nur Prozessor: Kennungen der Wände (aus der LED-Wall-Kopie), die er bespielt */
  waende: string[]
  /** nur Zuspieler: je Ausgang, wohin das Signal geht */
  ausgaenge: Ausgang[]
}

/** Was eine Wand aus einem Gesamtbild zeigt – Pixel im Bild des Ausgangs */
export interface Ausschnitt {
  wand: string
  x: number
  y: number
  b: number
  h: number
}

/**
 * Ein Ausgang eines Zuspielers (Festlegung 32 im Plan): je Wand ein eigener Ausgang, ein Ausgang
 * über einen Verteiler (HDMI-Splitter, beide Wände zeigen dasselbe) oder ein Gesamtbild, aus dem
 * jeder Prozessor seinen Ausschnitt nimmt.
 */
export interface Ausgang {
  id: string
  /** „HDMI 1“, „DP“ */
  name: string
  /** Bild des Ausgangs in Pixeln; 0 = nicht angegeben */
  breite: number
  hoehe: number
  /** Gerät dazwischen (Rolle „Verteiler“); null = direkt */
  ueber: string | null
  /** Prozessoren, die das Signal bekommen (Kennungen der Geräte) */
  an: string[]
  /** Gesamtbild für mehrere Wände: was jede Wand davon zeigt */
  ausschnitte: Ausschnitt[]
}

export function leeresGeraet(rolle: GeraetRolle = 'zuspieler'): Geraet {
  return {
    id: uid(),
    rolle,
    kurzname: '',
    name: '',
    modell: '',
    standort: '',
    ip: '',
    foto: null,
    notiz: '',
    waende: [],
    ausgaenge: []
  }
}

export function leererAusgang(name = ''): Ausgang {
  return { id: uid(), name, breite: 0, hoehe: 0, ueber: null, an: [], ausschnitte: [] }
}

// ---------------------------------------------------------------- Bedienfelder

/** Geräte mit Tasten: Stream Deck (feste Raster), Companion, frei und die Mottulbox-Werkzeuge
 *  Jingle-Player und OSC-Steuerung (Raster wählbar) */
export type BedienGeraet =
  | 'sd'
  | 'sd-mini'
  | 'sd-xl'
  | 'sd-plus'
  | 'sd-neo'
  | 'sd-plus-xl'
  | 'sd-studio'
  | 'companion'
  | 'frei'
  | 'jingle'
  | 'osc'

/** Navigationstaste: Seite weiter/zurück oder zu einer bestimmten Seite (Ordner am Stream Deck) */
export type TastenNav = { art: 'weiter' } | { art: 'zurueck' } | { art: 'seite'; ziel: string }

export interface Taste {
  /** Platz im Raster ab 0; die Nummer zählt Zeile für Zeile (zeile × spalten + spalte + 1) */
  spalte: number
  zeile: number
  /** Spanne in Spalten und Zeilen – 1 am Stream Deck, größer bei Kacheln der OSC-Steuerung */
  breite: number
  hoehe: number
  titel: string
  /** '#rrggbb' oder '' = Vorgabe (helle Schrift auf dunkler Taste) */
  textfarbe: string
  hintergrund: string
  /** was die Taste tut, z. B. „Startet das Intro-Video“ */
  funktion: string
  notiz: string
  stufe: Stufe
  /** Bild auf der Taste (Foto-Speicher) – Importe bringen es mit, Titel fehlen dort oft */
  bild: string | null
  nav: TastenNav | null
}

export interface BedienSeite {
  id: string
  name: string
  /** nur belegte Plätze; je Platz höchstens eine Taste */
  tasten: Taste[]
}

export interface Bedienfeld {
  id: string
  name: string
  geraet: BedienGeraet
  spalten: number
  zeilen: number
  /** erscheint ab Stufe */
  stufe: Stufe
  /** Drehregler, Touchleiste, Profil-Name … */
  notiz: string
  /** übernommen aus einem Werkzeug ('jingle', 'osc:<Projekt>:<Set>'); '' = von Hand */
  quelle: string
  seiten: BedienSeite[]
}

export interface Zugang {
  id: string
  /** z. B. „Laptop“, „WLAN“, „AnyDesk“ */
  wofuer: string
  benutzer: string
  passwort: string
  notiz: string
  stufe: Stufe
}

export type Bereich =
  'strom' | 'signal' | 'prozessor' | 'zuspieler' | 'bedienfeld' | 'module' | 'netzwerk'

export const BEREICHE: { value: Bereich; label: string }[] = [
  { value: 'strom', label: 'Strom' },
  { value: 'signal', label: 'Signal und Daten' },
  { value: 'prozessor', label: 'Prozessor/Controller' },
  { value: 'zuspieler', label: 'Zuspieler und Software' },
  { value: 'bedienfeld', label: 'Bedienfeld' },
  { value: 'module', label: 'Module und IMs' },
  { value: 'netzwerk', label: 'Netzwerk' }
]

/** Wohin ein Ja oder Nein führt */
export type Ziel =
  | { art: 'schritt'; id: string }
  | { art: 'loesung'; text: string }
  | { art: 'geloest' }
  | { art: 'anrufen' }
  | { art: 'fall'; id: string }

export interface FSchritt {
  id: string
  stufe: Stufe
  /** Frage („Leuchtet …?“) – oder Anweisung, wenn `nein` fehlt */
  text: string
  hinweis: string
  foto: string | null
  /** „vorher kurz anrufen“: Hinweis mit Kontakt, der Schritt bleibt für seine Stufe sichtbar */
  ruecksprache: boolean
  /** Stufe aus den Stammdaten des Moduls statt fest (IM-Tausch: 496-2,0 werkzeuglos, uS2+ verschraubt) */
  stufeAus: 'im-tausch' | null
  /**
   * Frage, die die LED-Wall-Planung beantwortet („Läuft das Signal über Glasfaser?“): Wissen es
   * alle Wände der Kopie gleich, entfällt die Frage in der Ausgabe und es geht mit Ja bzw. Nein weiter.
   */
  antwortAus: 'glasfaser' | null
  ja: Ziel
  /** null = Schritt ohne Frage, nur „Weiter“ (`ja`) */
  nein: Ziel | null
}

export interface Fehlerfall {
  id: string
  titel: string
  /** was man sieht */
  symptom: string
  bereich: Bereich
  stufe: Stufe
  schritte: FSchritt[]
  herkunft?: Herkunft
}

/** Kennzahlen der Wand zum Zeitpunkt der Übernahme (bleiben, auch wenn sich der Katalog ändert) */
export interface WandKennzahlen {
  projekt: string
  kunde: string
  modulKey: string
  modul: string
  spalten: number
  reihen: number
  module: number
  breiteM: string
  hoeheM: string
  aufloesungX: number
  aufloesungY: number
  gewichtKg: string
  leistungTypW: number
  leistungMaxW: number
  stromMaxA: string
}

/** Eine Wand der Planung, wie sie übernommen wurde */
export interface WandKopie {
  /** Kennung der Wand im Abschnitt „ledWall“ (für den Vergleich und spätere Querverweise) */
  id: string
  name: string
  /** Kopie der Wand (für den Vergleich und spätere Pläne) */
  daten: unknown
  kennzahlen: WandKennzahlen
}

export interface LedWallKopie {
  /** mindestens eine; Reihenfolge wie im Konfigurator */
  waende: WandKopie[]
  /** Stand der Quelle in derselben Projektdatei; null = aus dem Konfigurator übernommen */
  quelle: { rev: number; sha256: string } | null
  uebernommen: string
}

export type Passwoerter = 'drucken' | 'schwaerzen' | 'separat'

export interface Anleitung {
  titel: string
  deckblatt: {
    projekt: string
    kunde: string
    ort: string
    zeitraum: string
    foto: string | null
  }
  kapitel: KapitelEintrag[]
  geraete: Geraet[]
  zugaenge: Zugang[]
  /** Tastenfelder des Kapitels Bedienfeld (Version 6) */
  bedienfelder: Bedienfeld[]
  fehlerfaelle: Fehlerfall[]
  /** Kopien aus dem Firmenprofil, damit die Datei beim Kollegen vollständig ist */
  kontakte: FirmenKontakt[]
  ledWall: LedWallKopie | null
  ausgabe: {
    passwoerter: Passwoerter
    /** Online-Fassung: Ordner in der Online-Ablage und seine Adresse (QR-Code der Kurzkarte) –
     *  bleibt beim Aktualisieren gleich; null = noch nicht online */
    online: { ordner: string; url: string } | null
  }
  stand: { bearbeitet: string; aenderungen: string }
}

export const DEFAULT_TITEL = 'So bedienst du deine LED-Wall'

let seq = 0
/** kurze, eindeutige Kennung für Einträge (Ziele zeigen auf sie, nicht auf die Position) */
export function uid(): string {
  seq = (seq + 1) % 1_000_000
  return `${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export function leereAnleitung(): Anleitung {
  return {
    titel: DEFAULT_TITEL,
    deckblatt: { projekt: '', kunde: '', ort: '', zeitraum: '', foto: null },
    kapitel: KAPITEL.map((k) => neuesKapitel(k.id)),
    geraete: [],
    zugaenge: [],
    bedienfelder: [],
    fehlerfaelle: [],
    kontakte: [],
    ledWall: null,
    ausgabe: { passwoerter: 'separat', online: null },
    stand: { bearbeitet: '', aenderungen: '' }
  }
}

/** Alle benutzten Fotos (Hashes) – für die Projektdatei */
export function fotosIn(a: Anleitung): string[] {
  const out = new Set<string>()
  const add = (h: string | null | undefined): void => {
    if (h) out.add(h)
  }
  add(a.deckblatt.foto)
  for (const g of a.geraete) add(g.foto)
  for (const k of a.kapitel) {
    for (const b of k.bloecke) {
      if (b.typ === 'foto') add(b.foto)
      if (b.typ === 'schritte') for (const s of b.schritte) add(s.foto)
    }
  }
  for (const f of a.fehlerfaelle) for (const s of f.schritte) add(s.foto)
  for (const b of a.bedienfelder) for (const s of b.seiten) for (const t of s.tasten) add(t.bild)
  return [...out]
}
