// „Was ist neu“ in der Rechner-PWA: was sich für Anwender geändert hat, neuester Tag zuerst.
// Jede sichtbare Änderung an der Handy-App bekommt hier im selben Pull Request einen Eintrag
// (Skill rechner-pwa): Datum = Tag der Veröffentlichung (Merge auf main), kurze Sätze mit „du“,
// ohne Paket-Kennungen und Dateinamen – die liest ein Kollege am Handy, nicht der Plan. Was die
// PWA nur unsichtbar ändert, braucht keinen Eintrag (die Version ändert sich trotzdem).
// Gemerkt wird nur, bis zu welchem Tag man die Liste gesehen hat (Punkt an „Was ist neu“).
import type { Codec } from '@renderer/lib/usePersistentState'

export interface Neuigkeit {
  /** Tag der Veröffentlichung, JJJJ-MM-TT */
  datum: string
  /** Was neu ist, je ein kurzer Satz */
  punkte: string[]
}

export const NEUIGKEITEN: Neuigkeit[] = [
  {
    datum: '2026-11-27',
    punkte: [
      'Unten auf der Startseite steht die Version. Nach „Neu laden“ siehst du dort, dass die neue läuft.',
      '„Was ist neu“ zeigt, was sich an der App geändert hat.',
      'Auf dem iPhone steht die Kopfzeile ganz unter der Statusleiste, „Neu laden“ lässt sich wieder antippen.'
    ]
  },
  {
    datum: '2026-11-26',
    punkte: [
      'Alle Rechner merken sich deine Eingaben. „Zurücksetzen“ unter den Karten holt die Beispielwerte zurück.',
      'Rigging, Kameraobjektiv, Timecode, Beamer-Lumen, Audio-Delay und Projektion passen aufs Handy: Zugeklappte Karten nennen ihr Ergebnis.',
      'Einstellungen wählst du per Knopf statt aus einer Liste, auch in den Karten des RTA.'
    ]
  },
  {
    datum: '2026-11-24',
    punkte: [
      'Stromlast: „Max. Geräte“ steht über den Feldern, Anschluss, Absicherung und Auslastung wählst du per Knopf.'
    ]
  },
  {
    datum: '2026-11-16',
    punkte: [
      'Felder, mit denen nicht gerechnet werden kann, sind rot umrandet. Kein Rechner ersetzt mehr still einen Wert.',
      'Timecode tippst du nur mit Ziffern, die Temperatur im Audio-Delay auch mit Minus.',
      'Stromlast am Drehstrom: „Geräte pro Stromkreis“ zählt je Außenleiter.',
      'DMX-Dip-Schalter: Die Adresse ist die Summe der eingeschalteten Schalter, wie an den Geräten.'
    ]
  },
  {
    datum: '2026-11-13',
    punkte: ['Neu: der Testtongenerator – Sinus, Rauschen, Sweep, Metronom und Kanaltest.']
  },
  {
    datum: '2026-11-06',
    punkte: [
      'Die App heißt „MottulBox“.',
      'Mit dem Stern heftest du Werkzeuge oben an, „Ordnen“ stellt ihre Reihenfolge ein.'
    ]
  }
]

/** Gesehen bis zu diesem Tag (JJJJ-MM-TT); „“ = noch nie geöffnet */
export const GESEHEN_KEY = 'pwa:neuigkeiten-gesehen'

const DATUM = /^\d{4}-\d{2}-\d{2}$/

export const gesehenCodec: Codec<string> = {
  parse: (raw) => (DATUM.test(raw) ? raw : null),
  format: (d) => d
}

/** Tag des neuesten Eintrags */
export function neuesterTag(liste: Neuigkeit[] = NEUIGKEITEN): string {
  return liste[0]?.datum ?? ''
}

/**
 * Gibt es Neues seit dem letzten Blick? Wer die Liste noch nie gesehen hat, bekommt keinen
 * Punkt – beim ersten Start ist alles neu, ein Punkt sagte dann nichts.
 */
export function hatNeues(gesehen: string, liste: Neuigkeit[] = NEUIGKEITEN): boolean {
  return gesehen !== '' && gesehen < neuesterTag(liste)
}

const MONATE = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember'
]

/** „2026-11-27“ -> „27.11.2026“ (von Hand zerlegt: new Date() läse den Tag als UTC) */
export function tagKurz(datum: string): string {
  const [j, m, t] = datum.split('-')
  return `${t}.${m}.${j}`
}

/** „2026-11-27“ -> „27. November 2026“ */
export function tagLang(datum: string): string {
  const [j, m, t] = datum.split('-')
  return `${Number(t)}. ${MONATE[Number(m) - 1]} ${j}`
}
