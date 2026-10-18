// Baut die druckfertige Projektdoku (helles, selbständiges HTML) – rein, ohne api, getestet
// (printHtml.test.ts). Den PDF-Export über den main-Prozess macht print.ts.

import { APP_NAME } from '@shared/brand'
import { esc } from '@shared/html'
import { chainCounts, chainRoutes, routeSvg } from './cabling'
import type { ChainRoute, SigChainMeta } from './config'
import { amps, circuitLabel, PHASES, type PowerAnalysis } from './power'
import type { GroupLoad } from './processors'
import { PWR_COLORS, SIG_COLORS, type LedModule } from './data'
import type { Fit169 } from './math'

export interface PrintData {
  mod: LedModule
  projectName: string
  customerName: string
  /** nur bei mehreren Wänden: Name der gedruckten Wand */
  wallName?: string
  /** Kennung der gedruckten Wand (für „B“ und die Tabelle bei geteiltem Prozessor) */
  wallId?: string
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
  /** Verlauf je Kette (Startecke/Richtung oder gezeichnet) – Pfeile im Plan */
  sigMeta: Record<string, SigChainMeta>
  pwrMeta: Record<string, ChainRoute>
  /** Pläne von hinten gesehen (gespiegelt, groß beschriftet) */
  rear: boolean
  /** Prozessor, Ports und Lasten der Signalketten (processors.ts) – fehlt = ohne Tabelle */
  signal?: GroupLoad
  /** Lasten, Kreise und Phasen der Stromketten (power.ts) – fehlt = ohne Tabelle */
  power?: PowerAnalysis
  landscape: boolean
  curve: {
    modeLabel: string
    mods: number
    angles: number[]
    footprintW: number
    footprintD: number
    svg: string // fertiges SVG-Markup der Draufsicht
  } | null
}

/**
 * Plan als SVG: Module mit Kettennummer, darüber die Pfeile des Verlaufs (cabling.ts, dieselbe
 * Quelle wie am Bildschirm). Von hinten gespiegelt; die Spaltennummern stehen dann oben, damit
 * man am Modul abzählen kann.
 */
function gridSvg(
  assign: number[][],
  meta: Record<string, ChainRoute>,
  colors: string[],
  prefix: string,
  cols: number,
  rows: number,
  px: number,
  mirror: boolean,
  backups?: Set<number>
): string {
  const gap = 2
  const pad = 4
  const head = mirror ? 12 : 0
  const sw = cols * (px + gap) - gap + pad * 2
  const sh = rows * (px + gap) - gap + pad * 2 + head
  const x0 = pad
  const y0 = pad + head
  let s = `<svg viewBox="0 0 ${sw} ${sh}" width="${sw}" height="${sh}" xmlns="http://www.w3.org/2000/svg">`
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = assign[r]?.[c] ?? -1
      const x = x0 + (mirror ? cols - 1 - c : c) * (px + gap)
      const y = y0 + r * (px + gap)
      const col = v >= 0 ? colors[v % colors.length] : '#ddd'
      s += `<rect x="${x}" y="${y}" width="${px}" height="${px}" rx="2" fill="${v >= 0 ? col + '30' : '#f5f5f5'}" stroke="${col}" stroke-width="1"/>`
      if (v >= 0)
        s += `<text x="${x + px / 2}" y="${y + px / 2 + 1}" text-anchor="middle" dominant-baseline="central" fill="${col}" font-size="${Math.max(7, Math.floor(px / 2.8))}" font-weight="700" font-family="system-ui">${prefix}${v + 1}</text>`
      if (mirror && r === 0)
        s += `<text x="${x + px / 2}" y="${pad + 8}" text-anchor="middle" fill="#888" font-size="8" font-family="system-ui">${c + 1}</text>`
    }
  }
  s += routeSvg(chainRoutes(assign, meta), {
    cell: px,
    gap,
    x0,
    y0,
    cols,
    colors,
    id: `pdf-${prefix}`,
    mirror,
    backups
  })
  return s + '</svg>'
}

const num = (n: number): string => n.toLocaleString('de-DE')

