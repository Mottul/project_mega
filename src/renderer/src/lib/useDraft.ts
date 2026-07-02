// Lokaler Eingabepuffer für Felder, die einen externen Wert spiegeln.
// Kern-Regel: der externe Wert wird NUR übernommen, wenn das Feld nicht
// fokussiert ist – sonst überschreibt ein Hintergrund-Update (Timer-Tick,
// OSC-Feedback, Re-Render) die laufende Eingabe und das Feld „klemmt".
// Diese Logik war zuvor in 7 Feld-Komponenten kopiert (und in mehreren davon
// fehlerhaft ohne Fokus-Schutz); hier liegt sie einmal zentral.

import { useEffect, useRef, useState, type RefObject } from 'react'

export function useDraft(external: string): {
  /** Muss als ref an das <input> gehen (Fokus-Erkennung). */
  ref: RefObject<HTMLInputElement>
  text: string
  setText: (t: string) => void
} {
  const ref = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(external)
  useEffect(() => {
    if (document.activeElement !== ref.current) setText(external)
  }, [external])
  return { ref, text, setText }
}
