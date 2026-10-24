# Werkzeuge

Alle 23 Werkzeuge im Detail, gegliedert wie auf dem Startbildschirm. Die Handy-Fernsteuerung hat
eine eigene Seite: [FERNSTEUERUNG.md](FERNSTEUERUNG.md).

- [Startbildschirm & Bedienung](#startbildschirm--bedienung)
- [Wiedergabe & Show](#wiedergabe--show) – Video-Player, Jingle-Player, Stage-Timer & Uhr,
  Testbildgenerator
- [Steuerung](#steuerung) – OSC-Steuerung, NovaStar-Steuerung, Netzwerk-Scanner,
  DMX-Dip-Schalter
- [Bild & Projektion](#bild--projektion) – LED-Wall-Konfigurator, Projektionsverhältnis,
  Kameraobjektiv, Beamer-Lumen
- [Medien & Bibliothek](#medien--bibliothek) – Video-Konverter, Video-Generator, Medien-Info,
  Manuals-Bibliothek, YouTube-Downloader
- [Strom, Rigging & Aufbau](#strom-rigging--aufbau) – Packliste, Mini-Manual, Stromlast &
  Absicherung, Rigging-Last
- [Rechner](#rechner) – Kreisrechner, Audio-Delay & SPL, RTA (Echtzeit-Analysator), Timecode-Rechner
- [Übergaben zwischen Werkzeugen](#übergaben-zwischen-werkzeugen)
- [Wo die Daten liegen](#wo-die-daten-liegen)

## Startbildschirm & Bedienung

Jedes Werkzeug ist gleich aufgebaut:

- **Kopfleiste:** links das Menü **„Mottulbox ▾“** mit allem, was die ganze App betrifft (Design,
  Akzentfarbe, Anzeige, Projektordner, ffmpeg, yt-dlp), dann „Start“, das Werkzeug und sein Knopf
  **„Einstellungen“**; rechts nur Aktionen des Werkzeugs: „Eigenes Fenster“, „Kundenansicht“.
- **Ausgabe-Leiste** direkt darunter, in jedem Werkzeug am selben Platz: Monitor, Vollbild, NDI,
  Handy und rechts, was gerade läuft. Solange etwas live ist, ist sie **rot umrandet** und trägt
  „Live“ – Rot ist dafür reserviert (es gibt auch keine rote Akzentfarbe). Werkzeuge ohne
  Live-Ausgabe zeigen dort ihren Auftrag (Video-Konverter: Ziel, Ordner, „Konvertieren“;
  Video-Generator: „Video erzeugen“; Handbücher: Import) – **bernsteinfarben** mit „Läuft“,
  solange er läuft.
- **Schublade links** mit den Einstellungen: Bereiche mit Symbol, Titel und einer Zusammenfassung
  der Werte, einzeln auf- und zuklappbar; längere Erklärungen hinter dem **ⓘ**. Mit der **Nadel**
  angeheftet schiebt sie die Arbeitsfläche zur Seite (zum Einrichten), gelöst schwebt sie darüber
  und ist in der Show schnell wieder zu. Offen/angeheftet merkt sich jedes Werkzeug.

- **Suche** über Name, Beschreibung und Stichworte; mehrere Begriffe grenzen weiter ein.
- **Ansicht „Alle“ oder „Favoriten“.** Der Stern an einer Kachel macht ein Werkzeug zum Favoriten.
- **Favoriten-Kategorien:** selbst benannt, frei angeordnet und mit eigener Breite (ganze Zeile,
  ¾, ⅔, ½, ⅓, ¼) – so stehen eine bis vier Kategorien nebeneinander. Kacheln und Kategorien
  lassen sich ziehen oder mit den Pfeil-Knöpfen (auch per Tastatur) verschieben, eine Kategorie
  alphabetisch sortieren. Eine Kachel aus „Alle“ in eine Kategorie zu ziehen macht sie zum
  Favoriten. Beim Löschen einer Kategorie wandern ihre Werkzeuge in die Nachbar-Kategorie.
- **Kachelgröße** klein, mittel oder groß.
- **Was gerade läuft**, zeigt die Kachel mit pulsierendem Punkt: laufende Konvertierungen,
  Downloads, Timer, offene Ausgaben von Player und Stage-Timer (Fenster oder NDI) – und ob die
  Handy-Fernsteuerung des Werkzeugs aktiv ist. Alle Kacheln einer Größe sind gleich hoch, auch
  bei kurzer Beschreibung. Der Handy-Knopf oben
  zeigt den QR-Code der [Fernsteuer-App](FERNSTEUERUNG.md).
- **Eigene Fenster:** Jedes große Werkzeug lässt sich zusätzlich in einem eigenen Fenster öffnen
  („In neuem Fenster öffnen“ an der Kachel, „Eigenes Fenster“ in der Kopfleiste) – etwa Video-Player
  und Jingles gleichzeitig. Ist ein Werkzeug in mehreren Fenstern offen, zeigen alle denselben
  Stand; Änderungen kommen nach spätestens einer halben Sekunde in den anderen Fenstern an.
- **Kleine Werkzeuge** (Kreisrechner, DMX-Dip-Schalter, Projektionsverhältnis, Audio-Delay,
  RTA, Beamer-Lumen, Timecode-Rechner, Stromlast, Kameraobjektiv, Rigging-Last; an der Kachel ein
  kleines Fenster-Zeichen) öffnen sich **immer in einem eigenen, passend kleinen Fenster**, nie im
  Hauptfenster – das bleibt für die großen Werkzeuge frei. Je Werkzeug gibt es höchstens ein
  Fenster; ein zweiter Klick holt es nach vorn. **Die Höhe folgt dem Inhalt** (auch im
  Kompaktmodus und nach dem Breiterziehen), höchstens bis zur Bildschirmhöhe. Die Breite lässt
  sich bis 320 px verringern – dann stehen die Beschriftungen über den Feldern. Rechner mit zwei
  Bereichen legen sie nebeneinander, sobald das Fenster breit genug ist (etwa 770 px);
  Stromlast, Kameraobjektiv und Rigging-Last öffnen gleich so breit. Breite und Lage merkt sich
  die App (liegt die gemerkte Lage auf einem abgesteckten Bildschirm, erscheint es mittig). Die
  Kopfleiste zeigt nur den Namen; wer das Hauptfenster schließt, schließt die kleinen Fenster
  mit. Formeln, Hintergründe und Beispiele stehen hinter dem **ⓘ** am Bereich oder Feld;
  Zahlen schreiben und zeigen die Rechner mit Komma.
- **Kundenansicht:** „Kundenansicht“ in der Kopfleiste eines Werkzeugs sperrt es
  sofort und öffnet es auch bei jedem weiteren App-Start direkt – ohne „Zurück“ und ohne heikle
  Einstellungen (der Video-Player verbirgt z. B. Wand/Auflösung, Encoder, Lautheit und Idle-Bild,
  Medien-Info und Video-Konverter die Sprünge in andere Werkzeuge, der Video-Konverter auch die
  Encoder-Wahl). **Strg+Shift+K** verlässt die Kundenansicht und hebt den Autostart auf.
- **Darstellung** (Menü „Mottulbox“ bzw. „App-Einstellungen“ am Startbildschirm): Design Dunkel
  (Standard), Hell oder wie das System; 13 Akzentfarben (Gold, Bernstein, Türkis, Blau, Violett,
  Pink, Grün, Limette, Cyan, Indigo, Orchidee, Rosé, Silber); eine kompakte Anzeige setzt die
  ganze Oberfläche etwas kleiner. Ergebnisse in den Rechnern stehen in der Akzentfarbe.
- **Beenden mit Rückfrage:** Läuft beim Beenden noch etwas, fragt die App „Wirklich beenden?“
  und nennt es – Ausgaben von Video-Player, Stage-Timer und Testbild (auch NDI), laufende oder
  wartende Aufträge, die Vorschau des Video-Generators, verbundene Geräte der Fernsteuerungen
  (auch die Bühnen-Anzeige des Timers), Testton und spielende Jingles. Gefragt wird beim
  Schließen des letzten Fensters (das Hauptfenster nimmt Ausgaben und kleine Werkzeuge mit) und
  bei Cmd+Q; beim Herunterfahren oder Abmelden des Rechners nie. „Abbrechen“ lässt alles laufen.
- **Robust in der Show:** Ein abstürzendes Werkzeug bleibt in seinem Bereich (Fehlergrenze), die
  App läuft weiter. Stille Fehler werden als Hinweis sichtbar (z. B. defekte Jingle-Datei,
  verlorenes Audiogerät). `settings.json` wird atomar gespeichert; eine beschädigte
  `settings.json` oder `library.db` wird gesichert und neu angelegt statt still zurückgesetzt.
- **Datei-Dialoge** starten im zuletzt benutzten Ordner – getrennt für Dateien öffnen, Ordner
  wählen und Speichern, auch nach einem Neustart. Ein Speichern-Vorschlag behält dabei seinen
  Dateinamen. Ist der Ordner nicht mehr da (Stick abgezogen), startet der Dialog wie ohne Vorgabe
  (Downloads-Ordner).

## Wiedergabe & Show

### Video-Player

Playlist-Player für LED-Wände und Beamer.

- **Auf die Wand eingebacken:** Medien werden beim Import auf die Wand-Auflösung gerechnet –
  Blur-Fill, schwarze Ränder oder Strecken – und als H.264/MP4 abgelegt, das Chromium
  hardwarebeschleunigt abspielt. GPU-Encoder (NVENC, QSV, AMF, VideoToolbox) werden erkannt und
  vor Gebrauch geprüft, sonst übernimmt libx264; scheitert die GPU mitten im Import (Treiber,
  Sitzungslimit), wird er einmal auf der CPU wiederholt. Blur-Medien, die bis Oktober 2026 mit
  Intel Quick Sync gerechnet wurden, haben rechts einen grünen Rand – „Vorhandene neu einbacken“
  (unter Blur-Stärke) rechnet sie neu. Ebenso hatten Videos, deren Bild mit Quick Sync gerechnet
  wurde, bis Oktober 2026 nur 40–80 kbit/s Ton (auch im Video-Konverter und Video-Generator);
  solche Medien gelten jetzt als veraltet und werden beim Neu-Einbacken mit 192 kbit/s gerechnet.
- **Über den gemeinsamen Konvertierungs-Kern** (siehe [Video-Konverter](#video-konverter)):
  Deinterlace, HDR → SDR, konstante Bildrate, Drehung von Handyfotos und -videos (auch EXIF) und
  anamorphe Pixel werden richtig eingerechnet; passendes H.264 wird nur umverpackt. Bilder werden mit frei wählbarer
  Standzeit gebacken, GIFs zu Loop-Videos. Importe haben eine eigene Spur in der Warteschlange und
  warten nie auf einen Konverter-Stapel. **Gleichzeitige Importe** einstellbar (1–4, Standard 2):
  mehr lohnt bei vielen kurzen Clips, Bildern oder mit GPU-Encoder; während der Show lieber 1,
  damit die Wiedergabe genug Luft hat. Dieselbe Datei wird nie doppelt gleichzeitig gerechnet –
  zweimal hineingezogen, landet sie einmal in der Bibliothek.
- **Unverändert** (vierte Einpass-Art neben Blur, Ränder, Strecken): keine Umrechnung – die Datei
  wird 1:1 in die Bibliothek kopiert (spielt weiter, wenn der Stick weg ist) und beim Abspielen mit
  Rändern eingepasst. Nur, was der Player direkt kann: H.264 (8 bit, 4:2:0) und unter Windows/macOS
  H.265 in MP4/MOV, VP9/AV1, WebM mit VP8/VP9/AV1, Ton AAC/MP3/Opus/FLAC sowie Bilder und GIFs.
  ProRes, HAP, MPEG-2, DNxHD, AVI, MKV, PCM- oder AC-3-Ton werden beim Import mit Hinweis
  abgelehnt. Kein Deinterlace, keine HDR-Anpassung, keine Lautheit; eine andere Wandgröße backt
  diese Medien nicht neu ein – nur „Neu einbacken“ mit einer anderen Einpass-Art rechnet sie um.
- **Lautheit angleichen** (optional, EBU R128): Ziel −23, −16 oder −14 LUFS, gemessen und
  angewandt wie im [Video-Konverter](#video-konverter). Gilt für neue Importe; „Vorhandene neu
  einbacken“ bringt die Bibliothek auf die aktuelle Einstellung (bereits passende Medien werden
  übersprungen, zwei Fassungen desselben Clips laufen zu einer zusammen).
- **Ausgabe-Leiste:** Ausgabe-Monitor, Vollbild starten/beenden („Monitor wechseln“ legt die
  laufende Ausgabe um), NDI und Handy-Fernsteuerung ein/aus, rechts der laufende Titel. Die
  Wand-Auflösung (Eingabe, Vorgabe, „Vom Monitor“ oder „Aus LED-Wall“ – die im Konfigurator
  gewählte Wand) steht in der Schublade unter „Wand“.
- **Vollbild-Ausgabe** mit doppelt gepuffertem Player: nahtlose Übergänge, wahlweise Schnitt oder
  echtes Überblenden (das alte Video läuft weiter, Ton blendet mit). Shuffle ist lückenlos – das
  nächste Zufallsmedium wird vorab geladen.
- **Bedienung:** Play/Pause, Skip, Seek, Loop, Shuffle, Stumm; Playlist per Drag & Drop,
  gespeicherte Playlists als Tabs (Löschen nur nach Rückfrage; die Medien bleiben in der
  Bibliothek).
- **Bibliothek** mit Thumbnails, Import per Drag & Drop, Listen- und Kachelansicht;
  Neu-Konvertierung aller Medien bei Auflösungswechsel.
- **In-App-Vorschau**, die auch ohne Ausgabefenster abspielt – praktisch ohne zweiten Bildschirm.
- **Idle-Bild:** Testbild als Ausweichbild auf der Ausgabe.
- **NDI-Ausgabe** (optional, mit Ton): [NDI.md](NDI.md).
- **Handy-Fernsteuerung** inklusive Upload von Dateien, Fotos und Videos direkt von der Kamera:
  [FERNSTEUERUNG.md](FERNSTEUERUNG.md).

Hervorgegangen aus dem „LED Wall Player V4“ (Python/mpv).

### Jingle-Player

Kurze Audios (Auftrittsmusik, Stinger) auf belegbaren Pads.

- **Edit- und Live-Modus:** Live spielt ein Klick oder Hotkey (1–9, q …) ab; im Edit-Modus wählt
  der Klick ein Pad, seine Einstellungen erscheinen in der Schublade. Audio-Ausgabe, Handy und
  „Stopp (Esc)“ stehen in der Ausgabe-Leiste.
- **Je Pad:** Farbe, Lautstärke, Loop, Modus (One-Shot oder Toggle), Fade-Out und ein Start-/
  Stopp-Ausschnitt.
- **Waveform-Editor:** zoombar, Marker millisekundengenau ziehbar, Vorschau mit Abspielkopf,
  „Stille trimmen“ schneidet Pausen am Anfang und Ende weg.
- **Audio-Ausgabegerät wählbar** (Interface oder Pult statt Laptop-Lautsprecher), Solo-Modus,
  großer Stopp mit Fade für alle (Esc), mehrere Sets/Bänke.
- Die Dateien werden in die App-Ablage kopiert; die Belegung bleibt über Neustarts erhalten.
- **Handy-Fernsteuerung:** Pad-Raster der aktuellen Bank mit Live-Status.

### Stage-Timer & Uhr

- **Sprechzeit-Timer** mit mehreren Abschnitten, die nacheinander laufen.
- **Farbwarnung** nach Restzeit (weiß → gelb → rot, Schwellen einstellbar).
- **Am Ende:** stehen bleiben, überziehen oder automatisch zum nächsten Abschnitt. Beim
  Überziehen blinkt das Bild rot – abschaltbar (dann nur rote Ziffern), gilt für Ausgabefenster,
  NDI, Browser-Anzeige und Handy.
- **Live:** ±1 Minute, Nachrichten an die Bühne (auf Wunsch blinkend, mit Schnellnachrichten).
- **Vollbild-Anzeige** auf wählbarem Monitor, synchron zur Vorschau – der Timer läuft im
  Hauptprozess. Alternativ eine große Uhr mit Sekunden.
- **Anzeige im Browser** für Geräte ohne NDI: Fernseher, Tablet oder zweiter Rechner im selben
  Netz öffnen `http://<Rechner>:8092/anzeige` (QR-Code im Werkzeug, Link in der Fernsteuer-App).
  Reine Anzeige wie das Ausgabefenster – Restzeit in Warnfarbe, Redner/Titel, Balken,
  Nachrichten, Uhr-Modus. Antippen schaltet auf Vollbild; die Uhrzeit kommt vom Rechner,
  reißt die Verbindung ab, steht das groß da (verbindet sich von selbst neu). Läuft auch in
  älteren Smart-TV-Browsern. Details: [FERNSTEUERUNG.md](FERNSTEUERUNG.md).
- **NDI-Ausgabe** (optional): [NDI.md](NDI.md). **Handy-Fernsteuerung**, die auch bei
  geschlossenem Werkzeug funktioniert.
- **Am Startbildschirm** zeigt die Kachel, ob der Timer läuft und ob eine Ausgabe (Fenster oder
  NDI) aktiv ist.
- **Ablauf bleibt erhalten:** Abschnitte, Schwellen, Ende-Verhalten und Anzeige merkt sich die App
  über Neustarts – auch wenn der Timer nur vom Handy aus bedient wurde.

### Testbildgenerator

- **Muster:** Gitter/Module (2-px-Linien genau auf der Modulgrenze: letztes Pixel des einen,
  erstes des nächsten Moduls – bei Pixelfehlern ist klar, welches Modul betroffen ist), Geometrie, Farbbalken, Graustufen, Siemensstern, Konvergenz.
- **Mapping-Testbild** zum Einrichten von Beamern, Mappings und LED-Wänden. Jedes Element hat
  einen Messzweck und lässt sich einzeln ausblenden:
  - Raster ab Pixel 0,0 mit Zellnamen (A1, B2 …), um Warp-Punkte anzusagen; Linien 2 px breit
    genau auf der Zell- bzw. Cabinet-Grenze: automatisch
    (kürzere Kante ÷ 9, bei 1080p 120 px), mit eigener Zellgröße oder per „Aus
    LED-Wall-Konfigurator“ im Cabinet-Raster samt Wandauflösung. Wahlweise in Akzentfarbe,
    damit beim Überblenden jeder Beamer sein eigenes Raster zeigt.
  - In Akzentfarbe: 1-px-Rahmen auf dem äußersten Pixel (Beschnitt), Ecken 1–4 mit
    Pixelkoordinate, Mittelachsen genau durch die Bildmitte mit kräftigen Mittenmarken an den
    Kanten, ein kräftiger Kreis (Seitenverhältnis) und ein OBEN-Pfeil für gedrehte oder
    gespiegelte Ausgänge.
  - Schwarze Mittelscheibe mit Logo, Titel, Bezeichnung und Kennung; ihr Ring in Akzentfarbe
    füllt sich Sekunde für Sekunde und wird in der nächsten Minute ebenso wieder ausgegraut (kein
    Sprung zum Minutenwechsel) – steht er, hängt die Ausgabe, auch aus der Entfernung zu sehen.
    Sekundenring und Uhrzeit lassen sich einzeln ausblenden (dann voller Ring).
  - Lineal mit Teilstrichen alle 10/50/100 px, Diagonalen.
  - Vier Messfelder, im Raster eingepasst: Farbe 100/75 %, Grau 0–100 % mit Schwarz- und
    Weißgrenze, Schärfe (Linienpaare 1–4 px), Verläufe. Bei 4:3, großen Cabinets oder fast
    quadratischen Formaten frei in den Ecken; bei zu wenig Platz entfallen sie.
  - Kennung: Bezeichnung (z. B. „Beamer links“), Auflösung, Seitenverhältnis und laufende
    Uhrzeit (ausblendbar); ohne Mittelscheibe auf Schildern über und unter der Mitte.
  - Akzent- und Hintergrundfarbe frei wählbar oder per Schnellwahl. Raster, Lineal und Schrift
    passen sich dem Hintergrund an (hell auf dunkel, dunkel auf hell).
- **Bewegte Muster:** Pixelcheck-Loop, Scroll, Timecode, AV-Sync (siehe Testton).
- **Vollbild-Ausgabe** auf wählbarem Monitor, pixelgenau und live.
- **Testton** – „Ton“ in der Ausgabe-Leiste, eingestellt im Bereich „Testton“ der Schublade,
  gespielt auf dem gewählten Ausgabegerät:
  - Sinus mit freier Frequenz (Schnellwahl 100 Hz, 1 kHz, 10 kHz), Sweep 20 Hz – 20 kHz
    (logarithmisch, Dauer einstellbar), rosa und weißes Rauschen, Metronom (Tempo, Schläge je
    Takt, betonte Eins), Polaritätspuls für Polaritätsprüfer.
  - Kanal-Kennung: 1 kHz auf beiden Kanälen, links setzt er einmal aus, rechts zweimal je 4 s
    (angelehnt an GLITS der BBC) – vertauschte Kanäle hört man sofort. Alle übrigen Signale
    wahlweise auf beiden Kanälen, nur links, nur rechts oder sekündlich abwechselnd.
  - Pegel als Spitzenpegel in dBFS, Vorgabe −18 dBFS; gedeckelt bei −6 dBFS und beim Start
    über 0,5 s eingeblendet, ein Signalwechsel wird übergeblendet – schont Ohren und Hochtöner.
    Rauschen hat seine Spitzen begrenzt: der Effektivwert liegt 12 dB unter dem Pegel.
  - **AV-Sync:** Das Testbild „AV-Sync“ blitzt zu jeder vollen Sekunde weiß, im selben Moment
    piept der Ton. Ein Messgerät oder ein Zeitlupen-Video vor der Wand zeigt die Verzögerung des
    Bildwegs (LED-Prozessor, Beamer). Die Ausgabelatenz des Rechners ist im Ton schon
    herausgerechnet; mit „Versatz Ton“ an einem direkt angeschlossenen Monitor auf 0 eichen.
    Wählt man eines von beiden, zieht das andere mit; exportieren lässt es sich nicht (nur live).
  - Der Ton endet beim Verlassen des Werkzeugs.
- **Export** als PNG oder Video: H.264 mit festgelegter Rec.-709-Farbmatrix (farbtreu auf
  HD-Playern) oder HAP Q.
- **Presets** für wiederkehrende Einstellungen.

## Steuerung

### OSC-Steuerung

Frei belegbares Steuerpult, das OSC an MadMapper & Co. sendet.

- **Kacheln:** Fader (horizontal/vertikal), Poti (absolut oder Endlos-Encoder), Taster, Schalter,
  Auswahl (1 aus n), Bank (Taster, Schalter oder Poti; Spalten einstellbar), XY-Pad, Farbe
  (H/R/G/B/A, Hex, Pipette), Label und Anzeige. Die Anzeige zeigt eingehende OSC-Zahlen oder -Texte
  oder die Restzeit des Video-Players.
- **NovaStar-Kacheln:** Helligkeit (Fader und Knöpfe), Fade to Black, Freeze, Blackout und
  Preset-Auswahl – über dieselbe Verbindung wie die NovaStar-Steuerung.
- **Anordnen:** feines Raster im Edit-Modus, Kacheln frei verschiebbar (sie überlappen nicht und
  rücken beim Loslassen auf die nächste freie Stelle), per Eckgriff skalierbar mit Mindestgröße je
  Typ. Jede Kachel hat ihre OSC-Adresse; gleiche Typen werden beim Hinzufügen durchnummeriert.
- **Geräte-Vorschau** (Handy/Tablet, drehbar) zeigt die Fläche im Geräterahmen.
- **Projekte und Sets:** Ein Projekt bündelt mehrere Sets (je eine Bedienfläche, als Tabs). Der
  Projekt-Titel ist das erste Adresssegment neuer Kacheln (z. B. `/mottl/fader`); ein Projekt
  lässt sich als Vorlage für neue speichern („Default“). Edit-/Live-Umschalter und „Widget“ in der
  Set-Zeile, Ziel (Host:Port), Handy und OSC-Monitor in der Ausgabe-Leiste, Einstellungen in der
  Schublade.
- **Bedienung:** Fader, XY-Pad und Farbregler ziehen relativ (kein Sprung zum Klickpunkt).
- **Senden** per UDP aus dem Hauptprozess mit eigenem OSC-Codec; Host und Ports einstellbar
  (Vorgabe wie MadMapper 6: senden an 8010, empfangen auf 9000).
- **Feedback** (optional): eingehende Werte stellen passende Kacheln nach; dazu ein OSC-Monitor im
  eigenen Fenster und ein Learn-Modus (die nächste eingehende Adresse geht ins gewählte Widget).
- **Handy-Fernsteuerung** mit derselben Oberfläche; Sets lassen sich auch dort umschalten.

### NovaStar-Steuerung

Steuert NovaStar-LED-Prozessoren (NovaPro UHD Jr & Co.) über TCP 5200 – Vorabversion.

- **Leiste „Prozessor“:** Verbinden/Trennen, Blackout, Einfrieren und Fade to Black. Sie ist rot,
  solange eine Verbindung besteht – dann wirkt jeder Klick sofort auf der Wand. IP und Port stehen
  in der Schublade, ebenso Dauer und Ziel-Helligkeit des Ausblendens.
- Helligkeit, Fade-to-Black (weiche Rampe, als Umschalter mit Ziel-Helligkeit), Blackout und
  Freeze (ein gemeinsamer Anzeigemodus) sowie Preset-/Szenen-Abruf.
- Eigener, abhängigkeitsfreier Paket-Codec (Header 0x55AA + Prüfsumme); die Befehlsbytes sind
  gegen das Bitfocus-Companion-Modul abgeglichen, die Prüfsummen per Unit-Test gesichert.
- Roh-Befehl-Sender für andere Modelle.
- Auch als Widgets in der OSC-Steuerung nutzbar – und damit am Handy.

### Netzwerk-Scanner

Findet Geräte im lokalen Netz und zeigt IP, Hersteller (aus der MAC-Adresse) und vermuteten
Gerätetyp. Adapter, „Scannen“/„Stopp“ und der Fortschritt stehen in der Leiste „Scan“
(bernstein, solange er läuft); Einstellungen braucht der Scanner keine.

- **Erkennung:** TCP-Sweep über typische AV-Ports (NovaStar 5200, RTSP/ONVIF, PJLink,
  HTTP/SSH/RDP …), ATEM per UDP-Handshake, Bonjour/mDNS-Namen.
- Gerätetyp und Symbol lassen sich überschreiben (an der MAC gemerkt), eigene Bezeichnungen
  vergeben.
- Web-Oberfläche eines Geräts öffnen, seine IP an die NovaStar-Steuerung bzw. die
  NovaStar-Kacheln der OSC-Steuerung übergeben oder **Handbücher des Herstellers** in der
  Manuals-Bibliothek suchen (aus „Xi'an NovaStar Tech Co., Ltd.“ wird die Suche „NovaStar“).

### DMX-Dip-Schalter

DMX-Startadresse in Dip-Schalter umrechnen und zurück (binär, 9 Schalter, 1–512).

## Bild & Projektion

### LED-Wall-Konfigurator

Aufgebaut wie die anderen Werkzeuge: Die **Leiste „Projekt“** hat das Menü **„Datei“** für
[Projektdateien](#projektdateien-und-projektordner), die **Wand-Wahl**, exportiert die PDF-Doku
(Hoch oder Quer) und übergibt das Material an die [Packliste](#packliste); rechts stehen Projekt
und Kunde. Die **Schublade** hält alles, was die Wand festlegt, die **Arbeitsfläche** zeigt, was
daraus folgt – auf dem Laptop (ab etwa 1366 × 768) ohne Scrollen.

- **Mehrere Wände** in einer Planung (bis 20, z. B. ein Laptop bespielt zwei kleine Wände): Das
  Menü „Wand“ in der Leiste wählt eine Wand, legt eine neue an, dupliziert oder entfernt die
  gewählte. Jede Wand hat eigenen Namen, Modul, Maße, Aufbau, Curving und Verkabelung; Projekt
  und Kunde gelten für alle. PDF-Doku und Vorlagen gelten für die gewählte Wand, die Packliste
  und die Projektdatei für alle.
- **Schublade:** Vorlagen (eine Wand unter dem Projektnamen speichern; laden ersetzt die gewählte
  Wand, die übrigen Wände und die Verbindung zur Datei bleiben), Projekt und Kunde, Modul
  (Bestand: 496-2,0 / uS2+ / rX3ioBF), Wand (Name, Breite, Höhe – gerundet auf ganze Module –,
  Ground-Stack oder fliegend), beim uS2+ die Curving-Form, Prozessor und **Strom** (Netzspannung,
  Absicherung je Kreis).
- **Kennzahlen:** Auflösung mit Seitenverhältnis, Module (Spalten × Reihen), Größe (mit Fläche
  bzw. abgewickeltem Bogen), Gewicht, maximale Leistung (Strom bei der eingestellten
  Netzspannung, ab Werk 230 V), Ballast bzw. Last an der Traverse.
- **Zeichenfläche** mit Reitern, so groß wie das Fenster:
  - **Ansicht:** Vorderansicht mit Modulraster, 16:9-Nutzfläche und den schwarzen Rändern (in
    Pixeln), Maßketten in Metern und Pixeln; Ground-Stack auf seinen Standfüßen mit einer Person
    (1,80 m) zum Größenvergleich, fliegend an der Traverse.
  - **Draufsicht** (nur uS2+): die Curving-Form in voller Größe mit Radius, Modulen je Reihe,
    Bogen, belegter Grundfläche B × T, Gewicht je Reihe und Winkelverteilung.
  - **Signal** und **Strom:** zeichenbare Pläne mit farbcodierten Ketten – Modul anklicken weist
    es der gewählten Kette zu, Spalten- und Zeilenköpfe ganze Linien; die Ketten-Knöpfe zählen
    ihre Module, die Zellen wachsen mit dem Platz.
  - **Kabelverlauf** je Kette, nur von Hand: **Startecke** ihres Bereichs plus **waagrecht oder
    senkrecht** (Schlange wie in NovaLCT) – oder **Zeichnen** und mit gedrückter Maustaste über
    die Module ziehen (am letzten Modul ansetzen verlängert). Pfeile in Kettenfarbe zeigen den
    Weg, der Punkt den Start, gestrichelt eine lange Brücke zwischen nicht benachbarten Modulen.
    Ohne Startecke und Zeichnung hat eine Kette keinen Verlauf („S2 ohne Verlauf“); kommen nach
    dem Zeichnen Module dazu, stehen sie hinten an („nachzeichnen“).
  - **Prozessor und Ports:** Schublade „Prozessor“ – ab Werk der Prozessor des Bestands für das
    Modul (496-2,0 und rX3ioBF: NovaPro UHD Jr, uS2+: Tessera S8), wählbar VX4S oder ein
    eigener mit eigenen Werten; Farbtiefe und Bildrate; „Backup-Leitung für neue Ketten“. Bei
    mehreren Wänden desselben Moduls „Prozessor teilen mit“ – dann laufen die Ports fortlaufend
    und die Kapazität zählt gemeinsam. Je Signalkette in der Verlauf-Leiste **Port** (ab Werk
    fortlaufend) und **Backup** mit eigenem Port (beim Tessera als Portpaar 1 → 2, 3 → 4); im
    Plan steht dann ein „B“ am letzten Modul. Die Karte **Signal** neben dem Plan zeigt Ports,
    Grenze je Port (kleinerer Wert aus Prozessor und Empfangskarte, Werte aus den Handbüchern),
    Last je Kette und warnt – über der Grenze je Port, zu viele Ports, zu viele Pixel gesamt,
    zu breit oder hoch für den Prozessor, Backup nicht am Partner-Port, doppelter Port.
  - **Glasfaser-Strecke (CVT10):** in der Schublade „Prozessor“ (nur NovaPro UHD Jr) – Variante
    S (Singlemode, bis 10 km) oder M (Multimode, bis 300 m), Länge der Faser und die Redundanz
    der Strecke: keine, **Faser redundant** (zweite Faser von OPT3/OPT4 in dieselbe Box) oder
    **Hot-Backup** (zweite CVT10, die die Kettenenden vom selben Port speist – dann braucht keine
    Kette einen Backup-Port am Prozessor, ab Werk hat jede eine Backup-Leitung). Ports 1–8 gehen
    an eine Box (OPT1), 9–16 an eine zweite (OPT2). Unter der Länge steht, welche Stücke aus dem
    Lager dafür gehen (Singlemode LC-LC 1, 3, 20, 50, 100 m). Die Karte **Signal** nennt Boxen
    und Fasern, die Liste „B 3 (2. CVT10)“; warnt bei Multimode über 300 m. Bei geteiltem Prozessor gilt
    die Strecke der Wand, die ihn hat.
  - **Stromkreise und Phasen:** Je Stromkette in der Verlauf-Leiste **Kreis** (frei, z. B. „F3“)
    und **Phase** L1–L3. Ohne Phase verteilt die Rechnung die Kreise als Vorschlag auf die
    jeweils schwächste Phase (in Klammern, gespeichert wird er nicht); Ketten am selben Kreis
    zählen zusammen und liegen auf einer Phase. Die Karte **Strom** zeigt je Kette Module,
    Strom bei Maximalleistung, Kreis und Phase, darunter die Last je Phase, und warnt: Kette oder
    Kreis über der Absicherung (mit „höchstens n Module je Kreis“), ein Kreis auf zwei Phasen,
    Phasen deutlich ungleicher belastet als nötig; Kreise nah an der Absicherung bekommen den
    Hinweis, nacheinander einzuschalten (Einschaltstrom).
  - **Signal + Strom** nebeneinander (untereinander, wenn das Fenster dafür zu schmal ist) und
    **Vorne/Hinten**: Von hinten sind die Pläne gespiegelt und groß beschriftet, Spalten- und
    Kettennummern bleiben am Modul. Die PDF-Doku druckt die Pläne mit Pfeilen in der gewählten
    Blickrichtung, dazu Prozessor, Ports und Last je Signalkette (mit Glasfaser-Strecke) sowie
    Netz, Kreis, Phase und Strom je Stromkette.
- **Daneben:** Signal, Strom (typisch und maximal in W und A, Ketten, Phasen), Aufbau (LSU-Füße,
  Ballast je Fuß und gesamt bzw. Gewicht an der Traverse) und die Daten des Moduls (mit IMs je
  Modul). Ist die Arbeitsfläche schmal,
  stehen Zeichnung und Daten untereinander.
- **Curving-Planung** für uS2+: Vollkreise mit gleichem Winkel je Modul zur Auswahl, Kreissegment
  aus Sehne (Wandbreite) und Stichhöhe (auch als Start für den Builder), freier Segment-Builder
  und Squircle. Die Form bestimmt Modulzahl und Breite der Wand mit.
- **PDF-Projektdoku** inklusive Draufsicht, Winkeln und Verkabelungsplänen.

### Projektionsverhältnis, Kameraobjektiv, Beamer-Lumen

- **Projektionsverhältnis:** Throw Ratio, Bildmaße und Projektionsabstand – das passende
  Beamer-Objektiv wählen.
- **Kameraobjektiv:** aus Brennweite, Sensor, Telekonverter und Entfernung der Bildausschnitt –
  wie viel einer Person bei maximalem Zoom ins Bild passt, mit Visualisierung.
- **Beamer-Lumen:** Lumen-Bedarf aus Bildgröße und Umgebungslicht – und ob der vorhandene Beamer
  reicht.

## Medien & Bibliothek

### Video-Konverter

Clips passend fürs Zielsystem (früher „HAP-Konverter“).

- **Zielsysteme** wie im Prüfprofil der Medien-Info: Medienserver → HAP Q, USB-/LED-Player →
  H.264 (Level 4.2, Bitraten-Deckel), QLab/macOS → ProRes 422, Laptop/Allgemein → H.264.
- **Formate** frei wählbar: HAP, HAP Q, HAP Alpha, H.264, H.265, ProRes Proxy bis 4444, WAV.
- **Vorschau je Datei** („→ 1920 × 1080 · 50 fps · HAP Q“), parallele Läufe, HAP-Chunks und
  Kompressor einstellbar.
- **GPU für H.264 und H.265:** Encoder „Automatisch“ nutzt NVIDIA NVENC, Intel Quick Sync, AMD
  AMF bzw. Apple VideoToolbox – jeder GPU-Encoder wird vorher per Mini-Probelauf geprüft, ohne
  passende Hardware übernimmt die CPU (libx264/libx265). „Für Player-Boxen und TVs“ läuft nur über
  GPU-Encoder, die Level und Bitraten-Deckel im Probelauf eingehalten haben (VideoToolbox nicht →
  CPU). Scheitert die GPU mitten im Auftrag, wird er einmal auf der CPU wiederholt; die
  Auftragszeile zeigt den genutzten Encoder.
- **ProRes schnell oder normgerecht:** „Schnell“ nutzt auf dem Mac Apple VideoToolbox (Clips mit
  Transparenz über die CPU), sonst prores_aw – rund 3× so schnell wie prores_ks und meist sogar
  genauer, körniges Material liegt aber deutlich über der ProRes-Datenrate (gemessen bis 3×
  größere Dateien). „Normgerecht“ (prores_ks) hält Apples Datenraten ein. HAP gibt es nur als
  CPU-Encoder.
- Die Encoder-Wahl ist eine Rechner-Einstellung (`settings.json`), keine Vorgabe des
  Zielsystems: „Nur CPU“ bei H.264/H.265 und „Normgerecht“ bei ProRes sind dieselbe Stellung.
- **Lautheit angleichen** (EBU R128, −23/−16/−14 LUFS) für alle Formate mit Ton: erst messen,
  dann gleichmäßig verstärken – die Dynamik bleibt erhalten, nur wo Spitzen sonst über
  −1,5 dBTP gingen, wird begrenzt. Stille Spuren bleiben unverändert, gemessen wird nach dem
  Stereo-Downmix, Mono wie über zwei Lautsprecher. Die Auftragszeile zeigt das Ergebnis
  („Lautheit −32,3 → −23 LUFS, gleichmäßig“).
- **Sicher:** überschreibt nie (`…_2`), halbfertige Dateien werden entfernt – auch wenn man die
  App mitten im Auftrag beendet (sie bricht dann alle Konvertierungen, Generator-Läufe, Importe
  und Downloads ab, räumt auf und schließt höchstens 3 s später – vorher fragt sie, siehe
  „Beenden mit Rückfrage“); „Ergebnis prüfen“ öffnet die fertige Datei in der Medien-Info,
  „In Player-Bibliothek übernehmen“ gibt sie an den Video-Player.
- **ffmpeg aktuell** (Menü „Mottulbox“ → ffmpeg; gilt für die ganze App): zeigt, welcher Build
  läuft (mitgeliefert oder in der App aktualisiert). Unter Windows und Linux holt die App einmal am
  Tag den neuesten Build, der mindestens 7 Tage alt ist, prüft ihn (Prüfsumme, Encoder und
  Filter, Probe-Kodierung) und verwendet ihn **ab dem nächsten Start** – in einer laufenden Show
  wechselt ffmpeg nie. „Jetzt prüfen“ sucht sofort; „Mitgeliefertes verwenden“ geht beim nächsten
  Start zurück, und der abgelehnte Build kommt nicht wieder (erst ein neuerer). Abschaltbar; unter
  macOS kommt ffmpeg mit dem Installer.

**Der gemeinsame Konvertierungs-Kern** – genutzt von Video-Konverter und Player-Import; der
Video-Generator nutzt seine Analyse, Encoder, Lautheit und Warteschlange, der Testbild-Export nur
den ffmpeg-Runner und die Farbkennung – entscheidet je Datei:

- Drehung/Spiegelung und anamorphe Pixel fest einrechnen,
- Deinterlace (25i → 50p), variable → konstante Bildrate,
- **Show-Raster:** 29,97 ↔ 30 und 23,976 ↔ 24 per minimaler Tempo-Anpassung statt Bildsprung,
- HDR → SDR, Alpha automatisch (HAP Alpha/ProRes 4444) bzw. sauber auf Schwarz,
- Größe: Original, höchstens oder genau – mit Letterbox, Füllen, Blur oder Strecken; gerade bzw.
  durch 4 teilbare Maße,
- Farbmatrix und Range, Ton (48 kHz, AAC/PCM, Stereo, Lautheit in zwei Durchgängen),
- passendes H.264 nur umverpacken.

Die Warteschlange hat eine eigene Spur für den Player (gleichzeitige Importe einstellbar). Geprüft mit über 60 echten
Konvertierungen (Kontrolle per ffprobe).

### Video-Generator

Bilder und Videos zu **einem** Video – Foto-Diashow (Gala, Hochzeit) oder Sponsor-Loop für die
LED-Wand.

- **Elemente:** Fotos (JPG, PNG, WebP, BMP, TIFF), Videos und GIFs (als Schleife über die
  Standzeit) per Ziehen – auch an eine bestimmte Stelle –, Dialog oder Ordner. Fotos werden mit
  ihrer EXIF-Drehung gelesen. Fehlt eine Datei, ist das Element rot und „Video erzeugen“ gesperrt.
- **Storyboard** in Abspielreihenfolge mit Vorschaubildern, Übergang zwischen den Kacheln und
  Zeitlineal; bei vielen Fotos als Liste. Reihenfolge per Ziehen (auch mehrere zugleich), Pfeilen
  oder Alt+←/→; sortieren nach Name (natürlich: „2“ vor „10“), Aufnahmedatum oder Typ; „Mischen“
  würfelt die Liste einmal sichtbar um – gerendert wird genau, was man sieht.
- **Je Element** (auch für mehrere zugleich, leer = Vorgabe): Standzeit, bei Videos **Start und
  Ende** (ein Ausschnitt; soll ein Clip zweimal vorkommen, einfach zweimal hinzufügen), Originalton,
  Einpassen (Füllen, Ränder in Hintergrundfarbe, Blur-Rand), Ken Burns und der Übergang danach.
- **Übergänge:** Schnitt, Überblenden, über Schwarz/Weiß, Auflösen, Wischen, Schieben, Kreis,
  weiches Wischen, Zoom; zu lange werden auf die Hälfte des kürzeren Nachbarn gekürzt (Hinweis).
- **Ken Burns** (Fotos): automatisch (wechselnd, Hochkantfotos schwenken senkrecht), Zoom
  rein/raus oder Schwenk in vier Richtungen, sanft/mittel/stark – oder ein **eigener Rahmen**:
  Start- und Endausschnitt direkt auf dem Bild ziehen (Ecke zoomt, Pfeiltasten und +/− gehen auch;
  „Tauschen“ dreht die Fahrt um). Der Rahmen bleibt immer auf dem Bild, höchstens 4× vergrößert.
  Gerechnet über `perspective` mit Subpixel-Genauigkeit – auch langsame Schwenks ruckeln auf der
  LED-Wand nicht.
- **Nahtlose Schleife:** Das Ende blendet in den Anfang – vom letzten zum ersten Bild der Datei
  gibt es keinen Sprung; Musik blendet dann ebenfalls vom Ende in den Anfang.
- **Ausgabe:** Größe (HD, 4K, Hochkant, eigene, „Wie Player-Wand“, „Aus LED-Wall-Konfigurator“),
  Bildrate (auch 23,976/29,97/59,94), Format wie im Video-Konverter (H.264, H.265, ProRes, HAP,
  HAP Q) mit GPU-Encoder und CPU-Rückfall.
- **Ton:** Originalton der Videos (in Übergängen verblendet) und **Musik aus mehreren Titeln**:
  nacheinander mit Überblendung (einstellbar), reicht die Liste nicht, beginnt sie von vorn;
  Ein-/Ausblenden, Pegel und **Absenken unter Originalton** (−6 bis −30 dB, mit weichen Rampen von
  0,5 s, dicht aufeinanderfolgende Clips am Stück). Lautheit nach EBU R128 am fertigen Mix.
  **„Standzeit an Musik anpassen“** wählt die Standzeit der Bilder so, dass das Video genau so lang
  wird wie die Musik (Bilder mit eigener Standzeit und Videos bleiben, bei Schleife läuft die Musik
  genau einmal je Durchlauf).
- **Vorschau** (Karte unter dem Storyboard):
  - **Live** spielt das ganze Projekt in der App ab, ohne zu rechnen – Zeitachse, Ken-Burns-Fahrt,
    Einpassen und Musik (Titelfolge, Blenden, Absenken) wie in der Datei; die Übergänge sind in CSS
    nachgebaut (am gebündelten ffmpeg vermessen). Wählt man ein Element, springt der Abspielkopf
    dorthin. Videos laufen direkt aus der Quelle; was Chromium nicht abspielt (ProRes, HAP …),
    zeigt das Standbild.
  - **Ausschnitt eines Videos** an einem Bereichsregler unter der Vorschau: Start und Ende ziehen,
    die Bühne zeigt dabei das Bild an der Griffstelle (auch per Tastatur, ±0,1 s/±1 s).
  - **Rahmen:** der Ken-Burns-Editor für das gewählte Foto.
  - **„Vorschau rechnen“:** rechnet den Bereich um das gewählte Element (eine Sekunde davor und
    danach, bei Schleife über die Naht) klein (längere Seite 640 px) mit denselben Stücken und
    Befehlen wie das Ergebnis – Bild für Bild und Sample für Sample gleich, nur ohne
    Lautheitsangleichung. Gerechnet werden nur die Stücke im Ausschnitt; gleicher Stand kommt aus
    dem Zwischenspeicher. Ändert man danach etwas, steht „veraltet“ dabei.
- **Rechnen in Stücken:** Jedes Element und jeder Übergang wird einzeln gerechnet und
  zwischengespeichert; danach setzt ein Endlauf alles zusammen. Ändert man ein Element, werden nur
  dieses und seine Übergänge neu gerechnet. Bild und Ton liegen auf das Bild bzw. Sample genau
  (auch bei 29,97 fps), der Speicherbedarf bleibt unabhängig von der Länge. Vorher wird der
  Platz für die Zwischendateien geprüft (etwa 320 MB je Minute 1080p); der Zwischenspeicher hat
  eine Obergrenze und lässt sich leeren.
- **Aufträge** mit Fortschritt in Stufen (Analyse, Elemente, Übergänge, Ton, Kodieren) und
  Abbrechen (eine halbe Datei bleibt nie liegen); danach „In Player-Bibliothek übernehmen“,
  „In Medien-Info prüfen“, „Im Ordner zeigen“. Der Startbildschirm zeigt „rechnet · x %“.
- Das Projekt wird gemerkt. Aufträge teilen sich die Warteschlange (und GPU-Sitzungen) mit dem
  Video-Konverter.

### Medien-Info

Video- und Audio-Eckdaten per ffprobe: Auflösung, Bildrate, Codec, Bitrate, Ton, Timecode …

- **Analyse** im Hauptprozess mit Timeout, lesbaren Fehlermeldungen und Cache; Ordner werden
  rekursiv eingelesen (ohne `._`- und Systemdateien).
- **Tiefenanalyse** (optional): Keyframe-Abstand/GOP, VFR-Nachweis, Scan-Typ, HDR10-Metadaten,
  EXIF-Drehung von Fotos (steckt nur in den Seitendaten des ersten Bildes, nicht im Stream).
- **Show-Check:** Ampel-Hinweise je Prüfprofil (Zielsystem, Show-Raster, Datenträger).
- **Playlist-Vergleich** mit hervorgehobenen Abweichungen.
- **Kopieren** als Steckbrief, Kurzzeile oder Tabelle; **Export** als CSV (für Excel) oder JSON.
- **„Konvertieren“** übergibt die Dateien samt Zielsystem und Show-Raster an den Video-Konverter,
  **„Zu einem Video zusammenfügen …“** Bilder und Videos an den Video-Generator.

Der Parser ist an rund 140 echten Testdateien geprüft; 29 typische ffprobe-Ausgaben sind als
Fixture-Tests hinterlegt.

### Manuals-Bibliothek

Geräte-Handbücher (PDF) offline durchsuchen.

- Import mit Duplikat-Erkennung (SHA-256), Volltextsuche (SQLite FTS5) mit aufklappbaren
  Trefferboxen, Kategorien als Filter.
- PDF-Viewer in der App: Scrollen, Zoom/Pinch, Seitensprung, Suche im PDF.

### YouTube-Downloader

Wrapper um yt-dlp. Adresse und „Laden“ stehen in der Leiste „Download“ (bernstein, solange
Downloads laufen oder warten), Format, Zielordner und Anmeldung in der Schublade.

- Video (MP4) oder Audio (MP3/M4A) mit Auflösungsdeckel; Warteschlange mit Fortschritt, Tempo und
  Restzeit (zwei Downloads parallel, „Alle abbrechen“); Muxing über das gebündelte ffmpeg. Ein
  fertiges Video geht mit „In Player-Bibliothek übernehmen“ direkt an den Video-Player.
- **Playlists werden erkannt:** Jede Adresse wird vor dem Laden geprüft. Ein Video startet sofort,
  eine Playlist zeigt ihre Einträge mit Dauer zur Auswahl – „Alle/Keine“, Umschalt-Klick für
  Bereiche; private oder gelöschte Einträge sind gesperrt, Unter-Playlists (z. B. Kanal-Reiter)
  lassen sich einzeln öffnen. Jeder gewählte Eintrag wird ein eigener Download, in
  Playlist-Reihenfolge; auf Wunsch in einem Unterordner mit dem Playlist-Namen und mit
  vorangestellter Nummer („03 - Titel“). Sehr lange Playlists: die ersten 500 Einträge.
- **Video in einer Playlist** (`watch?v=…&list=…`): nur dieses Video ist vorgewählt, „Nur dieses
  Video laden“ startet es direkt.
- **Anmeldung** für altersbeschränkte oder nur angemeldet sichtbare Videos („Sign in to confirm
  your age“): Bereich „Anmeldung“ – Cookies aus Firefox, Chrome, Edge, Brave, Opera, Vivaldi,
  Chromium, Safari (Mac) oder aus einer exportierten cookies.txt (Netscape-Format). yt-dlp liest
  sie bei jedem Abruf selbst; dort bei YouTube angemeldet sein. Unter Windows sperren Chrome und
  Edge ihre Cookies für andere Programme – dort Firefox oder eine cookies.txt nutzen, den Browser
  beim Laden am besten schließen.
- **Seiten, die Programme aussperren** (Cloudflare-Schutz, HTTP 403): Prüfen und Laden werden
  automatisch ein zweites Mal als Browser versucht (Browser-Nachahmung von yt-dlp). Gegen eine
  echte Rätselseite hilft auch das nicht – dann im Browser laden.
- **Fehler verständlich:** Anmeldung nötig, Cookies gesperrt oder verschlüsselt, kein Profil
  gefunden, Seite blockt – jeweils mit dem nächsten Schritt statt der englischen yt-dlp-Zeile.
- yt-dlp lädt die App selbst als eigenständiges Programm (Prüfsumme wird verglichen) und prüft
  beim Start auf neue Versionen. Version, diese Prüfung und **Jetzt prüfen** stehen wie bei ffmpeg
  im Menü „Mottulbox“; fehlt yt-dlp, bietet der Downloader das Herunterladen direkt an.
- Nur freigegebene oder eigene Inhalte laden.

## Strom, Rigging & Aufbau

### Packliste

Material-Checkliste mit Mengen, Einheiten und Notizen – abhakbar, nach Kategorie gruppiert,
als Jobs speicherbar. Aus der LED-Wall-Konfiguration befüllbar (Module, Standfüße, Ballast,
Kabelmengen aus den gezeichneten Ketten); Export als PDF oder JSON. PDF, JSON und „Aus LED-Wall
übernehmen“ stehen in der Leiste „Projekt“, Projektname und gespeicherte Jobs (laden, löschen,
aktuelle speichern) in der Schublade – wie die Vorlagen des LED-Wall-Konfigurators.

- **Blöcke** (Kategorien): Der Titel nutzt die ganze Breite der Kopfzeile. Jeder Block kann eine
  **Farbe** bekommen (Tupfen links vom Titel: acht Farben oder keine) – sie färbt den Rand und den
  Kopf des Blocks und im PDF die Linie unter dem Titel. Kommen mehrere Wände aus dem
  LED-Wall-Konfigurator, bekommt jede Wand gleich beim Übernehmen eine eigene Farbe; eine
  gewählte Farbe bleibt beim nächsten Übernehmen. Farben ziehen beim Umbenennen mit und gehen in
  gespeicherte Jobs und die JSON-Datei mit.
- **PDF** (Schublade): Blöcke in der Reihenfolge der Liste. **Blöcke nicht über Seiten teilen**:
  Ein Block, der nicht mehr ganz auf die Seite passt, beginnt auf der nächsten (ein Block länger
  als eine Seite bricht trotzdem um, die Kopfzeile der Tabelle wiederholt sich). Aus: alles
  fortlaufend, nur der Titel bleibt bei seiner Tabelle und keine Zeile wird geteilt.

### Mini-Manual

Kurz-Anleitungen für die Leute vor Ort („So bedienst du deine LED-Wall“): wie man die Wand
einschaltet und bedient, was wo steht – und im Fehlerfall Schritt für Schritt, was man prüfen und
selbst beheben darf, bevor man anruft. Ausgabe als **Handbuch** (PDF, A4, Fußzeile mit Seiten)
und **Kurzkarte** (PDF, A5, genau eine Seite – passt sie nicht, wird sie bis 62 % verkleinert,
sonst kommt ein Hinweis), dazu die **Handy-Fassung** (eine HTML-Datei).

- **Handy-Fassung** (Leiste → Handy): eine einzige HTML-Datei, die nichts nachlädt – Fotos und
  Logo stecken darin. Inhaltsverzeichnis, unten eine Leiste „Anrufen“ mit dem ersten Kontakt; die
  Fehlersuche läuft mit **Schritt für Schritt** (eine Frage, Ja/Nein, Zurück, Von vorn), ohne
  Skript bleibt alles lesbar und „weiter bei 3“ ist ein Link. **Als Datei speichern** zum
  Verschicken (WhatsApp, Mail) – mit der Stufe aus der Leiste wie das PDF.
- **Online stellen:** schreibt dieselbe Seite in die **Online-Ablage** (App-Menü), je Anleitung
  in einen eigenen Ordner mit nicht erratbarem Namen („messe-dornbirn-k7f3q2x9/index.html“);
  beim Aktualisieren bleibt die Adresse gleich, „Unter neuer Adresse“ legt einen neuen Ordner an.
  Online **nie Zugangsdaten** und höchstens Stufe Betreuung. Die Adresse steht in der Schublade
  unter „Ausgabe“ (Link), „Adresse kopieren“ im Menü, und die **Kurzkarte** druckt sie als
  QR-Code („Am Handy: die ganze Anleitung“).

- **Stufen:** In der Leiste wählst du, für wen die Ausgabe ist – **Bedienung** (Kunde,
  Moderation), **Betreuung** (Haustechnik, Stagehand), **Technik** (Techniker, Lehrlinge) oder
  die **Lernausgabe** (alles, jeder Teil mit Stufen-Kennzeichen). Kapitel, Blöcke, Schritte und
  Fehlerfälle tragen eine Mindeststufe; die Stufe steuert nur, *was* erscheint. Ein Sprung in der
  Fehlersuche zu einem Schritt über der Stufe wird zu „Ab hier bitte anrufen“.
- **Reihenfolge** von Kapiteln, Blöcken, Schritten, Fehlerfällen, Geräten, Zugängen und
  Kontakten: am Griff (⋮⋮) ziehen – eine Linie zeigt, wo die Zeile landet – oder mit den
  Pfeil-Knöpfen (Tastatur).
- **Kapitel** (Schublade: an/ab, Reihenfolge, Stufe): Auf einen Blick, Systemübersicht (Grafik
  aus der Geräteliste), Geräte und Standorte, Zugangsdaten, Ein- und Ausschalten, Software,
  Bedienfeld, Inhalte tauschen, LED-Wall, Verkabelung, Fehlersuche, Pflege und Verbote, Ersatzteile,
  Kontakt und Support (mit QR-Code zum Anrufen), Dokumentstand. Dazu das Deckblatt.
- **Geräteliste mit Signalwegen:** Rolle (Zuspieler, Verteiler wie ein HDMI-Splitter, Prozessor,
  Bedienfeld, Netzwerk, Strom, Sonstiges), Name, Modell, Standort, IP, Hinweis, Foto. Ein
  **Prozessor** sagt, welche Wände er bespielt; ein **Zuspieler** hat Ausgänge („HDMI 1“ mit
  Bildgröße), je Ausgang optional über einen Verteiler an einen oder mehrere Prozessoren – liefert
  ein Ausgang ein Gesamtbild für mehrere Wände, steht je Wand der Ausschnitt dabei. Eindeutige
  Fälle brauchen keine Angabe (eine Wand, ein Prozessor). Aus der LED-Wall-Kopie legt ein Klick
  die Prozessoren der Planung an, „bespielt“ schon gesetzt. Die **Systemübersicht** zeichnet daraus
  die Pfeile (Name des Ausgangs am Pfeil) und listet die Signalwege je Wand; die Prüfung vor dem
  Export meldet Wände ohne Prozessor, Prozessoren ohne Wand, Zuspieler ohne Ziel und Ausschnitte,
  die über das Bild ragen oder skaliert werden.
- **Texte** mit kleiner Auszeichnung (Leerzeile = Absatz, „- “ Liste, „1. “ nummeriert, „> “
  Hinweis bis zur nächsten Leerzeile – Listen darin erlaubt –, `**fett**`) und **Platzhaltern**
  wie `{prozessor.name}`, `{pc.ip}`, `{wand.aufloesung}`, `{kontakt.mobil}` – die Kurznamen der Geräte sind die Quelle. Eingesetzte
  Werte stehen **fett** im Text, damit man Namen und Adressen beim Lesen sofort findet. Leere
  Platzhalter zeigt die Vorschau rot gestrichelt, im PDF wird daraus eine Linie zum Ausfüllen.
- **Bausteine:** mitgelieferte (Ein-/Ausschalten, Stromausfall, MadMapper, Mottulbox-Player,
  OBS, Stream Deck, Inhalte, Pflege, Ersatzteile, Status-LEDs) und **eigene** – ein Kapitel als
  Baustein speichern, eine Datei je Baustein im Benutzerordner unter `Bausteine/`. Eingefügt wird
  eine Kopie; die Anleitung ändert sich nicht von selbst, wenn sich die Bibliothek ändert. Gibt es
  den Namen im selben Kapitel schon, fragt das Speichern: **Ersetzen** (gleicher Baustein,
  Version + 1), **Beide behalten** (der neue heißt „… (2)“) oder Abbrechen.
- **Neuere Fassung:** Ist ein eingefügter Baustein oder Fehlerfall inzwischen neuer – in der
  mitgelieferten Bibliothek (mit einer neuen App-Version) oder als eigener Baustein (ersetzt oder
  vom Kollegen importiert) –, steht im Kapitel bzw. am Fall „Neuere Fassung von „…“: Version
  1 → 2“ mit **Aktualisieren**. Nach einer Rückfrage ersetzt die neue Fassung die Kopie an ihrer
  Stelle (eigene Änderungen daran gehen verloren); ein Fall behält seine Kennung, Verweise anderer
  Fälle bleiben. Die Prüfung in der Schublade nennt neuere Fassungen der Bibliothek als Hinweis.
- **Vorschläge nach Stichworten:** Jeder mitgelieferte Baustein trägt Stichworte (Software, Gerät,
  Prozessor, Modul). Was das Projekt nennt – Name, Modell und Notiz der Geräte, die LED-Wand mit
  Modul und Prozessor-Hersteller –, ergibt die Vorschläge: Der Knopf „Baustein einfügen …“ zeigt,
  wie viele noch fehlende Bausteine des Kapitels passen („2 passen“), in der Auswahl stehen sie
  oben mit „passt zum Projekt“. Nur ganze Wörter zählen („PC“ trifft „Medien-PC“, nicht „PCIe“).
- **Bausteine verwalten** (Leiste → Bausteine): alle eigenen nach Kapitel, mit Version, Autor
  und Datum; umbenennen, löschen, einzeln, als Auswahl oder alle **exportieren** (eine
  JSON-Datei zum Weitergeben per Mail oder Stick). **Importieren** nimmt eine oder mehrere solcher
  Dateien: Neues kommt dazu, eine höhere Version ersetzt die eigene, gleiche oder ältere wird
  übersprungen, ein anderer Baustein mit gleichem Namen heißt „… (2)“ – überschrieben wird nie
  stillschweigend. Danach steht die Zusammenfassung da („2 neu, 1 schon vorhanden“).
- **Fehlersuche** als Liste: je Schritt Stufe, Frage, Ja- und Nein-Ziel (anderer Schritt,
  Lösung, Gelöst, Anrufen, anderer Fall), Hinweis, Foto, „vorher kurz anrufen“, Stufe aus dem
  Modul (IM-Tausch: 496-2,0/rX3ioBF werkzeuglos mit Rücksprache, uS2+ nur Technik). Die Prüfung
  meldet fehlende Ziele, nie erreichte Schritte, Schleifen und Fälle ohne „Anrufen“. 15 Fälle
  aus Praxis und Herstellerhilfen liegen bei; eine neue Anleitung enthält die wichtigsten.
  **Antwort aus der Planung:** Eine Frage wie „Läuft das Signal über Glasfaser?“ entfällt in der
  Ausgabe, wenn alle Wände der LED-Wall-Kopie Glasfaser haben (bzw. keine) – es geht gleich mit
  Ja bzw. Nein weiter, die Box-Schritte erscheinen also nur mit Glasfaser.
- **LED-Wall:** Kennzahlen als Kopie aus der LED-Wall-Planung **derselben Projektdatei**
  (oder aus dem aktuellen Konfigurator) – bei mehreren Wänden jede mit Namen, im Kapitel je Wand
  eine Tabelle, Platzhalter `{wand.…}` für die erste und `{wand2.…}` usw. für die weiteren.
  Speichert jemand die Planung neu, zeigt die Anleitung „Planung geändert (Stand 7 → 9)“ mit den
  Unterschieden (auch neue, entfernte und umbenannte Wände) und übernimmt erst auf Klick. Haben
  die Wände verschiedene Module, gilt beim IM-Tausch die strengere Regel.
- **Bedienfeld:** ein oder mehrere Tastenfelder, je mit Gerät (Stream Deck Mini, MK.2, XL, +,
  Neo, + XL, Studio mit festem Raster; Companion und „frei“ mit wählbarem Raster bis 16 × 12),
  Name, Notiz (Drehregler, Touchleiste, Profil) und Stufe. Seiten anlegen, benennen, sortieren;
  eine Taste anklicken und Aufschrift (mehrzeilig wie am Gerät), „Was die Taste tut“, Notiz,
  Schrift- und Tastenfarbe, Bild und Stufe eintragen. **Navigation:** nächste Seite, vorige Seite
  oder „Öffnet …“ eine bestimmte Seite (Ordner) – ohne Aufschrift steht das Ziel auf der Taste.
  Tasten per Ziehen tauschen. Ein kleineres Raster (anderes Gerät) fragt nach, wenn dabei Tasten
  wegfallen. Im Handbuch und am Handy erscheint je Seite das Raster wie am Gerät (Nummer und
  Aufschrift) und darunter die Liste „Nummer – was die Taste tut“; Tasten über der Stufe bleiben
  ein leerer Platz, leere Seiten fallen weg. Die Prüfung meldet Tasten ohne Aufschrift. Text und
  Bausteine (z. B. „Stream Deck“) stehen über den Tastenfeldern. Importe aus Stream Deck,
  Companion und OBS füllen später dasselbe Modell.
- **Aus Mottulbox übernehmen** (immer als Kopie, danach von Hand ergänzbar):
  - **Jingle-Player** (Kapitel Bedienfeld): jede Bank eine Seite, jedes belegte Pad eine Taste
    mit Name, Farbe, „Spielt …“ bzw. „Startet bzw. stoppt …“ (Schleife) und dem Tastaturkürzel
    als Notiz; die Notiz des Felds sagt, dass erst „Live“ gewählt sein muss (und ob immer nur ein
    Jingle spielt).
  - **OSC-Steuerung** (Kapitel Bedienfeld): je Set ein Bedienfeld auf dem Raster der Steuerung –
    Kacheln mit Lage und Größe, Beschriftung und Farbe, „was sie tut“ in Worten (Regler, Taster,
    Schalter, Auswahl mit ihren Einträgen, Befehle an den LED-Prozessor), ohne OSC-Adressen. Bei
    mehreren Projekten erst das Projekt wählen. Kacheln werden der Reihe nach nummeriert; Lage
    und Größe bleiben wie in der Steuerung (kein Ziehen). Das **Verhältnis** folgt der Vorschau,
    die im Set eingestellt ist – Handy oder Tablet (hochkant oder quer) bzw. Desktop: Ein
    Handy-Layout steht schmal mit hohen Kacheln im Handbuch, ein Desktop-Layout breit; der Kopf
    des Felds nennt die Ansicht („Handy hochkant“).
  - **Video-Player** (Kapitel Software): ein Text zum Player (Ausgabe-Bildschirm, Überblendung,
    was die Wand zeigt, wenn nichts läuft) und je gespeicherter Playlist eine nummerierte Liste
    mit Titel und Dauer (ohne gespeicherte die gerade geladene).
  - Noch einmal übernehmen ersetzt die frühere Übernahme an ihrer Stelle – nach einer
    Rückfrage, denn Ergänzungen daran gehen verloren.
- **Verkabelung:** je Wand der Kopie Signal- und Stromplan mit Kabelverlauf (dieselbe Zeichnung
  wie die PDF-Doku des Konfigurators), Ports und Backup je Signalkette, Kreis, Phase und Strom je
  Stromkette, Prozessor und Glasfaser-Strecke. Blickrichtung im Kapitel: **von hinten** (ab Werk –
  dort wird gesteckt; gespiegelt, groß beschriftet) oder von vorne.
- **Kontakte** kommen aus dem **Firmenprofil** (App-Menü: Name, Logo, Akzentfarbe für Linien
  und Überschriften, Kontakte, Fernwartung) – als Kopie, damit die Datei beim Kollegen
  vollständig ist.
- **Zugangsdaten** stehen im Klartext in der Projektdatei; im PDF ab Werk „wird separat
  übergeben“, wahlweise geschwärzt oder gedruckt. Die Stufe Bedienung zeigt sie nie.
- **Vor dem Export** (Schublade, Zahl in der Leiste): leere Platzhalter, fehlender Kontakt,
  gedruckte Passwörter, fehlende oder veraltete LED-Wall-Planung, Probleme der Fehlerfälle,
  leere Kapitel, Fehler der Verkabelung laut Planung (Port oder Kreis überlastet, zu viele Ports). Bei Fehlern fragt der Export nach.
- **Fotos** stehen zentriert, die Bildunterschrift mittig darunter; mehrere Foto-Blöcke
  hintereinander stehen nebeneinander (zwei bzw. vier in zwei Spalten, sonst drei).
- **Vorschau** neben dem Formular: dieselbe Seite wie im PDF, Kapitel für Kapitel.
- Gespeichert wird als Teil „Anleitung“ der [Projektdatei](#projektdateien-und-projektordner),
  mit Fotos.

### Stromlast & Absicherung

Leistung ↔ Strom (1∼/3∼, mit Leistungsfaktor cos φ und Scheinleistung) und wie viele gleiche
Geräte auf einen 10- bis 63-A-Stromkreis passen – wahlweise mit 80 % Auslastung für den
Dauerbetrieb.

### Rigging-Last

Auflagerkräfte einer Traverse auf zwei Punkten und Strangkräfte im Bridle nach Anschlagwinkel,
mit Warnstufen. Richtwerte – ersetzt keinen Sachkundigen.

## Rechner

- **Kreisrechner:** Durchmesser, Radius, Umfang und Fläche – einen Wert eingeben, den Rest
  berechnen.
- **Audio-Delay & SPL:** Lautsprecher-Laufzeit aus der Distanz und Pegelabfall über die
  Entfernung.
- **Timecode-Rechner:** SMPTE-Timecode ↔ Frames ↔ Echtzeit, inklusive Drop-Frame (29,97/59,94),
  und Dauer zwischen In und Out.

### RTA (Echtzeit-Analysator)

Spektrum des Mikrofons in Echtzeit – am Rechner mit jedem Eingang (Audio-Interface mit
Messmikrofon), am Handy in der Web-App.

- **Messen** startet das Mikrofon ohne die Sprachfilter der Geräte (Echo- und Rauschunterdrückung,
  automatischer Pegel); filtert ein Gerät trotzdem, steht das in der Statuszeile.
- **Spektrum** als Bänder (1/1, 1/3, 1/6 oder 1/12 Oktave nach IEC 61260) und als feine Kurve
  (1/24 Oktave), beides zusammen oder einzeln. Gemessen wird mit fünf FFT-Fenstern zugleich
  (Multi-Time-Window): tiefe Frequenzen fein aufgelöst, hohe mit schneller Antwort. Bewertung
  **Z, A oder C** (IEC 61672). Spitzen je Band gehalten oder langsam fallend.
- **Mittelung** aus, schnell (125 ms), langsam (1 s) oder unendlich – für rosa Rauschen am
  ruhigsten. **Einfrieren** hält die Anzeige an, **Zurücksetzen** beginnt Mittelung, Spitzen,
  Leq und Max neu.
- **Pegel:** LAF/LAS (bzw. C/Z), **Leq** seit dem Start, **Max** und die **Aussteuerung**
  (größter Abtastwert, mit Warnung bei Übersteuerung).
- **Ablesen:** Zeiger bzw. Finger aufs Spektrum zeigt Frequenz, nächste Note mit Cent, Band- und
  Kurvenpegel.
- **Farbe** (Anzeige → Farbe): Akzent wie die App oder **neutral** – Pegel, Spektrum und
  Wasserfall in Weiß (im hellen Design Schwarz), z. B. für ein ruhiges Bild am Messplatz.
- **Spektrogramm** unter dem Spektrum (Anzeige → Spektrogramm), Farbe = Pegel, eine Zeile je
  0,1 s (gut 15 s Verlauf): **Wasserfall** – Frequenz waagrecht auf derselben Achse wie das
  Spektrum, eine Linie steht also genau unter ihrer Spitze, die Zeit läuft nach unten; oder
  **Zeitachse waagrecht** – Zeit nach links, Frequenz senkrecht. Beide mit Oktav-Gitter und
  Beschriftung; Zeiger bzw. Finger zeigt Frequenz, Note, Pegel und wie lange es her ist, das
  Fadenkreuz des Spektrums läuft durch den Wasserfall weiter.
- **Referenzen:** die aktuelle Kurve merken (bis zu sechs, benennbar, ein-/ausblendbar) und
  vergleichen; **Differenz** zeigt die laufende Messung minus der Referenz (0 dB = gleich).
  Gespeichert wird unbewertet in 1/24 Oktave – eine Referenz passt so zu jeder Auflösung und
  Bewertung.
- **Kalibrierung:** ohne zeigt der RTA dBFS (relativ zur Vollaussteuerung). Mit einem
  Kalibrator (94 oder 114 dB) auf dem Mikrofon setzt **Kalibrieren** den Offset, danach dB SPL;
  der Offset lässt sich auch eintippen. **Korrekturdatei** eines Messmikrofons (miniDSP UMIK,
  Dayton, REW – „Frequenz dB“ je Zeile) bereinigt dessen Frequenzgang.
- **Feedback-Finder:** meldet schmale, stehende Spitzen (deutlich über der Umgebung ±1/6
  Oktave und an derselben Frequenz) mit Frequenz, Note, Pegel und einem Filter-Vorschlag
  (Glocke 1/10 Oktave, Absenkung nach Prominenz); Empfindlichkeit niedrig/mittel/hoch; eine
  Liste behält die gefundenen Frequenzen fürs Einpegeln.
- **Grenzen:** Handymikrofone messen unter ~100 Hz und ganz oben zu wenig – für Vergleiche und
  Feedback reicht das, für Messungen ein Messmikrofon nehmen. Am Handy bleibt der Bildschirm
  während der Messung an.

### Rechner fürs Handy (PWA)

Alle zehn kleinen Werkzeuge – Kreis, Projektionsverhältnis, Kameraobjektiv, Beamer-Lumen,
DMX-Dip-Schalter, Stromlast, Audio-Delay, RTA, Rigging-Last und Timecode – gibt es zusätzlich als
eigenständige Web-App ohne die übrige Mottulbox: https://mottul.github.io/project_mega/ im
Browser öffnen, über „Installieren“ bzw.
„Zum Home-Bildschirm“ als App ablegen, danach läuft sie **offline**. Dieselben Rechner wie am
Desktop (gleicher Code). Der Knopf **„Darstellung“** oben rechts stellt wie das App-Menü der
Mottulbox Design (Dunkel, Hell, wie das Gerät) und Akzentfarbe ein; das Handy merkt sich beides.
Eine neue Version meldet sich mit „Neu laden“, sonst greift sie beim nächsten Start – das kommt nur
vor, wenn sich an den Rechnern selbst, an gemeinsamen Bedienelementen oder an den Farben etwas
geändert hat, nicht bei Änderungen an anderen Werkzeugen. **Symbol und Startbildschirm** der
installierten App legt das Handy beim Installieren fest: Android erneuert sie nach einer
Änderung von selbst, sobald Chrome sie bemerkt (beim Start, höchstens einmal am Tag, unter
Umständen mit Rückfrage); iOS nie – dort die App vom Home-Bildschirm entfernen und neu hinzufügen.
Wer nicht warten will: auch unter Android entfernen und neu installieren. Bauen und
Veröffentlichen: [ENTWICKLUNG.md](ENTWICKLUNG.md#rechner-pwa).

## Übergaben zwischen Werkzeugen

- **Medien-Info → Video-Konverter:** „Konvertieren“ übergibt die Dateien samt Zielsystem und
  Show-Raster. Zurück geht es mit „Quelle“, „Details“ oder „Ergebnis in Medien-Info prüfen“.
- **Video-Konverter / Medien-Info → Video-Generator:** „Zu einem Video zusammenfügen …“ übergibt
  die Dateien (Ordner werden dort aufgelöst). Das Ergebnis geht mit „In Player-Bibliothek
  übernehmen“ an den Video-Player (Wand-Auflösung und Einpassen wie dort eingestellt) und mit
  „In Medien-Info prüfen“ zur Kontrolle.
- **LED-Wall-Konfigurator → Packliste:** übernimmt Module, Standfüße, Ballast und Kabel und
  öffnet die Packliste im eigenen Fenster. Bei mehreren Wänden je Wand eine Kategorie
  („LED-Wall · Bar“); gleiche Module nennen die Summe über alle Wände. Dazu der Prozessor
  (geteilte einmal), die Backup-Leitungen der Signalketten und die Glasfaser-Strecke: CVT10-Boxen,
  Fasern, je Box ein PowerCON-Kabel; die Einspeisung heißt dann „CVT10 → erste Kachel“. Die
  Fasern kommen **aus dem Lager** (Singlemode LC-LC 20, 50, 100 m, Patch 1 und 3 m): je Faser das
  kürzeste Stück, das reicht, über 100 m die kleinste Kombination aus 100-m-Stücken plus Rest
  (150 m = 100 + 50 m, dazu LC-LC-Kupplungen für die Stöße). Multimode und Fasern ohne Länge
  stehen als Zeile zum Ausfüllen da.
- **Netzwerk-Scanner → NovaStar:** IP eines Geräts in die NovaStar-Steuerung bzw. die
  NovaStar-Kacheln der OSC-Steuerung übernehmen.
- **Netzwerk-Scanner → Manuals-Bibliothek:** den Hersteller eines Geräts als Handbuch-Suche.
- **Video-Konverter / YouTube-Downloader → Video-Player:** „In Player-Bibliothek übernehmen“ an
  fertigen Konvertierungen und Video-Downloads (wie beim Video-Generator).
- **LED-Wall-Konfigurator → Video-Player:** „Aus LED-Wall“ übernimmt die Wand-Auflösung.
- **Jingle-Player, OSC-Steuerung, Video-Player → Mini-Manual:** Bänke und Kacheln als Bedienfeld,
  Playlists als Text im Kapitel Software (siehe Mini-Manual, „Aus Mottulbox übernehmen“).
- **Video-Player → OSC-Steuerung:** Die Anzeige-Kachel kann die Restzeit des laufenden Clips
  zeigen.

In der Kundenansicht sind die Sprünge in andere Werkzeuge ausgeblendet.

Weitere Übergaben sind geplant: [ROADMAP.md](ROADMAP.md#verzahnung).

## Projektdateien und Projektordner

Eine **Projektdatei** (`.mottul`) hält die Planung eines Werkzeugs als Datei – zum Weitergeben an
Kollegen, zum Ablegen beim Kunden. Eine Datei kann mehrere Teile haben (heute die LED-Wall-Planung
und die Anleitung des Mini-Manuals, geplant die Packliste); **jedes Werkzeug liest und schreibt
nur seinen eigenen Teil**,
die anderen bleiben beim Speichern unverändert.

- **Ohne Datei** arbeitet ein Werkzeug wie immer – die schnelle Planung „nur für mich“ braucht
  keine Datei, der Stand bleibt trotzdem über einen Neustart erhalten.
- **Menü „Datei“** in der Leiste: Neu, Öffnen … (Strg+O), Speichern (Strg+S), Speichern unter …
  (Strg+Umschalt+S), Im Ordner zeigen und die zuletzt geöffneten Dateien. Daneben steht, woran man
  arbeitet: der Dateiname (mit Punkt, solange etwas ungespeichert ist) oder „ohne Datei“; derselbe
  Name steht im Fenstertitel. Gespeichert wird nur ausdrücklich, nie still.
- **Rückfragen:** „Neu“ und „Öffnen“ fragen, wenn ungespeicherte Änderungen verloren gingen. Hat
  jemand anderes die Datei inzwischen gespeichert (Netzlaufwerk), überschreibt Speichern sie nicht
  still: „Überschreiben / Speichern unter … / Abbrechen“. Enthält eine Datei beim Öffnen noch
  keine Planung dieses Werkzeugs, lässt sich die aktuelle hinzufügen oder eine leere anlegen
  (die aktuelle bleibt, bis das Speichern geklappt hat). Ist die Planung im zweiten Fenster offen
  und ändert sich dort etwas, während eine Rückfrage wartet, bricht die Aktion ab, statt das
  Falsche zu speichern. Eine **Vorlage** im LED-Wall-Konfigurator ersetzt nur die gewählte Wand;
  die Verbindung zur Datei bleibt, die Datei gilt danach als ungespeichert.
- **Sicherungen:** Vor jedem Überschreiben legt die App die bisherige Datei im Benutzerordner unter
  `Sicherungen/` ab (die letzten 10 je Datei; gleichnamige Dateien in anderen Ordnern haben
  eigene Sicherungen).
- **Online-Ablage** (App-Menü, für die Handy-Fassung des Mini-Manuals): ein Ordner, den ein
  Cloud-Dienst im Netz veröffentlicht – z. B. der **pCloud Public Folder** über pCloud Drive –, und
  seine Adresse (`https://filedn.eu/…/`). Die Mottulbox schreibt nur hinein, hochladen tut der
  Dienst; ein Zugang zu ihm steht nie in der App.
- **Projektordner:** im App-Menü; ab Werk `Dokumente/Mottulbox-Projekte` (wird beim ersten
  Speichern angelegt), änderbar, auch auf ein Netzlaufwerk. Eine neue Datei beginnt immer dort,
  „Öffnen“ im zuletzt benutzten Projektordner.
- Dateien aus einer neueren Mottulbox öffnet die App nicht; Teile, die sie nicht kennt, bleiben
  beim Speichern erhalten.
- **Fotos** (Mini-Manual) stecken in der Datei selbst. Beim Einfügen (JPG, PNG)
  verkleinert die App sie auf höchstens 2000 Pixel, dreht hochkant aufgenommene Handyfotos
  richtig und entfernt Metadaten wie den Aufnahmeort. Bis zum Speichern liegen sie im
  Benutzerordner unter `Projektfotos/`.

## Wo die Daten liegen

Alles liegt im Benutzerordner der App: Windows `%APPDATA%\Mottulbox`, macOS
`~/Library/Application Support/Mottulbox`, Linux `~/.config/Mottulbox`.

| Pfad                    | Inhalt                                                                   |
| ----------------------- | ------------------------------------------------------------------------ |
| `settings.json`         | App-Einstellungen inkl. Zielordner, NDI, Timer-Ablauf und Fensterlage der Rechner |
| `library.db`            | Bibliothek von Manuals und Video-Player (SQLite)                         |
| `player-media/`         | konvertierte Player-Medien und Thumbnails                                |
| `player-uploads/`       | vom Handy hochgeladene Originale                                         |
| `vgen-cache/`           | Video-Generator: Zwischenstücke (begrenzt, älteste zuerst gelöscht), Vorschaubilder, gerechnete Vorschauen (die neuesten 20) |
| `jingles/`              | Audiodateien des Jingle-Players                                          |
| `manuals/`              | importierte Handbücher                                                   |
| `bin/`                  | yt-dlp                                                                   |
| `ffmpeg/`               | in der App aktualisierte ffmpeg-Builds (Windows, Linux)                  |
| `Local Storage/`        | Werkzeug-Zustände (OSC-Projekte, LED-Wall-Planungen, Packlisten, Anleitungen …) |
| `Sicherungen/`          | frühere Stände von Projektdateien (die letzten 10 je Datei)              |
| `Projektfotos/`         | Fotos der Projektdateien und das Logo des Firmenprofils, benannt nach ihrem Inhalt (sha256) |
| `Bausteine/`            | eigene Bausteine des Mini-Manuals (eine Datei je Baustein)               |
| `avtoolbox-debug.log`   | Debug-Log – erste Anlaufstelle bei Problemen im gepackten Build          |

Projektdateien (`.mottul`) liegen dort, wo man sie speichert – ab Werk im Projektordner
`Dokumente/Mottulbox-Projekte`.
