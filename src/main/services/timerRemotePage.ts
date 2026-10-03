// Mobile Steuerseite des Stage-Timers (eine selbständige HTML-Seite, ohne
// Framework/Build): große Restzeit in der Farbe der Bühnenanzeige, Start/Pause,
// Abschnitt vor/zurück, ±1 Minute, Nachrichten an die Bühne und Sprung zu einem
// Abschnitt. Zustand + Ticks per SSE (der Timer tickt im main-Prozess).
// API-Pfade relativ (api/…), damit die Seite auch unter der Fernsteuer-App läuft.
// Achtung Template-Literal: im Client-JS keine Backslashes, Backticks oder ${…}.

import { FS_BUTTON, HOME_BUTTON, PWA_SCRIPT, pwaHead } from './remotePwa'

export const TIMER_MOBILE_PAGE = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>Stage-Timer</title>
${pwaHead()}
<style>
:root{--bg:#0f0f12;--card:#1b1b20;--border:#2c2c34;--muted:#26262e;--text:#e8e8ec;--dim:#8a8a99;--gold:#ffce2c;--warn:#eab308;--alert:#ef4444;--ok:#22c55e}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
body{margin:0;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,'Segoe UI',sans-serif}
header{position:sticky;top:0;z-index:5;background:var(--bg);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;padding:10px 14px}
header b{font-size:17px}
#pos{color:var(--dim);font-size:13px}
#dot{width:9px;height:9px;border-radius:50%;background:#ef4444;display:inline-block}
#dot.ok{background:#34d399}
main{padding:14px;max-width:760px;margin:0 auto;display:flex;flex-direction:column;gap:14px}
.card{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:14px}
#warn{display:none;padding:10px 12px;border-radius:10px;background:rgba(234,179,8,.12);border:1px solid rgba(234,179,8,.35);color:var(--warn);font-size:13px}
.disp{text-align:center;padding:18px 14px 16px}
#speaker{color:var(--dim);font-size:14px;min-height:18px}
#title{font-size:18px;font-weight:700;margin-top:2px;min-height:22px;overflow-wrap:anywhere}
#time{font-size:clamp(64px,24vw,150px);font-weight:800;line-height:1.05;margin:8px 0 10px;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
#time.blink{animation:blink 1s steps(2,start) infinite}
@keyframes blink{to{visibility:hidden}}
.bar{height:8px;border-radius:999px;background:var(--muted);overflow:hidden}
#fill{height:100%;width:0;border-radius:999px;transition:width .2s linear}
#msgnow{display:none;margin-top:12px;padding:8px 10px;border-radius:10px;background:rgba(255,206,44,.1);border:1px solid rgba(255,206,44,.3);color:var(--gold);font-size:14px;font-weight:600}
.row{display:flex;gap:10px}
.row>button{flex:1;white-space:nowrap;padding:12px 6px}
#prev,#next{font-size:15px}
button{font:inherit;color:var(--text);background:var(--muted);border:1px solid #3a3a44;border-radius:12px;padding:12px;min-height:52px;font-size:16px;font-weight:600;cursor:pointer;touch-action:manipulation}
button:active{filter:brightness(1.25)}
button:disabled{opacity:.35}
#toggle{flex:1.6;background:var(--gold);border-color:var(--gold);color:#1a1505;font-size:19px}
#toggle.run{background:var(--card);border-color:var(--gold);color:var(--gold)}
.small{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.small>button{min-height:46px;font-size:15px;white-space:nowrap}
.modes{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.modes button{min-height:42px;font-size:14px}
.modes button.on{background:rgba(255,206,44,.15);border-color:var(--gold);color:var(--gold)}
h3{margin:0 0 10px;font-size:13px;color:var(--dim);font-weight:600;text-transform:uppercase;letter-spacing:.04em}
.msgrow{display:flex;gap:8px}
#msg{flex:1;min-width:0;font:inherit;font-size:16px;color:var(--text);background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:10px 12px}
#send{min-height:44px;padding:0 16px;font-size:15px;background:var(--gold);border-color:var(--gold);color:#1a1505}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;align-items:center}
.chip{min-height:38px;padding:6px 13px;border-radius:999px;font-size:14px;font-weight:500}
label.flash{display:flex;align-items:center;gap:6px;font-size:14px;color:var(--dim);margin-right:4px}
label.flash input{width:20px;height:20px}
#clear{display:none;margin-top:10px;width:100%;min-height:44px;font-size:15px}
.seg{display:flex;align-items:center;gap:10px;width:100%;text-align:left;min-height:54px;margin-top:8px;padding:8px 12px;font-weight:500;background:var(--bg)}
.seg:first-child{margin-top:0}
.seg .n{width:28px;height:28px;border-radius:50%;border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--dim);flex:0 0 auto}
.seg.cur{border-color:var(--gold)}
.seg.cur .n{background:var(--gold);border-color:var(--gold);color:#1a1505}
.seg .tx{flex:1;min-width:0}
.seg .s{display:block;font-size:12px;color:var(--dim)}
.seg .t{display:block;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.seg .d{font-size:14px;color:var(--dim);font-variant-numeric:tabular-nums}
.ctrls{display:flex;flex-direction:column;gap:10px}
.clockonly .timeronly{display:none!important}
</style>
</head>
<body>
<header>${HOME_BUTTON}<span id="dot"></span><b>Timer</b><span id="pos"></span>${FS_BUTTON}</header>
<main>
<div id="warn">Noch keine Abschnitte – am Rechner im Werkzeug „Stage-Timer &amp; Uhr“ anlegen.</div>
<div class="card disp">
  <div id="speaker"></div>
  <div id="title"></div>
  <div id="time">--:--</div>
  <div class="bar timeronly"><div id="fill"></div></div>
  <div id="msgnow"></div>
</div>
<div class="modes">
  <button id="m-timer" data-mode="timer">Timer</button>
  <button id="m-clock" data-mode="clock">Uhr</button>
</div>
<div class="ctrls timeronly">
  <div class="row">
    <button id="prev" aria-label="Voriger Abschnitt">‹ Voriger</button>
    <button id="toggle">Start</button>
    <button id="next" aria-label="Nächster Abschnitt">Nächster ›</button>
  </div>
  <div class="small">
    <button id="minus">−1 min</button>
    <button id="plus">+1 min</button>
    <button id="reset">↺ Abschnitt neu</button>
    <button id="stop">Stopp</button>
  </div>
</div>
<div class="card">
  <h3>Nachricht an die Bühne</h3>
  <div class="msgrow"><input id="msg" type="text" maxlength="200" placeholder="z. B. Bitte lauter sprechen" enterkeyhint="send"><button id="send">Senden</button></div>
  <div class="chips">
    <label class="flash"><input id="flash" type="checkbox">blinkend</label>
    <button class="chip" data-quick="Bitte zum Ende kommen">Bitte zum Ende kommen</button>
    <button class="chip" data-quick="Letzte Minute!">Letzte Minute!</button>
    <button class="chip" data-quick="Zeit ist um">Zeit ist um</button>
  </div>
  <button id="clear">Nachricht ausblenden</button>
</div>
<div class="card timeronly">
  <h3>Abschnitte</h3>
  <div id="segs"></div>
</div>
</main>
<script>
(function(){
  var state=null, remaining=0;
  function el(id){return document.getElementById(id);}
  function post(cmd){fetch('api/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(cmd)}).catch(function(){});}
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  function pad(n){return (n<10?'0':'')+n;}
  // wie format.ts (fmtTimer): M:SS bzw. H:MM:SS, negativ mit Minuszeichen
  function fmt(t){var neg=t<0,s=Math.abs(Math.round(t)),h=Math.floor(s/3600),m=Math.floor((s%3600)/60),x=s%60;var c=h>0?h+':'+pad(m)+':'+pad(x):m+':'+pad(x);return neg?'−'+c:c;}
  function seg(){return state&&state.current>=0?state.segments[state.current]:null;}

  function paintTime(){
    if(!state)return;
    var t=el('time');
    if(state.displayMode==='clock'){
      var d=new Date();
      t.textContent=pad(d.getHours())+':'+pad(d.getMinutes())+(state.clockShowSeconds?':'+pad(d.getSeconds()):'');
      t.style.color='#ffffff';t.className='';return;
    }
    var s=seg();
    t.textContent=s?fmt(remaining):'--:--';
    // gleiche Farbstufen wie die Bühnenanzeige (TimerDisplay)
    var phase=remaining<0?'over':remaining<=state.alertSec?'alert':remaining<=state.warnSec?'warn':'ok';
    if(!s)phase='ok';
    t.style.color=phase==='ok'?'#ffffff':phase==='warn'?'#eab308':'#ef4444';
    t.className=phase==='over'?'blink':'';
    var p=s&&s.durationSec>0?Math.max(0,Math.min(1,remaining/s.durationSec)):0;
    var f=el('fill');f.style.width=(p*100)+'%';
    f.style.background=phase==='ok'?'#22c55e':phase==='warn'?'#eab308':'#ef4444';
  }

  function render(){
    if(!state)return;
    var s=seg(), n=state.segments.length, clock=state.displayMode==='clock';
    document.body.className=clock?'clockonly':'';
    el('warn').style.display=(!clock&&n===0)?'block':'none';
    el('pos').textContent=clock?'Uhr':(n?(state.current+1)+'/'+n:'');
    el('speaker').textContent=clock?'':(s?s.speaker:'');
    el('title').textContent=clock?'':(s?s.title:'');
    el('m-timer').className=clock?'':'on';
    el('m-clock').className=clock?'on':'';
    var tg=el('toggle');tg.textContent=state.running?'Pause':'Start';tg.className=state.running?'run':'';tg.disabled=n===0;
    el('prev').disabled=state.current<=0;
    el('next').disabled=state.current>=n-1;
    el('minus').disabled=el('plus').disabled=el('reset').disabled=state.current<0;
    el('stop').disabled=n===0;
    var m=state.message;
    el('msgnow').style.display=m?'block':'none';
    el('msgnow').textContent=m?'Auf der Bühne: '+m.text+(m.flash?' (blinkend)':''):'';
    el('clear').style.display=m?'block':'none';
    var h='';
    for(var i=0;i<n;i++){
      var x=state.segments[i];
      h+='<button class="seg'+(i===state.current?' cur':'')+'" data-goto="'+i+'"><span class="n">'+(i+1)+'</span><span class="tx"><span class="s">'+esc(x.speaker)+'</span><span class="t">'+esc(x.title||'—')+'</span></span><span class="d">'+fmt(x.durationSec)+'</span></button>';
    }
    el('segs').innerHTML=h;
    paintTime();
  }

  el('toggle').onclick=function(){post({type:'toggle'});};
  el('prev').onclick=function(){post({type:'prev'});};
  el('next').onclick=function(){post({type:'next'});};
  el('minus').onclick=function(){post({type:'adjust',deltaSec:-60});};
  el('plus').onclick=function(){post({type:'adjust',deltaSec:60});};
  el('reset').onclick=function(){post({type:'reset'});};
  el('stop').onclick=function(){if(confirm('Timer stoppen und zum ersten Abschnitt zurück?'))post({type:'resetAll'});};
  el('m-timer').onclick=function(){post({type:'setDisplayMode',mode:'timer'});};
  el('m-clock').onclick=function(){post({type:'setDisplayMode',mode:'clock'});};
  el('segs').onclick=function(e){var b=e.target.closest('[data-goto]');if(b)post({type:'goto',index:+b.getAttribute('data-goto')});};
  function send(text){text=(text||'').trim();if(text)post({type:'message',text:text,flash:el('flash').checked});}
  el('send').onclick=function(){send(el('msg').value);el('msg').value='';el('msg').blur();};
  el('msg').onkeydown=function(e){if(e.key==='Enter'){send(el('msg').value);el('msg').value='';el('msg').blur();}};
  document.querySelector('.chips').addEventListener('click',function(e){var b=e.target.closest('[data-quick]');if(b)send(b.getAttribute('data-quick'));});
  el('clear').onclick=function(){post({type:'clearMessage'});};

  function apply(s){state=s;remaining=s.remainingSec;render();}
  fetch('api/state').then(function(r){return r.json();}).then(apply).catch(function(){});
  try{
    var es=new EventSource('api/events');
    es.onopen=function(){el('dot').className='ok';};
    es.onerror=function(){el('dot').className='';};
    es.onmessage=function(e){
      var m;try{m=JSON.parse(e.data);}catch(_){return;}
      if(m.type==='state')apply(m.payload);
      else if(m.type==='tick'&&state){remaining=m.payload.remainingSec;state.running=m.payload.running;paintTime();}
    };
  }catch(_){}
  // Uhr-Modus: die Uhrzeit läuft lokal weiter (Ticks gibt es nur im Timer).
  setInterval(function(){if(state&&state.displayMode==='clock')paintTime();},500);
})();
</script>
${PWA_SCRIPT}
</body>
</html>`
