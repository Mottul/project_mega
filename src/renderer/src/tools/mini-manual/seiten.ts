// Seitenbauer: EIN Weg vom Modell zu HTML – für Handbuch (PDF, A4), Kurzkarte (PDF, A5) und die
// Vorschau im Werkzeug (Shadow DOM). Rein, ohne api. Alles Fremde läuft über esc()/inline()
// (shared/html, markup.ts); Fotos als foto://-Adresse, die main fürs PDF einsetzt.
//
// Die Stufe steuert nur, WAS erscheint (Kapitel, Blöcke, Schritte, Fehlerfälle). Lernausgabe:
// alles, jeder Teil mit Stufen-Kennzeichen.

import { fotoUrl } from '@shared/fotos'
import { esc, safeHref } from '@shared/html'
import { DEFAULT_AKZENT, type FirmenKontakt, type FirmenProfil } from '@shared/types'
import { qrMatrix } from '@renderer/components/qr'
import { computeWall } from '../led-wall/compute'
import { PWR_COLORS, SIG_COLORS } from '../led-wall/data'
import { amps, analyzePower, circuitLabel } from '../led-wall/power'
import { gridSvg } from '../led-wall/printHtml'
import { analyzeProcessors, backupLabel, fiberSummary } from '../led-wall/processors'
import { faelleFuerStufe, type AusgabeFall, type AusgabeZiel } from './fehlersuche'
import { geplanteWaende, glasfaser, modulKeys } from './ledWallKopie'
import { inline, markup, type MarkupOptionen } from './markup'
import { signalwege, type Signalweg } from './signalwege'
import {
  ROLLEN,
  kapitelDef,
  stufeLabel,
  type Anleitung,
  type Block,
  type Geraet,
  type GeraetRolle,
  type KapitelEintrag,
  type KapitelId,
  type Stufe,
  type WandKennzahlen
} from './model'
import { platzhalterWerte } from './platzhalter'

export interface SeitenKontext {
  stufe: Stufe
  /** Lernausgabe: alle Stufen, jeweils gekennzeichnet */
  lern: boolean
  firma: FirmenProfil
  /** Stand (Datum) für Deckblatt und Fußzeile */
  datum: string
  modus: 'vorschau' | 'druck'
}

/** wirksame Stufe: Lernausgabe zeigt alles */
const grenze = (c: SeitenKontext): Stufe => (c.lern ? 3 : c.stufe)
const akzent = (f: FirmenProfil): string =>
  /^#[0-9a-f]{6}$/i.test(f.akzent) ? f.akzent : DEFAULT_AKZENT

function mo(a: Anleitung, c: SeitenKontext): MarkupOptionen {
  return { werte: platzhalterWerte(a, c.firma), modus: c.modus }
}

const badge = (c: SeitenKontext, s: Stufe): string =>
  c.lern ? `<span class="stufe s${s}">${esc(stufeLabel(s))}</span>` : ''

/** Kapitel, die in dieser Ausgabe erscheinen (in der Reihenfolge der Anleitung) */
export function sichtbareKapitel(a: Anleitung, c: SeitenKontext): KapitelEintrag[] {
  const g = grenze(c)
  return a.kapitel.filter((k) => k.an && k.stufe <= g)
}

// ---------------------------------------------------------------- Bausteine der Seite

