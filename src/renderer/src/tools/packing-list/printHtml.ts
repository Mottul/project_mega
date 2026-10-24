// HTML der Packliste fürs PDF – rein (ohne api), damit es ohne Fenster testbar ist.

import { APP_NAME } from '@shared/brand'
import { esc } from '@shared/html'
import type { PackItem } from './store'

export interface PackPdfOptionen {
  /** Reihenfolge der Blöcke wie in der Liste; Kategorien ohne Positionen fallen weg */
  categories: string[]
  /** Farbe je Block (#rrggbb) für die Linie unter dem Titel */
  colors: Record<string, string>
  /** Ein Block, der nicht mehr ganz auf die Seite passt, beginnt auf der nächsten */
  bloeckeZusammen: boolean
  datum: string
}

const HEX = /^#[0-9a-f]{6}$/i

export function packingHtml(projectName: string, items: PackItem[], o: PackPdfOptionen): string {
  // Kategorien in der Reihenfolge der Liste, dazu solche, die nur an Positionen hängen
  const cats = [...new Set([...o.categories, ...items.map((i) => i.category)])].filter((c) =>
    items.some((i) => i.category === c)
  )

  let body = ''
  for (const cat of cats) {
    const rows = items
      .filter((i) => i.category === cat)
      .map(
        (i) =>
          `<tr><td class="chk"></td><td class="q">${i.qty} ${esc(i.unit)}</td><td>${esc(i.name) || '—'}</td><td class="note">${esc(i.note)}</td></tr>`
      )
      .join('')
    const farbe = o.colors[cat]
    const linie = farbe && HEX.test(farbe) ? ` style="border-bottom-color:${farbe}"` : ''
    body += `<section class="block"><h2${linie}>${esc(cat)}</h2><table><thead><tr><th class="chk"></th><th class="q">Menge</th><th>Position</th><th class="note">Notiz</th></tr></thead><tbody>${rows}</tbody></table></section>`
  }
  if (!body) body = '<p style="color:#666">Keine Positionen.</p>'

  // Ein Block länger als eine Seite bricht trotzdem um (Chromium teilt dann doch); die
  // Kopfzeile der Tabelle wiederholt sich auf der neuen Seite
  const zusammen = o.bloeckeZusammen
    ? '.block{break-inside:avoid;page-break-inside:avoid}'
    : 'h2{break-after:avoid;page-break-after:avoid}'

  return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>Packliste${projectName ? ' – ' + esc(projectName) : ''}</title><style>
*{margin:0;padding:0;box-sizing:border-box;print-color-adjust:exact;-webkit-print-color-adjust:exact}
body{font-family:'Segoe UI',system-ui,sans-serif;color:#1a1a1e;padding:20px 24px;font-size:12px}
h1{font-size:20px;margin-bottom:2px}
.meta{color:#666;margin-bottom:14px;font-size:11px}
.block{padding-top:14px}
h2{font-size:13px;margin:0 0 4px;border-bottom:2px solid #eab308;padding-bottom:3px;display:inline-block}
table{border-collapse:collapse;width:100%;margin-bottom:4px}
thead{display:table-header-group}
tr{break-inside:avoid;page-break-inside:avoid}
td,th{border:1px solid #ddd;padding:4px 8px;text-align:left;vertical-align:top}
th{background:#f7f7f7;font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:.4px}
.chk{width:22px}.chk td,td.chk{height:18px}
td.chk::before{content:"";display:block;width:13px;height:13px;border:1.5px solid #999;border-radius:3px;margin:1px auto}
.q{width:74px;white-space:nowrap;font-weight:600}
.note{color:#666;font-size:11px}
${zusammen}
</style></head><body>
<h1>Packliste</h1><div class="meta">${projectName ? 'Projekt: <b>' + esc(projectName) + '</b> · ' : ''}Datum: ${esc(o.datum)} · ${items.length} Positionen</div>
${body}
<div style="margin-top:16px;padding-top:5px;border-top:1px solid #ccc;font-size:9px;color:#999">${APP_NAME} · Packliste · ${esc(o.datum)}</div>
</body></html>`
}
