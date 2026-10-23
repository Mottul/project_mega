// Bedienfelder (Plan Mini-Manual, Abschnitt „Bedienfelder“): Raster je Gerät, Tasten setzen,
// tauschen, Seiten und Raster ändern – rein und getestet. Die Importe (Stream Deck, Companion)
// füllen später dasselbe Modell; danach bleibt alles im Editor änderbar.

import {
  uid,
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
  { value: 'frei', label: 'Freies Raster', spalten: 5, zeilen: 3, waehlbar: true }
]

/** Grenzen eines wählbaren Rasters (Companion kann mehr, eine Druckseite nicht) */
export const RASTER_MAX = { spalten: 16, zeilen: 12 } as const

export const geraetDef = (g: BedienGeraet): GeraetDef =>
  BEDIEN_GERAETE.find((x) => x.value === g) ?? BEDIEN_GERAETE[0]

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
    seiten: [neueSeite()]
  }
}

export function leereTaste(spalte: number, zeile: number): Taste {
  return {
    spalte,
    zeile,
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
  const rest = s.tasten.filter((t) => t !== a && t !== b)
  const neu = [...rest]
  if (a) neu.push({ ...a, ...nach })
  if (b) neu.push({ ...b, ...von })
  return { ...s, tasten: neu.sort(ordnung) }
}

const drin = (t: Taste, spalten: number, zeilen: number): boolean =>
  t.spalte < spalten && t.zeile < zeilen

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
  const spalten = d.waehlbar
    ? klemme(wunsch?.spalten ?? b.spalten, RASTER_MAX.spalten, d.spalten)
    : d.spalten
  const zeilen = d.waehlbar
    ? klemme(wunsch?.zeilen ?? b.zeilen, RASTER_MAX.zeilen, d.zeilen)
    : d.zeilen
  return {
    ...b,
    geraet,
    spalten,
    zeilen,
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
