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
:root{--bg:#0f0f12;--card:#1b1b20;--border:#2c2c34;--muted:#26262e;--text:#e8e8ec;--dim:#8a8a99;--accent:#3b82f6}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
body{margin:0;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,'Segoe UI',sans-serif;overscroll-behavior:none}
header{position:sticky;top:0;z-index:5;background:var(--bg);border-bottom:1px solid var(--border)}
.hrow{display:flex;align-items:center;gap:9px;padding:10px 14px}
header b{font-size:16px}
#setName{color:var(--dim);font-size:13px}
#sets{display:flex;gap:6px;overflow-x:auto;padding:0 14px 9px;-webkit-overflow-scrolling:touch}
#sets:empty{display:none}
.settab{flex:0 0 auto;border:1px solid var(--border);background:var(--card);color:var(--dim);padding:6px 13px;border-radius:8px;font-size:13px;font-weight:600;white-space:nowrap;touch-action:manipulation}
.settab.on{border-color:var(--accent);background:rgba(59,130,246,.15);color:var(--text)}
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
.cslider{position:relative;flex:1;height:16px;border-radius:5px;background:var(--muted);overflow:hidden;touch-action:none}
.cfill{position:absolute;left:0;top:0;bottom:0;background:rgba(255,255,255,.18)}
.cthumb{position:absolute;top:50%;width:12px;height:12px;border-radius:50%;border:2px solid #fff;background:#fff;transform:translate(-50%,-50%)}
.lblview{display:flex;height:100%;width:100%;align-items:center;font-weight:600;line-height:1.1;overflow:hidden;word-break:break-word}
.meter{flex:1;display:flex;flex-direction:column;justify-content:center;gap:6px}
.mval{text-align:center;font-size:18px;font-weight:600;font-variant-numeric:tabular-nums;line-height:1}
.mbar{height:8px;border-radius:9999px;background:var(--muted);overflow:hidden}
.mfill{height:100%;border-radius:9999px;transition:width .15s}
</style>
</head>
<body>
<header><div class="hrow"><span id="dot"></span><b>OSC</b><span id="setName"></span></div><div id="sets"></div></header>
<div id="warn">OSC-Steuerung ist nicht geöffnet. Auf dem Rechner das Werkzeug „OSC-Steuerung" öffnen und die Fernsteuerung aktiv lassen.</div>
<div id="grid"></div>
<script>
var ROWH=38,GAP=8;
var CHECKER='repeating-conic-gradient(#0006 0% 25%, #fff3 0% 50%) 50% / 10px 10px';
var state={connected:false,setName:'',columns:24,widgets:[],sets:[],currentSetId:''};
var sig='',ssig='',updaters={},activeId=null;

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
  var r=w.r,g=w.g,b=w.b,a=(w.a==null?1:w.a);
  function cmd(){return {kind:'color',id:w.id,r:r,g:g,b:b,a:a};}
  function paintSw(){var c='rgba('+((r*255)|0)+','+((g*255)|0)+','+((b*255)|0)+','+a+')';sw.style.background='linear-gradient('+c+','+c+'),'+CHECKER;}
  // Horizontaler Kanalregler mit RELATIVEM Greifen (wie Fader/XY auf dem Desktop).
  function relRow(letter,get,set){
    var el=document.createElement('div');el.className='crow';
    var lab=document.createElement('span');lab.textContent=letter;
    var sl=document.createElement('div');sl.className='cslider';
    var fill=document.createElement('div');fill.className='cfill';
    var thumb=document.createElement('div');thumb.className='cthumb';
    sl.appendChild(fill);sl.appendChild(thumb);el.appendChild(lab);el.appendChild(sl);
    var st=null;
    function paint(v){var p=clamp01(v)*100;fill.style.width=p+'%';thumb.style.left=p+'%';}
    paint(get());
    sl.addEventListener('pointerdown',function(e){sl.setPointerCapture(e.pointerId);activeId=w.id;st={px:e.clientX,v:get()};});
    sl.addEventListener('pointermove',function(e){if(!st)return;var rc=sl.getBoundingClientRect();var v=clamp01(st.v+(e.clientX-st.px)/rc.width);set(v);paint(v);paintSw();postCmd(cmd());});
    function up(e){if(e&&e.pointerId!=null){try{sl.releasePointerCapture(e.pointerId);}catch(_){}}st=null;activeId=null;postNow(cmd());}
    sl.addEventListener('pointerup',up);sl.addEventListener('pointercancel',function(){st=null;activeId=null;});
    return {el:el,paint:paint};
  }
  var rr=relRow('R',function(){return r;},function(v){r=v;});
  var rg=relRow('G',function(){return g;},function(v){g=v;});
  var rb=relRow('B',function(){return b;},function(v){b=v;});
  var ra=relRow('A',function(){return a;},function(v){a=v;});
  wrap.appendChild(rr.el);wrap.appendChild(rg.el);wrap.appendChild(rb.el);wrap.appendChild(ra.el);
  paintSw();body.appendChild(wrap);
  updaters[w.id]=function(nw){if(activeId===w.id)return;r=nw.r;g=nw.g;b=nw.b;a=(nw.a==null?1:nw.a);rr.paint(r);rg.paint(g);rb.paint(b);ra.paint(a);paintSw();};
}
function alignJustify(al){return al==='left'?'flex-start':al==='right'?'flex-end':'center';}
function makeLabel(w,body){
  var el=document.createElement('div');el.className='lblview';
  function paint(nw){el.textContent=nw.label||'Überschrift';el.style.color=nw.color;el.style.justifyContent=alignJustify(nw.align);el.style.textAlign=(nw.align||'center');el.style.fontSize=Math.min(10+nw.ch*6,42)+'px';}
  paint(w);body.appendChild(el);
  updaters[w.id]=paint;
}
function makeMeter(w,body){
  var wrap=document.createElement('div');wrap.className='meter';
  var val=document.createElement('div');val.className='mval';
  var bar=document.createElement('div');bar.className='mbar';
  var fill=document.createElement('div');fill.className='mfill';
  bar.appendChild(fill);wrap.appendChild(val);wrap.appendChild(bar);body.appendChild(wrap);
  function paint(nw){val.textContent=nw.meterText||'';val.style.color=nw.color;fill.style.background=nw.color;fill.style.width=(clamp01(nw.meterLevel||0)*100)+'%';}
  paint(w);
  updaters[w.id]=paint;
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
    if(w.ch>=2&&w.type!=='label'){var lab=document.createElement('div');lab.className='lab';lab.innerHTML='<span class="dot" style="background:'+esc(w.color)+'"></span>'+esc(w.label||'');tile.appendChild(lab);}
    var bd=document.createElement('div');bd.className='body';tile.appendChild(bd);
    if(w.type==='fader')makeFader(w,bd);
    else if(w.type==='toggle')makeToggle(w,bd);
    else if(w.type==='button')makeButton(w,bd);
    else if(w.type==='xy')makeXY(w,bd);
    else if(w.type==='color')makeColor(w,bd);
    else if(w.type==='label')makeLabel(w,bd);
    else if(w.type==='meter')makeMeter(w,bd);
    grid.appendChild(tile);
  });
}

