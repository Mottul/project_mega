// Bühnen-Anzeige des Stage-Timers im Browser – für Fernseher, Tablets und Rechner ohne NDI.
// Reine Anzeige (keine Bedienung), gespeist vom selben SSE-Strom wie die Handy-Steuerung,
// sieht aus wie das Ausgabefenster: große Ziffern in der Warnfarbe, Redner/Titel, Uhrzeit,
// Restzeit-Balken, Nachrichten-Banner, Uhr-Modus.
// Robust für ältere Smart-TV-Browser: ES5 ohne Framework, XMLHttpRequest statt fetch,
// Rückfall auf Abfragen ohne EventSource. Die Uhrzeit kommt vom Rechner (api/time), nicht
// von der Uhr des Anzeigegeräts. Reißt die Verbindung ab, steht das groß da – ein
// eingefrorenes Bild darf nie wie die echte Restzeit aussehen.
// API-Pfade relativ (api/…), damit die Seite auch unter der Fernsteuer-App (/timer/) läuft.
// Achtung Template-Literal: im Client-JS keine Backslashes, Backticks oder ${…}.

export const TIMER_DISPLAY_PAGE = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#000000">
<title>Stage-Timer – Anzeige</title>
<style>
html,body{margin:0;height:100%;background:#000;color:#fff;overflow:hidden;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}
body.idle{cursor:none}
#root{position:fixed;left:0;top:0;right:0;bottom:0;background:#000}
#root.flash{animation:bgflash 1s steps(1) infinite}
@keyframes bgflash{0%{background:#000}50%{background:#3b0a0a}}
.mode{position:absolute;left:0;top:0;right:0;bottom:0;display:none}
#clock{flex-direction:column;align-items:center;justify-content:center}
#cbig,#digits{font-weight:700;line-height:1;font-variant-numeric:tabular-nums;white-space:nowrap}
#cdate{margin-top:2vh;color:#a3a3a3}
#head{position:absolute;left:0;right:0;top:0;display:flex;justify-content:space-between;align-items:flex-start;padding:2.5vh 2.5vw}
#names{min-width:0;display:flex;flex-direction:column;line-height:1.2}
#speaker{color:#a3a3a3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#title{font-weight:600;color:#e5e5e5;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
#hclock{color:#737373;flex-shrink:0;margin-left:2vw;font-variant-numeric:tabular-nums}
#main{position:absolute;left:0;right:0;top:0;bottom:0;display:flex;align-items:center;justify-content:center}
#bar{position:absolute;left:0;right:0;bottom:0;height:3vh;min-height:10px;background:#171717}
#fill{height:100%;width:0;transition:width .2s linear,background .2s linear}
#msg{display:none;position:absolute;left:3vw;right:3vw;bottom:3.5vh;padding:1.8vh 3vw;border:3px solid #fff;border-radius:16px;background:rgba(234,179,8,.97);text-align:center}
#msg.flash{animation:msgflash .8s steps(1) infinite}
@keyframes msgflash{50%{opacity:.25}}
#msgtext{color:#000;font-weight:700;overflow-wrap:anywhere}
#conn{display:none;position:absolute;left:0;right:0;top:0;padding:1.6vh 2vw;background:#7f1d1d;color:#fff;font-weight:700;text-align:center;font-size:max(16px,2.4vh)}
#tap{position:absolute;left:50%;bottom:8vh;transform:translateX(-50%);padding:10px 18px;border-radius:999px;background:rgba(255,255,255,.12);color:#d4d4d4;font-size:max(14px,1.8vh);transition:opacity .6s}
</style>
</head>
<body>
<div id="root">
  <div id="clock" class="mode"><div id="cbig"></div><div id="cdate"></div></div>
  <div id="timer" class="mode">
    <div id="main"><span id="digits">--:--</span></div>
    <div id="head"><div id="names"><span id="speaker"></span><span id="title"></span></div><span id="hclock"></span></div>
    <div id="bar"><div id="fill"></div></div>
  </div>
  <div id="msg"><span id="msgtext"></span></div>
  <div id="conn">Verbindung zum Timer getrennt – wird neu verbunden …</div>
  <div id="tap">Antippen für Vollbild</div>
</div>
<script>
(function(){
  var S=null, remaining=0, offset=0, online=false, offSince=Date.now(), es=null, polling=false;
  function el(id){return document.getElementById(id);}
  function pad(n){return (n<10?'0':'')+n;}
  function now(){return new Date(Date.now()+offset);}
  function fmtTimer(t){
    var neg=t<0, s=Math.abs(Math.round(t)), h=Math.floor(s/3600), m=Math.floor((s%3600)/60), x=s%60;
    var core=h>0?(h+':'+pad(m)+':'+pad(x)):(m+':'+pad(x));
    return neg?('−'+core):core;
  }
  function fmtClock(d,sec){return pad(d.getHours())+':'+pad(d.getMinutes())+(sec?':'+pad(d.getSeconds()):'');}
  function fmtDate(d){
    try{return d.toLocaleDateString('de-AT',{weekday:'long',day:'numeric',month:'long',year:'numeric'});}
    catch(e){return pad(d.getDate())+'.'+pad(d.getMonth()+1)+'.'+d.getFullYear();}
  }
  function phase(){
    if(remaining<0)return 'overtime';
    if(remaining<=S.alertSec)return 'alert';
    if(remaining<=S.warnSec)return 'warn';
    return 'ok';
  }
  function show(id,on,disp){el(id).style.display=on?(disp||'block'):'none';}

  function render(){
    if(!S)return;
    var w=window.innerWidth, h=window.innerHeight, d=now();
    var small=Math.max(11,Math.min(w/30,h/14));
    var clockMode=S.displayMode==='clock';
    show('clock',clockMode,'flex');
    show('timer',!clockMode);
    var seg=S.current>=0?S.segments[S.current]:null;
    var main=clockMode?fmtClock(d,S.clockShowSeconds):(seg?fmtTimer(remaining):'--:--');
    var fs=Math.min((w/Math.max(4,main.length))*1.55,h*0.42);
    var p=phase();
    el('root').className=(p==='overtime'&&!clockMode)?'flash':'';
    if(clockMode){
      el('cbig').textContent=main;
      el('cbig').style.fontSize=fs+'px';
      el('cdate').textContent=S.clockShowDate?fmtDate(d):'';
      el('cdate').style.fontSize=(small*1.3)+'px';
    }else{
      var dg=el('digits');
      dg.textContent=main;
      dg.style.fontSize=fs+'px';
      dg.style.color=p==='ok'?'#ffffff':(p==='warn'?'#eab308':'#ef4444');
      el('speaker').textContent=seg?(seg.speaker||''):'';
      el('speaker').style.fontSize=(small*0.95)+'px';
      var title=seg?(seg.title||(seg.speaker?'':'Abschnitt '+(S.current+1))):'Kein Abschnitt';
      el('title').textContent=title;
      el('title').style.fontSize=(small*1.3)+'px';
      el('hclock').textContent=S.showClockInTimer?fmtClock(d,true):'';
      el('hclock').style.fontSize=(small*1.25)+'px';
      var prog=seg&&seg.durationSec>0?Math.max(0,Math.min(1,remaining/seg.durationSec)):0;
      el('fill').style.width=(prog*100)+'%';
      el('fill').style.background=p==='ok'?'#22c55e':(p==='warn'?'#eab308':'#ef4444');
    }
    var m=S.message;
    show('msg',!!m);
    // Hinweis „Antippen“ läge sonst auf dem Nachrichten-Banner
    el('tap').style.visibility=m?'hidden':'visible';
    if(m){
      el('msgtext').textContent=m.text;
      el('msgtext').style.fontSize=Math.max(14,Math.min(w/18,h/7))+'px';
      el('msg').className=m.flash?'flash':'';
    }
  }

  // Uhrzeit im Sekundentakt nachführen (auch ohne Ticks, z. B. pausiert oder Uhr-Modus)
  function clockLoop(){render();setTimeout(clockLoop,1000-(now().getTime()%1000)+5);}

  function setOnline(on){
    if(on===online)return;
    online=on;
    if(!on)offSince=Date.now();
    showConn();
  }
  // Erst nach 2 s melden: kurze Aussetzer (Neuverbindung) sollen nicht flackern
  function showConn(){show('conn',!online&&Date.now()-offSince>2000);}
  setInterval(showConn,500);

  function get(path,ok,fail){
    var x=new XMLHttpRequest();
    x.open('GET',path,true);
    x.timeout=5000;
    x.onload=function(){if(x.status===200){try{ok(JSON.parse(x.responseText));}catch(e){fail();}}else fail();};
    x.onerror=fail;x.ontimeout=fail;
    x.send();
  }
  function apply(m){
    if(m.type==='state'){S=m.payload;remaining=S.remainingSec;}
    else if(m.type==='tick'&&S){remaining=m.payload.remainingSec;S.running=m.payload.running;S.current=m.payload.current;}
    render();
  }
  // Uhr des Rechners übernehmen (Laufzeit halbiert) – zugleich Lebenszeichen alle 10 s
  function sync(){
    var t0=Date.now();
    get('api/time',function(r){
      var t1=Date.now();offset=r.now+(t1-t0)/2-t1;
      if(polling||(es&&es.readyState===1))setOnline(true);
    },function(){setOnline(false);});
  }
  function poll(){
    get('api/state',function(s){apply({type:'state',payload:s});setOnline(true);setTimeout(poll,1000);},
      function(){setOnline(false);setTimeout(poll,2000);});
  }
  function connect(){
    if(!window.EventSource){polling=true;poll();return;}
    es=new EventSource('api/events');
    es.onopen=function(){setOnline(true);};
    es.onmessage=function(e){try{apply(JSON.parse(e.data));setOnline(true);}catch(err){}};
    es.onerror=function(){setOnline(false);};
  }

  // Antippen: Vollbild + Bildschirm wach halten (Wake Lock nur, wo der Browser es erlaubt –
  // über http im LAN meist nicht); Mauszeiger verschwindet nach 3 s
  var lock=null;
  function wake(){
    try{if(navigator.wakeLock&&!lock)navigator.wakeLock.request('screen').then(function(l){lock=l;l.addEventListener('release',function(){lock=null;});}).catch(function(){});}catch(e){}
  }
  document.addEventListener('click',function(){
    var r=document.documentElement, f=r.requestFullscreen||r.webkitRequestFullscreen;
    if(f&&!(document.fullscreenElement||document.webkitFullscreenElement)){try{var p=f.call(r);if(p&&p.catch)p.catch(function(){});}catch(e){}}
    wake();
    el('tap').style.opacity='0';
  });
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')wake();});
  var idle=null;
  function moved(){document.body.className='';clearTimeout(idle);idle=setTimeout(function(){document.body.className='idle';},3000);}
  document.addEventListener('mousemove',moved);moved();
  setTimeout(function(){el('tap').style.opacity='0';},5000);
  window.addEventListener('resize',render);

  connect();sync();setInterval(sync,10000);clockLoop();
})();
</script>
</body>
</html>
`