// Bilder direkt im Deckblatt (Flex-Spalte) brauchen align-self: Sonst streckt der Browser sie
// auf die volle Breite und begrenzt nur die Höhe – das Foto war verzerrt.
export function css(c: SeitenKontext): string {
  const ak = akzent(c.firma)
  return `
*{box-sizing:border-box;margin:0;padding:0;print-color-adjust:exact;-webkit-print-color-adjust:exact}
.mm{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;color:#1a1a1e;font-size:12px;line-height:1.5;background:#fff}
.mm h1{font-size:26px;line-height:1.15;margin-bottom:6px}
.mm h2{font-size:19px;margin:0 0 10px;padding-bottom:4px;border-bottom:2px solid ${ak}}
.mm h2 .nr{color:${ak};margin-right:8px}
.mm h3{font-size:14px;margin:12px 0 4px}
.mm p{margin:0 0 6px}
.mm ul,.mm ol{margin:0 0 8px 20px}
.mm li{margin:2px 0}
.mm .kapitel{padding:4px 0 10px}
.mm .kapitel+.kapitel{break-before:page}
.mm .muted{color:#676c76}
.mm .hinweis{border-left:3px solid ${ak};background:#fdf8e6;padding:6px 10px;margin:0 0 8px;border-radius:3px}
.mm .hinweis.warnung{border-left-color:#c62828;background:#fdecec}
.mm .hinweis>:last-child{margin-bottom:0}
.mm .schritte{margin:0 0 10px 0;padding-left:0;list-style:none;counter-reset:s}
.mm .schritte li{counter-increment:s;display:grid;grid-template-columns:24px minmax(0,1fr);gap:6px;padding:4px 0;border-top:1px solid #ececec;break-inside:avoid}
.mm .schritte li::before{content:counter(s);font-weight:700;color:${ak}}
.mm img.foto{display:block;max-width:100%;max-height:260px;margin:6px auto;border:1px solid #e2e2e2;border-radius:3px}
.mm img.mini{max-height:110px;margin:6px 0}
.mm figure{margin:8px auto 12px;break-inside:avoid;text-align:center}
.mm figure img.foto{margin:0 auto}
.mm figcaption{color:#676c76;font-size:11px;text-align:center;margin-top:4px}
.mm .fotos{display:flex;flex-wrap:wrap;justify-content:center;align-items:flex-start;gap:12px;margin:8px 0 12px}
.mm .fotos figure{margin:0;flex:1 1 0;min-width:0}
.mm .fotos.n2 figure{flex-basis:calc(50% - 6px);max-width:calc(50% - 6px)}
.mm .fotos.n3 figure{flex-basis:calc(33.333% - 8px);max-width:calc(33.333% - 8px)}
.mm .fotos img.foto{max-height:200px}
.mm table{border-collapse:collapse;width:100%;margin:0 0 10px}
.mm .plaene{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-start;margin:6px 0 8px}
.mm .plaene>div{min-width:0}
.mm .plaene svg{display:block;max-width:100%;height:auto}
.mm .plaene table{width:auto;margin:0}
.mm .plaene h4{font-size:11px;margin:0 0 3px;text-transform:uppercase;letter-spacing:.4px;color:#676c76}
.mm .rueck{border:1px solid #e0a800;background:#fff8e1;color:#7a5a00;font-weight:700;text-transform:uppercase;font-size:11px;letter-spacing:.04em;text-align:center;padding:3px 6px;margin:4px 0 8px;border-radius:3px}
.mm td,.mm th{border:1px solid #ddd;padding:4px 7px;text-align:left;vertical-align:top}
.mm th{background:#f7f7f7;font-size:10px;text-transform:uppercase;letter-spacing:.4px}
.mm .stufe{display:inline-block;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;border:1px solid #999;border-radius:8px;padding:0 6px;margin-left:6px;color:#555;vertical-align:middle}
.mm .stufe.s2{border-color:#b58900;color:#8a6800}.mm .stufe.s3{border-color:#555;color:#222}
.mm .ph-leer{border:1px dashed #c62828;color:#c62828;border-radius:3px;padding:0 3px;font-family:Consolas,monospace;font-size:.9em}
.mm .ph-linie{display:inline-block;min-width:90px;border-bottom:1px solid #999;height:1em;vertical-align:baseline}
.mm .fall{break-inside:avoid-page;margin:0 0 14px}
.mm .fall h3{font-size:15px;margin:10px 0 2px}
.mm .fall .symptom{color:#676c76;margin-bottom:6px}
.mm .fs{display:grid;grid-template-columns:28px minmax(0,1fr);gap:6px;padding:6px 0;border-top:1px solid #ececec;break-inside:avoid}
.mm .fs .n{font-weight:800;color:#b58900;font-size:14px}
.mm .fs .q{font-weight:600}
.mm .fs .ziele{display:flex;flex-wrap:wrap;gap:4px 16px;margin-top:2px;font-size:11px;color:#555}
.mm .fs .ziele b{color:#1a1a1e}
.mm .ruf{color:#8e1b1b;font-weight:600}
.mm .ok{color:#1b5e20;font-weight:600}
.mm .ruecksprache{color:#8e1b1b;font-size:11px}
.mm .anrufen{border:1.5px solid #c62828;color:#8e1b1b;border-radius:5px;padding:7px 10px;font-weight:600;margin:4px 0 10px}
.mm .symptome li a{color:inherit;text-decoration:none}
.mm .qr{display:inline-block;vertical-align:top}
.mm .kontakte{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.mm .kontakt{border:1px solid #e2e2e2;border-radius:5px;padding:8px 10px;display:flex;gap:10px;justify-content:space-between;break-inside:avoid}
.mm .system{width:100%;height:auto;margin:6px 0 10px}
.mm .ph{font-weight:700}
.mm .deckblatt{display:flex;flex-direction:column;gap:14px;min-height:240mm}
.mm .deckblatt>img{flex:none;align-self:flex-start;width:auto;height:auto;max-width:100%;margin:0}
.mm .deckblatt .logo{max-height:26mm;max-width:90mm}
.mm .deckblatt h1{font-size:34px;margin-top:40px}
.mm .deckblatt .linie{border-bottom:3px solid ${ak};padding-bottom:8px}
.mm .deckblatt .meta{margin-top:auto;color:#676c76;border-top:1px solid #e2e2e2;padding-top:8px}
.mm .deckblatt img.foto{max-height:120mm}
`
}

function foto(hash: string | null, cls = 'foto'): string {
  return hash ? `<img class="${cls}" src="${esc(fotoUrl(hash))}" alt="">` : ''
}

function figur(b: Extract<Block, { typ: 'foto' }>, o: MarkupOptionen): string {
  return `<figure>${foto(b.foto)}${b.text ? `<figcaption>${inline(b.text, o)}</figcaption>` : ''}</figure>`
}

function bloecke(bs: Block[], a: Anleitung, c: SeitenKontext): string {
  const g = grenze(c)
  const o = mo(a, c)
  const sichtbar = bs.filter((b) => b.stufe <= g && (b.typ !== 'foto' || !!b.foto))
  // Fotos, die direkt aufeinander folgen, stehen nebeneinander (je Reihe zwei bzw. drei),
  // ein einzelnes zentriert; die Bildunterschrift jeweils mittig darunter
  const teile: (Block | Extract<Block, { typ: 'foto' }>[])[] = []
  for (const b of sichtbar) {
    const last = teile.at(-1)
    if (b.typ === 'foto' && Array.isArray(last)) last.push(b)
    else teile.push(b.typ === 'foto' ? [b] : b)
  }
  return teile
    .map((b) => {
      if (Array.isArray(b)) {
        if (b.length === 1) return figur(b[0], o)
        // 2 und 4 Fotos als zwei Spalten (2 × 2), sonst drei je Reihe
        const spalten = b.length === 2 || b.length === 4 ? 2 : 3
        return `<div class="fotos n${spalten}">${b.map((x) => figur(x, o)).join('')}</div>`
      }
      switch (b.typ) {
        case 'text':
          return `${c.lern ? `<div>${badge(c, b.stufe)}</div>` : ''}${markup(b.text, o)}`
        case 'hinweis':
          return `<div class="hinweis${b.art === 'warnung' ? ' warnung' : ''}">${badge(c, b.stufe)}${markup(b.text, o)}</div>`
        case 'foto':
          return figur(b, o)
        case 'schritte': {
          const items = b.schritte
            .filter((s) => s.stufe <= g)
            .map(
              (s) =>
                `<li><span>${inline(s.text, o)}${badge(c, s.stufe)}${foto(s.foto, 'foto mini')}</span></li>`
            )
            .join('')
          return `${b.titel ? `<h3>${inline(b.titel, o)}${badge(c, b.stufe)}</h3>` : ''}${items ? `<ol class="schritte">${items}</ol>` : ''}`
        }
      }
    })
    .join('')
}

