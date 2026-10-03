// Gemeinsame Web-App-Bausteine (PWA) der mobilen Steuerseiten und der Startseite
// der Fernsteuer-App: Kopf-Tags (Manifest, Home-Bildschirm-Icon, Start ohne
// Browserleiste), ein kleines Client-Skript (Vollbild-Knopf, Display wach halten,
// Knopf zurück zur Startseite) und die Server-Routen für Manifest und Icons.
//
// Warum so: Das iPhone kennt für Webseiten KEINE Vollbild-API – ohne Browserleiste
// läuft eine Seite dort nur als vom Home-Bildschirm gestartete Web-App. Android
// und iPad haben die Fullscreen-API; dort merkt sich das Skript den Vollbild-
// Wunsch und stellt ihn nach App-Wechsel/Neuladen beim nächsten Tippen wieder her
// (Vollbild verlangt eine Nutzergeste). Echte Installation per Manifest und die
// Wake-Lock-API geben die Browser nur über HTTPS frei – im LAN (http://<ip>)
// greifen sie nicht, das Skript nutzt Wake-Lock daher nur, wo verfügbar.
//
// Achtung: PWA_SCRIPT ist ein Template-Literal -> im Client-JS keine Backslashes,
// Backticks oder ${…} (würden schon beim Laden des Moduls ausgewertet).

import type { IncomingMessage, ServerResponse } from 'node:http'
import { APP_NAME } from '@shared/brand'

/** Hintergrund der Steuerseiten (Startbildschirm/Statusleiste der Web-App). */
export const PWA_BACKGROUND = '#0f0f12'

/** Icon-Routen -> Kantenlänge. 180 = Home-Bildschirm-Icon von iOS (das iOS ohne
 *  <link> auch selbst unter /apple-touch-icon*.png sucht), 192/512 = Manifest. */
const ICON_ROUTES = new Map<string, number>([
  ['/icon-180.png', 180],
  ['/apple-touch-icon.png', 180],
  ['/apple-touch-icon-precomposed.png', 180],
  ['/icon-192.png', 192],
  ['/icon-512.png', 512]
])

/** Liefert das App-Icon als PNG der gewünschten Kantenlänge (oder null). Wird vom
 *  main-Prozess gesetzt (Electron rendert es), damit dieses Modul ohne Electron
 *  testbar bleibt. */
type IconSource = (size: number) => Buffer | null
let iconSource: IconSource = () => null

export function setPwaIconSource(source: IconSource): void {
  iconSource = source
}

/** Kopf-Tags für <head>. Alle Pfade sind absolut: Unter der Fernsteuer-App
 *  (/<id>/) gehören Manifest und Icons der App-Wurzel, damit Startseite und alle
 *  Steuerseiten EINE Web-App bilden. */
export function pwaHead(themeColor: string = PWA_BACKGROUND): string {
  return [
    `<meta name="theme-color" content="${themeColor}">`,
    '<meta name="apple-mobile-web-app-capable" content="yes">',
    '<meta name="mobile-web-app-capable" content="yes">',
    '<meta name="apple-mobile-web-app-status-bar-style" content="black">',
    `<meta name="apple-mobile-web-app-title" content="${APP_NAME}">`,
    '<link rel="manifest" href="/manifest.webmanifest">',
    '<link rel="apple-touch-icon" href="/icon-180.png">',
    '<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">',
    NAV_STYLE,
    EVENTSOURCE_GUARD
  ].join('\n')
}

// Kopfzeilen-Knöpfe (Zurück zur Startseite, Vollbild) – auf allen Seiten gleich.
// Der Zurück-Knopf erscheint nur unter der Fernsteuer-App (Klasse setzt PWA_SCRIPT).
const NAV_STYLE =
  '<style>' +
  '.navbtn{display:flex;align-items:center;justify-content:center;flex:0 0 auto;width:40px;height:40px;' +
  'min-height:0;padding:0;margin:0;border-radius:10px;background:#1b1b20;border:1px solid #2c2c34;' +
  'color:#8a8a99;cursor:pointer;text-decoration:none;box-shadow:none;font:inherit}' +
  '.navbtn:active{filter:brightness(1.3)}.navbtn.navright{margin-left:auto}' +
  'html:not(.in-app) [data-home]{display:none!important}' +
  '</style>'

