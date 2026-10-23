// Bedienfelder (Plan Mini-Manual, Abschnitt „Bedienfelder“): Raster je Gerät, Tasten setzen,
// tauschen, Seiten und Raster ändern – rein und getestet. Die Importe (Stream Deck, Companion)
// füllen später dasselbe Modell; danach bleibt alles im Editor änderbar.

import {
  uid,
  type BedienFlaeche,
  type BedienGeraet,
  type BedienSeite,
  type Bedienfeld,
  type Taste,
  type TastenNav
} from './model'

export interface GeraetDef {
  value: BedienGeraet
  label: string
  spalten: number
  zeilen: number
  /** Raster wählbar (Companion, frei); sonst fest wie am Gerät */
  waehlbar?: boolean
  /** Was das Raster nicht zeigt – gehört in die Notiz des Bedienfelds */
  hinweis?: string
  /** größtes wählbares Raster, sonst RASTER_MAX */
  max?: { spalten: number; zeilen: number }
}

export const BEDIEN_GERAETE: GeraetDef[] = [
  { value: 'sd', label: 'Stream Deck / MK.2', spalten: 5, zeilen: 3 },
  { value: 'sd-mini', label: 'Stream Deck Mini', spalten: 3, zeilen: 2 },
  { value: 'sd-xl', label: 'Stream Deck XL', spalten: 8, zeilen: 4 },
  {
    value: 'sd-plus',
    label: 'Stream Deck +',
    spalten: 4,
    zeilen: 2,
    hinweis: '4 Drehregler und eine Touchleiste – in der Notiz beschreiben.'
  },
  {
    value: 'sd-neo',
    label: 'Stream Deck Neo',
    spalten: 4,
    zeilen: 2,
    hinweis: 'Infoleiste und zwei Touchpunkte zum Blättern – in der Notiz beschreiben.'
  },
  {
    value: 'sd-plus-xl',
    label: 'Stream Deck + XL',
    spalten: 9,
    zeilen: 4,
    hinweis: '6 Drehregler und eine Touchleiste – in der Notiz beschreiben.'
  },
  {
    value: 'sd-studio',
    label: 'Stream Deck Studio',
    spalten: 16,
    zeilen: 2,
    hinweis: '2 Drehregler – in der Notiz beschreiben.'
  },
  { value: 'companion', label: 'Companion', spalten: 8, zeilen: 4, waehlbar: true },
  { value: 'frei', label: 'Freies Raster', spalten: 5, zeilen: 3, waehlbar: true },
  { value: 'jingle', label: 'Jingle-Player (Mottulbox)', spalten: 4, zeilen: 2, waehlbar: true },
  // feines Raster wie in der OSC-Steuerung (Kacheln mit Spanne, 4–48 Spalten)
  {
    value: 'osc',
    label: 'OSC-Steuerung (Mottulbox)',
    spalten: 24,
    zeilen: 12,
    waehlbar: true,
    max: { spalten: 48, zeilen: 64 }
  }
]

/** Grenzen eines wählbaren Rasters (Companion kann mehr, eine Druckseite nicht) */
export const RASTER_MAX = { spalten: 16, zeilen: 12 } as const

export const geraetDef = (g: BedienGeraet): GeraetDef =>
  BEDIEN_GERAETE.find((x) => x.value === g) ?? BEDIEN_GERAETE[0]

export const rasterMax = (g: BedienGeraet): { spalten: number; zeilen: number } =>
  geraetDef(g).max ?? RASTER_MAX

export function neueSeite(name = ''): BedienSeite {
  return { id: uid(), name, tasten: [] }
}

export function neuesBedienfeld(geraet: BedienGeraet = 'sd', name = ''): Bedienfeld {
  const d = geraetDef(geraet)
  return {
    id: uid(),
    name,
    geraet,
    spalten: d.spalten,
    zeilen: d.zeilen,
    stufe: 1,
    notiz: '',
    flaeche: null,
    quelle: '',
    seiten: [neueSeite()]
  }
}

export function leereTaste(spalte: number, zeile: number): Taste {
  return {
    spalte,
    zeile,
    breite: 1,
    hoehe: 1,
    titel: '',
    textfarbe: '',
    hintergrund: '',
    funktion: '',
    notiz: '',
    stufe: 1,
    bild: null,
    nav: null
  }
}