function qrSvg(text: string, size = 76): string {
  const m = qrMatrix(text)
  if (!m) return ''
  const n = m.length
  const q = 4
  let rects = ''
  for (let r = 0; r < n; r++)
    for (let col = 0; col < n; col++)
      if (m[r][col]) rects += `<rect x="${col + q}" y="${r + q}" width="1" height="1"/>`
  return `<svg class="qr" width="${size}" height="${size}" viewBox="0 0 ${n + 2 * q} ${n + 2 * q}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${rects}</g></svg>`
}

/** Rufnummer für tel: (nur Ziffern und führendes +) */
export function telNummer(s: string): string {
  const t = s.trim()
  return (t.startsWith('+') ? '+' : '') + t.replace(/\D/g, '')
}

function kontaktKarte(k: FirmenKontakt, qr: boolean): string {
  const tel = telNummer(k.mobil || k.buero)
  const zeilen = [
    k.funktion && `<div class="muted">${esc(k.funktion)}</div>`,
    k.mobil &&
      `<div>Mobil: <a href="${safeHref(`tel:${telNummer(k.mobil)}`)}">${esc(k.mobil)}</a></div>`,
    k.buero && `<div>Büro: ${esc(k.buero)}</div>`,
    k.mail && `<div><a href="${safeHref(`mailto:${k.mail}`)}">${esc(k.mail)}</a></div>`,
    k.erreichbarkeit && `<div class="muted">${esc(k.erreichbarkeit)}</div>`,
    k.whatsapp && k.mobil && '<div class="muted">auch per WhatsApp</div>'
  ]
    .filter(Boolean)
    .join('')
  return `<div class="kontakt"><div><b>${esc(k.name || 'Kontakt')}</b>${zeilen}</div>${qr && tel.length > 3 ? qrSvg(`tel:${tel}`) : ''}</div>`
}

const ROLLE_LABEL = (r: GeraetRolle): string => ROLLEN.find((x) => x.value === r)?.label ?? r

/**
 * Systemübersicht als SVG mit festen Spalten je Rolle – ohne Layout-Paket. Sind Signalwege
 * bekannt (signalwege.ts), verbinden Pfeile genau die Geräte, die zusammengehören (ein Zuspieler
 * für zwei Wände steht einmal da, mit zwei Pfeilen; der Name des Ausgangs steht am Pfeil);
 * sonst zeigt ein Pfeil zwischen den Spalten nur die Richtung.
 */