/** Zurück-Knopf (Pfeil) zur Startseite der Fernsteuer-App. */
export const HOME_BUTTON =
  '<a href="../" class="navbtn" data-home aria-label="Alle Fernsteuerungen" title="Alle Fernsteuerungen">' +
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></a>'

/** Vollbild-Knopf (rechts in der Kopfzeile); Icon setzt PWA_SCRIPT. */
export const FS_BUTTON =
  '<button class="navbtn navright" data-fs="20" aria-label="Vollbild"></button>'

// Live-Verbindungen (EventSource) beim Verlassen der Seite AUSDRÜCKLICH schließen.
// Browser erlauben pro Adresse nur ~6 gleichzeitige Verbindungen; bleibt beim
// Seitenwechsel eine alte offen (z. B. iOS hält Seiten im Zurück-Cache), warten
// neue Seiten auf eine freie Verbindung -> zähes Laden. Kommt eine Seite aus dem
// Zurück-Cache wieder, wird sie neu geladen (frischer Stand + neue Verbindung).
// Muss im <head> laufen, damit es die Seiten-Skripte schon nutzen.
const EVENTSOURCE_GUARD =
  '<script>(function(){var E=window.EventSource;if(!E)return;var open=[];' +
  'function G(u,o){var es=new E(u,o);open.push(es);return es;}' +
  'G.prototype=E.prototype;G.CONNECTING=0;G.OPEN=1;G.CLOSED=2;window.EventSource=G;' +
  "addEventListener('pagehide',function(){for(var i=0;i<open.length;i++)open[i].close();open=[];});" +
  "addEventListener('pageshow',function(e){if(e.persisted)location.reload();});})();</script>"

/** Web-App-Manifest. display 'fullscreen' fällt auf iOS auf 'standalone' zurück
 *  (Statusleiste bleibt, Browserleiste weg). */
export function pwaManifest(): string {
  return JSON.stringify({
    id: '/',
    name: `${APP_NAME} Fernsteuerung`,
    short_name: APP_NAME,
    lang: 'de',
    start_url: '/',
    scope: '/',
    display: 'fullscreen',
    display_override: ['fullscreen', 'standalone'],
    orientation: 'any',
    background_color: PWA_BACKGROUND,
    theme_color: PWA_BACKGROUND,
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }
    ]
  })
}

/** Beantwortet Manifest- und Icon-Anfragen. true = erledigt, sonst false. */
export function servePwaAsset(req: IncomingMessage, res: ServerResponse): boolean {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname
  if (path === '/manifest.webmanifest') {
    res.writeHead(200, {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'no-cache'
    })
    res.end(pwaManifest())
    return true
  }
  const size = ICON_ROUTES.get(path)
  if (size === undefined) return false
  const png = iconSource(size)
  if (!png) {
    res.writeHead(404)
    res.end('not found')
    return true
  }
  res.writeHead(200, {
    'Content-Type': 'image/png',
    'Content-Length': png.length,
    'Cache-Control': 'public, max-age=86400'
  })
  res.end(png)
  return true
}

/** Client-Skript für alle Steuerseiten (ans Ende von <body>). Bedient Knöpfe mit
 *  [data-fs] (Wert = Icon-Größe in px) und setzt am <html> die Klassen 'pwa'
 *  (als Web-App gestartet) und 'in-app' (unter der Fernsteuer-App, /<id>/). */
