// Handy-Fassung der Anleitung (Phase 3): EINE HTML-Datei, die nichts nachlädt – die Fotos setzt
// main beim Speichern ein (services/html). Ohne Skript eine lesbare Seite mit Inhalt und
// Sprungmarken („weiter bei 3“ ist ein Link); mit Skript führt die Fehlersuche Schritt für Schritt
// (Frage, Ja/Nein, nächster Schritt, Zurück). Die Online-Fassung (pCloud Public Folder …) zeigt
// nie Zugangsdaten und höchstens die Stufe Betreuung: Die Adresse kennt jeder mit der Kurzkarte.

import { esc, safeHref } from '@shared/html'
import { kapitelDef, type Anleitung, type Stufe } from './model'
import {
  css,
  deckblatt,
  kapitelHtml,
  sichtbareKapitel,
  telNummer,
  type SeitenKontext
} from './seiten'

/** Höchste Stufe der Online-Fassung */
export const ONLINE_STUFE: Stufe = 2

/** Online: keine Lernausgabe, höchstens Betreuung */
export function onlineKontext(c: SeitenKontext): SeitenKontext {
  const stufe = Math.min(c.lern ? ONLINE_STUFE : c.stufe, ONLINE_STUFE) as Stufe
  return { ...c, lern: false, stufe }
}

const HANDY_CSS = `
html{-webkit-text-size-adjust:100%}
body.mm{max-width:760px;margin:0 auto;padding:14px 14px 76px;font-size:16px;line-height:1.55}
.mm h1{font-size:25px}
.mm h2{font-size:20px}
.mm h3{font-size:17px}
.mm .kapitel{padding:6px 0 18px}
.mm .kapitel+.kapitel{break-before:auto;border-top:1px solid #e2e2e2;padding-top:16px}
.mm .deckblatt{min-height:0;gap:10px}
.mm .deckblatt h1{margin-top:6px}
.mm .deckblatt img.foto{max-height:50vh}
.mm table{display:block;overflow-x:auto;max-width:100%}
.mm .kontakte{grid-template-columns:minmax(0,1fr)}
.mm img.foto{max-height:60vh}
.mm .fotos.n3 figure{flex-basis:calc(50% - 6px);max-width:calc(50% - 6px)}
.mm .fs .ziele{font-size:14px}
.mm a{color:inherit}
.inhalt{border:1px solid #e2e2e2;border-radius:6px;padding:8px 12px;margin:6px 0 4px}
.inhalt ol{margin:4px 0 0 22px}
.inhalt a{text-decoration:none}
.anruf{position:fixed;left:0;right:0;bottom:0;display:flex;justify-content:center;padding:8px 12px calc(8px + env(safe-area-inset-bottom));background:#fff;border-top:1px solid #e2e2e2}
.anruf a{display:block;width:100%;max-width:520px;text-align:center;background:#1b5e20;color:#fff;font-weight:700;border-radius:8px;padding:11px 12px;text-decoration:none}
.sfs-start{display:inline-block;margin:4px 0 8px;font:inherit;font-weight:600;padding:8px 14px;border-radius:8px;border:1.5px solid #1a1a1e;background:#fff}
.sfs .fs{display:none}
.sfs .fs.aktiv{display:grid;border-top:0}
.sfs .fs .ziele{display:none}
.sfs .fs .q{font-size:18px}
.sfs-box{display:none}
.sfs .sfs-box{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 12px}
.sfs-box button{flex:1 1 40%;font:inherit;font-weight:700;padding:13px 10px;border-radius:8px;border:1.5px solid #1a1a1e;background:#fff;color:#1a1a1e}
.sfs-box button.ja{background:#e8f5e9;border-color:#1b5e20}
.sfs-box button.nein{background:#fdecec;border-color:#8e1b1b}
.sfs-box button.klein{flex:0 1 auto;font-weight:400;padding:8px 12px;border-color:#bbb}
.sfs-ende{flex:1 1 100%;font-size:18px;padding:10px 12px;border-radius:8px;background:#f7f7f7}
.sfs .sfs-start{display:none}
@media print{.anruf,.sfs-start,.sfs-box{display:none}.sfs .fs{display:grid}.sfs .fs .ziele{display:flex}}`

/**
 * Schritt für Schritt: liest die Schritte aus dem Dokument (data-nr, .z mit data-wahl/data-ziel,
 * .zt mit dem Text des Ziels) – dieselbe Seite bleibt ohne Skript vollständig. Bewusst ohne
 * neuere Sprachmittel, damit auch ältere Handy-Browser mitkommen.
 */
