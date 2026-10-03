// Startseite der Fernsteuer-App (eine selbständige HTML-Seite, ohne Framework/
// Build): große Kacheln für alle Fernsteuerungen, aktive führen zur Steuerseite
// unter /<id>/, ausgeschaltete sagen, wo man sie am Rechner einschaltet. Live-
// Updates per SSE. Dazu einmalige Hinweise zum Installieren als Web-App und zum
// Wachhalten des Displays (beides lässt sich per http im LAN nicht erzwingen).
// Achtung Template-Literal: im Client-JS keine Backslashes, Backticks oder ${…}.

import { APP_NAME } from '@shared/brand'
import { FS_BUTTON, PWA_SCRIPT, pwaHead } from './remotePwa'

export const REMOTE_APP_PAGE = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>${APP_NAME} Fernsteuerung</title>
${pwaHead()}
<style>
:root{--bg:#0f0f12;--card:#1b1b20;--border:#2c2c34;--muted:#26262e;--text:#e8e8ec;--dim:#8a8a99;--gold:#ffce2c;--ok:#34d399}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
body{margin:0;min-height:100vh;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,'Segoe UI',sans-serif}
header{display:flex;align-items:center;gap:12px;padding:16px 16px 6px;max-width:960px;margin:0 auto}
.logo{width:44px;height:44px;border-radius:11px;flex:0 0 auto}
h1{margin:0;font-size:20px;line-height:1.15}
.sub{color:var(--dim);font-size:13px;margin-top:2px}
main{padding:10px 16px 28px;max-width:960px;margin:0 auto}
#offline{display:none;margin-bottom:12px;padding:10px 12px;border-radius:10px;background:rgba(234,179,8,.12);border:1px solid rgba(234,179,8,.35);color:#eab308;font-size:13px}
#list{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(270px,1fr))}
.tile{display:flex;align-items:center;gap:14px;min-height:92px;padding:16px;border-radius:14px;background:var(--card);border:1px solid var(--border);color:inherit;text-decoration:none;transition:transform .06s}
a.tile:active{transform:scale(.985);border-color:var(--gold)}
.ic{width:50px;height:50px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex:0 0 auto;background:rgba(255,206,44,.12);color:var(--gold)}
.tx{flex:1;min-width:0}
.t{display:block;font-size:17px;font-weight:700}
.d{display:block;font-size:13px;color:var(--dim);margin-top:3px;line-height:1.35}
.st{align-self:flex-start;flex:0 0 auto;font-size:12px;font-weight:600;padding:3px 9px;border-radius:999px;background:rgba(52,211,153,.14);color:var(--ok)}
.tile.off{opacity:.6}
.tile.off .ic{background:var(--muted);color:var(--dim)}
.hint{display:flex;gap:10px;align-items:flex-start;margin-top:16px;padding:12px 14px;border-radius:12px;border:1px solid var(--border);background:var(--card);font-size:13px;color:var(--dim);line-height:1.45}
.hint[hidden]{display:none}
.hint b{color:var(--text)}
.hint .x{margin-left:auto;flex:0 0 auto;background:transparent;border:none;color:var(--dim);font-size:18px;line-height:1;padding:2px 4px;cursor:pointer}
</style>
</head>
<body>
<header>
<img class="logo" src="/icon-180.png" alt="" onerror="this.style.display='none'">
<div><h1>${APP_NAME}</h1><div class="sub">Fernsteuerung</div></div>
${FS_BUTTON}
</header>
<main>
<div id="offline">Keine Verbindung zum Rechner. Läuft dort noch eine Fernsteuerung? Es wird automatisch erneut verbunden …</div>
<div id="list"></div>
<div id="install" class="hint" hidden><span id="install-text"></span><button class="x" data-close="install" aria-label="Hinweis schließen">×</button></div>
<div id="awake" class="hint" hidden><span id="awake-text"></span><button class="x" data-close="awake" aria-label="Hinweis schließen">×</button></div>
</main>
${PWA_SCRIPT}
<script>
(function(){
  function el(id){return document.getElementById(id);}
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  function svg(inner){return '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+inner+'</svg>';}

  function render(remotes){
    var h='';
    for(var i=0;i<remotes.length;i++){
      var r=remotes[i], ic='<span class="ic">'+svg(r.icon)+'</span>';
      if(r.running){
        h+='<a class="tile" href="'+esc(r.id)+'/">'+ic+'<span class="tx"><span class="t">'+esc(r.name)+'</span><span class="d">'+esc(r.description)+'</span></span><span class="st">bereit</span></a>';
      }else{
        h+='<div class="tile off">'+ic+'<span class="tx"><span class="t">'+esc(r.name)+'</span><span class="d">Aus – am Rechner im Werkzeug „'+esc(r.tool)+'“ unter „Fernsteuerung“ aktivieren.</span></span></div>';
      }
    }
    el('list').innerHTML=h;
  }

  fetch('api/remotes').then(function(r){return r.json();}).then(function(d){render(d.remotes);}).catch(function(){});
  try{
    var es=new EventSource('api/events');
    es.onopen=function(){el('offline').style.display='none';};
    es.onerror=function(){el('offline').style.display='block';};
    es.onmessage=function(e){try{var m=JSON.parse(e.data);if(m.type==='state')render(m.payload.remotes);}catch(_){}};
  }catch(_){}

  // Einmalige Hinweise (schließbar, gemerkt pro Gerät).
  function seen(k){try{return localStorage.getItem('mb-hint-'+k)==='1';}catch(_){return false;}}
  function show(k,html){if(seen(k))return;el(k+'-text').innerHTML=html;el(k).hidden=false;}
  document.addEventListener('click',function(e){
    var b=e.target.closest&&e.target.closest('[data-close]');if(!b)return;
    var k=b.getAttribute('data-close');el(k).hidden=true;
    try{localStorage.setItem('mb-hint-'+k,'1');}catch(_){}
  });
  var ua=navigator.userAgent||'';
  var ios=/iPhone|iPad|iPod/.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  var android=/Android/i.test(ua);
  var app=document.documentElement.classList.contains('pwa');
  if(!app&&ios){
    show('install','<b>Als App auf den Home-Bildschirm:</b> In Safari auf das Teilen-Symbol tippen und „Zum Home-Bildschirm“ wählen. Von dort startet die Fernsteuerung ohne Browserleiste im Vollbild – mit allen Steuerseiten.');
  }else if(!app&&android){
    show('install','<b>Als App auf den Startbildschirm:</b> Im Browser-Menü ⋮ „Zum Startbildschirm hinzufügen“ wählen. Vollbild gibt es über das Symbol oben rechts; nach einem App-Wechsel kehrt es beim nächsten Tippen zurück.');
  }
  if((ios||android)&&!('wakeLock' in navigator)){
    show('awake','<b>Display wach halten:</b> Über eine WLAN-Adresse (http) dürfen Webseiten die Bildschirmsperre nicht abschalten. Für die Show deshalb am Gerät die automatische Sperre aus- oder hochstellen'+(ios?' (Einstellungen › Anzeige & Helligkeit › Automatische Sperre).':' (Einstellungen › Display › Bildschirm-Timeout).'));
  }
})();
</script>
</body>
</html>`