function systemSvg(a: Anleitung, wege: Signalweg[]): string {
  type Knoten = { id: string; name: string }
  const col = (rolle: GeraetRolle): Knoten[] =>
    a.geraete
      .filter((g) => g.rolle === rolle)
      .map((g) => ({ id: g.id, name: g.name || ROLLE_LABEL(g.rolle) }))
  const waende = a.ledWall?.waende ?? []
  const spalten: { titel: string; knoten: Knoten[]; immer?: boolean }[] = [
    { titel: 'Bedienfeld', knoten: col('bedienfeld') },
    { titel: 'Zuspieler', knoten: col('zuspieler') },
    { titel: 'Verteiler', knoten: col('verteiler') },
    { titel: 'Prozessor', knoten: col('prozessor'), immer: true },
    {
      titel: waende.length > 1 ? 'LED-Wände' : 'LED-Wand',
      knoten: waende.length
        ? waende.map(({ id, name, kennzahlen: k }) => ({
            id: `wand:${id}`,
            name:
              waende.length > 1 ? `${name} (${k.modul})` : `${k.modul} · ${k.spalten} × ${k.reihen}`
          }))
        : [{ id: 'wand:-', name: 'LED-Wand' }],
      immer: true
    }
  ].filter((s) => s.knoten.length || s.immer)
  // Kanten aus den Signalwegen (ohne Doppelte); Beschriftung: Name des Ausgangs
  const kanten = new Map<string, { von: string; nach: string; text: string }>()
  const kante = (von: string, nach: string, text = ''): void => {
    const k = `${von}>${nach}`
    const alt = kanten.get(k)
    if (!alt) kanten.set(k, { von, nach, text })
    else if (text && !alt.text.split(', ').includes(text))
      alt.text = `${alt.text}, ${text}`.replace(/^, /, '')
  }
  for (const w of wege) {
    if (!w.prozessor) continue
    kante(w.prozessor.id, `wand:${w.wand.id}`)
    if (!w.zuspieler) continue
    const name = w.ausgang?.name.trim() ?? ''
    if (w.verteiler) {
      kante(w.zuspieler.id, w.verteiler.id, name)
      kante(w.verteiler.id, w.prozessor.id)
    } else kante(w.zuspieler.id, w.prozessor.id, name)
  }
  const unten = col('netzwerk')
    .concat(col('strom'), col('sonstiges'))
    .map((k) => k.name)
  const W = 680
  const n = spalten.length
  const bw = Math.min(140, (W - (n - 1) * 28) / n)
  const gap = (W - n * bw) / Math.max(1, n - 1)
  const rows = Math.max(1, ...spalten.map((s) => s.knoten.length))
  const bh = 34
  const top = 24
  const H = top + rows * (bh + 10) + (unten.length ? 70 : 10)
  const lage = new Map<string, { x: number; y: number }>()
  let svg = ''
  spalten.forEach((s, i) => {
    const x = i * (bw + gap)
    svg += `<text x="${x + bw / 2}" y="14" text-anchor="middle" font-size="11" fill="#676c76">${esc(s.titel)}</text>`
    s.knoten.forEach((k, j) => {
      const y = top + j * (bh + 10)
      lage.set(k.id, { x, y })
      svg += `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="5" fill="#fff" stroke="#999"/>`
      svg += `<text x="${x + bw / 2}" y="${y + bh / 2 + 4}" text-anchor="middle" font-size="11">${esc(k.name.slice(0, Math.floor(bw / 6)))}</text>`
    })
    if (!kanten.size && i < spalten.length - 1) {
      const y = top + bh / 2
      svg += `<line x1="${x + bw + 4}" y1="${y}" x2="${x + bw + gap - 8}" y2="${y}" stroke="#555" stroke-width="1.5" marker-end="url(#pfeil)"/>`
    }
  })
  for (const k of kanten.values()) {
    const a1 = lage.get(k.von)
    const b1 = lage.get(k.nach)
    if (!a1 || !b1) continue
    const x1 = a1.x + bw + 2
    const y1 = a1.y + bh / 2
    const x2 = b1.x - 6
    const y2 = b1.y + bh / 2
    const xm = (x1 + x2) / 2
    svg += `<path d="M${x1} ${y1} C${xm} ${y1} ${xm} ${y2} ${x2} ${y2}" fill="none" stroke="#555" stroke-width="1.4" marker-end="url(#pfeil)"/>`
    // am Ziel-Ende: Zwei Ausgänge eines Zuspielers starten am selben Punkt, ihre Ziele liegen
    // aber verschieden hoch (gleiches Ziel = eine Kante mit beiden Namen)
    if (k.text)
      svg += `<text x="${x2 - 3}" y="${y2 - 5}" text-anchor="end" font-size="9" fill="#676c76">${esc(k.text.slice(0, 18))}</text>`
  }
  if (unten.length) {
    const y = H - 46
    svg += `<text x="0" y="${y - 6}" font-size="11" fill="#676c76">Netzwerk, Strom, Sonstiges</text>`
    unten.slice(0, 4).forEach((n, i) => {
      svg += `<rect x="${i * 170}" y="${y}" width="160" height="30" rx="5" fill="#f7f7f7" stroke="#bbb"/><text x="${i * 170 + 80}" y="${y + 19}" text-anchor="middle" font-size="11">${esc(n.slice(0, 26))}</text>`
    })
  }
  return `<svg class="system" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="Segoe UI, sans-serif"><defs><marker id="pfeil" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#555"/></marker></defs>${svg}</svg>`
}

/**
 * Signalwege als Text unter der Übersicht – bei mehreren Wänden oder sobald Ausgänge,
 * Verteiler oder Ausschnitte eingetragen sind (sonst sagt die Zeichnung schon alles).
 */
function wegListe(a: Anleitung, wege: Signalweg[]): string {
  const mitGeraet = wege.filter((w) => w.prozessor)
  const lohnt =
    (a.ledWall?.waende.length ?? 0) > 1 ||
    mitGeraet.some((w) => w.ausgang?.name.trim() || w.verteiler || w.ausschnitt)
  if (!mitGeraet.length || !lohnt) return ''
  const n = (g: Geraet): string => esc(g.name.trim() || ROLLE_LABEL(g.rolle))
  const zeilen = wege.map((w) => {
    if (!w.prozessor)
      return `<li><b>${esc(w.wand.name)}</b>: <span class="muted">noch kein Prozessor</span></li>`
    const teile = [
      w.zuspieler &&
        `${n(w.zuspieler)}${w.ausgang?.name.trim() ? ` (${esc(w.ausgang.name.trim())})` : ''}`,
      w.verteiler && n(w.verteiler),
      n(w.prozessor)
    ].filter(Boolean)
    const s = w.ausschnitt
    const aus = s && s.b && s.h ? ` · Ausschnitt ab ${s.x}, ${s.y} · ${s.b} × ${s.h} px` : ''
    return `<li><b>${esc(w.wand.name)}</b>: ${teile.join(' → ')}${aus}</li>`
  })
  return `<h3>Signalwege</h3><ul class="wege">${zeilen.join('')}</ul>`
}

/** Sprungmarke eines Schritts (Links im Text, Schritt für Schritt am Handy) */
const schrittId = (fallId: string, nr: number): string => `fs-${fallId}-${nr}`

/** Ziel maschinenlesbar fürs Handy-Skript: Schritt, anderer Fall oder Ende des Wegs */
function zielCode(z: AusgabeZiel): string {
  return z.art === 'schritt' ? `s:${z.nr}` : z.art === 'fall' ? `f:${z.id}` : 'ende'
}

