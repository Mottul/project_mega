// Werkzeugsuche des Startbildschirms – rein, damit ein Test über die Registry prüfen kann, dass
// gekürzte Beschreibungen nichts unauffindbar machen (ihre Begriffe stehen dann in `keywords`).

import type { ToolModule } from '@renderer/tools/types'

/** Trifft jedes Wort der Suche auf Name, Beschreibung oder Stichworte? Leere Suche trifft alles. */
export function matches(tool: ToolModule, q: string): boolean {
  if (!q) return true
  const hay = [tool.name, tool.description, ...(tool.keywords ?? [])].join(' ').toLowerCase()
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((term) => hay.includes(term))
}