// Signatur der Set-Liste (+ aktives Set) -> Tab-Leiste nur neu bauen, wenn sich
// Sets/Namen/Auswahl ändern, nicht bei jedem Wert-Update.
function setsSig(s){return (s.sets||[]).map(function(t){return t.id+'~'+t.name;}).join('|')+'#'+(s.currentSetId||'');}
function buildSets(){
  var box=document.getElementById('sets');box.innerHTML='';
  var sets=state.sets||[];
  if(sets.length<2)return; // ein einziges Set -> keine Leiste (Name steht im Kopf)
  sets.forEach(function(t){
    var b=document.createElement('button');
    b.className='settab'+(t.id===state.currentSetId?' on':'');
    b.textContent=t.name||'Set';
    b.addEventListener('click',function(){
      if(t.id===state.currentSetId)return;
      // sofortiges Feedback; der Rechner bestätigt mit dem nächsten Schnappschuss
      state.currentSetId=t.id;
      Array.prototype.forEach.call(box.children,function(c){c.classList.remove('on');});
      b.classList.add('on');
      postNow({kind:'selectSet',id:t.id});
    });
    box.appendChild(b);
  });
}

function apply(s){
  state=s;
  document.getElementById('setName').textContent=s.setName||'';
  document.getElementById('dot').className=s.connected?'ok':'';
  document.getElementById('warn').style.display=s.connected?'none':'block';
  var ss=setsSig(s);
  if(ss!==ssig){ssig=ss;buildSets();}
  var ns=layoutSig(s);
  if(ns!==sig){sig=ns;build();}
  else{s.widgets.forEach(function(w){var u=updaters[w.id];if(u)u(w);});}
}

fetch('/api/state').then(function(r){return r.json();}).then(apply).catch(function(){});
try{var es=new EventSource('/api/events');es.onmessage=function(e){try{var m=JSON.parse(e.data);if(m.type==='state')apply(m.payload);}catch(_){}};}catch(_){}
</script>
</body>
</html>`