function zielText(z: AusgabeZiel, o: MarkupOptionen, fallId: string): string {
  switch (z.art) {
    case 'schritt':
      return `weiter bei <a href="#${esc(schrittId(fallId, z.nr))}"><b>${z.nr}</b></a>`
    case 'loesung':
      return `<span class="ok">${inline(z.text, o)}</span>`
    case 'geloest':
      return '<span class="ok">Gelöst</span>'
    case 'fall':
      return `weiter mit <a href="#fall-${esc(z.id)}"><b>Fall ${z.nr}</b></a> „${esc(z.titel)}“`
    default:
      return z.grund === 'stufe'
        ? '<span class="ruf">Ab hier bitte anrufen</span>'
        : '<span class="ruf">Bitte anrufen</span>'
  }
}

function fallHtml(f: AusgabeFall, a: Anleitung, c: SeitenKontext): string {
  const o = mo(a, c)
  const kontakt = a.kontakte[0]
  const ruf = kontakt
    ? ` – ${esc(kontakt.name)}${kontakt.mobil ? `, ${esc(kontakt.mobil)}` : ''}`
    : ''
  const kopf = `<h3 id="fall-${esc(f.fall.id)}">${f.nr}. ${inline(f.fall.titel, o)}${badge(c, f.fall.stufe)}</h3>${f.fall.symptom ? `<div class="symptom">${inline(f.fall.symptom, o)}</div>` : ''}`
  if (f.nurAnrufen)
    return `<div class="fall">${kopf}<div class="anrufen">Bitte anrufen${ruf}</div></div>`
  const id = f.fall.id
  // je Ziel: Beschriftung, maschinenlesbares Ziel (data-ziel) und der Text des Ziels (.zt) –
  // das Handy-Skript macht daraus Knöpfe, der Druck zeigt die Zeile wie sie ist
  const z = (wahl: 'Ja' | 'Nein' | 'Dann', ziel: AusgabeZiel): string =>
    `<span class="z" data-wahl="${wahl}" data-ziel="${esc(zielCode(ziel))}"><b>${wahl}:</b> <span class="zt">${zielText(ziel, o, id)}</span></span>`
  const schritte = f.schritte
    .map((s) => {
      const ziele = s.nein ? z('Ja', s.ja) + z('Nein', s.nein) : z('Dann', s.ja)
      return `<div class="fs" id="${esc(schrittId(id, s.nr))}" data-nr="${s.nr}"><span class="n">${s.nr}</span><div><div class="q">${inline(s.schritt.text, o)}${badge(c, s.stufe)}</div>${s.hinweis ? `<div class="muted">${inline(s.hinweis, o)}</div>` : ''}${s.ruecksprache ? `<div class="ruecksprache">Vorher kurz anrufen${ruf}</div>` : ''}${foto(s.schritt.foto, 'foto mini')}<div class="ziele">${ziele}</div></div></div>`
    })
    .join('')
  return `<div class="fall" data-fall="${esc(id)}">${kopf}${schritte}</div>`
}

function passwort(a: Anleitung, pw: string): string {
  if (!pw) return ''
  switch (a.ausgabe.passwoerter) {
    case 'drucken':
      return esc(pw)
    case 'schwaerzen':
      return '••••••••'
    default:
      return '<span class="muted">wird separat übergeben</span>'
  }
}

// ---------------------------------------------------------------- Kapitel

/** Breite der Seite, die die Pläne nutzen dürfen (A4 hoch abzüglich Rand) */
const PLAN_BREITE = 660

/**
 * Kapitel Verkabelung: je Wand der Kopie die Pläne (dieselbe Zeichnung wie die PDF-Doku des
 * Konfigurators) in der gewählten Blickrichtung, dazu Ports und Stromkreise und die
 * Glasfaser-Strecke. Gerechnet wie im Konfigurator (geteilte Prozessoren über alle Wände).
 */
function verkabelung(k: KapitelEintrag, a: Anleitung): string {
  const walls = geplanteWaende(a.ledWall)
  if (!walls.length)
    return '<p class="muted">Noch keine LED-Wall-Planung übernommen (Kapitel LED-Wall).</p>'
  const hinten = (k.ansicht ?? 'hinten') === 'hinten'
  const groups = analyzeProcessors(walls)
  return walls
    .map((w, wi) => {
      const c = w.config
      const d = computeWall(c)
      const g = groups.find((x) => x.walls.some((y) => y.wallId === w.id))
      const sig = g?.walls.find((y) => y.wallId === w.id)?.chains ?? []
      const power = analyzePower(c)
      const titel = walls.length > 1 ? `<h3>${esc(w.name)}</h3>` : ''
      if (!sig.length && !power.chains.length)
        return `${titel}<p class="muted">In der Planung ist keine Verkabelung gezeichnet.</p>`
      // nebeneinander, solange die Module lesbar bleiben – sonst untereinander und größer
      const halb = Math.floor((PLAN_BREITE / 2 - 20) / d.cols) - 2
      const px = Math.max(
        6,
        Math.min(28, halb >= 14 ? halb : Math.floor((PLAN_BREITE - 10) / d.cols) - 2)
      )
      const backups = new Set(sig.filter((l) => l.backupPort !== null).map((l) => l.chain))
      const plan = (art: 'S' | 'P'): string =>
        art === 'S'
          ? gridSvg(
              c.sig,
              c.sigMeta,
              SIG_COLORS,
              'S',
              d.cols,
              d.rows,
              px,
              hinten,
              backups,
              `mm-${wi}-S`
            )
          : gridSvg(
              c.pwr,
              c.pwrMeta,
              PWR_COLORS,
              'P',
              d.cols,
              d.rows,
              px,
              hinten,
              undefined,
              `mm-${wi}-P`
            )
      const kopf = [
        g
          ? `<b>Prozessor:</b> ${esc(g.processor.name)}${
              g.walls.length > 1
                ? ` (geteilt mit ${esc(
                    g.walls
                      .filter((y) => y.wallId !== w.id)
                      .map((y) => y.wallName)
                      .join(', ')
                  )})`
                : ''
            }`
          : '',
        g?.fiber
          ? `<b>Glasfaser:</b> ${esc(fiberSummary(g.fiber))} – ${g.fiber.groups.map((x) => `Box ${x.name} an ${x.opt} (Ports ${x.ports.join(', ')})`).join('; ')}`
          : '',
        `<b>Strom:</b> ${power.voltage} V, Absicherung ${power.breakerA} A je Kreis`
      ]
        .filter(Boolean)
        .map((x) => `<p>${x}</p>`)
        .join('')
      const sigTab = sig.length
        ? `<table><thead><tr><th>Kette</th><th>Module</th><th>Port</th></tr></thead><tbody>${sig
            .map(
              (l) =>
                `<tr><td>S${l.chain + 1}</td><td>${l.modules}</td><td>${l.port}${l.backupPort !== null ? ` · ${esc(backupLabel(l))}` : ''}</td></tr>`
            )
            .join('')}</tbody></table>`
        : ''
      const pwrTab = power.chains.length
        ? `<table><thead><tr><th>Kette</th><th>Module</th><th>Kreis · Phase</th><th>Strom</th></tr></thead><tbody>${power.chains
            .map(
              (l) =>
                `<tr><td>P${l.chain + 1}</td><td>${l.modules}</td><td>${esc(circuitLabel(l))}</td><td>${amps(l.amps)} A</td></tr>`
            )
            .join('')}</tbody></table>`
        : ''
      return `${titel}${kopf}${hinten ? '<div class="rueck">Ansicht von hinten – Publikum auf der anderen Seite</div>' : ''}<div class="plaene"><div><h4>Signal</h4>${plan('S')}</div><div><h4>Strom</h4>${plan('P')}</div></div><div class="plaene"><div>${sigTab}</div><div>${pwrTab}</div></div>`
    })
    .join('')
}

