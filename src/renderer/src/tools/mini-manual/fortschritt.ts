// „Was fehlt noch“ (Schublade): wenige Meilensteine statt langer Listen – Projekt, LED-Wall, Geräte,
// Ein-/Ausschalten, Fehlersuche, Kontakt, Platzhalter, Fehler der Prüfung. Jeder führt mit einem
// Klick an die Stelle, an der er sich erledigen lässt. Abgewählte Kapitel zählen nicht. Rein.

import type { Anleitung, KapitelId } from './model'
import type { PruefPunkt } from './pruefung'

export interface Meilenstein {
  id: string
  /** erledigt: was geschafft ist; offen: was zu tun ist */
  text: string
  erledigt: boolean
  ziel: KapitelId | 'deckblatt'
}

export function fortschritt(a: Anleitung, punkte: PruefPunkt[]): Meilenstein[] {
  const an = (id: KapitelId): boolean => !!a.kapitel.find((k) => k.id === id)?.an
  const einAus = a.kapitel.find((k) => k.id === 'einAus')
  const platzhalter = punkte.find((p) => /Platzhalter \{[^}]+\} ohne Wert/.test(p.text))
  // der fehlende Kontakt hat einen eigenen Meilenstein
  const fehler = punkte.find((p) => p.schwere === 'fehler' && p.kapitel !== 'kontakt')
  const alle: (Meilenstein & { gilt: boolean })[] = [
    {
      id: 'projekt',
      gilt: true,
      erledigt: !!a.deckblatt.projekt.trim(),
      text: a.deckblatt.projekt.trim() ? 'Projekt benannt' : 'Projekt benennen',
      ziel: 'deckblatt'
    },
    {
      id: 'ledwall',
      gilt: an('ledWall'),
      erledigt: !!a.ledWall?.waende.length,
      text: a.ledWall?.waende.length ? 'LED-Wall übernommen' : 'LED-Wall übernehmen',
      ziel: 'ledWall'
    },
    {
      id: 'geraete',
      gilt: an('geraete'),
      erledigt: a.geraete.length > 0,
      text: a.geraete.length ? 'Geräte eingetragen' : 'Geräte eintragen',
      ziel: 'geraete'
    },
    {
      id: 'einAus',
      gilt: an('einAus'),
      erledigt: !!einAus?.bloecke.some(
        (b) => b.typ === 'schritte' && b.schritte.some((s) => s.text.trim())
      ),
      text: 'Schritte zum Ein- und Ausschalten',
      ziel: 'einAus'
    },
    {
      id: 'fehlersuche',
      gilt: an('fehlersuche'),
      erledigt: a.fehlerfaelle.length > 0,
      text: a.fehlerfaelle.length ? 'Fehlerfälle gewählt' : 'Fehlerfälle wählen',
      ziel: 'fehlersuche'
    },
    {
      id: 'kontakt',
      gilt: an('kontakt'),
      erledigt: a.kontakte.length > 0,
      text: a.kontakte.length ? 'Kontakt gewählt' : 'Kontakt wählen',
      ziel: 'kontakt'
    },
    {
      id: 'platzhalter',
      gilt: true,
      erledigt: !platzhalter,
      text: platzhalter ? platzhalter.text : 'Platzhalter gefüllt',
      ziel: platzhalter?.kapitel ?? 'deckblatt'
    },
    {
      id: 'pruefung',
      gilt: true,
      erledigt: !fehler,
      text: fehler ? fehler.text : 'Keine Fehler in der Prüfung',
      ziel: fehler?.kapitel ?? 'deckblatt'
    }
  ]
  return alle.filter((m) => m.gilt).map(({ gilt: _gilt, ...m }) => m)
}