/** Nummer der Taste wie am Stream Deck: Zeile für Zeile, ab 1 */
export const tastenNr = (spalten: number, t: { spalte: number; zeile: number }): number =>
  t.zeile * spalten + t.spalte + 1

/** Nummer im Druck und Editor: am Gerät nach Platz, in der OSC-Steuerung (Kacheln auf feinem
 *  Raster) der Reihe nach – Platznummern wären dort 1, 4, 49 … */
export function nummer(b: Bedienfeld, s: BedienSeite, t: Taste): number {
  const i = s.tasten.indexOf(t)
  return b.geraet === 'osc' && i >= 0 ? i + 1 : tastenNr(b.spalten, t)
}

/** Gibt es Tasten über mehrere Plätze? Dann ordnen Editor und Druck jede Taste ausdrücklich an. */
export const hatSpannen = (b: Bedienfeld): boolean =>
  b.seiten.some((s) => s.tasten.some((t) => t.breite > 1 || t.hoehe > 1))

/** Plätze, die eine größere Taste zusätzlich zu ihrem eigenen bedeckt ("spalte,zeile") */
export function abgedeckt(s: BedienSeite): Set<string> {
  const out = new Set<string>()
  for (const t of s.tasten)
    for (let z = t.zeile; z < t.zeile + t.hoehe; z++)
      for (let sp = t.spalte; sp < t.spalte + t.breite; sp++)
        if (sp !== t.spalte || z !== t.zeile) out.add(`${sp},${z}`)
  return out
}

export const tasteAn = (s: BedienSeite, spalte: number, zeile: number): Taste | undefined =>
  s.tasten.find((t) => t.spalte === spalte && t.zeile === zeile)

/** Nichts darauf (Stufe zählt nicht) – eine leere Taste fällt aus der Liste */
export function istLeer(t: Taste): boolean {
  return (
    !t.titel.trim() &&
    !t.funktion.trim() &&
    !t.notiz.trim() &&
    !t.textfarbe &&
    !t.hintergrund &&
    !t.bild &&
    !t.nav
  )
}

const ordnung = (a: Taste, b: Taste): number => a.zeile - b.zeile || a.spalte - b.spalte

/** Taste setzen, ändern oder – ist sie leer – entfernen; die Liste bleibt Zeile für Zeile sortiert */
export function setzeTaste(s: BedienSeite, t: Taste): BedienSeite {
  const rest = s.tasten.filter((x) => x.spalte !== t.spalte || x.zeile !== t.zeile)
  return { ...s, tasten: (istLeer(t) ? rest : [...rest, t]).sort(ordnung) }
}

type Platz = { spalte: number; zeile: number }

/** Inhalt zweier Plätze tauschen (Ziehen im Editor); ein leerer Platz nimmt die Taste einfach auf */
export function tauscheTasten(s: BedienSeite, von: Platz, nach: Platz): BedienSeite {
  if (von.spalte === nach.spalte && von.zeile === nach.zeile) return s
  const a = tasteAn(s, von.spalte, von.zeile)
  const b = tasteAn(s, nach.spalte, nach.zeile)
  // große Kacheln (OSC) würden sich überlappen – dort tauscht der Editor nicht
  if ([a, b].some((t) => t && (t.breite > 1 || t.hoehe > 1))) return s
  const rest = s.tasten.filter((t) => t !== a && t !== b)
  const neu = [...rest]
  if (a) neu.push({ ...a, ...nach })
  if (b) neu.push({ ...b, ...von })
  return { ...s, tasten: neu.sort(ordnung) }
}

const drin = (t: Taste, spalten: number, zeilen: number): boolean =>
  t.spalte + t.breite <= spalten && t.zeile + t.hoehe <= zeilen

/** So viele belegte Tasten lägen bei diesem Raster außerhalb (für die Rückfrage) */
export function ausserhalb(b: Bedienfeld, spalten: number, zeilen: number): number {
  return b.seiten.reduce((n, s) => n + s.tasten.filter((t) => !drin(t, spalten, zeilen)).length, 0)
}

const klemme = (v: number, max: number, vorgabe: number): number =>
  Number.isFinite(v) ? Math.min(max, Math.max(1, Math.round(v))) : vorgabe

