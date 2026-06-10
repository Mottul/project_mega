// Eigenständige mobile Steuerseite (vom Fernsteuerungs-Server ausgeliefert).
// Bewusst Vanilla-HTML/CSS/JS ohne Build-Schritt. Spricht /api/state, /api/library,
// /api/command (POST), /api/upload und /api/events (SSE für Live-Updates). Kein
// Template-Literal und kein ${} im Client-JS, da diese Datei selbst ein Template-
// Literal ist (Icons daher als zusammengesetzte SVG-Strings).

export const MOBILE_PAGE = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<meta name="theme-color" content="#09090b" />
<title>Player-Fernsteuerung</title>
<style>
  :root { --bg:#09090b; --card:#18181b; --muted:#27272a; --fg:#fafafa; --sub:#a1a1aa; --gold:#ffce2c; }
  * { box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
  body { margin:0; background:var(--bg); color:var(--fg);
    font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif; padding:14px; padding-bottom:40px; }
  h3 { margin:18px 0 8px; font-size:14px; color:var(--sub); font-weight:600; }
  .card { background:var(--card); border:1px solid var(--muted); border-radius:12px; padding:12px; }
  .row { display:flex; align-items:center; gap:8px; }
  .head { justify-content:space-between; }
  #title { font-size:18px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  #meta { font-size:12px; color:var(--sub); margin-top:2px; }
  #dot { width:10px; height:10px; border-radius:50%; background:#71717a; flex:0 0 auto; }
  #dot.on { background:#22c55e; }
  .times { display:flex; justify-content:space-between; font-size:12px; color:var(--sub); margin-top:4px; }
  input[type=range]{ width:100%; accent-color:var(--gold); height:28px; }
  .transport { justify-content:center; gap:14px; margin:14px 0 4px; }
  button { font:inherit; color:var(--fg); background:var(--muted); border:1px solid #3f3f46;
    border-radius:10px; padding:12px 14px; min-height:46px; cursor:pointer; }
  button:active { filter:brightness(1.25); }
  .transport button { min-width:64px; display:flex; align-items:center; justify-content:center; }
  #play { background:var(--gold); color:#1a1505; border-color:var(--gold); min-width:84px; }
  .modes { display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin-top:8px; }
  .modes button { display:flex; align-items:center; justify-content:center; gap:6px; font-size:14px; }
  .modes button.on { background:var(--gold); color:#1a1505; border-color:var(--gold); }
  .list { display:flex; flex-direction:column; gap:6px; }
  .item { display:flex; align-items:center; gap:10px; background:var(--card); border:1px solid var(--muted);
    border-radius:10px; padding:8px; }
  .item.cur { border-color:var(--gold); }
  .item img { width:64px; height:36px; object-fit:cover; border-radius:6px; background:#000; flex:0 0 auto; }
  .item .t { flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:14px; }
  .item .d { font-size:12px; color:var(--sub); flex:0 0 auto; }
  .x { background:transparent; border:none; color:var(--sub); padding:8px; min-height:0; font-size:18px; }
  .grip { background:transparent; border:none; color:var(--sub); padding:8px 6px; min-height:0; font-size:20px;
    cursor:grab; touch-action:none; flex:0 0 auto; }
  .item.dragging { opacity:0.6; border-color:var(--gold); }
  .empty { color:var(--sub); font-size:13px; text-align:center; padding:14px; }
  .libhead { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; }
  .libhead h3 { margin:0; }
  .libtools { display:flex; align-items:center; gap:8px; }
  .uploadbtn { background:var(--muted); border:1px solid #3f3f46; border-radius:10px;
    padding:9px 14px; font-size:14px; cursor:pointer; flex:0 0 auto; }
  .iconbtn { background:var(--muted); border:1px solid #3f3f46; border-radius:10px; padding:9px;
    min-height:0; display:flex; align-items:center; justify-content:center; cursor:pointer; flex:0 0 auto; }
  .uprog { font-size:12px; color:var(--sub); }
  .uprog.active { padding:6px 2px; }
  .chips { display:flex; flex-wrap:wrap; gap:8px; }
  .chip { background:var(--muted); border:1px solid #3f3f46; border-radius:999px;
    padding:10px 16px; font-size:15px; color:var(--fg); cursor:pointer; }
  .chip .n { color:var(--sub); font-size:12px; margin-left:7px; }
  .setcard { display:flex; flex-direction:column; gap:14px; }
  .setlabel { font-size:12px; color:var(--sub); margin-bottom:6px; }
  .modes.two { grid-template-columns:1fr 1fr; margin-top:0; }
  .modes.three { grid-template-columns:1fr 1fr 1fr; margin-top:0; }
  .stepper { display:flex; align-items:center; gap:8px; }
  .stepper button { min-width:48px; font-size:22px; }
  .stepper .v { font-size:16px; min-width:64px; text-align:center; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
  .grid .item { flex-direction:column; align-items:stretch; padding:6px; gap:6px; }
  .grid .item img { width:100%; height:auto; aspect-ratio:16/9; }
  .grid .item .t { white-space:normal; font-size:13px; }
  .grid .item .d { display:none; }
</style>
</head>
<body>
  <div class="card">
    <div class="row head">
      <div style="min-width:0">
        <div id="title">—</div>
        <div id="meta"></div>
      </div>
      <div id="dot" title="Verbindung"></div>
    </div>
    <input id="seek" type="range" min="0" max="100" value="0" />
    <div class="times"><span id="pos">0:00</span><span id="dur">0:00</span></div>
    <div class="row transport">
      <button id="prev" data-cmd="prev" aria-label="Zurück"></button>
      <button id="play" data-cmd="toggle" aria-label="Play/Pause"></button>
      <button id="next" data-cmd="next" aria-label="Weiter"></button>
    </div>
    <div class="modes">
      <button id="loop"></button>
      <button id="shuffle"></button>
      <button id="mute"></button>
    </div>
  </div>

  <div id="plwrap" style="display:none">
    <h3>Playlists</h3>
    <div id="playlists" class="chips"></div>
  </div>

  <h3>Einstellungen</h3>
  <div class="card setcard">
    <div>
      <div class="setlabel">Verarbeitung (neue Uploads)</div>
      <div class="modes three">
        <button id="fit-blur">Blur</button>
        <button id="fit-bars">Letterbox</button>
        <button id="fit-stretch">Strecken</button>
      </div>
    </div>
    <div>
      <div class="setlabel">Übergang</div>
      <div class="modes two">
        <button id="tr-cut">Schnitt</button>
        <button id="tr-xf">Überblenden</button>
      </div>
      <div id="xfrow" class="stepper" style="margin-top:10px;display:none">
        <span class="setlabel" style="margin:0;flex:1">Überblendzeit</span>
        <button id="xf-dec" aria-label="kürzer">−</button>
        <span id="xf-val" class="v">0.5s</span>
        <button id="xf-inc" aria-label="länger">+</button>
      </div>
    </div>
    <div>
      <div class="setlabel">Bild-Standzeit</div>
      <div class="stepper">
        <button id="dur-dec" aria-label="weniger">−</button>
        <span id="dur-val" class="v">10s</span>
        <button id="dur-inc" aria-label="mehr">+</button>
      </div>
    </div>
  </div>

  <h3>Playlist</h3>
  <div id="playlist" class="list"></div>

  <div class="libhead">
    <h3>Bibliothek</h3>
    <div class="libtools">
      <button id="view-toggle" class="iconbtn" aria-label="Ansicht umschalten"></button>
      <label class="iconbtn" aria-label="Foto/Video aufnehmen"><span id="cam-ic"></span>
        <input id="cam" type="file" accept="image/*,video/*" capture="environment" hidden />
      </label>
      <label class="uploadbtn">+ Hochladen
        <input id="file" type="file" accept="image/*,video/*" multiple hidden />
      </label>
    </div>
  </div>
  <div id="uprog" class="uprog"></div>
  <div id="library" class="list"></div>

<script>
(function(){
  var state=null, lib=[], seeking=false;
  var dragging=false, dragEl=null, dragFrom=-1;
  var libView='list';
  try{ var lv=localStorage.getItem('av-libview'); if(lv==='grid'||lv==='list') libView=lv; }catch(_e){}

  function el(id){ return document.getElementById(id); }
  function api(cmd){ fetch('/api/command',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(cmd)}); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]; }); }
  function fmt(t){ t=Math.max(0,t||0); var m=Math.floor(t/60), s=Math.floor(t%60); return m+':'+(s<10?'0':'')+s; }

  // Inline-SVG-Icons (gleiche Formen wie im Desktop, lucide-Stil).
  function svg(inner,sz){ return '<svg viewBox="0 0 24 24" width="'+(sz||20)+'" height="'+(sz||20)+'" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block">'+inner+'</svg>'; }
  var IC = {
    prev:'<polygon points="19 20 9 12 19 4" fill="currentColor" stroke="none"/><rect x="4" y="4" width="2.2" height="16" rx="1" fill="currentColor" stroke="none"/>',
    next:'<polygon points="5 4 15 12 5 20" fill="currentColor" stroke="none"/><rect x="17.8" y="4" width="2.2" height="16" rx="1" fill="currentColor" stroke="none"/>',
    play:'<polygon points="7 4 19 12 7 20" fill="currentColor" stroke="none"/>',
    pause:'<rect x="6.5" y="4" width="3.6" height="16" rx="1" fill="currentColor" stroke="none"/><rect x="13.9" y="4" width="3.6" height="16" rx="1" fill="currentColor" stroke="none"/>',
    repeat:'<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
    shuffle:'<path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22"/><path d="m18 2 4 4-4 4"/><path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2"/><path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8"/><path d="m18 14 4 4-4 4"/>',
    vol:'<polygon points="11 5 6 9 2 9 2 15 6 15 11 19" fill="currentColor" stroke="none"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/>',
    volx:'<polygon points="11 5 6 9 2 9 2 15 6 15 11 19" fill="currentColor" stroke="none"/><line x1="22" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="22" y2="15"/>',
    list:'<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3.5" y1="6" x2="3.51" y2="6"/><line x1="3.5" y1="12" x2="3.51" y2="12"/><line x1="3.5" y1="18" x2="3.51" y2="18"/>',
    grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
    cam:'<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"/><circle cx="12" cy="13" r="3.2"/>'
  };

  function curItem(){ return state && state.index>=0 ? state.playlist[state.index] : null; }

  function render(){
    if(!state) return;
    var c=curItem();
    el('title').textContent = c ? c.title : 'Nichts ausgewählt';
    el('meta').textContent = c ? (c.width+'×'+c.height+' · '+c.fitMode) : (state.playlist.length+' in der Playlist');
    el('play').innerHTML = svg(state.playing?IC.pause:IC.play, 26);
    var dur = state.durationSec || (c && c.durationSec) || 0;
    el('dur').textContent = fmt(dur);
    var seek=el('seek');
    seek.max = Math.max(1, dur);
    seek.disabled = !(c && c.kind!=='image' && dur>0);
    if(!seeking){ seek.value = Math.min(state.positionSec||0, dur||1); el('pos').textContent = fmt(state.positionSec||0); }
    var loopBtn=el('loop');
    loopBtn.innerHTML = svg(IC.repeat,18)+'<span>'+(state.loop==='one'?'Eines':state.loop==='all'?'Alle':'Aus')+'</span>';
    loopBtn.className = state.loop!=='none' ? 'on' : '';
    var shBtn=el('shuffle'); shBtn.innerHTML = svg(IC.shuffle,18)+'<span>Zufall</span>'; shBtn.className = state.shuffle ? 'on' : '';
    var muteBtn=el('mute'); muteBtn.innerHTML = svg(state.muted?IC.volx:IC.vol,18)+'<span>'+(state.muted?'Stumm':'Ton')+'</span>'; muteBtn.className = state.muted ? '' : 'on';
    // Übergang + Überblendzeit
    el('tr-cut').className = state.transition==='crossfade' ? '' : 'on';
    el('tr-xf').className = state.transition==='crossfade' ? 'on' : '';
    el('xfrow').style.display = state.transition==='crossfade' ? 'flex' : 'none';
    el('xf-val').textContent = ((state.transitionMs||500)/1000).toFixed(1)+'s';
    // Verarbeitung (Fit für neue Uploads)
    var f=state.defaultFit||'blur';
    el('fit-blur').className = f==='blur'?'on':'';
    el('fit-bars').className = f==='bars'?'on':'';
    el('fit-stretch').className = f==='stretch'?'on':'';
    el('dur-val').textContent = (state.imageDurationSec||10)+'s';
    renderSaved();
    renderPlaylist();
  }

  function renderSaved(){
    var wrap=el('plwrap'), box=el('playlists');
    var pls=(state&&state.savedPlaylists)||[];
    if(!pls.length){ wrap.style.display='none'; box.innerHTML=''; return; }
    wrap.style.display='';
    var h='';
    for(var i=0;i<pls.length;i++){
      h += '<button class="chip" data-pl="'+i+'">'+esc(pls[i].name)+'<span class="n">'+pls[i].mediaIds.length+'</span></button>';
    }
    box.innerHTML=h;
  }

  function renderPlaylist(){
    if(dragging) return; // während des Ziehens nicht neu aufbauen
    var box=el('playlist');
    if(!state || state.playlist.length===0){ box.innerHTML='<div class="empty">Playlist leer</div>'; return; }
    var h='';
    for(var i=0;i<state.playlist.length;i++){
      var m=state.playlist[i];
      h += '<div class="item'+(i===state.index?' cur':'')+'" data-goto="'+i+'">'
        + '<button class="grip" data-drag="'+i+'">⠿</button>'
        + (m.thumbUrl?'<img src="'+esc(m.thumbUrl)+'" />':'<img />')
        + '<div class="t">'+(i+1)+'. '+esc(m.title)+'</div>'
        + '<div class="d">'+(m.durationSec?fmt(m.durationSec):'Bild')+'</div>'
        + '<button class="x" data-remove="'+i+'">✕</button>'
        + '</div>';
    }
    box.innerHTML=h;
  }

  function renderLib(){
    var box=el('library');
    box.className = libView==='grid' ? 'grid' : 'list';
    if(lib.length===0){ box.innerHTML='<div class="empty">Bibliothek leer</div>'; return; }
    var h='';
    for(var i=0;i<lib.length;i++){
      var m=lib[i];
      h += '<div class="item" data-add="'+esc(m.id)+'">'
        + (m.thumbUrl?'<img src="'+esc(m.thumbUrl)+'" />':'<img />')
        + '<div class="t">'+esc(m.title)+'</div>'
        + '<div class="d">+</div>'
        + '</div>';
    }
    box.innerHTML=h;
  }

  function updateViewToggle(){ el('view-toggle').innerHTML = svg(libView==='grid'?IC.list:IC.grid,20); }
  function setLibView(v){ libView=v; try{ localStorage.setItem('av-libview',v); }catch(_e){} renderLib(); updateViewToggle(); }

  // Tippen: Transport
  document.querySelector('.transport').addEventListener('click',function(e){
    var b=e.target.closest('button'); if(b&&b.dataset.cmd) api({type:b.dataset.cmd});
  });
  el('loop').addEventListener('click',function(){
    var order=['all','one','none']; var n=order[(order.indexOf(state?state.loop:'all')+1)%3]; api({type:'setLoop',loop:n});
  });
  el('shuffle').addEventListener('click',function(){ api({type:'setShuffle',shuffle:!(state&&state.shuffle)}); });
  el('mute').addEventListener('click',function(){ api({type:'setMuted',muted:!(state&&state.muted)}); });
  el('tr-cut').addEventListener('click',function(){ api({type:'setTransition',transition:'cut'}); });
  el('tr-xf').addEventListener('click',function(){ api({type:'setTransition',transition:'crossfade'}); });
  el('xf-dec').addEventListener('click',function(){ var v=(state&&state.transitionMs)||500; api({type:'setTransition',transition:'crossfade',transitionMs:Math.max(100,v-100)}); });
  el('xf-inc').addEventListener('click',function(){ var v=(state&&state.transitionMs)||500; api({type:'setTransition',transition:'crossfade',transitionMs:Math.min(5000,v+100)}); });
  el('fit-blur').addEventListener('click',function(){ api({type:'setDefaultFit',fit:'blur'}); });
  el('fit-bars').addEventListener('click',function(){ api({type:'setDefaultFit',fit:'bars'}); });
  el('fit-stretch').addEventListener('click',function(){ api({type:'setDefaultFit',fit:'stretch'}); });
  el('dur-dec').addEventListener('click',function(){ var v=(state&&state.imageDurationSec)||10; api({type:'setImageDuration',seconds:Math.max(1,v-1)}); });
  el('dur-inc').addEventListener('click',function(){ var v=(state&&state.imageDurationSec)||10; api({type:'setImageDuration',seconds:Math.min(3600,v+1)}); });
  el('view-toggle').addEventListener('click',function(){ setLibView(libView==='grid'?'list':'grid'); });
  el('playlists').addEventListener('click',function(e){
    var b=e.target.closest('[data-pl]'); if(!b) return;
    var pls=(state&&state.savedPlaylists)||[]; var p=pls[+b.dataset.pl];
    if(p) api({type:'replace',mediaIds:p.mediaIds});
  });

  var seek=el('seek');
  seek.addEventListener('input',function(){ seeking=true; el('pos').textContent=fmt(+seek.value); });
  seek.addEventListener('change',function(){ api({type:'seek',positionSec:+seek.value}); seeking=false; });

  el('playlist').addEventListener('click',function(e){
    if(e.target.closest('[data-drag]')) return; // Griff -> kein Sprung
    var rm=e.target.closest('[data-remove]');
    if(rm){ e.stopPropagation(); api({type:'remove',index:+rm.dataset.remove}); return; }
    var go=e.target.closest('[data-goto]'); if(go) api({type:'goto',index:+go.dataset.goto});
  });

  // Playlist per Drag&Drop umordnen (Pointer-Events -> Touch + Maus).
  function onDragMove(e){
    if(!dragging) return;
    e.preventDefault();
    var box=el('playlist'), nodes=box.querySelectorAll('.item'), y=e.clientY, after=null;
    for(var i=0;i<nodes.length;i++){
      var n=nodes[i]; if(n===dragEl) continue;
      var r=n.getBoundingClientRect();
      if(y < r.top + r.height/2){ after=n; break; }
    }
    if(after){ if(after!==dragEl.nextSibling) box.insertBefore(dragEl, after); }
    else box.appendChild(dragEl);
  }
  function onDragEnd(){
    if(!dragging) return;
    document.removeEventListener('pointermove', onDragMove);
    document.removeEventListener('pointerup', onDragEnd);
    document.removeEventListener('pointercancel', onDragEnd);
    var nodes=el('playlist').querySelectorAll('.item'), to=-1;
    for(var i=0;i<nodes.length;i++){ if(nodes[i]===dragEl){ to=i; break; } }
    if(dragEl) dragEl.classList.remove('dragging');
    var from=dragFrom; dragging=false; dragEl=null; dragFrom=-1;
    // DOM bleibt wie gezogen; der autoritative State-Broadcast rendert gleich neu.
    if(to>=0 && to!==from) api({type:'move',from:from,to:to});
  }
  el('playlist').addEventListener('pointerdown',function(e){
    var h=e.target.closest('[data-drag]'); if(!h) return;
    var item=h.closest('.item'); if(!item) return;
    e.preventDefault();
    dragging=true; dragEl=item; dragFrom=+h.dataset.drag;
    item.classList.add('dragging');
    document.addEventListener('pointermove', onDragMove);
    document.addEventListener('pointerup', onDragEnd);
    document.addEventListener('pointercancel', onDragEnd);
  });
  el('library').addEventListener('click',function(e){
    var a=e.target.closest('[data-add]'); if(a) api({type:'add',mediaIds:[a.dataset.add]});
  });

  // Upload vom Tablet/Handy: Dateien nacheinander als rohen Body senden. Die
  // Kamera-Schaltfläche nutzt dieselbe Warteschlange (capture -> direkt aufnehmen).
  function onPick(){ var fl=this.files; if(fl&&fl.length) uploadQueue(Array.prototype.slice.call(fl)); this.value=''; }
  el('file').addEventListener('change', onPick);
  el('cam').addEventListener('change', onPick);
  function uploadQueue(files){
    var total=files.length, done=0, prog=el('uprog'); prog.className='uprog active';
    function next(){
      if(!files.length){ prog.textContent='Fertig – '+done+'/'+total+' hochgeladen, wird konvertiert…';
        setTimeout(function(){ prog.className='uprog'; prog.textContent=''; },5000); return; }
      var f=files.shift();
      prog.textContent='Lade '+(done+1)+'/'+total+': '+f.name;
      var xhr=new XMLHttpRequest();
      xhr.open('POST','/api/upload');
      xhr.setRequestHeader('x-filename', encodeURIComponent(f.name));
      xhr.setRequestHeader('content-type','application/octet-stream');
      xhr.onload=function(){ done++; next(); };
      xhr.onerror=function(){ prog.textContent='Fehler bei '+f.name; setTimeout(next,600); };
      xhr.send(f);
    }
    next();
  }

  function loadState(){ fetch('/api/state').then(function(r){return r.json();}).then(function(s){ state=s; render(); }); }
  function loadLib(){ fetch('/api/library').then(function(r){return r.json();}).then(function(l){ lib=l; renderLib(); }); }

  function connect(){
    var es=new EventSource('/api/events');
    es.onopen=function(){ el('dot').className='on'; };
    es.onerror=function(){ el('dot').className=''; };
    es.onmessage=function(e){
      var msg; try{ msg=JSON.parse(e.data); }catch(_){ return; }
      if(msg.type==='state'){ state=msg.payload; render(); }
      else if(msg.type==='tick'){ if(state){ state.positionSec=msg.payload.positionSec; state.durationSec=msg.payload.durationSec; }
        if(!seeking){ var d=msg.payload.durationSec||0; el('seek').max=Math.max(1,d); el('seek').value=Math.min(msg.payload.positionSec,d||1); el('pos').textContent=fmt(msg.payload.positionSec); el('dur').textContent=fmt(d); } }
      else if(msg.type==='library'){ loadLib(); }
    };
  }

  // statische Icons setzen
  el('prev').innerHTML = svg(IC.prev,22);
  el('next').innerHTML = svg(IC.next,22);
  el('cam-ic').innerHTML = svg(IC.cam,20);
  updateViewToggle();

  loadState(); loadLib(); connect();
})();
</script>
</body>
</html>`