export const PWA_SCRIPT = `<script>
(function(){
  var de=document.documentElement, KEY='mb-fullscreen';
  function wantFs(){try{return localStorage.getItem(KEY)==='1';}catch(_){return false;}}
  function setWantFs(on){try{if(on)localStorage.setItem(KEY,'1');else localStorage.removeItem(KEY);}catch(_){}}
  function mq(q){return !!(window.matchMedia&&window.matchMedia(q).matches);}

  // Vom Home-Bildschirm gestartet -> schon ohne Browserleiste, Vollbild-Knopf unnötig.
  var standalone=navigator.standalone===true||mq('(display-mode: standalone)')||mq('(display-mode: fullscreen)');
  if(standalone)de.classList.add('pwa');
  // Unter der Fernsteuer-App liegt jede Steuerseite unter /<id>/.
  var seg=location.pathname.split('/');
  if(seg.length===3&&seg[1]&&(seg[2]===''||seg[2]==='index.html'))de.classList.add('in-app');

  var canFs=!!(de.requestFullscreen||de.webkitRequestFullscreen);
  function isFs(){return !!(document.fullscreenElement||document.webkitFullscreenElement);}
  function run(fn,ctx){try{var p=fn.call(ctx);if(p&&p.catch)p.catch(function(){});}catch(_){}}
  function enterFs(){run(de.requestFullscreen||de.webkitRequestFullscreen,de);}
  function exitFs(){run(document.exitFullscreen||document.webkitExitFullscreen,document);}

  var MAX='<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>';
  var MIN='<path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>';
  var btns=document.querySelectorAll('[data-fs]');
  function paint(){
    var on=isFs();
    for(var i=0;i<btns.length;i++){
      var sz=btns[i].getAttribute('data-fs')||'20';
      btns[i].innerHTML='<svg viewBox="0 0 24 24" width="'+sz+'" height="'+sz+'" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block">'+(on?MIN:MAX)+'</svg>';
      btns[i].setAttribute('aria-label',on?'Vollbild beenden':'Vollbild');
    }
  }
  for(var i=0;i<btns.length;i++){
    if(!canFs||standalone){btns[i].style.display='none';continue;}
    btns[i].addEventListener('click',function(){
      if(isFs()){setWantFs(false);exitFs();}else{setWantFs(true);enterFs();}
    });
  }

  // Vollbild-Wunsch wiederherstellen: Nach App-Wechsel, Neuladen oder Seitenwechsel
  // ist das Vollbild weg; der Browser erlaubt es erst wieder mit einer Nutzergeste
  // -> beim nächsten Tippen irgendwo erneut anfordern.
  var TAP=['pointerup','touchend','click'], armed=false;
  function onTap(e){
    if(e.target&&e.target.closest&&e.target.closest('[data-fs]'))return;
    if(!isFs()&&wantFs())enterFs();
  }
  function arm(){
    if(armed||!canFs||standalone||isFs()||!wantFs())return;
    armed=true;
    for(var i=0;i<TAP.length;i++)document.addEventListener(TAP[i],onTap,true);
  }
  function disarm(){
    if(!armed)return;
    armed=false;
    for(var i=0;i<TAP.length;i++)document.removeEventListener(TAP[i],onTap,true);
  }
  function onFsChange(){
    paint();
    if(isFs()){disarm();return;}
    // Bei sichtbarer Seite hat der Nutzer das Vollbild verlassen (Zurück-Geste,
    // Esc) -> Wunsch vergessen. Bei App-Wechsel/Sperre ist die Seite verdeckt.
    setTimeout(function(){
      if(!isFs()&&document.visibilityState==='visible')setWantFs(false);
    },400);
  }
  document.addEventListener('fullscreenchange',onFsChange);
  document.addEventListener('webkitfullscreenchange',onFsChange);

  // Display wach halten (Wake-Lock gibt es nur in sicheren Kontexten).
  var lock=null, asking=false;
  function keepAwake(){
    if(lock||asking||!('wakeLock' in navigator)||document.visibilityState!=='visible')return;
    asking=true;
    navigator.wakeLock.request('screen').then(function(l){
      lock=l;asking=false;
      l.addEventListener('release',function(){lock=null;});
    }).catch(function(){asking=false;});
  }
  document.addEventListener('pointerup',keepAwake,true);
  document.addEventListener('visibilitychange',function(){
    if(document.visibilityState==='visible'){arm();keepAwake();}
  });

  paint();
  arm();
  keepAwake();
})();
</script>`