/**
 * Gerät bzw. Raster wechseln: feste Geräte bringen ihr Raster mit, wählbare behalten das bisherige
 * (bzw. das angegebene). Tasten außerhalb fallen weg – vorher fragt der Editor (`ausserhalb`).
 */
export function mitRaster(
  b: Bedienfeld,
  geraet: BedienGeraet,
  wunsch?: { spalten?: number; zeilen?: number }
): Bedienfeld {
  const d = geraetDef(geraet)
  const max = rasterMax(geraet)
  const spalten = d.waehlbar
    ? klemme(wunsch?.spalten ?? b.spalten, max.spalten, d.spalten)
    : d.spalten
  const zeilen = d.waehlbar ? klemme(wunsch?.zeilen ?? b.zeilen, max.zeilen, d.zeilen) : d.zeilen
  return {
    ...b,
    geraet,
    spalten,
    zeilen,
    // das Verhältnis der OSC-Fläche gilt nur, solange es eine OSC-Fläche ist
    flaeche: geraet === 'osc' ? b.flaeche : null,
    seiten: b.seiten.map((s) => ({
      ...s,
      tasten: s.tasten.filter((t) => drin(t, spalten, zeilen))
    }))
  }
}

/** Seite entfernen; Tasten, die dorthin führten, verlieren ihr Ziel (bleiben aber stehen) */
export function seiteEntfernen(b: Bedienfeld, id: string): Bedienfeld {
  if (b.seiten.length <= 1) return b
  return {
    ...b,
    seiten: b.seiten
      .filter((s) => s.id !== id)
      .map((s) => ({
        ...s,
        tasten: s.tasten.map((t) =>
          t.nav?.art === 'seite' && t.nav.ziel === id ? { ...t, nav: null } : t
        )
      }))
  }
}

/** Name einer Seite für Anzeige und Druck: eigener Name, sonst „Seite 2“ */
export function seitenName(b: Bedienfeld, id: string): string {
  const i = b.seiten.findIndex((s) => s.id === id)
  const s = b.seiten[i]
  return s?.name.trim() || (i >= 0 ? `Seite ${i + 1}` : 'Seite')
}

/** Aufschrift einer Navigationstaste ohne eigenen Titel */
export function navTitel(b: Bedienfeld, nav: TastenNav): string {
  if (nav.art === 'weiter') return 'Weiter ▸'
  if (nav.art === 'zurueck') return '◂ Zurück'
  return `▸ ${seitenName(b, nav.ziel)}`
}

/** Was eine Navigationstaste tut – für die Liste unter dem Raster */
export function navText(b: Bedienfeld, nav: TastenNav): string {
  if (nav.art === 'weiter') return 'Nächste Seite'
  if (nav.art === 'zurueck') return 'Vorige Seite bzw. zurück'
  return `Öffnet „${seitenName(b, nav.ziel)}“`
}

/** Zahl der belegten Tasten (Schublade) */
export const belegteTasten = (felder: Bedienfeld[]): number =>
  felder.reduce((n, b) => n + b.seiten.reduce((m, s) => m + s.tasten.length, 0), 0)

/** Beschriftung der Fläche im Kopf des Bedienfelds („Handy hochkant“) */
export function flaecheText(f: BedienFlaeche): string {
  if (f.geraet === 'desktop') return 'Desktop'
  return `${f.geraet === 'handy' ? 'Handy' : 'Tablet'} ${f.quer ? 'quer' : 'hochkant'}`
}

/**
 * Maße zum Zeichnen: die Fläche verkleinert (höchstens `massstab`, höchstens `maxBreite` breit) –
 * Spaltenbreite und Zeilenhöhe behalten ihr Verhältnis, ein Handy-Layout bleibt schmal.
 */
export function flaecheMasse(
  f: BedienFlaeche,
  maxBreite: number,
  massstab: number
): { breite: number; zeile: number; abstand: number } {
  const k = Math.min(massstab, maxBreite / f.breite)
  return {
    breite: Math.round(f.breite * k),
    zeile: Math.max(6, Math.round(f.zeile * k)),
    abstand: Math.max(1, Math.round(f.abstand * k))
  }
}
