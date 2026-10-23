// Bedienfeld für Handbuch, Vorschau und Handy: das Raster wie am Gerät (dunkle Tasten mit Nummer
// und Aufschrift) und darunter die Liste „Nummer – was die Taste tut“. Rein; alles Fremde läuft
// über esc()/inline()/markup(), Farben nur als geprüftes #rrggbb.

import { fotoUrl } from '@shared/fotos'
import { esc } from '@shared/html'
import {
  abgedeckt,
  geraetDef,
  hatSpannen,
  navText,
  navTitel,
  nummer,
  seitenName,
  tasteAn,
  tastenNr
} from './bedienfeld'
import { inline, markup, type MarkupOptionen } from './markup'
import type { BedienSeite, Bedienfeld, Stufe, Taste } from './model'

const FARBE = /^#[0-9a-f]{6}$/i

/** style-Attribut: Platz im Raster (nur Zahlen) und Farben (nur geprüftes #rrggbb) */
function stil(t: Taste | undefined, ort: string): string {
  const s = [
    ort,
    t && FARBE.test(t.hintergrund) && `background:${t.hintergrund}`,
    t && FARBE.test(t.textfarbe) && `color:${t.textfarbe}`
  ].filter(Boolean)
  return s.length ? ` style="${s.join(';')}"` : ''
}

/** Aufschrift auf der Taste: eigener Titel (mehrzeilig wie am Stream Deck), sonst die Navigation */
function aufschrift(b: Bedienfeld, t: Taste): string {
  if (t.titel.trim()) return esc(t.titel.trim()).replace(/\n/g, '<br>')
  return t.nav ? esc(navTitel(b, t.nav)) : ''
}

function seiteHtml(
  b: Bedienfeld,
  s: BedienSeite,
  o: MarkupOptionen,
  g: Stufe,
  badge: (s: Stufe) => string
): string {
  const zeigt = (t: Taste | undefined): t is Taste => !!t && t.stufe <= g
  // Kacheln mit Spanne (OSC-Steuerung) stehen ausdrücklich an ihrem Platz; leere Plätze bleiben
  // dort frei, weil das feine Raster sonst aus lauter Mini-Kästchen bestünde
  const spannen = hatSpannen(b)
  const osc = b.geraet === 'osc'
  const zu = abgedeckt(s)
  let zellen = ''
  for (let zeile = 0; zeile < b.zeilen; zeile++)
    for (let spalte = 0; spalte < b.spalten; spalte++) {
      if (zu.has(`${spalte},${zeile}`)) continue
      const t = tasteAn(s, spalte, zeile)
      const ort = spannen
        ? `grid-column:${spalte + 1} / span ${t?.breite ?? 1};grid-row:${zeile + 1} / span ${t?.hoehe ?? 1}`
        : ''
      // Eine Taste über der Stufe bleibt als leerer Platz – das Raster entspricht dem Gerät
      if (zeigt(t))
        zellen += `<div class="taste${t.nav ? ' nav' : ''}"${stil(t, ort)}>${t.bild ? `<img src="${esc(fotoUrl(t.bild))}" alt="">` : ''}<span class="n">${nummer(b, s, t)}</span><span class="t">${aufschrift(b, t)}</span></div>`
      else if (!osc)
        zellen += `<div class="taste leer"${stil(undefined, ort)}><span class="n">${tastenNr(b.spalten, { spalte, zeile })}</span></div>`
    }
  const zeilen = s.tasten
    .filter(zeigt)
    .map((t) => {
      const name = t.titel.trim() ? `<b>${esc(t.titel.trim().replace(/\s*\n\s*/g, ' '))}</b>` : ''
      const was = t.funktion.trim() ? inline(t.funktion, o) : t.nav ? esc(navText(b, t.nav)) : ''
      // nur Bild oder Farbe: steht im Raster, in der Liste gäbe es nichts zu sagen
      if (!name && !was && !t.notiz.trim()) return ''
      return `<tr><td class="n">${nummer(b, s, t)}</td><td>${name}${badge(t.stufe)}${name && was ? ' – ' : ''}${was}${t.notiz.trim() ? `<div class="muted">${markup(t.notiz, o)}</div>` : ''}</td></tr>`
    })
    .join('')
  const titel = b.seiten.length > 1 || s.name.trim() ? `<h4>${esc(seitenName(b, s.id))}</h4>` : ''
  // feste Breite je Spalte, damit kleine Raster nicht auf die ganze Seite aufgeblasen werden;
  // mit Spannen feste Zeilenhöhe (etwas flacher als breit, wie in der OSC-Steuerung)
  const zelle = Math.min(64, Math.floor(680 / b.spalten))
  const raster = spannen
    ? `grid-template-columns:repeat(${b.spalten},minmax(0,1fr));grid-template-rows:repeat(${b.zeilen},${Math.max(8, Math.round(zelle * 0.75))}px)`
    : `grid-template-columns:repeat(${b.spalten},minmax(0,1fr))`
  return `<div class="tf-seite">${titel}<div class="tf-raster${spannen ? ' frei' : ''}" style="${raster};max-width:${zelle * b.spalten + 14}px">${zellen}</div>${zeilen ? `<table class="tf-liste"><tbody>${zeilen}</tbody></table>` : ''}</div>`
}

export function tastenfeldHtml(
  b: Bedienfeld,
  o: MarkupOptionen,
  g: Stufe,
  badge: (s: Stufe) => string
): string {
  const d = geraetDef(b.geraet)
  const kopf = `<h3>${esc(b.name.trim() || d.label)}${b.name.trim() ? `<span class="muted"> · ${esc(d.label)}</span>` : ''}${badge(b.stufe)}</h3>`
  // Seiten ohne sichtbare Taste nicht als leeres Raster drucken
  const seiten = b.seiten
    .filter((s) => s.tasten.some((t) => t.stufe <= g))
    .map((s) => seiteHtml(b, s, o, g, badge))
    .join('')
  return `<div class="tf">${kopf}${b.notiz.trim() ? markup(b.notiz, o) : ''}${seiten}</div>`
}

/** CSS der Tastenfelder (Teil von css() in seiten.ts) */
export const TASTENFELD_CSS = `
.mm .tf{margin:0 0 14px}
.mm .tf h4{font-size:12px;margin:8px 0 4px}
.mm .tf-seite{break-inside:avoid;margin:0 0 12px}
.mm .tf-raster{display:grid;gap:4px;padding:7px;background:#26262b;border-radius:9px;margin:4px 0 8px}
.mm .taste{position:relative;aspect-ratio:1/1;border-radius:6px;background:#0d0d10;color:#f5f5f5;display:flex;align-items:center;justify-content:center;text-align:center;font-size:9.5px;font-weight:600;line-height:1.15;padding:10px 3px 3px;overflow:hidden;overflow-wrap:anywhere}
.mm .taste.leer{background:#18181c}
.mm .tf-raster.frei .taste{aspect-ratio:auto;padding:9px 3px 2px}
.mm .taste.nav{box-shadow:inset 0 0 0 1.5px #9a9aa2}
.mm .taste img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.mm .taste .n{position:absolute;top:2px;left:4px;font-size:8px;font-weight:400;opacity:.7}
.mm .taste .t{position:relative;text-shadow:0 0 3px rgba(0,0,0,.85)}
.mm .tf-liste td.n{width:34px;font-weight:700;text-align:right}
.mm .tf-liste .muted p{margin:0}
`