/** Prozessor, Ports und Last je Signalkette – mit den Warnungen (keine Sperre) */
function signalTable(g: GroupLoad, wallId: string | undefined): string {
  const p = g.processor
  const several = g.walls.length > 1
  const rows = g.walls
    .flatMap((w) =>
      w.chains.map(
        (c) =>
          `<tr${c.over ? ' style="color:#b91c1c;font-weight:700"' : ''}><td>${several ? `${esc(w.wallName)} ` : ''}S${c.chain + 1}${w.wallId === wallId || !several ? '' : ' (andere Wand)'}</td><td>${c.modules}</td><td>${num(c.px)}</td><td>${c.port}${c.backupPort !== null ? ` · Backup ${c.backupPort}` : ''}</td></tr>`
      )
    )
    .join('')
  const head = `${esc(p.name)}${several ? ' (geteilt)' : ''} · ${p.bitDepth} bit · ${p.hz} Hz · Ports ${g.portsUsed}${p.ports ? ` von ${p.ports}` : ''}${p.portPx ? ` · je Port höchstens ${num(p.portPx)} px${p.limitBy === 'karte' ? ` (Karte ${esc(p.card ?? '')})` : ''}` : ''}`
  const warn = g.warnings
    .filter((w) => w.level !== 'info')
    .map((w) => `<div class="bar" style="border-left-color:#b91c1c">${esc(w.text)}</div>`)
    .join('')
  return `<h2>Signal: Prozessor und Ports</h2><div style="font-size:11px;margin-bottom:4px">${head}</div>${rows ? `<table><tr><th style="width:auto">Kette</th><th style="width:auto">Module</th><th style="width:auto">Pixel</th><th style="width:auto">Port</th></tr>${rows}</table>` : ''}${warn}`
}

/** Strom: Netz, je Kette Last, Kreis und Phase (Vorschlag in Klammern), Phasen, Warnungen */
function powerTable(p: PowerAnalysis): string {
  const rows = p.chains
    .map(
      (c) =>
        `<tr${c.over ? ' style="color:#b91c1c;font-weight:700"' : ''}><td>P${c.chain + 1}</td><td>${c.modules}</td><td>${amps(c.amps)} A</td><td>${esc(circuitLabel(c))}</td></tr>`
    )
    .join('')
  const head = `Netz ${p.voltage} V · Absicherung ${p.breakerA} A je Kreis${p.maxModules ? ` · höchstens ${p.maxModules} Module je Kreis (Maximalleistung)` : ''} · Phasen: ${PHASES.map((ph) => `${ph} ${amps(p.phases[ph])} A`).join(' · ')}`
  const warn = p.warnings
    .filter((w) => w.level !== 'info')
    .map((w) => `<div class="bar" style="border-left-color:#b91c1c">${esc(w.text)}</div>`)
    .join('')
  const auto = p.chains.some((c) => c.phaseAuto)
    ? '<div style="font-size:9px;color:#777;margin-top:2px">Phase in Klammern: Vorschlag, nicht festgelegt.</div>'
    : ''
  return `<h2>Strom: Kreise und Phasen</h2><div style="font-size:11px;margin-bottom:4px">${head}</div><table><tr><th style="width:auto">Kette</th><th style="width:auto">Module</th><th style="width:auto">Strom (max.)</th><th style="width:auto">Kreis · Phase</th></tr>${rows}</table>${auto}${warn}`
}

function legend(assign: number[][], colors: string[], prefix: string): string {
  return [...chainCounts(assign)]
    .sort((a, b) => a[0] - b[0])
    .map(
      ([ci, count]) =>
        `<span style="display:inline-flex;align-items:center;gap:3px;margin-right:7px;font-size:10px"><span class="cdot" style="background:${colors[ci % colors.length]}"></span><b>${prefix}${ci + 1}</b> ${count} Mod.</span>`
    )
    .join('')
}

