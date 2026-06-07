// Eigenständige mobile Steuerseite (vom Fernsteuerungs-Server ausgeliefert).
// Bewusst Vanilla-HTML/CSS/JS ohne Build-Schritt. Spricht /api/state, /api/library,
// /api/command (POST) und /api/events (SSE für Live-Updates). Kein Template-Literal
// und kein ${} im Client-JS, da diese Datei selbst ein Template-Literal ist.

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
  .transport button { min-width:64px; font-size:20px; }
  #play { background:var(--gold); color:#1a1505; border-color:var(--gold); min-width:84px; font-size:24px; }
  .modes { display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin-top:8px; }
  .modes button.on { background:var(--gold); color:#1a1505; border-color:var(--gold); }
  .list { display:flex; flex-direction:column; gap:6px; }
  .item { display:flex; align-items:center; gap:10px; background:var(--card); border:1px solid var(--muted);
    border-radius:10px; padding:8px; }
  .item.cur { border-color:var(--gold); }
  .item img { width:64px; height:36px; object-fit:cover; border-radius:6px; background:#000; flex:0 0 auto; }
  .item .t { flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:14px; }
  .item .d { font-size:12px; color:var(--sub); flex:0 0 auto; }
  .x { background:transparent; border:none; color:var(--sub); padding:8px; min-height:0; font-size:18px; }
  .empty { color:var(--sub); font-size:13px; text-align:center; padding:14px; }
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
      <button data-cmd="prev" aria-label="Zurück">⏮</button>
      <button id="play" data-cmd="toggle" aria-label="Play/Pause">▶</button>
      <button data-cmd="next" aria-label="Weiter">⏭</button>
    </div>
    <div class="modes">
      <button id="loop">Loop</button>
      <button id="shuffle">Zufall</button>
      <button id="mute">Ton</button>
    </div>
  </div>

  <h3>Playlist</h3>
  <div id="playlist" class="list"></div>

  <h3>Bibliothek</h3>
  <div id="library" class="list"></div>

<script>
(function(){
  var state=null, lib=[], seeking=false;
  function el(id){ return document.getElementById(id); }
  function api(cmd){ fetch('/api/command',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(cmd)}); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]; }); }
  function fmt(t){ t=Math.max(0,t||0); var m=Math.floor(t/60), s=Math.floor(t%60); return m+':'+(s<10?'0':'')+s; }

  function curItem(){ return state && state.index>=0 ? state.playlist[state.index] : null; }

  function render(){
    if(!state) return;
    var c=curItem();
    el('title').textContent = c ? c.title : 'Nichts ausgewählt';
    el('meta').textContent = c ? (c.width+'×'+c.height+' · '+c.fitMode) : (state.playlist.length+' in der Playlist');
    el('play').textContent = state.playing ? '⏸' : '▶';
    var dur = state.durationSec || (c && c.durationSec) || 0;
    el('dur').textContent = fmt(dur);
    var seek=el('seek');
    seek.max = Math.max(1, dur);
    seek.disabled = !(c && c.kind!=='image' && dur>0);
    if(!seeking){ seek.value = Math.min(state.positionSec||0, dur||1); el('pos').textContent = fmt(state.positionSec||0); }
    var loopBtn=el('loop');
    loopBtn.textContent = state.loop==='one' ? 'Loop: 1' : (state.loop==='all' ? 'Loop: Alle' : 'Loop: aus');
    loopBtn.className = state.loop!=='none' ? 'on' : '';
    el('shuffle').className = state.shuffle ? 'on' : '';
    var muteBtn=el('mute'); muteBtn.textContent = state.muted ? 'Stumm' : 'Ton'; muteBtn.className = state.muted ? '' : 'on';
    renderPlaylist();
  }

  function renderPlaylist(){
    var box=el('playlist');
    if(!state || state.playlist.length===0){ box.innerHTML='<div class="empty">Playlist leer</div>'; return; }
    var h='';
    for(var i=0;i<state.playlist.length;i++){
      var m=state.playlist[i];
      h += '<div class="item'+(i===state.index?' cur':'')+'" data-goto="'+i+'">'
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

  // Tippen: Transport/Modi
  document.querySelector('.transport').addEventListener('click',function(e){
    var b=e.target.closest('button'); if(b&&b.dataset.cmd) api({type:b.dataset.cmd});
  });
  el('loop').addEventListener('click',function(){
    var order=['all','one','none']; var n=order[(order.indexOf(state?state.loop:'all')+1)%3]; api({type:'setLoop',loop:n});
  });
  el('shuffle').addEventListener('click',function(){ api({type:'setShuffle',shuffle:!(state&&state.shuffle)}); });
  el('mute').addEventListener('click',function(){ api({type:'setMuted',muted:!(state&&state.muted)}); });

  var seek=el('seek');
  seek.addEventListener('input',function(){ seeking=true; el('pos').textContent=fmt(+seek.value); });
  seek.addEventListener('change',function(){ api({type:'seek',positionSec:+seek.value}); seeking=false; });

  el('playlist').addEventListener('click',function(e){
    var rm=e.target.closest('[data-remove]');
    if(rm){ e.stopPropagation(); api({type:'remove',index:+rm.dataset.remove}); return; }
    var go=e.target.closest('[data-goto]'); if(go) api({type:'goto',index:+go.dataset.goto});
  });
  el('library').addEventListener('click',function(e){
    var a=e.target.closest('[data-add]'); if(a) api({type:'add',mediaIds:[a.dataset.add]});
  });

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

  loadState(); loadLib(); connect();
})();
</script>
</body>
</html>`
