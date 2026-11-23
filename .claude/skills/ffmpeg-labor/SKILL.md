---
name: ffmpeg-labor
description: ffmpeg-Verfahren vor dem Einbau messen statt raten – Testmedien per lavfi, Bild- und Samplezahl, Stückgrenzen, Ruckeln, Zeit und Spitzenspeicher. Verwenden bei neuen Filterketten, Übergängen, Ken Burns, Montage oder Audio-Verarbeitung (Video-Generator, Konvertierungs-Kern).
---

# ffmpeg-Labor

Die Pläne in `docs/PLAN-VIDEO-GENERATOR.md` stammen aus Messungen am gebündelten ffmpeg
(`resources/ffmpeg/<os>/`, `npm run ff:fetch`) – dort stehen die geprüften Befehle, Messwerte
und **Stolpersteine** (u. a. `xfade`/`acrossfade` mit Dauer 0, Ton-Drift über den concat-Demuxer,
kein `-filter_complex_script` mehr, `xfade` verlangt identische Größe/Rate/Zeitbasis/Pixelformat).
Dort zuerst nachlesen. Neue Verfahren so prüfen, bevor sie in den Code wandern:

1. **Erst die Fähigkeiten:** `ffmpeg -hide_banner -filters` / `-encoders` – das gebündelte
   ffmpeg ist ein bestimmter Build, nicht das aus dem PATH. **Gegen den aktuellen Build messen**
   (`npm run ff:fetch -- --force`): Installer und CI nehmen den neuesten, und Verhalten ändert
   sich zwischen Builds (Farbort-Umrechnung im Herbst 2026, `-vsync` entfernt → `-fps_mode`).
   Bild-Eigenschaften je Stück prüfen:
   `ffprobe -read_intervals "%+#1" -show_entries frame=color_range,color_space,chroma_location`.
2. **Testmedien per lavfi**, nie echte Kundendateien: `testsrc2` (Bild, Bewegung), `sine` (Ton),
   Fotos als Einzelbild; absichtlich unbequeme Fälle (Hochkant, 29,97/59,94 fps, Mono 44,1 kHz,
   anamorph, ohne Ton, EXIF-gedreht).
3. **Zählen statt schauen:** Bildzahl (`ffprobe -count_frames`), Samplezahl und Dauer
   (`ffprobe -show_entries stream=duration,nb_read_frames`), Soll = Ist auf das Bild/Sample genau.
   Positionen aus der aufsummierten Zeitachse in ganzen Bildern runden, nicht je Stück.
4. **Stückgrenzen vergleichen:** Bild an der Naht gegen die Nachbarbilder (PSNR), sie müssen
   zusammenpassen; ohne Sprung bei Schleife und Übergang.
5. **Ruckeln messen:** einen Marker (kleiner heller Punkt) über die Bahn verfolgen und die
   Unruhe je Bild sowie Rückwärtssprünge zählen – so wurde `perspective` gegenüber `zoompan`
   entschieden.
6. **Zeit und Speicher je Lauf:** Wanduhr und Spitzen-Arbeitsspeicher. Unter Windows
   (PowerShell) den Prozess mit `Start-Process -PassThru` starten und
   `$p.Refresh(); $p.PeakWorkingSet64` in kurzen Abständen lesen; unter Linux `/usr/bin/time -v`.
   Wächst der Speicher mit der Elementzahl, ist die Kette zu groß – in Stücken rechnen.
7. **Lange Filtergraphen** als Datei (`-/filter_complex datei.txt`), die Windows-Kommandozeile
   ist auf 32.767 Zeichen begrenzt.
8. **Ergebnis festhalten:** Befehl, Messwerte und Stolperstein in den Plan bzw. die Doku
   schreiben und das Verfahren als Test in `convertPlan`/`videoGenPlan` oder `e2e/` verankern –
   Laborskripte im Arbeitsordner gehen sonst verloren.

**Live über eine Pipe (Stream fürs Heimnetz, gemessen November 2026):** Rohe Bilder über stdin
mit `-framerate` allein bekommen ihre Zeit aus der Bildzahl – fehlen Bilder, läuft die Zeit im
Strom dauerhaft hinter der Uhr (Labor: fünf Hänger zu 0,8 s = 4,01 s Rückstand). Mit
`-use_wallclock_as_timestamps 1` vor dem Eingang und `fps=<Rate>` am Ende der Filterkette
blieben 0,03 s, der nötige Puffer ist ein Hänger (0,83 s). Messen wie im Labor: Bilder im Takt
schreiben, mit Warteschleifen unterbrechen, den TS-Ausgang mit `e2e/tsMitschnitt.mjs` zerlegen
(`tsParser`, `zeitachse`). Dazu `-copyts`: Ohne fängt jeder Eingang bei 0 an, und ein neu
gestartetes ffmpeg dreht die Zeit für den Empfänger zurück; mit bleibt sie die absolute Wanduhr
(im TS modulo 2³³, rund 26,5 Stunden – Empfänger kennen den Überlauf).