export function ledWallPrintHtml(d: PrintData): { html: string; fileName: string } {
  const dt = new Date().toLocaleDateString('de-AT')
  const pn = esc(d.projectName)
  const cn = esc(d.customerName)
  const wn = esc(d.wallName ?? '')

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
.ap{display:inline-block;padding:1px 5px;border-radius:3px;font-size:9px;font-weight:700;margin:1px}
.rear{margin:12px 0 0;padding:5px 9px;border:2px solid #b45309;border-radius:4px;color:#b45309;font-weight:700;text-transform:uppercase;letter-spacing:.06em;text-align:center}
</style></head><body>`

  html += `<h1>LEDWall Konfiguration${wn ? ` – ${wn}` : ''}</h1><div class="meta">${pn ? `Projekt: <b>${pn}</b> · ` : ''}${cn ? `Kunde: <b>${cn}</b> · ` : ''}Datum: ${dt} · Modul: <b>${esc(d.mod.name)}</b> · Aufbau: <b>${d.buildMode === 'stacked' ? 'Ground-Stack (LSU)' : 'Fliegend (Traverse)'}</b></div>`

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
<tr><th>Helligkeit</th><td>${d.mod.brightnessMax ? `${d.mod.brightness} (max ${d.mod.brightnessMax})` : d.mod.brightness} nit</td></tr>
<tr><th>Kontrast</th><td>&gt; ${d.mod.contrast}</td></tr>
<tr><th>Tiefe</th><td>${d.mod.dimD} mm</td></tr>
<tr><th>IMs je Modul</th><td>${d.mod.ims.count} (${esc(d.mod.ims.layout)})</td></tr></table>`
  if (d.buildMode === 'stacked')
    html += `<div class="bar"><b>Ground-Stack:</b> ${d.baseUnits} Standfüße × ${d.ballastPerBase} kg = <b>${d.totalBallast} kg Ballast</b></div>`
  else html += `<div class="bar"><b>Fliegend:</b> Gesamtgewicht ${d.weightKg} kg an Traverse</div>`
  html += `</div></div>`

  // Curving: Draufsicht + Winkel je Modul (eine Reihe)
  if (d.curve && d.curve.angles.length > 0) {
    const c = d.curve
    const pills = c.angles
      .map((a) => {
        const abs = Math.abs(a)
        const col = abs === 0 ? '#14b8a6' : a > 0 ? '#b8860b' : '#7c3aed'
        const bg = abs === 0 ? '#e7f8f5' : a > 0 ? '#fdf6dd' : '#f1ecfd'
        return `<span class="ap" style="color:${col};background:${bg}">${abs}°${a < 0 ? ' &#8634;' : ''}</span>`
      })
      .join('')
    html += `<h2>Curving – ${esc(c.modeLabel)}</h2><div style="margin-bottom:6px;font-size:11px">${c.mods} Module/Reihe · belegte Fläche ${c.footprintW.toFixed(2)} × ${c.footprintD.toFixed(2)} m</div>`
    html += `<div style="max-width:${d.landscape ? 640 : 480}px;margin-bottom:6px">${c.svg}</div>`
    html += `<div style="font-size:10px;color:#555;margin-bottom:3px">Winkelverteilung je Modul:</div><div>${pills}</div>`
  }

  // Querformat bietet ~1030 px nutzbare Breite (A4 ~700) -> Pläne länger
  // nebeneinander und mit größeren Zellen drucken.
  const sideBySideMax = d.landscape ? 24 : 16
  const printPx = d.cols > sideBySideMax ? 20 : d.cols > sideBySideMax * 0.75 ? 24 : 28
  const gridClass = d.cols > sideBySideMax ? 'g1' : 'g2'
  if (d.rear) html += `<div class="rear">Ansicht von hinten – Publikum auf der anderen Seite</div>`
  const own = d.signal?.walls.find((w) => w.wallId === d.wallId) ?? d.signal?.walls[0]
  const backups = new Set(
    (own?.chains ?? []).filter((c) => c.backupPort !== null).map((c) => c.chain)
  )
  html += `<div class="${gridClass}"><div><h2>Signalverkabelung</h2><div style="margin-bottom:4px">${legend(d.sig, SIG_COLORS, 'S')}</div>${gridSvg(d.sig, d.sigMeta, SIG_COLORS, 'S', d.cols, d.rows, printPx, d.rear, backups)}</div>`
  html += `<div><h2>Stromverkabelung</h2><div style="margin-bottom:4px">${legend(d.pwr, PWR_COLORS, 'P')}</div>${gridSvg(d.pwr, d.pwrMeta, PWR_COLORS, 'P', d.cols, d.rows, printPx, d.rear)}</div></div>`
  if (d.signal && d.signal.walls.some((w) => w.chains.length))
    html += signalTable(d.signal, d.wallId)
  if (d.power && d.power.chains.length) html += powerTable(d.power)
  html += `<div style="margin-top:14px;padding-top:5px;border-top:1px solid #ccc;font-size:9px;color:#999">${APP_NAME} · LED-Wall-Konfigurator · ${dt}</div></body></html>`

  const safe = [d.projectName, d.wallName ?? '']
    .map((x) => x.replace(/[^\wäöüÄÖÜß -]+/g, '').trim())
    .filter(Boolean)
    .join('-')
  return { html, fileName: `LEDWall${safe ? '-' + safe : ''}.pdf` }
}