export const HANDY_JS = `(function(){
var d=document;
function alle(el,sel){return Array.prototype.slice.call(el.querySelectorAll(sel))}
function knopf(text,cls,fn){var b=d.createElement('button');b.type='button';b.className=cls;b.textContent=text;b.addEventListener('click',fn);return b}
alle(d,'.fall[data-fall]').forEach(function(fall){
var schritte=alle(fall,'.fs');if(!schritte.length)return;
var weg=[];var box=d.createElement('div');box.className='sfs-box';
var start=knopf('Schritt für Schritt','sfs-start',function(){zeige(1,true)});
fall.insertBefore(start,schritte[0]);fall.appendChild(box);
fall.addEventListener('sfs-start',function(){zeige(1,true)});
function schritt(nr){for(var i=0;i<schritte.length;i++)if(schritte[i].getAttribute('data-nr')===String(nr))return schritte[i];return null}
function aus(){schritte.forEach(function(s){s.classList.remove('aktiv')})}
function fuss(){
if(weg.length>1||box.getAttribute('data-ende'))box.appendChild(knopf('Zurück','klein',zurueck));
box.appendChild(knopf('Von vorn','klein',function(){zeige(1,true)}));
box.appendChild(knopf('Alle Schritte zeigen','klein',function(){fall.classList.remove('sfs');aus();box.innerHTML=''}))}
function zeige(nr,neu){var s=schritt(nr);if(!s)return;if(neu)weg=[];
fall.classList.add('sfs');aus();s.classList.add('aktiv');weg.push(nr);box.innerHTML='';box.removeAttribute('data-ende');
alle(s,'.z').forEach(function(z){var w=z.getAttribute('data-wahl');
box.appendChild(knopf(w==='Dann'?'Erledigt – weiter':w,w==='Ja'?'ja':w==='Nein'?'nein':'',function(){folge(z)}))});
fuss();if(fall.scrollIntoView)fall.scrollIntoView({block:'start'})}
function folge(z){var ziel=z.getAttribute('data-ziel')||'ende';
if(ziel.indexOf('s:')===0)return zeige(+ziel.slice(2));
if(ziel.indexOf('f:')===0){var id=ziel.slice(2);var f=alle(d,'.fall[data-fall]').filter(function(x){return x.getAttribute('data-fall')===id})[0];
if(f){fall.classList.remove('sfs');aus();box.innerHTML='';try{f.dispatchEvent(new CustomEvent('sfs-start'))}catch(e){}}return}
box.innerHTML='';box.setAttribute('data-ende','1');var e=d.createElement('div');e.className='sfs-ende';
var t=z.querySelector('.zt');e.innerHTML=t?t.innerHTML:'';box.appendChild(e);fuss()}
function zurueck(){if(box.getAttribute('data-ende')){return zeige(weg.pop())}weg.pop();var vor=weg.pop();if(vor)zeige(vor)}
});
})();`

/** Handy-Fassung: online ohne Zugangsdaten und höchstens Betreuung */
export function handyHtml(a: Anleitung, c0: SeitenKontext, o: { online: boolean }): string {
  const c = o.online ? onlineKontext(c0) : c0
  // online nie Zugangsdaten – auch nicht als „wird separat übergeben“
  const ks = sichtbareKapitel(a, c).filter((k) => !(o.online && k.id === 'zugang'))
  const inhalt = ks.length
    ? `<nav class="inhalt" aria-label="Inhalt"><b>Inhalt</b><ol>${ks
        .map((k) => `<li><a href="#k-${k.id}">${esc(kapitelDef(k.id).titel)}</a></li>`)
        .join('')}</ol></nav>`
    : ''
  const k = a.kontakte[0]
  const tel = k ? telNummer(k.mobil || k.buero) : ''
  const anruf =
    k && tel.length > 3
      ? `<div class="anruf"><a href="${safeHref(`tel:${tel}`)}">Anrufen: ${esc(k.name || 'Kontakt')}</a></div>`
      : ''
  const body =
    deckblatt(a, c) +
    inhalt +
    ks.map((x, i) => kapitelHtml(x, i + 1, a, c)).join('') +
    anruf +
    `<script>${HANDY_JS}</script>`
  return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>${esc(a.titel)}</title><style>${css(c)}${HANDY_CSS}</style></head><body class="mm">${body}</body></html>`
}