function kapitelInhalt(k: KapitelEintrag, a: Anleitung, c: SeitenKontext): string {
  const g = grenze(c)
  const o = mo(a, c)
  const module = modulKeys(a.ledWall)
  switch (k.id) {
    case 'aufEinenBlick': {
      const einAus = a.kapitel.find((x) => x.id === 'einAus')
      const listen = (einAus?.an ? einAus.bloecke : []).filter(
        (b) => b.typ === 'schritte' && b.stufe <= 1
      )
      const faelle = faelleFuerStufe(a.fehlerfaelle, c.stufe, module, glasfaser(a.ledWall)).slice(
        0,
        5
      )
      const kontakt = a.kontakte[0]
      return `${bloecke(listen, a, { ...c, lern: false, stufe: 1 })}${
        faelle.length
          ? `<h3>Etwas stimmt nicht?</h3><ul>${faelle.map((f) => `<li>${inline(f.fall.titel, o)} → Kapitel Fehlersuche, Fall ${f.nr}</li>`).join('')}</ul>`
          : ''
      }${kontakt ? `<h3>Kontakt</h3>${kontaktKarte(kontakt, true)}` : ''}`
    }
    case 'system': {
      if (!a.geraete.length && !a.ledWall)
        return '<p class="muted">Noch keine Geräte eingetragen.</p>'
      const wege = signalwege(a)
      return systemSvg(a, wege) + wegListe(a, wege)
    }
    case 'geraete': {
      if (!a.geraete.length) return '<p class="muted">Noch keine Geräte eingetragen.</p>'
      const ip = g >= 3
      const rows = a.geraete
        .map(
          (x) =>
            `<tr><td>${esc(ROLLE_LABEL(x.rolle))}</td><td><b>${esc(x.name)}</b>${x.modell ? `<br><span class="muted">${esc(x.modell)}</span>` : ''}</td><td>${esc(x.standort)}</td>${ip ? `<td>${esc(x.ip)}</td>` : ''}<td>${x.notiz ? markup(x.notiz, o) : ''}${foto(x.foto, 'foto mini')}</td></tr>`
        )
        .join('')
      return `<table><thead><tr><th>Rolle</th><th>Gerät</th><th>Standort</th>${ip ? '<th>IP</th>' : ''}<th>Hinweis</th></tr></thead><tbody>${rows}</tbody></table>`
    }
    case 'zugang': {
      const z = a.zugaenge.filter((x) => x.stufe <= g)
      if (!z.length) return '<p class="muted">Keine Zugangsdaten eingetragen.</p>'
      const rows = z
        .map(
          (x) =>
            `<tr><td>${esc(x.wofuer)}${badge(c, x.stufe)}</td><td>${esc(x.benutzer)}</td><td>${passwort(a, x.passwort)}</td><td>${esc(x.notiz)}</td></tr>`
        )
        .join('')
      const fw = c.firma.fernwartung.trim()
      return `<table><thead><tr><th>Wofür</th><th>Benutzer</th><th>Passwort</th><th>Hinweis</th></tr></thead><tbody>${rows}</tbody></table>${fw ? `<h3>Fernwartung</h3>${markup(fw, o)}` : ''}`
    }
    case 'ledWall': {
      const waende = a.ledWall?.waende ?? []
      const tabelle = (w: WandKennzahlen): string => `<table><tbody>
<tr><th>Modul</th><td>${esc(w.modul)}</td><th>Module</th><td>${w.spalten} × ${w.reihen} = ${w.module}</td></tr>
<tr><th>Größe</th><td>${esc(w.breiteM.replace('.', ','))} × ${esc(w.hoeheM.replace('.', ','))} m</td><th>Auflösung</th><td>${w.aufloesungX} × ${w.aufloesungY} px</td></tr>
<tr><th>Gewicht</th><td>${esc(w.gewichtKg.replace('.', ','))} kg</td><th>Leistung</th><td>max. ${w.leistungMaxW} W (${esc(w.stromMaxA.replace('.', ','))} A)</td></tr>
</tbody></table>`
      const tab = !waende.length
        ? '<p class="muted">Noch keine LED-Wall-Planung übernommen.</p>'
        : waende.length === 1
          ? tabelle(waende[0].kennzahlen)
          : waende.map((w) => `<h3>${esc(w.name)}</h3>${tabelle(w.kennzahlen)}`).join('')
      return tab + bloecke(k.bloecke, a, c)
    }
    case 'verkabelung':
      return verkabelung(k, a)
    case 'fehlersuche': {
      const alle = faelleFuerStufe(a.fehlerfaelle, g, module, glasfaser(a.ledWall))
      if (!alle.length) return '<p class="muted">Noch keine Fehlerfälle.</p>'
      const uebersicht = `<h3>Was siehst du?</h3><ul class="symptome">${alle
        .map(
          (f) =>
            `<li><a href="#fall-${esc(f.fall.id)}"><b>${inline(f.fall.titel, o)}</b> → Fall ${f.nr}</a></li>`
        )
        .join('')}</ul>`
      // in der Reihenfolge der Liste – die Nummern im Text („weiter mit Fall 3“) müssen passen
      return uebersicht + alle.map((f) => fallHtml(f, a, c)).join('')
    }
    case 'kontakt': {
      if (!a.kontakte.length) return '<p class="muted">Noch kein Kontakt gewählt.</p>'
      return `<div class="kontakte">${a.kontakte.map((k) => kontaktKarte(k, true)).join('')}</div>`
    }
    case 'dokumentstand': {
      const q = a.ledWall?.quelle
      return `<table><tbody>
<tr><th>Stand</th><td>${esc(c.datum)}</td></tr>
<tr><th>Ausgabe</th><td>${c.lern ? 'Lernausgabe (alle Stufen)' : `Stufe ${esc(stufeLabel(c.stufe))}`}</td></tr>
${a.stand.bearbeitet ? `<tr><th>Bearbeitet von</th><td>${esc(a.stand.bearbeitet)}</td></tr>` : ''}
${a.ledWall ? `<tr><th>LED-Wall</th><td>${q ? `Planung Stand ${q.rev}` : 'aus dem Konfigurator'}${a.ledWall.waende.length > 1 ? ` (${a.ledWall.waende.length} Wände)` : ''}, übernommen ${esc(a.ledWall.uebernommen.slice(0, 10))}</td></tr>` : ''}
</tbody></table>${a.stand.aenderungen ? `<h3>Änderungen</h3>${markup(a.stand.aenderungen, o)}` : ''}`
    }
    default:
      return bloecke(k.bloecke, a, c) || '<p class="muted">Noch kein Inhalt.</p>'
  }
}

