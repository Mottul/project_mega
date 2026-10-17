// Kleines Auszeichnungs-Subset für Texte der Anleitung (kein WYSIWYG, keine Bibliothek):
//   Leerzeile = neuer Absatz · „- “ Aufzählung · „1. “ nummeriert · „> “ Hinweisbox · **fett**
//   {quelle.feld} Platzhalter
// Erst wird ALLES escaped, dann werden nur diese Auszeichnungen umgesetzt – fremder Text aus
// einer Projektdatei kann so nie HTML einschleusen.

import { esc } from '@shared/html'
import { PLATZHALTER_RE, type PlatzhalterWerte } from './platzhalter'

export interface MarkupOptionen {
  werte: PlatzhalterWerte
  /** Vorschau: leere Platzhalter sichtbar markieren; Druck: Linie zum Ausfüllen */
  modus: 'vorschau' | 'druck'
}

/** Eine Zeile: escapen, **fett**, Platzhalter (eingesetzte Werte hervorgehoben: Klasse ph) */
export function inline(text: string, o: MarkupOptionen): string {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(PLATZHALTER_RE, (all, q: string, f: string) => {
      const v = o.werte.get(`${q}.${f}`)
      if (v !== undefined) return `<span class="ph">${esc(v)}</span>`
      return o.modus === 'vorschau'
        ? `<span class="ph-leer" title="Platzhalter ohne Wert">${all}</span>`
        : '<span class="ph-linie"></span>'
    })
}

type Art = 'p' | 'ul' | 'ol'

function art(line: string): { art: Art | null; text: string } {
  if (!line.trim()) return { art: null, text: '' }
  let m = /^\s*[-*•]\s+(.*)$/.exec(line)
  if (m) return { art: 'ul', text: m[1] }
  m = /^\s*\d{1,3}[.)]\s+(.*)$/.exec(line)
  if (m) return { art: 'ol', text: m[1] }
  return { art: 'p', text: line.trim() }
}

/** Zeilen als Absätze und Listen; gleiche Art hintereinander wird ein Block */
function bloecke(lines: string[], o: MarkupOptionen): string {
  const groups: { art: Art; lines: string[] }[] = []
  for (const raw of lines) {
    const l = art(raw)
    if (!l.art) {
      groups.push({ art: 'p', lines: [] }) // Trenner: nächste Zeile beginnt einen neuen Block
      continue
    }
    const last = groups[groups.length - 1]
    if (last && last.art === l.art && last.lines.length) last.lines.push(l.text)
    else groups.push({ art: l.art, lines: [l.text] })
  }
  return groups
    .filter((g) => g.lines.length)
    .map((g) => {
      const items = g.lines.map((l) => inline(l, o))
      switch (g.art) {
        case 'ul':
          return `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`
        case 'ol':
          return `<ol>${items.map((i) => `<li>${i}</li>`).join('')}</ol>`
        default:
          return `<p>${items.join('<br>')}</p>`
      }
    })
    .join('')
}

/**
 * Mehrzeiliger Text als HTML-Blöcke. Ein Hinweis beginnt mit „> “ und reicht bis zur nächsten
 * Leerzeile – darin gelten Absätze und Listen wie sonst („> - Punkt“ oder „- Punkt“ direkt
 * darunter). Früher endete er an der ersten Zeile ohne „>“, und „> - Punkt“ blieb Text.
 */
export function markup(text: string, o: MarkupOptionen): string {
  const out: string[] = []
  let normal: string[] = []
  let hinweis: string[] | null = null
  const fertig = (): void => {
    if (normal.length) out.push(bloecke(normal, o))
    if (hinweis) out.push(`<div class="hinweis">${bloecke(hinweis, o)}</div>`)
    normal = []
    hinweis = null
  }
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) {
      fertig()
      continue
    }
    const m = /^\s*>\s?(.*)$/.exec(raw)
    if (m && !hinweis) fertig() // Text davor bleibt außerhalb des Hinweises
    if (m) (hinweis ??= []).push(m[1])
    else if (hinweis) hinweis.push(raw)
    else normal.push(raw)
  }
  fertig()
  return out.join('')
}
