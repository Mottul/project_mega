// Lokaler Eingabepuffer für Felder, die einen externen Wert spiegeln.
// Kern-Regel: der externe Wert wird NUR übernommen, wenn das Feld nicht
// fokussiert ist – sonst überschreibt ein Hintergrund-Update (Timer-Tick,
// OSC-Feedback, Re-Render) die laufende Eingabe und das Feld „klemmt".
// Diese Logik war zuvor in 7 Feld-Komponenten kopiert (und in mehreren davon
// fehlerhaft ohne Fokus-Schutz); hier liegt sie einmal zentral.
// Für <input> und <textarea> (Typ-Parameter; Vorgabe: <input>).

import { useEffect, useRef, useState, type RefObject } from 'react'

export function useDraft<E extends HTMLElement = HTMLInputElement>(
  external: string
): {
  /** Muss als ref an das Feld gehen (Fokus-Erkennung). */
  ref: RefObject<E>
  text: string
  setText: (t: string) => void
} {
  const ref = useRef<E>(null)
  const [text, setText] = useState(external)
  useEffect(() => {
    if (document.activeElement !== ref.current) setText(external)
  }, [external])
  return { ref, text, setText }
}