export function kapitelHtml(k: KapitelEintrag, nr: number, a: Anleitung, c: SeitenKontext): string {
  const d = kapitelDef(k.id)
  return `<section class="kapitel" id="k-${k.id}"><h2><span class="nr">${String(nr).padStart(2, '0')}</span>${esc(d.titel)}${badge(c, k.stufe)}</h2>${kapitelInhalt(k, a, c)}</section>`
}

export function deckblatt(a: Anleitung, c: SeitenKontext): string {
  const d = a.deckblatt
  const logo = c.firma.logo ? foto(c.firma.logo, 'logo') : ''
  const zeilen = [d.projekt, d.kunde, d.ort, d.zeitraum].filter((x) => x.trim())
  return `<section class="kapitel deckblatt" id="k-deckblatt">${logo}<div class="linie"><h1>${esc(a.titel)}</h1>${zeilen.length ? `<div>${zeilen.map(esc).join(' · ')}</div>` : ''}</div>${foto(d.foto)}<div class="meta">Stand ${esc(c.datum)} · ${c.lern ? 'Lernausgabe' : `Stufe ${esc(stufeLabel(c.stufe))}`}${c.firma.name ? ` · ${esc(c.firma.name)}` : ''}</div></section>`
}

/** Fußzeile des Handbuchs (main setzt Seitenzahlen dazu) */
export function fusszeile(a: Anleitung, c: SeitenKontext): string {
  return [
    a.deckblatt.projekt || a.titel,
    `Stand ${c.datum}`,
    c.lern ? 'Lernausgabe' : `Stufe ${stufeLabel(c.stufe)}`
  ].join(' · ')
}

// ---------------------------------------------------------------- ganze Ausgaben

