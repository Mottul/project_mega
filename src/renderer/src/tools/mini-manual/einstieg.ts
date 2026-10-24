// Geführter Einstieg (Bedienbarkeit): Wann eine Anleitung noch „frisch“ ist – dann bietet die
// Oberfläche den Einstieg an – und welche Kapitel zu dem passen, was darin eingetragen wurde. Rein.

import type { Anleitung, KapitelId } from './model'

/** Noch nichts Eigenes eingetragen: kein Projekt, keine Geräte, keine Wand, kein Kontakt */
export function istFrisch(a: Anleitung): boolean {
  return (
    !a.deckblatt.projekt.trim() &&
    !a.deckblatt.kunde.trim() &&
    !a.geraete.length &&
    !a.ledWall &&
    !a.kontakte.length &&
    !a.bedienfelder.length
  )
}

/**
 * Kapitel, die sich aus dem Eingetragenen ableiten lassen – nur dort, wo es einen Hinweis gibt;
 * alles andere bleibt, wie es ist. Ohne Wand fallen LED-Wall und Verkabelung weg (sie zeigten nur
 * „noch keine Planung“).
 */
export function kapitelVorschlag(a: Anleitung): Partial<Record<KapitelId, boolean>> {
  const wand = !!a.ledWall?.waende.length
  const rolle = (r: string): boolean => a.geraete.some((g) => g.rolle === r)
  const v: Partial<Record<KapitelId, boolean>> = { ledWall: wand, verkabelung: wand }
  if (rolle('bedienfeld') || a.bedienfelder.length) v.bedienfeld = true
  if (rolle('zuspieler')) v.software = true
  return v
}

export function mitKapitelVorschlag(a: Anleitung): Anleitung {
  const v = kapitelVorschlag(a)
  return {
    ...a,
    kapitel: a.kapitel.map((k) => (k.id in v ? { ...k, an: !!v[k.id] } : k))
  }
}
