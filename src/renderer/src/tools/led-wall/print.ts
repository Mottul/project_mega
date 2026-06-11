// Baut die druckfertige Projektdoku (helles, selbständiges HTML) und exportiert
// sie über den main-Prozess als PDF (window.open ist app-weit verboten).

import { api } from '@renderer/lib/api'
import { PWR_COLORS, SIG_COLORS, type LedModule } from './data'
import type { Fit169 } from './math'

export interface PrintData {
  mod: LedModule
  projectName: string
  customerName: string
  buildMode: 'stacked' | 'flying'
  cols: number
  rows: number
  total: number
  actualW: string
  actualH: string
  resX: number
  resY: number
  ratioW: number
  ratioH: number
  fit169: Fit169 | null
  weightKg: string
  powerTypW: number
  powerMaxW: number
  ampsTyp: string
  ampsMax: string
  baseUnits: number
  ballastPerBase: number
  totalBallast: number
  sig: number[][]
  pwr: number[][]
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function gridSvg(assign: number[][], colors: string[], prefix: string, cols: number, rows: number, px: number): string {
  const gap = 2
  const pad = 4
  const sw = cols * (px + gap) - gap + pad * 2
  const sh = rows * (px + gap) - gap + pad * 2
  let s = `<svg viewBox="0 0 ${sw} ${sh}" width="${sw}" height="${sh}" xmlns="http://www.w3.org/2000/svg">`
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = assign[r]?.[c] ?? -1
      const x = pad + c * (px + gap)
      const y = pad + r * (px + gap)
      const col = v >= 0 ? colors[v % colors.length] : '#ddd'
      s += `<rect x="${x}" y="${y}" width="${px}" height="${px}" rx="2" fill="${v >= 0 ? col + '30' : '#f5f5f5'}" stroke="${col}" stroke-width="1"/>`
      if (v >= 0)
        s += `<text x="${x + px / 2}" y="${y + px / 2 + 1}" text-anchor="middle" dominant-baseline="central" fill="${col}" font-size="${Math.max(7, Math.floor(px / 2.8))}" font-weight="700" font-family="system-ui">${prefix}${v + 1}</text>`
    }
  }
  return s + '</svg>'
}

function legend(assign: number[][], colors: string[], prefix: string): string {
  const used = new Set<number>()
  for (const row of assign) for (const v of row) if (v >= 0) used.add(v)
  return [...used]
    .sort((a, b) => a - b)
    .map((ci) => {
      const count = assign.flat().filter((v) => v === ci).length
      return `<span style="display:inline-flex;align-items:center;gap:3px;margin-right:7px;font-size:10px"><span class="cdot" style="background:${colors[ci % colors.length]}"></span><b>${prefix}${ci + 1}</b> ${count} Mod.</span>`
    })
    .join('')
}

