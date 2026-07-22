// Mobile Steuerseite des Jingle-Players (eine selbständige HTML-Seite). Zeigt die
// Pads der aktuellen Bank als Raster; Tippen feuert den Jingle, großer Stopp-
// Button faded alles aus. Live-Updates per SSE. Bewusst ohne Framework/Build.

export const JINGLE_MOBILE_PAGE = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>Jingles</title>
<style>
:root{--bg:#0f0f12;--card:#1b1b20;--border:#2c2c34;--text:#e8e8ec;--dim:#8a8a99;--gold:#eab308}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
body{margin:0;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,'Segoe UI',sans-serif}
header{position:sticky;top:0;background:var(--bg);padding:12px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px}
header b{font-size:17px}
#bank{color:var(--dim);font-size:13px}
#warn{display:none;margin:10px 14px;padding:10px 12px;border-radius:8px;background:rgba(234,179,8,.12);border:1px solid rgba(234,179,8,.35);color:var(--gold);font-size:13px}
#grid{display:grid;gap:10px;padding:14px;grid-template-columns:repeat(2,minmax(0,1fr))}
.pad{border:none;border-radius:12px;min-height:96px;color:#000;font-size:15px;font-weight:700;padding:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;text-align:center;line-height:1.2;overflow-wrap:anywhere;transition:transform .05s,filter .1s}
.pad:active{transform:scale(.97)}
.pad.empty{background:var(--card);color:var(--dim);border:1px dashed var(--border);font-weight:400}
.pad.playing{outline:3px solid #fff;filter:brightness(1.1)}
footer{position:sticky;bottom:0;padding:12px 14px;background:var(--bg);border-top:1px solid var(--border)}
#stop{width:100%;padding:16px;border:none;border-radius:12px;background:#ef4444;color:#fff;font-size:17px;font-weight:700;cursor:pointer}
#stop:active{filter:brightness(.9)}
#dot{width:9px;height:9px;border-radius:50%;background:#ef4444;display:inline-block}
#dot.ok{background:#34d399}
.hbtn{margin-left:auto;background:var(--card);border:1px solid var(--border);color:var(--dim);border-radius:9px;padding:7px;display:flex;align-items:center;justify-content:center;cursor:pointer}
.hbtn:active{filter:brightness(1.3)}
</style>
</head>
<body>
<header><span id="dot"></span><b>Jingles</b><span id="bank"></span><button id="fs" class="hbtn" aria-label="Vollbild"></button></header>
<div id="warn">Jingle-Player ist nicht geöffnet. Auf dem Rechner das Werkzeug „Jingle-Player" öffnen.</div>
<div id="grid"></div>
<footer><button id="stop">■ Alles stoppen</button></footer>
<script>
var state={connected:false,bankName:'',columns:2,pads:[],playing:[]};
function post(cmd){fetch('/api/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(cmd)}).catch(function(){});}
function render(){
  document.getElementById('bank').textContent=state.bankName||'';
  document.getElementById('dot').className=state.connected?'ok':'';
  document.getElementById('warn').style.display=state.connected?'none':'block';
  var cols=Math.max(1,Math.min(6,state.columns||2));
  var grid=document.getElementById('grid');
  grid.style.gridTemplateColumns='repeat('+cols+',minmax(0,1fr))';
  var playing={};(state.playing||[]).forEach(function(id){playing[id]=true;});
  grid.innerHTML='';
  (state.pads||[]).forEach(function(p){
    var b=document.createElement('button');
    if(!p.loaded){b.className='pad empty';b.textContent='—';}
    else{b.className='pad'+(playing[p.id]?' playing':'');b.style.background=p.color||'#64748b';b.textContent=p.label||'Jingle';b.onclick=function(){post({type:'trigger',padId:p.id});};}
    grid.appendChild(b);
  });
}
document.getElementById('stop').onclick=function(){post({type:'stopAll'});};
function applyState(s){state=s;render();}
fetch('/api/state').then(function(r){return r.json();}).then(applyState).catch(function(){});
try{
  var es=new EventSource('/api/events');
  es.onmessage=function(e){try{var m=JSON.parse(e.data);if(m.type==='state')applyState(m.payload);}catch(_){}};
}catch(_){}
render();
(function(){var de=document.documentElement,b=document.getElementById('fs');if(!b)return;
var MAX='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
var MIN='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>';
function fs(){return !!(document.fullscreenElement||document.webkitFullscreenElement);}
function u(){b.innerHTML=fs()?MIN:MAX;}
if(!(de.requestFullscreen||de.webkitRequestFullscreen)){b.style.display='none';return;}
b.onclick=function(){if(fs()){(document.exitFullscreen||document.webkitExitFullscreen).call(document);}else{(de.requestFullscreen||de.webkitRequestFullscreen).call(de);}};
document.addEventListener('fullscreenchange',u);document.addEventListener('webkitfullscreenchange',u);u();
})();
</script>
</body>
</html>`
