// Tastatur der Seite „Mischen“: 1–9 Vorschau, Umschalt + 1–9 Programm, Leertaste Cut, Eingabe Auto.
// Über den Code der Taste, nicht das Zeichen: Umschalt + 1 ist auf der deutschen Tastatur „!“.
// Rein -> testbar.

export type TastenAktion =
  { art: 'vorschau' | 'programm'; index: number } | { art: 'cut' } | { art: 'auto' }

export interface Taste {
  code: string
  shiftKey: boolean
  ctrlKey: boolean
  altKey: boolean
  metaKey: boolean
  repeat: boolean
}

export function tasteZuAktion(t: Taste): TastenAktion | null {
  // Gehaltene Taste nie wiederholen: Das wären mehrere Schnitte auf Sendung
  if (t.repeat || t.ctrlKey || t.altKey || t.metaKey) return null
  const ziffer = /^(?:Digit|Numpad)([1-9])$/.exec(t.code)
  if (ziffer) {
    return { art: t.shiftKey ? 'programm' : 'vorschau', index: Number(ziffer[1]) - 1 }
  }
  if (t.shiftKey) return null
  if (t.code === 'Space') return { art: 'cut' }
  if (t.code === 'Enter' || t.code === 'NumpadEnter') return { art: 'auto' }
  return null
}

/**
 * Gilt die Taste für den Mischer? Nie in Textfeldern und Auswahllisten, und ein per Tab
 * angesteuerter Knopf außerhalb der Mischfläche behält seine Bedeutung: Eingabe auf „Verbinden“
 * ist kein Auto. Den Fokus nach einem Mausklick räumt AtemControl weg.
 */
export function tasteGiltFuerMischer(ziel: Element | null, flaeche: Element | null): boolean {
  if (!ziel) return true
  if (ziel.closest('input, textarea, select, [contenteditable="true"]')) {
    return false
  }
  if (!ziel.closest('button, a, summary, [role="button"]')) return true
  return flaeche?.contains(ziel) ?? false
}