export async function exportLedWallPdf(d: PrintData): Promise<string | null> {
  const dt = new Date().toLocaleDateString('de-AT')
  const pn = esc(d.projectName)
  const cn = esc(d.customerName)

  let html = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>LEDWall${pn ? ' – ' + pn : ''}</title><style>
*{margin:0;padding:0;box-sizing:border-box;print-color-adjust:exact;-webkit-print-color-adjust:exact}
body{font-family:'Segoe UI',system-ui,sans-serif;color:#1a1a1e;padding:18px 22px;font-size:12px}
h1{font-size:20px;margin-bottom:2px}
h2{font-size:13px;margin:12px 0 5px;border-bottom:2px solid #eab308;padding-bottom:3px;display:inline-block}
.meta{color:#666;margin-bottom:12px;font-size:11px}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:14px}.g1{display:grid;grid-template-columns:1fr;gap:14px}
table{border-collapse:collapse;width:100%;margin-bottom:6px}
td,th{border:1px solid #ddd;padding:3px 7px;font-size:11px;text-align:left}
th{background:#f7f7f7;font-weight:600;width:44%}
.bar{background:#fdf6dd;padding:5px 9px;border-radius:4px;border-left:3px solid #eab308;font-size:11px;margin:5px 0}
.cdot{width:9px;height:9px;border-radius:2px;display:inline-block}
</style></head><body>`

  html += `<h1>LEDWall Konfiguration</h1><div class="meta">${pn ? `Projekt: <b>${pn}</b> · ` : ''}${cn ? `Kunde: <b>${cn}</b> · ` : ''}Datum: ${dt} · Modul: <b>${esc(d.mod.name)}</b> · Aufbau: <b>${d.buildMode === 'stacked' ? 'Ground-Stack (LSU)' : 'Fliegend (Traverse)'}</b></div>`

  html += `<div class="g2"><div><h2>Wandkonfiguration</h2><table>
<tr><th>Modul</th><td>${esc(d.mod.name)} (PP ${d.mod.pitch} mm, ${d.mod.ip})</td></tr>
<tr><th>Wandgröße</th><td>${d.actualW} × ${d.actualH} m</td></tr>
<tr><th>Module</th><td>${d.cols} × ${d.rows} = ${d.total} Stk.</td></tr>
<tr><th>Auflösung</th><td>${d.resX} × ${d.resY} px (${d.ratioW}:${d.ratioH})</td></tr></table>`
  if (d.fit169) {
    if (d.fit169.match) html += `<div class="bar">16:9-Content passt exakt.</div>`
    else
      html += `<div class="bar">16:9: ${d.fit169.barPx} px Rand ${d.fit169.side === 'lr' ? 'links/rechts' : 'oben/unten'} (Nutzfläche ${d.fit169.cw}×${d.fit169.ch} px)</div>`
  }
  html += `</div><div><h2>Technische Daten</h2><table>
<tr><th>Gewicht</th><td>${d.weightKg} kg</td></tr>
<tr><th>Leistung (typ.)</th><td>${d.powerTypW} W (${d.ampsTyp} A)</td></tr>
<tr><th>Leistung (max.)</th><td>${d.powerMaxW} W (${d.ampsMax} A)</td></tr>
<tr><th>Helligkeit</th><td>${d.mod.brightness} nit</td></tr>
<tr><th>Kontrast</th><td>&gt; ${d.mod.contrast}</td></tr>
<tr><th>Tiefe</th><td>${d.mod.dimD} mm</td></tr></table>`
  if (d.buildMode === 'stacked')
    html += `<div class="bar"><b>Ground-Stack:</b> ${d.baseUnits} Standfüße × ${d.ballastPerBase} kg = <b>${d.totalBallast} kg Ballast</b></div>`
  else html += `<div class="bar"><b>Fliegend:</b> Gesamtgewicht ${d.weightKg} kg an Traverse</div>`
  html += `</div></div>`

  const printPx = d.cols > 16 ? 20 : d.cols > 12 ? 24 : 28
  const gridClass = d.cols > 16 ? 'g1' : 'g2'
  html += `<div class="${gridClass}"><div><h2>Signalverkabelung</h2><div style="margin-bottom:4px">${legend(d.sig, SIG_COLORS, 'S')}</div>${gridSvg(d.sig, SIG_COLORS, 'S', d.cols, d.rows, printPx)}</div>`
  html += `<div><h2>Stromverkabelung</h2><div style="margin-bottom:4px">${legend(d.pwr, PWR_COLORS, 'P')}</div>${gridSvg(d.pwr, PWR_COLORS, 'P', d.cols, d.rows, printPx)}</div></div>`
  html += `<div style="margin-top:14px;padding-top:5px;border-top:1px solid #ccc;font-size:9px;color:#999">AV Toolbox · LED-Wall-Konfigurator · ${dt}</div></body></html>`

  const safe = d.projectName.replace(/[^\wäöüÄÖÜß -]+/g, '').trim()
  return api.util.exportPdf(html, `LEDWall${safe ? '-' + safe : ''}.pdf`)
}
