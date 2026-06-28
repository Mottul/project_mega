// Packliste als druckfertiges PDF (helle Tabelle mit Ankreuzkästchen), gruppiert
// nach Kategorie. Nutzt den gemeinsamen util:exportPdf-Kanal.

import { api } from '@renderer/lib/api'
import type { PackItem } from './store'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export async function exportPackingPdf(
  projectName: string,
  items: PackItem[]
): Promise<string | null> {
  const dt = new Date().toLocaleDateString('de-AT')
  const cats = [...new Set(items.map((i) => i.category))]

  let body = ''
  for (const cat of cats) {
    const rows = items
      .filter((i) => i.category === cat)
      .map(
        (i) =>
          `<tr><td class="chk"></td><td class="q">${i.qty} ${esc(i.unit)}</td><td>${esc(i.name) || '—'}</td><td class="note">${esc(i.note)}</td></tr>`
      )
      .join('')
    body += `<h2>${esc(cat)}</h2><table><thead><tr><th class="chk"></th><th class="q">Menge</th><th>Position</th><th class="note">Notiz</th></tr></thead><tbody>${rows}</tbody></table>`
  }
  if (!body) body = '<p style="color:#666">Keine Positionen.</p>'

  const html = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>Packliste${projectName ? ' – ' + esc(projectName) : ''}</title><style>
*{margin:0;padding:0;box-sizing:border-box;print-color-adjust:exact;-webkit-print-color-adjust:exact}
body{font-family:'Segoe UI',system-ui,sans-serif;color:#1a1a1e;padding:20px 24px;font-size:12px}
h1{font-size:20px;margin-bottom:2px}
.meta{color:#666;margin-bottom:14px;font-size:11px}
h2{font-size:13px;margin:14px 0 4px;border-bottom:2px solid #eab308;padding-bottom:3px;display:inline-block}
table{border-collapse:collapse;width:100%;margin-bottom:4px}
td,th{border:1px solid #ddd;padding:4px 8px;text-align:left;vertical-align:top}
th{background:#f7f7f7;font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:.4px}
.chk{width:22px}.chk td,td.chk{height:18px}
td.chk::before{content:"";display:block;width:13px;height:13px;border:1.5px solid #999;border-radius:3px;margin:1px auto}
.q{width:74px;white-space:nowrap;font-weight:600}
.note{color:#666;font-size:11px}
</style></head><body>
<h1>Packliste</h1><div class="meta">${projectName ? 'Projekt: <b>' + esc(projectName) + '</b> · ' : ''}Datum: ${dt} · ${items.length} Positionen</div>
${body}
<div style="margin-top:16px;padding-top:5px;border-top:1px solid #ccc;font-size:9px;color:#999">MegaToolBox · Packliste · ${dt}</div>
</body></html>`

  const safe = projectName.replace(/[^\wäöüÄÖÜß -]+/g, '').trim()
  return api.util.exportPdf(html, `Packliste${safe ? '-' + safe : ''}.pdf`)
}