**Ton dazu über einen zweiten Eingang (Stufe 2, gemessen November 2026)** – Blitz und Piep alle
2 s, Versatz Ton − Bild im Ausgang (`blitzUndPiep` in `e2e/tsMitschnitt.mjs`):

- Roh-PCM (`-f f32le -sample_rate 48000 -ch_layout stereo`) liest ffmpeg in Paketen zu **4096
  Samples (85 ms)**; mit `-use_wallclock_as_timestamps` kommt der Stempel erst am Paketende –
  der Ton lag 55 bis 162 ms zu spät. Mit `-itsoffset -0.0853` ±20 ms, nach Hängern blieben bis
  44 ms stehen: ffmpeg unterscheidet einen Schub verspäteter Blöcke nicht von einer Lücke.
- `-isync 0` am Ton: ab dem zweiten Paket gar kein Zeitstempel mehr (`pts N/A`).
- **`-itsoffset` greift bei Roh-PCM nicht** – ihre Pakete haben keinen Zeitstempel, ffmpeg zählt
  erst später ab 0.
- Was trägt: Ton OHNE Wanduhr, Sample für Sample in der richtigen Reihenfolge (der Sender legt
  die Blöcke nach ihrer Sample-Nummer, `stream/tontakt.ts`), `-af asetpts=N/SR/TB+<Start>/TB`
  mit der Startzeit in Sekunden und `-copyts`: −36 … −2 ms (das Raster eines Bildes), auch über
  vier Hänger zu 0,8 s. Mit `-avoid_negative_ts make_zero` dazu waren es −9 ms konstant, der
  Strom begann bei 0 – aber dann beginnt auch jeder Neustart von ffmpeg wieder bei 0, die Zeit
  springt für den Empfänger zurück. Deshalb ohne.

**Wo ein Bild im Strom landet (gemessen 22.11.2026):** Mit `-use_wallclock_as_timestamps 1`,
`-copyts` und `fps=30` liegt das Raster absolut auf Vielfachen von 1/30 s seit 1970, nicht ab dem
ersten Bild: Ein Bild erscheint zuerst auf `round(Ende des Schreibens / 33,3 ms) · 33,3 ms`
(193 von 199 Bildern genau, 6 ein Raster später, wenn ffmpeg spät las). Der MPEG-TS-Muxer
schiebt Bild und Ton gleich um 1,4 s. Das Raster verschiebt also jedes Bild um bis zu ±16,7 ms,
je Start fest (Bilder und Raster laufen im selben Takt; im E2E vor dem Ausgleich je Lauf
−21 … +6 ms, einmal sprang ein Blitz um ein Raster). Der Sender rechnet es je frischem Bild aus
dem Ende des Schreibens nach (`stream/bildRaster.ts`, Mittel statt Median: an der
Rundungsgrenze landen die Bilder abwechselnd davor und danach) und legt den Ton mit.
Messen: Bilder mit Nummer als **Streifenmuster** schreiben (ein Bit je Streifen, schwarz/weiß)
und mit `scale=8:1:flags=area,format=gray` zurücklesen. Nicht über die Helligkeit: x264 rundet
flache Flächen um mehrere Stufen, und `format=gray` liefert den begrenzten Bereich (16–235) –
beides ergab ein Sägezahn-Muster von ±5 Bildern, das wie ein schwankendes Raster aussah.

