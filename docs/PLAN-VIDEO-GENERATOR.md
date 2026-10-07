# Plan: Video-Generator (Diashow & Montage)

**Status:** Plan, noch nicht umgesetzt (Phase 0 erledigt). **Stand:** 7. Oktober 2026 (Code-Basis
`main` nach PR #110). Die [Festlegungen](#festlegungen) (Name, Hauptzweck, Musik, Titel/Logo)
sind getroffen – die Umsetzung kann mit Phase 1 beginnen.

Bilder und Videos hineinladen, ein Gesamtvideo herausbekommen: Anzeigedauer, Übergänge,
Reihenfolge, Ken-Burns-Effekt, einstellbare Zielgröße. Die Messwerte unten stammen aus Versuchen
mit dem gebündelten ffmpeg (N-127222 vom 06.10.2026, Linux, 4 Kerne, nur CPU); die dort
geprüften Befehle stehen im Abschnitt [Render-Pipeline](#render-pipeline).

Hauptzwecke sind **Foto-Diashows** (Gala, Hochzeit) und **Sponsor-Loops** für die LED-Wand; bei
Videos genügt ein Ausschnitt (Start/Ende). Ein Schnittprogramm soll das Werkzeug nicht werden.

- [Entscheidung](#entscheidung-eigenes-werkzeug)
- [Funktionsumfang](#funktionsumfang)
- [Bedienung](#bedienung)
- [Render-Pipeline](#render-pipeline) – [Messwerte](#messwerte), [Stolpersteine](#stolpersteine)
- [Umsetzung im Code](#umsetzung-im-code)
- [Sonderfälle](#sonderfälle)
- [Phase 0: EXIF-Drehung von Fotos](#phase-0-exif-drehung-von-fotos-betrifft-heute-den-player)
- [Phasen](#phasen) · [Tests & Doku](#tests--doku) · [Festlegungen](#festlegungen)

## Entscheidung: eigenes Werkzeug

Ein eigenes Werkzeug **„Video-Generator“** (Kategorie „Medien & Bibliothek“, id
`video-generator`), das den gemeinsamen Konvertierungs-Kern nutzt – **kein Modus im
Video-Konverter**.

- Der Konverter macht aus N Dateien N Dateien, jede für sich geplant (`converterJobs.enqueue`:
  ein Auftrag je Datei, `ConverterJob.inputPath` ist ein einzelner Pfad). Der Generator macht aus
  N Elementen mit Reihenfolge, Dauer und Übergängen **eine** Datei, mit Zeitleiste und Vorschau.
- Ein Konverter-Modus müsste rund die Hälfte von `hap-converter/VideoConverter.tsx` mit
  Modus-Weichen durchziehen: Eingabeliste ohne Reihenfolge und Dubletten, Vorgaben mit Größe
  „Original/höchstens“ und Bildrate „Original/Raster“ (für eine Montage ungültig), Auftragsliste
  mit einem Eingang je Auftrag, und `setOptions(…)` würde die gemerkte Zielvorgabe auf „eigene“
  stellen. Das in einem Werkzeug, das in der Show läuft.
- Der Gewinn wäre klein: Formate, GPU-Encoder mit Rückfall, Lautheit und Warteschlange kommen
  ohnehin aus dem Kern (CLAUDE.md: „Neue Korrekturen und Formate dort einbauen, nicht je Tool“).
- Im Konverter (und in der Medien-Info) nur ein Knopf **„Zu einem Video zusammenfügen…“**, der
  die Dateien per `useHandoff().givePaths('video-generator', paths)` übergibt (Muster:
  `showInMediaInfo` im Konverter), in der Kundenansicht ausgeblendet.

## Funktionsumfang

### Phase 1 – Grundausstattung

- **Elemente:** Bilder (alle aus `STILL_IMAGE_EXTENSIONS`), Videos (`VIDEO_EXTENSIONS`), GIFs als
  Schleife über die Standzeit. Hinzufügen per Ziehen (auch an eine Position), Dialog oder Ordner
  (Ordner im Renderer über `api.mediaInfo.collect` auflösen, auf Medien filtern).
- **Reihenfolge:** Ziehen, Pfeil-Knöpfe/Tastatur; sortieren nach Name (natürlich, „2“ vor „10“,
  gleicher Collator wie `collectMediaFiles`), Aufnahmedatum, Typ; **Mischen** würfelt die Liste
  einmal sichtbar um – gerendert wird genau, was man sieht.
- **Dauer:** Bilder mit Vorgabe (Vorschlag 5 s) und je Bild änderbar.
- **Videoausschnitt:** je Video **Start und Ende** festlegen (ein Ausschnitt; Eingabe in Sekunden
  mit Komma, Vorgabe: ganzes Video). Damit man die Stelle sieht, zeigt die Auswahl Vorschaubilder
  am Start- und am Endpunkt (`vgenThumb` mit Zeitpunkt); grafisch ziehen folgt in Phase 2. Es gibt
  **keinen Schnitt-Editor** – soll ein Clip mit zwei Ausschnitten vorkommen, fügt man ihn zweimal
  hinzu (jedes Element hat eine eigene id, Dubletten sind erlaubt).
- **Übergänge:** Vorgabe und je Übergang: Schnitt, Überblenden, über Schwarz, über Weiß,
  Auflösen, Wischen ←/→, Schieben ←/→/↑/↓, Kreis, weiches Wischen, Zoom (xfade kennt über 50 –
  eine kuratierte Auswahl mit deutschen Namen genügt). Vorgabe 1 s. Zu lange Übergänge werden
  gekürzt (höchstens die Hälfte des kürzeren Nachbarn), mit Hinweis.
- **Nahtlose Schleife** (Schalter bei der Ausgabe, Vorgabe aus; für Sponsor-Loops im Player): Das
  Ende blendet in den Anfang. Der Schleifen-Übergang (letztes → erstes Element) ist ein normaler
  Übergang mit eigener Art und Länge (bei „Schnitt“ entfällt das Stück, die Naht ist dann hart);
  möglich ab zwei Elementen, sonst Hinweis. Die Gesamtdauer ist die Summe der Dauern minus
  **aller** Übergänge. Technik: [Render-Pipeline](#render-pipeline), „Nahtlose Schleife“.
- **Ken Burns je Bild:** aus, automatisch (wechselnde Richtungen, deterministisch aus der
  Element-id; Hochkantbilder schwenken senkrecht), Zoom rein/raus, Schwenk ←/→/↑/↓. Stärke sanft
  (10 %), mittel (20 %), stark (35 %). Vorgabe: automatisch, mittel.
- **Einpassen** (Vorgabe und je Element): Füllen (Beschnitt), Ränder in Hintergrundfarbe,
  Blur-Rand (wie im Player).
- **Zielgröße:** Breite × Höhe, Bildrate (25, 30, 50, 60, 23,976, 29,97, 59,94); Vorlagen HD,
  4K, Hochkant; „Wie Player-Wand“ und „Aus LED-Wall-Konfigurator“.
- **Ton:** Originalton je Video an/aus (in Übergängen verblendet); eine Musikdatei (auf
  Gesamtlänge geschnitten bzw. wiederholt, Ein-/Ausblenden, Pegel – bei Schleife blendet statt-
  dessen das Musikende in den Anfang); Lautheit nach EBU R128 wie im Konverter (zweistufig,
  gemessen am fertigen Ton-Mix).
- **Ausgabe:** Formate wie im Konverter (H.264, H.265, ProRes, HAP/HAP Q; Transparenz erst
  später), Qualität, GPU-Encoder mit Rückfall; Fortschritt in Stufen, Abbrechen; danach
  „In Player-Bibliothek übernehmen“, „In Medien-Info prüfen“, „Im Ordner zeigen“.
- **Projekt** wird gemerkt (zustand-Store), Startbildschirm-Kachel zeigt „rechnet · x %“.

### Phase 2 – Ausbau

- **Vorschau live** in der App: Ken Burns per CSS-`transform`, Überblenden per Deckkraft
  (Prinzip wie die Doppel-Ebene der `PlaybackEngine` im Player, aber eigene Komponente). Die
  Ausschnitte kommen aus **derselben** reinen Funktion wie die Filter – Vorschau und Datei laufen
  gleich.
- **„Vorschau rechnen“:** kleiner Probelauf (z. B. 640 px) eines Bereichs um das gewählte
  Element, exakt wie das Ergebnis.
- **Ken-Burns-Rahmen:** Start- und Endausschnitt direkt auf dem Bild ziehen.
- **Videoausschnitt grafisch:** Start und Ende an einem Bereichsregler über der Vorschau setzen
  (Phase 1: Eingabefelder mit Vorschaubildern).
- **Musik:** mehrere Titel, Absenken unter Originalton (`sidechaincompress`), „Bilddauer an
  Musiklänge anpassen“.

### Später

Titel-/Texttafeln (im Renderer gezeichnet → PNG → Standbild-Element, wie der Testbild-Export),
eingebackenes Logo (`overlay`, PNG mit Alpha), Farbkorrektur/LUT (`lut3d`), Schnitt auf den Takt
der Musik, „ein Video je Ordner“, benannte Projekt-Vorlagen.

### Nicht geplant

Schnitt-Editor (Clips teilen, mehrere Ausschnitte je Clip, Schnittmarken, mehrere Spuren) und
Clip-Zusammenschnitt als Schwerpunkt – dafür gibt es Schnittprogramme; der Generator bleibt bei
Diashow, Loop und einfacher Montage.

## Bedienung

- **Oben: Storyboard** – Kachelreihe in Abspielreihenfolge mit Vorschaubildern; zwischen den
  Kacheln ein anklickbares Übergangs-Symbol; Zeitlineal und Gesamtdauer. Listenansicht für viele
  Elemente (100+ Fotos).
- **Mitte: Vorschau** des gewählten Elements – in Phase 1 als Standbild (bei Videos am Start-
  bzw. Endpunkt), ab Phase 2 live mit Play.
- **Seiten-Panel** (`ToolShell`/`PanelSection` wie die anderen Werkzeuge):
  - **Ausgabe:** Größe, Bildrate, Format, Qualität, Schleife, Zieldatei.
  - **Vorgaben:** Bilddauer, Übergang, Ken Burns, Einpassen.
  - **Ton & Musik.**
  - **Auswahl:** Einstellungen des gewählten Elements bzw. Übergangs (bei Videos: Start/Ende),
    auch für mehrere zugleich.
- **„Video erzeugen“:** Auftrag mit Fortschritt in Stufen (Elemente x/y, Übergänge,
  Zusammensetzen), Abbrechen.
- **Kundenansicht** (`useKiosk()`): Encoder-Wahl und Sprünge in andere Werkzeuge ausblenden, wie
  im Konverter.

## Render-Pipeline

**Nicht** alles in einem ffmpeg-Lauf: Ein einzelner `filter_complex` über alle Eingänge brauchte
2,3–2,5 GB Arbeitsspeicher schon bei 20–40 Elementen (wächst mit jedem Element), und ein Fehler in
einem Element bricht alles ab. Stattdessen in Stücken – gemessen bild- und samplegenau:

1. **Analyse** je Datei über `probeMediaInfo` (Cache); bei Fotos die EXIF-Drehung beachten
   ([Phase 0](#phase-0-exif-drehung-von-fotos-betrifft-heute-den-player)).
2. **Element-Stücke** (parallel, zwischengespeichert): jedes Element exakt auf Zielgröße,
   Bildrate, `yuv420p`, SAR 1, Farbe und Drehung normalisiert, Ken Burns eingerechnet, genau
   `round(dauer × fps)` Bilder. Zwischenformat **H.264 nur Einzelbilder** (`-g 1`, crf 12,
   ultrafast) – jedes Bild ein Keyframe, daher bildgenau schneidbar (gemessen mit `yuv420p`; für
ProRes-/HAP-Ziele eine 4:4:4-Zwischenstufe wählen, noch nicht gemessen). Ton des Elements als
   PCM 48 kHz Stereo mit genau passender Samplezahl (Bilder/stumme Videos: Stille).
3. **Übergangs-Stücke:** je Übergang ein kurzes Stück nur aus den beiden Nachbarn (`xfade`).
   Schnitte brauchen kein Stück.
4. **Bild zusammensetzen:** concat-Demuxer mit `inpoint`/`outpoint` liest die Stücke nacheinander
   – Speicher konstant, egal wie viele Elemente.
5. **Ton:** eigener Lauf über die Tonspuren der Elemente (`acrossfade` bei Übergängen, `concat`
   bei Schnitten) → WAV; dazu Musik und die zweistufige Lautheitsmessung (schnell, nur Ton).
   **Nicht** über den concat-Demuxer (driftet, siehe [Stolpersteine](#stolpersteine)).
6. **Endlauf:** einmal ins Zielformat kodieren – Encoder-Argumente aus dem Kern, GPU über
   `encodeWithFallback` (scheitert die GPU, einmal CPU).

Ändert man ein Element, werden nur dessen Stück, die Übergänge zu den Nachbarn und der Endlauf neu
gerechnet. Cache-Schlüssel: Quell-Signatur (Pfad, Größe, mtime) + Element-Einstellungen +
Zielgröße/Bildrate + Plan-Version; Cache-Ordner `userData/vgen-cache` mit Größengrenze.

**Zeitachse in ganzen Bildern.** Ton-Positionen aus der aufsummierten Zeitachse runden, nicht je
Stück – bei 29,97/59,94 fps ist ein Bild keine ganze Zahl Samples (1601,6 bei 29,97), sonst
entsteht Drift.

**Nahtlose Schleife** (noch nicht gemessen – eine Verallgemeinerung der gemessenen Verfahren): Die
Übergänge werden zyklisch gezählt, Element n−1 blendet in Element 0. Das Schleifen-Übergangs-Stück
entsteht wie jedes andere aus dem Schluss von Element n−1 und dem Anfang von Element 0 und steht
am Ende der Bildliste; die Datei **beginnt** in Element 0 erst hinter dessen Überblendbereich
(`inpoint` = Länge des Schleifen-Übergangs – die Regel „Übergang davor“ der Bildliste gilt damit
auch für Element 0). Im Ton-Lauf wird Element 0 zweimal gebraucht: ab dem Schleifen-Übergang als
Anfang und als Kopfstück im letzten `acrossfade`. Dauer = Summe der Dauern − Summe aller n
Übergänge; die Kürzungsregel (höchstens die Hälfte des kürzeren Nachbarn) gilt zyklisch. Ken Burns
an Element 0 läuft ohne Sprung weiter, weil die Datei mitten in dessen Bahn beginnt. Die Musik
bekommt bei Schleife kein Aus-/Einblenden; ihr Ende wird mit ihrem Anfang überblendet
(`acrossfade`). Prüfen im E2E: letztes Bild → erstes Bild ohne Sprung gegen die Nachbarbilder. Wie
sauber der Player am Dateiende neu startet, ist getrennt zu prüfen.

### Geprüfte Befehle

So im Labor gelaufen (Pfade gekürzt, 1920×1080 bei 25 fps). In der App kommt die
Normalisierung je Element aus `planConversion` (Drehung, Deinterlace, HDR→SDR, quadratische
Pixel, VFR→CFR) – die Ketten hier sind die vereinfachte Form.

**Foto mit Ken Burns (Zoom rein 1,2×, 4 s = 100 Bilder):** Bild **einmal** dekodieren und per
`loop` wiederholen (statt `-loop 1` am Eingang, das das Foto für jedes Bild neu dekodiert), dann
`perspective` (Subpixel) mit der Bildnummer `in`:

```
ffmpeg -i foto.jpg -filter_complex "[0:v]scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos,crop=1920:1080,setsar=1,format=yuv420p,loop=loop=99:size=1:start=0,setpts=N/25/TB,perspective=x0='(0.5*W-(W/pow(1.2,in/99))/2)':y0='(0.5*H-(H/pow(1.2,in/99))/2)':x1='((0.5*W-(W/pow(1.2,in/99))/2)+(W/pow(1.2,in/99)))':y1='(0.5*H-(H/pow(1.2,in/99))/2)':x2='(0.5*W-(W/pow(1.2,in/99))/2)':y2='((0.5*H-(H/pow(1.2,in/99))/2)+(H/pow(1.2,in/99)))':x3='((0.5*W-(W/pow(1.2,in/99))/2)+(W/pow(1.2,in/99)))':y3='((0.5*H-(H/pow(1.2,in/99))/2)+(H/pow(1.2,in/99)))':interpolation=cubic:eval=frame,fps=25,setsar=1,trim=end_frame=100[v];anullsrc=r=48000:cl=stereo,atrim=end_sample=192000,asetpts=N/SR/TB[a]" -map "[v]" -map "[a]" -c:v libx264 -preset ultrafast -crf 12 -g 1 -pix_fmt yuv420p -c:a pcm_s16le element_00.mov
```

Allgemein: Zoom `z(n) = Z^(n/(N−1))` (exponentiell wirkt gleichmäßig), Ausschnitt `w = W/z`,
`h = H/z`, links oben `x0 = cx·W − w/2`, `y0 = cy·H − h/2`; die vier Ecken `x0..y3` sind die
Quellpunkte, die auf die Ausgabe-Ecken abgebildet werden. Für mehr Detail bei starkem Zoom vorher
auf Ausgabe × Endzoom vergrößern und nach `perspective` auf W×H verkleinern (gemessen etwas
schärfer, aber ⅓ langsamer).

**Hochkantfoto, senkrechter Schwenk:** auf Ausgabebreite skalieren, Ausschnitt in Ausgabe-
Seitenverhältnis wandert von oben nach unten:

```
[0:v]scale=1920:-2:flags=lanczos,format=yuv420p,loop=loop=99:size=1:start=0,setpts=N/25/TB,perspective=x0=0:y0='((H-1080*W/1920)*in/99)':x1=W:y1='((H-1080*W/1920)*in/99)':x2=0:y2='((H-1080*W/1920)*in/99)+(1080*W/1920)':x3=W:y3='((H-1080*W/1920)*in/99)+(1080*W/1920)':interpolation=cubic:eval=frame,scale=1920:1080:flags=bicubic,fps=25,setsar=1,trim=end_frame=100[v]
```

**Video (Ränder, Ausschnitt ab 1 s, 5 s = 125 Bilder):** zu kurze Clips mit dem letzten Bild
auffüllen, dann exakt schneiden; Ton auf 48 kHz Stereo, auffüllen, exakt schneiden:

```
ffmpeg -ss 1.0 -t 5.0 -i clip.mp4 -filter_complex "[0:v]scale='trunc(iw*sar/2)*2':ih,setsar=1,scale=1920:1080:force_original_aspect_ratio=decrease:flags=lanczos,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=25,format=yuv420p,tpad=stop_mode=clone:stop_duration=5.0,trim=end_frame=125,setpts=PTS-STARTPTS[v];[0:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=end_sample=240000,asetpts=N/SR/TB[a]" -map "[v]" -map "[a]" -c:v libx264 -preset ultrafast -crf 12 -g 1 -pix_fmt yuv420p -c:a pcm_s16le element_01.mov
```

Blur-Rand für Hochkantvideos: `split=2[bg][fg]; [bg]` klein rechnen (W/8), `boxblur=8:2`, auf
W×H hochskalieren; `[fg]` einpassen; `overlay=(W-w)/2:(H-h)/2:shortest=1`. **Labels je Element
mit Präfix** – die festen Labels aus `fitFilters('blur')` kollidieren sonst.

**Übergang** (Element k hat Dauer d, Übergang T Sekunden = nT Bilder): `-ss` vor `-i` springt in
der Einzelbild-Zwischendatei bildgenau. Nur Bild – der Ton kommt aus dem eigenen Lauf:

```
ffmpeg -ss {d-T} -i element_k.mov -t {T} -i element_k+1.mov -filter_complex "[0:v]trim=end_frame={nT},setpts=PTS-STARTPTS[a];[1:v]trim=end_frame={nT},setpts=PTS-STARTPTS[b];[a][b]xfade=transition=fade:duration={T}:offset=0,trim=end_frame={nT}[v]" -map "[v]" -an -c:v libx264 -preset ultrafast -crf 12 -g 1 -pix_fmt yuv420p uebergang_k.mov
```

**Bildliste** für den concat-Demuxer – je Element der Teil ohne die Überlappungen (`inpoint` =
Länge des Übergangs davor, `outpoint` = Dauer − Übergang danach), dazwischen die
Übergangs-Stücke. Pfade mit `/` schreiben, `'` als `'\''` maskieren; `-safe 0`:

```
ffconcat version 1.0
file 'element_00.mov'
inpoint 0.000000
outpoint 3.000000
file 'uebergang_00.mov'
file 'element_01.mov'
inpoint 1.000000
outpoint 4.200000
file 'uebergang_01.mov'
file 'element_02.mov'
inpoint 0.800000
outpoint 4.000000
…
```

**Ton-Lauf** (Graph als Datei, siehe Stolpersteine). Kette über alle Elemente, `acrossfade` mit
der Übergangslänge, `concat` bei Schnitten. Besser als im Labor: Die Element-Stufe schreibt den
Ton zusätzlich als eigene WAV, dann liest dieser Lauf nur die kleinen WAVs:

```
ffmpeg -i ton_00.wav -i ton_01.wav -i ton_02.wav … -/filter_complex ton_graph.txt -map "[xaN]" -c:a pcm_s16le mix.wav

ton_graph.txt:
[0:a][1:a]acrossfade=d=1.0:c1=tri:c2=tri[xa0];[xa0][2:a]acrossfade=d=0.8:c1=tri:c2=tri[xa1];[xa1][3:a]concat=n=2:v=0:a=1[xa2];…
```

**Endlauf:**

```
ffmpeg -f concat -safe 0 -i liste.ffconcat -i mix.wav -map 0:v -map 1:a <Encoder-Argumente aus dem Kern> ausgabe.mp4
```

Musik und Lautheit kommen in den Ton-Lauf bzw. als `loudnormApplyFilter` vor dem Endlauf, damit
der Endlauf nur noch kodiert.

### Messwerte

20 gemischte Elemente (Fotos 4000×3000 quer und 3000×4000 hoch mit Ken Burns, 1080p25 mit Ton,
720p30 ohne Ton, Hochkant 1080×1920 60 fps mono 44,1 kHz, 4K 29,97, PAL anamorph), 15 Übergänge
und 4 Schnitte, Ziel 1080p25, 4 Kerne, nur CPU:

| | Ein großer Lauf | Stück-Verfahren |
|---|---|---|
| Arbeitsspeicher | 2,5 GB, wächst je Element | 0,32 GB je Element-Stück, 0,43 GB Endlauf – konstant |
| Länge | – | 71,400 s soll = ist |
| Bilder | – | 1785 von 1785 |
| Ton | – | 3.427.200 von 3.427.200 Samples |
| Stückgrenzen | – | alle bildgenau (Vergleich je Grenze mit den Nachbarbildern) |
| Zeit | – | 40 s für 71 s Video (Elemente 19,7 s mit 2 parallel, Übergänge 5,8 s, Endlauf 14,7 s) |
| Zwischendateien | – | ≈ 43 Mbit/s → ca. 320 MB je Minute bei 1080p25 (4K: ca. 1,3 GB) |

**Ken Burns** – Bahn eines Markers Bild für Bild verfolgt (150 Bilder, Zoom 1→1,25):

| Verfahren | Unruhe je Bild | Rucker rückwärts | Tempo 1080p / 4K |
|---|---|---|---|
| `zoompan` direkt (gängiges Rezept) | 0,32 px | 11 – sichtbares Zittern | 129 / 101 Bilder/s |
| `zoompan`, 2× vorvergrößert | 0,16 px | 0 (2 ungleichmäßige) | – / 42 Bilder/s |
| `zoompan`, 4× vorvergrößert | 0,08 px | 0 | 44 / 13 Bilder/s |
| **`perspective`** (Subpixel, kubisch) | **0,009 px** | **0** | **42 / 12,6 Bilder/s** |
| `scale` je Bild + `crop` | 0,6 px | 58 | 19 Bilder/s |

→ `perspective` ist der Standard: praktisch ruckelfrei bei gleichem Tempo wie `zoompan` 4×.
Gerade auf LED-Wänden fallen ruckelnde langsame Schwenks sofort auf. 4K-Fotos sind teuer
(≈ 12–17 s je 6-s-Foto auf 4 Kernen) – Fortschritt und Parallelität zählen.

**Zwischenformat** (6 s 1080p): H.264 nur Einzelbilder crf 12 ultrafast 0,6 s, 46 Mbit/s,
52 dB (sichtbar verlustfrei); MJPEG 0,6 s, 34 Mbit/s, 47 dB; utvideo (verlustfrei) 0,7 s,
180 Mbit/s; FFV1 2,2 s, 112 Mbit/s; ProRes HQ 11 s, 189 Mbit/s. → H.264 nur Einzelbilder.

### Stolpersteine

Alle gemessen – die naheliegenden Rezepte gehen hier schief:

- **`xfade` mit Dauer 0 als Schnitt beendet das Video**, wenn der Versatz genau am Ende des
  ersten Eingangs liegt (71 s erwartet, 11 s geliefert). Schnitte per `concat`.
- **`acrossfade` mit Dauer 0 blendet trotzdem 0,92 s** (fällt auf 44100 Samples zurück).
  Schnitte im Ton per `concat`.
- **Ton über den concat-Demuxer driftet:** `inpoint` rastet beim Ton auf Paketgrenzen, je Grenze
  einige Millisekunden zu viel – nach 20 Elementen 0,35 s Versatz. Deshalb der eigene Ton-Lauf
  (gemessen exakt).
- **`xfade` verlangt identische Größe, Bildrate, Zeitbasis und Pixelformat** („timebase do not
  match“, „parameters … do not match“). Jedes Element exakt normalisieren, auch wenn die Quelle
  schon passt – `planConversion` setzt `fps=` nur, wenn sich die Rate ändert, und `setsar=1` nur,
  wenn überhaupt Filter laufen; beides muss für Montage-Stücke immer gesetzt werden.
- **Dieses ffmpeg kennt `-filter_complex_script` nicht mehr.** Lange Graphen als Datei über
  `-/filter_complex datei.txt`. Die Windows-Kommandozeile ist auf 32.767 Zeichen begrenzt
  (40 Fotos in einem Graph sind schon ≈ 10.000 Zeichen).
- **Handyfotos:** ffmpeg dreht sie beim Dekodieren nach EXIF, die Analyse sieht die Drehung aber
  nicht ([Phase 0](#phase-0-exif-drehung-von-fotos-betrifft-heute-den-player)).

## Umsetzung im Code

### Konvertierungs-Kern (kleine Umbauten, Konverter und Player bleiben unverändert)

- `main/services/convert/args.ts`: `videoEncoderArgs` (privat) exportieren und auf
  `(format, video: {width, height, fps, gop}, opts, io)` entkoppeln; Audio-Codec- und
  Container-Argumente als eigene Funktionen. `buildConvertArgs` bleibt die Zusammensetzung für
  eine Datei (bestehende Tests bleiben grün).
- `shared/convertPlan.ts` – nur optionale Schalter: Standbild als Video planen (heute „Standbild –
  kein Video“), immer `fps` + `setpts` + `setsar=1`, Label-Präfix für `fitFilters('blur')`,
  Farbmatrix wirklich umrechnen (SD-601 und HD-709 gemischt), Alpha einmal für die ganze Montage
  entscheiden, HDR immer nach SDR (ein Datenstrom kann nicht beides sein), In-/Out-Punkte.
  `fitFilters` und `sourceMatrix` exportieren.
- `convert/capabilities.ts`: `xfade` und `perspective` als Fähigkeiten prüfen (Muster
  `parseFilterNames`/`capabilitiesFrom`), fehlende in der Oberfläche ausgrauen.
- `converterJobs.ts`: `encoderFamily` und die CPU-Rückfall-Wahl exportieren bzw. herausziehen;
  `uniqueOutputPath` um einen Helfer ohne Eingangsdatei ergänzen.
- `convert/loudness.ts`: `measureLoudness` auf „beliebige Argumente + Dauer“ verallgemeinern (die
  reinen Funktionen in `shared/loudness.ts` passen unverändert).
- Warteschlange: ein Eintrag je Projekt in der Spur `converter` (teilt sich GPU-Sitzungen mit dem
  Konverter); die Element-Stücke innerhalb des Auftrags begrenzt parallel.
- `runFfmpeg` ist schon allgemein (Fortschritt aus `out_time_us`, Abbruch, Fehlertext);
  Fortschritt der Stufen nach Ausgabesekunden gewichten.

### Neue Module

- `src/shared/videoGenPlan.ts` (rein, Tests): Zeitachse in ganzen Bildern, Kürzungen,
  Ken-Burns-Bahnen (`kenBurnsAt(n)` liefert Ausschnitt → `perspective`-Ausdruck **und**
  CSS-Transform), Filter je Element, Übergangs-Stücke, Bildliste, Ton-Graph, Hinweise,
  Speicherschätzung, Cache-Schlüssel. Auch der Renderer nutzt sie (Gesamtdauer, Lineal, Vorschau).
- `src/main/services/convert/videoGen*.ts`: Auftrag (Muster `converterJobs.run`: prüfen, planen,
  Stücke, Übergänge, Ton, Lautheit, Ausgabepfad reservieren, kodieren mit Rückfall, halbfertige
  Datei bei Fehler löschen), Cache mit Größengrenze, Vorschaubilder.
- `src/main/ipc/videoGen.handlers.ts`: Projekt feldweise prüfen (Allowlist der Übergänge,
  Grenzen für Dauern/Größen/Elementzahl), Speicherdialog, Fortschritts-Events (Muster
  `pattern.handlers.ts`). Registrierung in `ipc/registry.ts`, Sink wie `converterJobs.setSink`.
- **IPC** (CLAUDE.md: Channel + `ToolboxApi`-Methode + preload + Handler): `vgenThumb`,
  `vgenPickOutput`, `vgenEnqueue`, `vgenList`, `vgenCancel`, `vgenClearFinished`, Event
  `vgenUpdate`; Phase 2 `vgenPreview`.
- **Vorschaubilder/Probeläufe** beliebiger Quellen: `media://` liefert heute nur Dateien aus
  `player-media` (`resolveMediaFile`). Einen Zweig für `url.host === 'vgen'` mit eigenem sicheren
  Resolver auf `userData/vgen-cache` ergänzen – kein neues Schema, keine CSP-Änderung, kein
  `file://` (SICHERHEIT.md). Erzeugt mit `buildThumbArgs`, begrenzt parallel, vom Renderer lazy
  angefordert.

### Renderer

- `tools/video-generator/`: `index.ts` (`ToolModule`, lazy, Stichworte Diashow, Slideshow,
  Montage, Ken Burns, Fotos), `VideoGenerator.tsx`, Storyboard, Auswahl-Panel, `store.ts`,
  `order.ts` (+ Test: verschieben, sortieren, mischen mit Startwert), `presets.ts` (Übergänge mit
  deutschen Namen, Größen-Vorlagen). Eintrag in `tools/registry.ts`, Aktivität in
  `launcher/useToolActivity.ts`.
- **Speichern** (drei Orte): Projekt im zustand-Store mit `debouncedStorage()`, `version`,
  `migrate`, `syncAcrossWindows` – Element-ids per `crypto.randomUUID()`, **keine**
  Vorschaubilder oder Metadaten im Store. `settings.json`: nur `videoGen.outputDir` (Vorgabe in
  `DEFAULT_SETTINGS`). Bedien-Kleinigkeiten (Ansicht) per `usePersistentState`.
- **Bausteine:** Ziehen/Ablegen wie in der Player-Playlist (`text/x-reorder`, `onDragLeave` nur
  bei `currentTarget === target`); Datei-Ablage per `api.pathForFile`; Metadaten-Cache wie
  `useInputMeta` im Konverter (kopieren oder nach `lib/` ziehen – nicht importieren, das Modul
  startet beim Laden `syncAcrossWindows`). Tiefenanalyse nur für Videos.
- **Fehlende UI-Bausteine:** `NumberField` kann nur ganze Zahlen – für „2,5 s“ ein
  `DurationField`/`DecimalField` mit Komma auf Basis von `useDraft` anlegen. `Checkbox` (privat
  im Konverter) und `Segmented` (doppelt: Launcher, OSC) nach `components/ui` ziehen.
- **Zielgröße:** „Aus LED-Wall-Konfigurator“ wie im Mapping-Testbild (`MappingSettings.tsx`:
  `led-wall/store` + `computeWall` dynamisch laden); „Wie Player-Wand“ über
  `useSettings((s) => s.player.wallWidth)` usw.
- **Übergaben:** Konverter/Medien-Info → Generator (`givePaths`); Ergebnis → Player
  (`api.player.import({ sources: [ausgabe], fitMode, wall })` – erfüllt nebenbei teilweise
  „Fertiger Auftrag → Player-Bibliothek“ aus der ROADMAP) und → Medien-Info.

## Sonderfälle

- **Hoch und quer gemischt:** Einpassen je Element; Ken Burns „automatisch“ schwenkt
  Hochkantbilder senkrecht.
- **Handyvideos:** VFR → CFR, Drehung, iPhone-HDR (HLG) → SDR – vorhandene Logik aus
  `planConversion`.
- **Ton:** Videos ohne Ton und Bilder bekommen Stille; Mono, 5.1 und 44,1 kHz werden Stereo 48 kHz.
- **Sehr kurze Elemente:** Übergang kürzen (höchstens halbe Länge des kürzeren Nachbarn), Hinweis.
- **Sehr große Fotos** (50 MP): vor der Bewegung auf Ausgabe × Endzoom verkleinern (Speicher).
- **PNG mit Transparenz:** auf die Hintergrundfarbe.
- **GIF:** als Schleife über die Standzeit (`-ignore_loop 0` bzw. `-stream_loop -1` + `-t`); ein
  GIF mit nur einem Bild gilt als Standbild (wie im Player-Import).
- **Fehlende Dateien nach Neustart:** Element rot markiert, Erzeugen gesperrt.
- **100+ Elemente:** Listenansicht, Vorschaubilder lazy, Analyse begrenzt parallel (die Analyse
  läuft ohnehin mit höchstens 4 ffprobe gleichzeitig).
- **Platz:** Bedarf vorab schätzen und freien Speicher prüfen; Cache-Grenze, älteste Stücke
  zuerst aufräumen.
- **Abbrechen** jederzeit; fertige Stücke bleiben im Cache für den nächsten Lauf.

## Phase 0: EXIF-Drehung von Fotos (betrifft heute den Player) – ✅ erledigt

ffmpeg dreht ein Foto mit EXIF-Orientierung beim Dekodieren automatisch. ffprobe meldet die
Drehung aber nur in den **Frame**-Seitendaten, nicht im Stream. `deriveRotation`
(`main/services/ffmpeg/mediaInfoParse.ts`) liest nur die Stream-Seitendaten (`Display Matrix`).

Gemessen (Testbild 800×400, EXIF-Orientierung 6):

```
ffprobe -select_streams v:0 -show_entries stream=width,height:stream_side_data=rotation foto.jpg
  → width=800, height=400, keine Drehung
ffprobe -select_streams v:0 -read_intervals "%+#1" -show_frames -show_entries frame=width,height:frame_side_data=side_data_type,rotation foto.jpg
  → side_data_type=3x3 displaymatrix, rotation=-90
ffmpeg -i foto.jpg -frames:v 1 dekodiert.png  → 400×800
```

Folge: Medien-Info, Player-Import (und später der Generator) halten Hochkant-Handyfotos für
Querformat und passen sie falsch ein – bei passendem Seitenverhältnis wählt der Plan sogar
„Strecken“ und verzerrt das Bild. **Abhilfe:** bei Standbildern die Seitendaten des ersten Frames
mit auswerten (Typname `3x3 displaymatrix` neben `Display Matrix`), Tests mit der Fabrik
`tools/media-info/testFactory.ts`. Klein, lohnt sich vorab.

**Umgesetzt:** `deriveRotation`/`parseFirstFrame` in `mediaInfoParse.ts` werten die Display-Matrix
jetzt unter beiden Typnamen aus; `deepAnalyze` (`mediaInfo.ts`) liest bei Standbildern ohne „echtes"
Video ebenfalls das erste Frame (statt wie bisher nur bei Videos), `applyDeepAnalysis` trägt
Rotation, Spiegelung und Anzeigegröße des Standbilds nach. Läuft über die bestehende
Tiefenanalyse – Medien-Info (Vorgabe an), Player-Import und Video-Konverter (beide fest an) nutzen
sie automatisch. `convertPlan.ts` rechnete `rotation`/`sar` schon vorher korrekt ein, nur die
Analyse lieferte bei Fotos bislang `rotation: 0`. Tests: `mediaInfoParse.test.ts` (reale
ffprobe-Ausgabe eines EXIF-gedrehten Testfotos als Fixture).

## Phasen

| Phase | Inhalt | Umfang |
|---|---|---|
| 0 | ✅ EXIF-Drehung in der Analyse (Player profitiert sofort) | klein |
| 1 | Kern-Umbauten, `videoGenPlan`, Rechenlauf mit Cache, Werkzeug mit Storyboard, Vorgaben, Ausgabe, Videoausschnitt (Start/Ende), nahtlose Schleife, Musik einfach (eine Datei), Übergaben | groß |
| 2 | Live-Vorschau und „Vorschau rechnen“, Ken-Burns-Rahmen, Videoausschnitt grafisch, Musik-Ausbau | mittel |
| 3 | Titel, Logo, LUT, Vorlagen | nach Bedarf |

## Tests & Doku

- **Unit-Tests** (vitest) für `videoGenPlan`: Zeitachse in Bildern und Samples (auch 29,97),
  Kürzungen, Ken-Burns-Bahnen, Bildliste, Ton-Graph, Cache-Schlüssel, Schleife (zyklische
  Übergänge, Gesamtdauer, `inpoint` von Element 0); `order.ts`; Prüfung der IPC-Eingaben.
- **E2E-Harness vorhanden:** `e2e/harness.mjs` (`launchApp`, `openRoute`, `stubConfirm`,
  `runSteps`) und `e2e/smoke.mjs`, gestartet mit `npm run e2e`, siehe
  [ENTWICKLUNG.md](ENTWICKLUNG.md#tests--ci). Die früheren E2E-Läufe der Cloud-Sitzungen waren
  Wegwerf-Skripte im Scratchpad und gingen bei Container-Resets verloren – für den Generator
  ein eigenes Skript `e2e/video-generator.mjs` ins Repo legen.
- **E2E in der App** (mit diesem Harness): Testmedien per
  lavfi erzeugen (Fotos quer/hoch, Clips mit/ohne Ton, verschiedene Bildraten), Projekt rechnen
  und prüfen: Bildzahl, Samplezahl, Bild an jeder Stückgrenze gegen die Nachbarn (wie in den
  Messungen), Schleife (Dateiende → Dateianfang ohne Sprung, Länge = Summe − alle Übergänge),
  Videoausschnitt (Start/Ende bildgenau), Abbrechen, Cache-Treffer beim zweiten Lauf, Übergabe an
  den Player.
- **Doku bei Umsetzung:** `WERKZEUGE.md` (neuer Abschnitt unter „Medien & Bibliothek“, Übergaben,
  Kundenansicht), README-Überblick, `ROADMAP.md` (Eintrag streichen, Verzahnung anpassen),
  `SICHERHEIT.md` (`media://vgen`), `ENTWICKLUNG.md` (Kern-Liste). Nebenbei: `WERKZEUGE.md` und
  `ENTWICKLUNG.md` sagen, der Testbild-Export nutze den gemeinsamen Kern – er nutzt aber nur
  `runFfmpeg` und `setparamsFor`/`tagsFor`, nicht `planConversion`/`buildConvertArgs`.

## Festlegungen

Die ursprünglich offenen Fragen sind am 7. Oktober 2026 entschieden:

1. **Name:** „Video-Generator“ (id `video-generator`). „Diashow & Montage“ bleibt nur der Untertitel
   dieses Plans.
2. **Hauptzweck:** Foto-Diashow (Gala, Hochzeit) und Sponsor-Loop für die LED-Wand. Bei Videos
   genügt ein Ausschnitt mit Start und Ende; ein Schnitt-Editor und der Clip-Zusammenschnitt als
   Schwerpunkt entfallen (siehe „Nicht geplant“). Folgen: Die **nahtlose Schleife kommt schon in
   Phase 1** (vorher Phase 2); die Vorgaben (5 s, Überblenden 1 s, Ken Burns automatisch/mittel)
   bleiben auf Diashows zugeschnitten, die Schleife ist ein Schalter (Vorgabe aus).
3. **Musik:** in Phase 1 eine Datei mit Ein-/Ausblenden und Pegel; mehrere Titel, Absenken unter
   den Originalton und „Bilddauer an Musiklänge anpassen“ bleiben Phase 2.
4. **Titel/Logo:** später, nach Bedarf (Phase 3).
5. **Phase 0** (EXIF-Drehung): vorab umgesetzt, siehe oben.
