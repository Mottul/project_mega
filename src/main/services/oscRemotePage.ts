// Mobile Steuerseite der OSC-Steuerung (eine selbständige HTML-Seite, ohne
// Framework/Build). Zeigt die Oberfläche der aktuellen Oberfläche im selben
// Raster wie der Desktop (gx/gy/cw/ch). Bedienelemente (Fader/Taster/Schalter/
// XY/Farbe) reagieren auf Touch und schicken Steuerbefehle per POST; der Rechner
// sendet daraufhin das OSC. Live-Updates per SSE. Fader/XY ziehen RELATIV
// (kein Sprung auf den Berührungspunkt), wie auf dem Desktop.

export const OSC_MOBILE_PAGE = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>OSC-Steuerung</title>
<style>
:root{--bg:#0f0f12;--card:#1b1b20;--border:#2c2c34;--muted:#26262e;--text:#e8e8ec;--dim:#8a8a99}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
body{margin:0;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,'Segoe UI',sans-serif;overscroll-behavior:none}
header{position:sticky;top:0;z-index:5;background:var(--bg);padding:10px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:9px}
header b{font-size:16px}
#setName{color:var(--dim);font-size:13px}
#dot{width:9px;height:9px;border-radius:50%;background:#ef4444;display:inline-block}
#dot.ok{background:#34d399}
#warn{display:none;margin:10px 14px;padding:10px 12px;border-radius:8px;background:rgba(234,179,8,.12);border:1px solid rgba(234,179,8,.35);color:#eab308;font-size:13px}
#grid{display:grid;padding:12px}
.tile{display:flex;flex-direction:column;min-height:0;border:1px solid var(--border);border-radius:9px;background:var(--card);padding:6px;overflow:hidden}
.lab{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:600;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lab .dot{width:8px;height:8px;border-radius:50%;flex:0 0 auto}
.body{flex:1;min-height:0;display:flex}
.fader{position:relative;flex:1;border-radius:6px;background:var(--muted);overflow:hidden;touch-action:none}
.fader .fill{position:absolute;left:0;right:0;bottom:0;opacity:.85}
.fader .val{position:absolute;left:0;right:0;bottom:2px;text-align:center;font-size:11px;font-variant-numeric:tabular-nums;color:rgba(232,232,236,.9)}
.toggle{flex:1;border:1px solid;border-radius:6px;background:transparent;color:var(--text);font-size:14px;font-weight:700;touch-action:manipulation}
.btn{flex:1;display:flex;align-items:center;justify-content:center;border:1px solid;border-radius:6px;background:transparent;font-size:22px;touch-action:none}
.xy{position:relative;flex:1;border-radius:6px;background:var(--muted);overflow:hidden;touch-action:none}
.xy .dot2{position:absolute;width:16px;height:16px;border-radius:50%;border:2px solid #fff;transform:translate(-50%,-50%);box-shadow:0 1px 3px rgba(0,0,0,.5)}
.color{flex:1;display:flex;flex-direction:column;gap:5px;min-height:0}
.color .swatch{height:22px;border-radius:5px;border:1px solid rgba(255,255,255,.15)}
.crow{display:flex;align-items:center;gap:7px}
.crow span{width:12px;font-size:11px;color:var(--dim)}
.crow input{flex:1}
</style>
</head>
<body>
<header><span id="dot"></span><b>OSC</b><span id="setName"></span></header>
<div id="warn">OSC-Steuerung ist nicht geöffnet. Auf dem Rechner das Werkzeug „OSC-Steuerung" öffnen und die Fernsteuerung aktiv lassen.</div>
<div id="grid"></div>
<script>
var ROWH=38,GAP=8;
var state={connected:false,setName:'',columns:24,widgets:[]};
var sig='',updaters={},activeId=null;

var lastSent=0,pendingCmd=null,timer=null;
function postNow(cmd){fetch('/api/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(cmd)}).catch(function(){});lastSent=Date.now();}
function postCmd(cmd){var now=Date.now();if(now-lastSent>=33){postNow(cmd);}else{pendingCmd=cmd;if(!timer){timer=setTimeout(function(){timer=null;if(pendingCmd){postNow(pendingCmd);pendingCmd=null;}},33-(now-lastSent));}}}

function clamp(v,lo,hi){return v<lo?lo:(v>hi?hi:v);}
function clamp01(v){return clamp(v,0,1);}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function layoutSig(s){return s.columns+'|'+s.widgets.map(function(w){return w.id+':'+w.type+':'+w.gx+','+w.gy+','+w.cw+','+w.ch+':'+w.label+':'+w.color+':'+w.min+','+w.max;}).join(';');}

function makeFader(w,body){
  var lo=Math.min(w.min,w.max),hi=Math.max(w.min,w.max),span=(hi-lo)||1;
  var pad=document.createElement('div');pad.className='fader';
  var fill=document.createElement('div');fill.className='fill';fill.style.background=w.color;
  var val=document.createElement('div');val.className='val';
  pad.appendChild(fill);pad.appendChild(val);body.appendChild(pad);
  var cur=w.value,st=null;
  function paint(v){cur=v;var n=(v-lo)/span;fill.style.height=(n*100)+'%';val.textContent=v.toFixed(2);}
  paint(w.value);
  pad.addEventListener('pointerdown',function(e){pad.setPointerCapture(e.pointerId);activeId=w.id;st={py:e.clientY,v:cur};});
  pad.addEventListener('pointermove',function(e){if(!st)return;var r=pad.getBoundingClientRect();var dN=-(e.clientY-st.py)/r.height;var v=clamp(st.v+dN*span,lo,hi);paint(v);postCmd({kind:'fader',id:w.id,value:v});});
  function up(e){if(e&&e.pointerId!=null){try{pad.releasePointerCapture(e.pointerId);}catch(_){}}st=null;activeId=null;postNow({kind:'fader',id:w.id,value:cur});}
  pad.addEventListener('pointerup',up);pad.addEventListener('pointercancel',function(){st=null;activeId=null;});
  updaters[w.id]=function(nw){if(activeId===w.id)return;paint(nw.value);};
}
function makeToggle(w,body){
  var btn=document.createElement('button');btn.className='toggle';btn.style.borderColor=w.color;
  function paint(on){btn.textContent=on?'AN':'AUS';btn.style.background=on?w.color:'transparent';btn.style.color=on?'#fff':'';btn.dataset.on=on?'1':'';}
  paint(w.value>=0.5);
  btn.addEventListener('click',function(){var on=!(btn.dataset.on==='1');paint(on);postNow({kind:'toggle',id:w.id,on:on});});
  body.appendChild(btn);
  updaters[w.id]=function(nw){paint(nw.value>=0.5);};
}
function makeButton(w,body){
  var btn=document.createElement('button');btn.className='btn';btn.style.borderColor=w.color;btn.style.color=w.color;btn.textContent='\\u26A1';
  function press(p){btn.style.background=p?w.color:'transparent';btn.style.color=p?'#fff':w.color;}
  btn.addEventListener('pointerdown',function(e){btn.setPointerCapture(e.pointerId);press(true);postNow({kind:'button',id:w.id,down:true});});
  function up(){press(false);postNow({kind:'button',id:w.id,down:false});}
  btn.addEventListener('pointerup',up);btn.addEventListener('pointercancel',up);
  body.appendChild(btn);
  updaters[w.id]=function(){};
}
function makeXY(w,body){
  var pad=document.createElement('div');pad.className='xy';
  var dot=document.createElement('div');dot.className='dot2';dot.style.background=w.color;pad.appendChild(dot);
  var cx=w.x,cy=w.y,st=null;
  function paint(x,y){cx=x;cy=y;dot.style.left=(x*100)+'%';dot.style.top=((1-y)*100)+'%';}
  paint(w.x,w.y);
  pad.addEventListener('pointerdown',function(e){pad.setPointerCapture(e.pointerId);activeId=w.id;st={px:e.clientX,py:e.clientY,vx:cx,vy:cy};});
  pad.addEventListener('pointermove',function(e){if(!st)return;var r=pad.getBoundingClientRect();var dx=(e.clientX-st.px)/r.width;var dy=-(e.clientY-st.py)/r.height;var x=clamp01(st.vx+dx),y=clamp01(st.vy+dy);paint(x,y);postCmd({kind:'xy',id:w.id,x:x,y:y});});
  function up(e){if(e&&e.pointerId!=null){try{pad.releasePointerCapture(e.pointerId);}catch(_){}}st=null;activeId=null;postNow({kind:'xy',id:w.id,x:cx,y:cy});}
  pad.addEventListener('pointerup',up);pad.addEventListener('pointercancel',function(){st=null;activeId=null;});
  body.appendChild(pad);
  updaters[w.id]=function(nw){if(activeId===w.id)return;paint(nw.x,nw.y);};
}
function makeColor(w,body){
  var wrap=document.createElement('div');wrap.className='color';
  var sw=document.createElement('div');sw.className='swatch';wrap.appendChild(sw);
  var r=w.r,g=w.g,b=w.b;
  function paintSw(){sw.style.background='rgb('+((r*255)|0)+','+((g*255)|0)+','+((b*255)|0)+')';}
  function row(letter,get,set){
    var el=document.createElement('label');el.className='crow';
    var lab=document.createElement('span');lab.textContent=letter;
    var inp=document.createElement('input');inp.type='range';inp.min='0';inp.max='1';inp.step='0.01';inp.value=get();
    inp.addEventListener('pointerdown',function(){activeId=w.id;});
    inp.addEventListener('input',function(){set(parseFloat(inp.value));paintSw();postCmd({kind:'color',id:w.id,r:r,g:g,b:b});});
    inp.addEventListener('change',function(){activeId=null;postNow({kind:'color',id:w.id,r:r,g:g,b:b});});
    el.appendChild(lab);el.appendChild(inp);return {el:el,inp:inp};
  }
  var rr=row('R',function(){return r;},function(v){r=v;});
  var rg=row('G',function(){return g;},function(v){g=v;});
  var rb=row('B',function(){return b;},function(v){b=v;});
  wrap.appendChild(rr.el);wrap.appendChild(rg.el);wrap.appendChild(rb.el);
  paintSw();body.appendChild(wrap);
  updaters[w.id]=function(nw){if(activeId===w.id)return;r=nw.r;g=nw.g;b=nw.b;rr.inp.value=r;rg.inp.value=g;rb.inp.value=b;paintSw();};
}

function build(){
  var grid=document.getElementById('grid');grid.innerHTML='';updaters={};
  var cols=Math.max(1,Math.min(48,state.columns||24));
  grid.style.gridTemplateColumns='repeat('+cols+',1fr)';
  grid.style.gridAutoRows=ROWH+'px';grid.style.gap=GAP+'px';
  state.widgets.forEach(function(w){
    var gx=Math.min(Math.max(0,w.gx),cols-1),cw=Math.min(w.cw,cols-gx);
    var tile=document.createElement('div');tile.className='tile';
    tile.style.gridColumn=(gx+1)+' / span '+cw;tile.style.gridRow=(w.gy+1)+' / span '+w.ch;
    if(w.ch>=2){var lab=document.createElement('div');lab.className='lab';lab.innerHTML='<span class="dot" style="background:'+esc(w.color)+'"></span>'+esc(w.label||'');tile.appendChild(lab);}
    var bd=document.createElement('div');bd.className='body';tile.appendChild(bd);
    if(w.type==='fader')makeFader(w,bd);
    else if(w.type==='toggle')makeToggle(w,bd);
    else if(w.type==='button')makeButton(w,bd);
    else if(w.type==='xy')makeXY(w,bd);
    else if(w.type==='color')makeColor(w,bd);
    grid.appendChild(tile);
  });
}

function apply(s){
  state=s;
  document.getElementById('setName').textContent=s.setName||'';
  document.getElementById('dot').className=s.connected?'ok':'';
  document.getElementById('warn').style.display=s.connected?'none':'block';
  var ns=layoutSig(s);
  if(ns!==sig){sig=ns;build();}
  else{s.widgets.forEach(function(w){var u=updaters[w.id];if(u)u(w);});}
}

fetch('/api/state').then(function(r){return r.json();}).then(apply).catch(function(){});
try{var es=new EventSource('/api/events');es.onmessage=function(e){try{var m=JSON.parse(e.data);if(m.type==='state')apply(m.payload);}catch(_){}};}catch(_){}
</script>
</body>
</html>`