**Bild und Ton aus dem Spiegel des Players (Stufe 2):** Der Ton folgt der Medien-Uhr (Renderzeit
im AudioWorklet), das Bild kommt erst mit dem paint im main – dazwischen liegen die Phase der
Anzeige im Spiegel (Übergabe per `requestVideoFrameCallback` gegen `currentTime`, je Start
−15 … +13 ms) und der Weg zum paint (Windows 9 ms, Linux 4, macOS-Runner 19), danach das
Raster von ffmpeg (oben). Alles misst der Sender laufend (`erfassung/bildweg.ts`,
`stream/bildRaster.ts`) und legt den Ton um die Summe später (Protokollzeile „Weg des Bildes“);
ohne das lag der Ton am Mac bis zu zwei Bilder zu früh. Diagnose je Teilstrecke im E2E:
`e2e/avDiagnose.mjs`. Nach einem Hänger kann der Spiegel ein Bild später zeigen und nach dem
nächsten wieder pünktlich (CI, Linux-Runner ohne GPU, Lauf 44970466157: +33 ms nach dem ersten
Hänger, zurück nach dem zweiten). Der Median der letzten 90 Proben zieht nach 2–3 s nach, jeder
Wechsel rückt den Ton (eine kurze Lücke, deshalb erst ab 10 ms Änderung, bis #249 5): Blitze in dieser
Zeit lagen ein Bild daneben (−38, +29 ms), danach wieder bei 0. Erwogen und verworfen: nur aus
eng liegenden Proben nachführen – das hätte genau diese Sprünge verzögert und auf Rechnern mit
breiter Streuung den Ausgleich eingefroren. Auch der Weg zum paint kann nach einem Hänger länger
bleiben (Windows lokal: je Blitz 20–29 statt 9–12 ms, der Median nur 15); landet der Blitz dann
jenseits einer Rundungsgrenze des Rasters, steht er ein Raster später im Strom (−23 … −30 ms).
Ein Bild Genauigkeit ist mit 30 Bildern/s je Blitz also nicht garantiert, die Grenze im E2E ist
60 ms.

**Unter Last (main f810d49, macOS-Runner: −126 ms am ersten Blitz):** Holt der Ton-Thread des
Spiegels nach einem Stocken auf, steht `ctx.currentTime` schon weiter, und der Spiegel meldet die
Renderzeit der Blöcke des Schubs zu früh. Der Ton-Takt richtete sich nach dem pünktlichsten Block
(richtig für Ankunftszeiten, die nur zu spät sein können) und machte so einen Block zum Anker –
der ganze Ton lag bis zu 1,5 s um dessen Fehler zu früh. Seit #249 zählt mit Renderzeit der
Median der Blöcke (`stream/tontakt.ts`), ein neuer Weg rückt den Anker um genau die Änderung,
statt am gerade ankommenden Block neu anzusetzen, und der Sender rückt erst ab 10 ms Änderung
(unter Last wanderte der Weg um ±15 ms: 14 Wechsel in 25 s). Im Protokoll: „Renderzeit zu
früh“, „Ton nachgeführt“; die E2E-Diagnose zählt die Blöcke mit zu früher Renderzeit.
Zweiter Weg zu so einem Ausreißer, von der Bildseite: Unter macOS und Linux geht ein Bild in
64-KB-Stücken durch die Pipe zu ffmpeg (3,7 MB bei 720p), jedes Stück eine Runde im Event-Loop
des main-Prozesses, und ffmpeg stempelt erst, wenn es ganz da ist. Ist der main beschäftigt,
liegt das Bild so viel zu spät im Strom – im roten Lauf stieg das Raster genau um den ersten
Blitz von 14 auf 19 ms (über 300 Bilder gemittelt: die 20 Bilder dazwischen im Schnitt 44 ms
später). Der Sender meldet solche Bilder („Bild spät an ffmpeg“, ab 50 ms), und das E2E zerlegt
jeden Blitz in „Bild nach dem paint“ und „Piep nach der Renderzeit“ (PTS − 1,4 s gegen die
Wanduhr) – ein Ausreißer zeigt sich nur auf einer Seite. Im nächsten macOS-Lauf genau so: erster
Blitz −42 ms, davon das Bild 34 ms nach dem paint (sonst 0), der Piep normal. Grund: stdin eines
Kindprozesses ist unter macOS ein Unix-Socket-Paar mit 8 KB Puffer je Seite – 3,7 MB brauchen
Hunderte Runden. Seit #249 gehen die Bilder über TCP auf 127.0.0.1 (128 KB je Seite, wächst).
Drittens wanderte dort der Anteil des Spiegels: Er misst gegen `currentTime`, und die Medien-Uhr
ging anders als die Ton-Uhr (−439 gegen −1542 ppm) – 27 ms in 25 s, während Ton und Bild im
Spiegel zusammenblieben; der Sender wanderte mit und legte den Ton 14 ms zu früh. Seit #249
gelten nach dem ersten Wert nur Sprünge (mehr als 10 ms in 3 s, `stream/spiegelAnteil.ts`) –
echte Wechsel nach Hängern sind Sprünge, Wandern steht einmal als „Spiegel wandert langsam“ im
Protokoll. Ein Stocken des main selbst sieht „Bild spät an ffmpeg“ nicht: Die Erfassung stempelt
das paint erst bei der Ankunft, danach geht es schnell. Dafür zählt der Sender seit #253 jeden
Takt, der mehr als 50 ms zu spät kommt (`stream/stockWaechter.ts`, Zeile „main-Prozess stockte“);
Bilder aus so einem Moment liegen im Strom so viel zu spät, der Ton nicht (Paket ST6).

**Audio-Testsignale (gemessen, Oktober 2026):** `aevalsrc=0.1*sin(2*PI*1000*t)` trifft den
Pegel exakt (Spitze −20,0 dBFS; `sine` hat dagegen 1/8 Amplitude). `anoisesrc=color=pink` ist in
Terzen von 63 Hz bis 4 kHz flach (±0,3 dB), darüber fällt es (−1 dB bei 8 kHz, −2,3 dB bei
12,5 kHz). Nachgemessen je Terz mit zwei `bandpass=width_type=q:w=4.32` hintereinander und
`astats` (RMS); `astats` nennt 20·log10(RMS) – Sinus nach AES17 also +3,01 dB.

Aufräumen: große Zwischendateien (Intra-Material etwa 320 MB je Minute 1080p) nach dem Lauf
löschen, Messungen im Scratchpad ablegen, nicht im Repository.

**Nicht neben den E2E messen:** `e2e/shutdown.mjs` zählt nach dem Beenden jedes `ffmpeg` aus
`resources/ffmpeg` als „läuft weiter“ – auch die eines Laborskripts (21.11.2026 so rot geworden,
allein wiederholt grün).