function dokument(titel: string, style: string, body: string): string {
  return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>${esc(titel)}</title><style>${style}</style></head><body class="mm">${body}</body></html>`
}

export function handbuchHtml(a: Anleitung, c: SeitenKontext): string {
  const body =
    deckblatt(a, c) +
    sichtbareKapitel(a, c)
      .map((k, i) => kapitelHtml(k, i + 1, a, c))
      .join('')
  return dokument(a.titel, css(c), body)
}

/** Ein Kapitel (oder das Deckblatt) für die Vorschau im Shadow DOM */
export function vorschau(
  a: Anleitung,
  c: SeitenKontext,
  id: KapitelId | 'deckblatt'
): { css: string; html: string } {
  if (id === 'deckblatt') return { css: css(c), html: `<div class="mm">${deckblatt(a, c)}</div>` }
  const ks = sichtbareKapitel(a, c)
  const i = ks.findIndex((k) => k.id === id)
  const k = a.kapitel.find((x) => x.id === id)
  const html =
    i >= 0 && k
      ? kapitelHtml(k, i + 1, a, c)
      : k
        ? `<section class="kapitel"><p class="muted">Dieses Kapitel erscheint in dieser Ausgabe nicht (abgewählt oder über der Stufe).</p></section>`
        : ''
  return { css: css(c), html: `<div class="mm">${html}</div>` }
}

// ---------------------------------------------------------------- Kurzkarte (A5, eine Seite)

export function kurzkarteHtml(a: Anleitung, c: SeitenKontext): string {
  const o = mo(a, c)
  const ak = akzent(c.firma)
  const einAus = a.kapitel.find((x) => x.id === 'einAus')
  const listen = (einAus?.an ? einAus.bloecke : []).filter(
    (b): b is Extract<Block, { typ: 'schritte' }> => b.typ === 'schritte' && b.stufe <= c.stufe
  )
  const spalten = listen
    .slice(0, 3)
    .map(
      (b) =>
        `<div class="block"><h5>${inline(b.titel || 'Schritte', o)}</h5><ol>${b.schritte
          .filter((s) => s.stufe <= c.stufe)
          .map((s) => `<li>${inline(s.text, o)}</li>`)
          .join('')}</ol></div>`
    )
    .join('')
  const waende = a.ledWall?.waende ?? []
  const w = waende[0]?.kennzahlen
  const sub = [
    a.deckblatt.projekt,
    a.deckblatt.ort,
    waende.length > 1
      ? `${waende.length} LED-Wände`
      : w &&
        `${w.breiteM.replace('.', ',')} × ${w.hoeheM.replace('.', ',')} m, ${w.aufloesungX} × ${w.aufloesungY} px`
  ]
    .filter(Boolean)
    .map((x) => esc(x))
    .join(' · ')
  const faelle = faelleFuerStufe(
    a.fehlerfaelle,
    c.stufe,
    modulKeys(a.ledWall),
    glasfaser(a.ledWall)
  )
  const fsNr = sichtbareKapitel(a, c).findIndex((k) => k.id === 'fehlersuche') + 1
  const k = a.kontakte[0]
  const tel = k ? telNummer(k.mobil || k.buero) : ''
  const style = `${css(c)}
.kk{display:flex;flex-direction:column;gap:9px;font-size:11px}
.kk .top{display:flex;justify-content:space-between;align-items:center;gap:10px}
.kk .top .logo{max-height:34px;max-width:150px;object-fit:contain}
.kk .meta{color:#676c76;font-size:10px;text-align:right}
.kk h1{font-size:21px;margin:0}
.kk .sub{color:#676c76;border-bottom:2px solid ${ak};padding-bottom:5px}
.kk .cols{display:grid;grid-template-columns:repeat(${Math.min(Math.max(listen.length, 1), 2)},minmax(0,1fr));gap:10px}
.kk h5{font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;margin:0 0 3px}
.kk ol{margin:0 0 0 16px}
.kk .alarm{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;background:#fff7d6;border:1.5px solid ${ak};border-radius:5px;padding:7px 9px}
.kk .alarm ul{margin:3px 0 0 16px}
.kk .kontakt-zeile{display:flex;justify-content:space-between;gap:10px;color:#444;border-top:1px solid #e2e2e2;padding-top:5px;flex-wrap:wrap}
.kk .handy{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;border:1px solid #e2e2e2;border-radius:5px;padding:6px 9px}
.kk .handy .adr{color:#676c76;font-size:9px;word-break:break-all}`
  // Online-Fassung: die Adresse als QR-Code – am Handy die ganze Anleitung, Schritt für Schritt
  const url = a.ausgabe.online?.url ?? ''
  const handy = url
    ? `<div class="handy"><div><b>Am Handy:</b> die ganze Anleitung, Fehlersuche Schritt für Schritt<div class="adr">${esc(url.replace(/^https:\/\//, ''))}</div></div>${qrSvg(url, 84)}</div>`
    : ''
  const body = `<div class="kk">
<div class="top">${c.firma.logo ? foto(c.firma.logo, 'logo') : `<b>${esc(c.firma.name)}</b>`}<div class="meta">Kurzkarte · Stand ${esc(c.datum)}<br>Stufe ${esc(stufeLabel(c.stufe))}</div></div>
<div><h1>${esc(a.titel)}</h1>${sub ? `<div class="sub">${sub}</div>` : '<div class="sub"></div>'}</div>
${spalten ? `<div class="cols">${spalten}</div>` : '<p class="muted">Im Kapitel „Ein- und Ausschalten“ stehen noch keine Schritte.</p>'}
<div class="alarm"><div><b>Etwas stimmt nicht?</b>${
    faelle.length
      ? `<ul>${faelle
          .slice(0, 5)
          .map((f) => `<li>${inline(f.fall.titel, o)}</li>`)
          .join(
            ''
          )}</ul>Schritt für Schritt im Handbuch${fsNr > 0 ? `, Kapitel ${fsNr} Fehlersuche` : ''}.`
      : ' Bitte anrufen.'
  }</div>${tel.length > 3 ? qrSvg(`tel:${tel}`, 70) : ''}</div>
${handy}
${k ? `<div class="kontakt-zeile"><span><b>${esc(k.name)}</b>${k.mobil ? ` · ${esc(k.mobil)}` : ''}</span><span>${esc(k.erreichbarkeit)}</span></div>` : ''}
</div>`
  return dokument(`Kurzkarte – ${a.titel}`, style, body)
}

/** Nummer jedes Kapitels in dieser Ausgabe (fehlt = erscheint nicht) */
export function kapitelNummern(a: Anleitung, c: SeitenKontext): Map<KapitelId, number> {
  return new Map(sichtbareKapitel(a, c).map((k, i) => [k.id, i + 1]))
}
