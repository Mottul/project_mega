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
- [Strom, Rigging & Aufbau](#strom-rigging--aufbau) – Packliste, Stromlast & Absicherung,
  Rigging-Last
- [Rechner](#rechner) – Kreisrechner, Audio-Delay & SPL, Timecode-Rechner
- [Übergaben zwischen Werkzeugen](#übergaben-zwischen-werkzeugen)
- [Wo die Daten liegen](#wo-die-daten-liegen)

## Startbildschirm & Bedienung

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
- **Eigene Fenster:** Jedes Werkzeug lässt sich zusätzlich in einem eigenen Fenster öffnen
  („In neuem Fenster öffnen“ an der Kachel oder in der Kopfzeile) – etwa Video-Player, Jingles
  und Rechner gleichzeitig. Ist ein Werkzeug in mehreren Fenstern offen, zeigen alle denselben
  Stand; Änderungen kommen nach spätestens einer halben Sekunde in den anderen Fenstern an.
- **Kundenansicht:** „Als Kundenansicht starten“ in der Kopfzeile eines Werkzeugs sperrt es
  sofort und öffnet es auch bei jedem weiteren App-Start direkt – ohne „Zurück“ und ohne heikle
  Einstellungen (der Video-Player verbirgt z. B. Wand/Auflösung, Encoder, Lautheit und Idle-Bild,
  Medien-Info und Video-Konverter die Sprünge in andere Werkzeuge, der Video-Konverter auch die
  Encoder-Wahl). **Strg+Shift+K** verlässt die Kundenansicht und hebt den Autostart auf.
- **Darstellung:** Design Dunkel (Standard), Hell oder wie das System; sieben Akzentfarben (Gold,
  Bernstein, Türkis, Blau, Violett, Pink, Grün); am Startbildschirm außerdem eine kompakte Anzeige,
  die die ganze Oberfläche etwas kleiner setzt. Ergebnisse in den Rechnern stehen in der
  Akzentfarbe.
- **Robust in der Show:** Ein abstürzendes Werkzeug bleibt in seinem Bereich (Fehlergrenze), die
  App läuft weiter. Stille Fehler werden als Hinweis sichtbar (z. B. defekte Jingle-Datei,
  verlorenes Audiogerät). `settings.json` wird atomar gespeichert; eine beschädigte
  `settings.json` oder `library.db` wird gesichert und neu angelegt statt still zurückgesetzt.

## Wiedergabe & Show

### Video-Player

Playlist-Player für LED-Wände und Beamer.

- **Auf die Wand eingebacken:** Medien werden beim Import auf die Wand-Auflösung gerechnet –
  Blur-Fill, schwarze Ränder oder Strecken – und als H.264/MP4 abgelegt, das Chromium
  hardwarebeschleunigt abspielt. GPU-Encoder (NVENC, QSV, AMF, VideoToolbox) werden erkannt und
  vor Gebrauch geprüft, sonst übernimmt libx264; scheitert die GPU mitten im Import (Treiber,
  Sitzungslimit), wird er einmal auf der CPU wiederholt.
- **Über den gemeinsamen Konvertierungs-Kern** (siehe [Video-Konverter](#video-konverter)):
  Deinterlace, HDR → SDR, konstante Bildrate, Drehung von Handyfotos und -videos (auch EXIF) und
  anamorphe Pixel werden richtig eingerechnet; passendes H.264 wird nur umverpackt. Bilder werden mit frei wählbarer
  Standzeit gebacken, GIFs zu Loop-Videos. Importe haben eine eigene Spur in der Warteschlange und
  warten nie auf einen Konverter-Stapel. **Gleichzeitige Importe** einstellbar (1–4, Standard 2):
  mehr lohnt bei vielen kurzen Clips, Bildern oder mit GPU-Encoder; während der Show lieber 1,
  damit die Wiedergabe genug Luft hat. Dieselbe Datei wird nie doppelt gleichzeitig gerechnet –
  zweimal hineingezogen, landet sie einmal in der Bibliothek.
- **Lautheit angleichen** (optional, EBU R128): Ziel −23, −16 oder −14 LUFS, gemessen und
  angewandt wie im [Video-Konverter](#video-konverter). Gilt für neue Importe; „Vorhandene neu
  einbacken“ bringt die Bibliothek auf die aktuelle Einstellung (bereits passende Medien werden
  übersprungen, zwei Fassungen desselben Clips laufen zu einer zusammen).
- **Ausgabe & Wand** (erste Sektion im Seiten-Panel): Ausgabe-Monitor wählen, Vollbild öffnen
  und die Wand-Auflösung festlegen – per Eingabe, Vorgabe oder „von Monitor“.
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
  der Klick ein Pad, seine Einstellungen erscheinen im Seiten-Panel.
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
- **Bewegte Muster:** Pixelcheck-Loop, Scroll, Timecode.
- **Vollbild-Ausgabe** auf wählbarem Monitor, pixelgenau und live.
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
  lässt sich als Vorlage für neue speichern („Default“). Edit-/Live-Umschalter in der Kopfzeile,
  Einstellungen im Seiten-Panel.
- **Bedienung:** Fader, XY-Pad und Farbregler ziehen relativ (kein Sprung zum Klickpunkt).
- **Senden** per UDP aus dem Hauptprozess mit eigenem OSC-Codec; Host und Ports einstellbar
  (MadMapper-Standard: senden 8000, empfangen 9000).
- **Feedback** (optional): eingehende Werte stellen passende Kacheln nach; dazu ein OSC-Monitor im
  eigenen Fenster und ein Learn-Modus (die nächste eingehende Adresse geht ins gewählte Widget).
- **Handy-Fernsteuerung** mit derselben Oberfläche; Sets lassen sich auch dort umschalten.

### NovaStar-Steuerung

Steuert NovaStar-LED-Prozessoren (NovaPro UHD Jr & Co.) über TCP 5200 – Vorabversion.

- Helligkeit, Fade-to-Black (weiche Rampe, als Umschalter mit Ziel-Helligkeit), Blackout und
  Freeze (ein gemeinsamer Anzeigemodus) sowie Preset-/Szenen-Abruf.
- Eigener, abhängigkeitsfreier Paket-Codec (Header 0x55AA + Prüfsumme); die Befehlsbytes sind
  gegen das Bitfocus-Companion-Modul abgeglichen, die Prüfsummen per Unit-Test gesichert.
- Roh-Befehl-Sender für andere Modelle.
- Auch als Widgets in der OSC-Steuerung nutzbar – und damit am Handy.

### Netzwerk-Scanner

Findet Geräte im lokalen Netz und zeigt IP, Hersteller (aus der MAC-Adresse) und vermuteten
Gerätetyp.

- **Erkennung:** TCP-Sweep über typische AV-Ports (NovaStar 5200, RTSP/ONVIF, PJLink,
  HTTP/SSH/RDP …), ATEM per UDP-Handshake, Bonjour/mDNS-Namen.
- Gerätetyp und Symbol lassen sich überschreiben (an der MAC gemerkt), eigene Bezeichnungen
  vergeben.
- Web-Oberfläche eines Geräts öffnen oder seine IP an die NovaStar-Steuerung bzw. die
  NovaStar-Kacheln der OSC-Steuerung übergeben.

### DMX-Dip-Schalter

DMX-Startadresse in Dip-Schalter umrechnen und zurück (binär, 9 Schalter, 1–512).

## Bild & Projektion

### LED-Wall-Konfigurator

- **Wand:** Größe und Modultyp (Bestand: 496-2,0 / uS2+ / rX3ioBF) → Auflösung, 16:9-Einpassung,
  Gewicht, Strom und Ballast (LSU-Füße).
- **Verkabelung:** zeichenbare Signal- und Strompläne mit farbcodierten Ketten.
- **Curving-Planung** für uS2+: Vollkreis-Tabelle mit auswählbaren Kreisen, Kreissegment aus
  Sehne und Stichhöhe (auch als Start für den Segment-Builder), freier Segment-Builder und
  Squircle – je mit Draufsicht, Winkelverteilung und belegter Grundfläche B × T. Die
  Curving-Form bestimmt Modulzahl und Breite der Wand mit.
- **Vorlagen:** Planungen unter Namen speichern und wieder laden.
- **PDF-Projektdoku** (wahlweise Querformat) inklusive Draufsicht und Winkeln; Übergabe an die
  [Packliste](#packliste).

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
- **Sicher:** überschreibt nie (`…_2`), halbfertige Dateien werden entfernt; „Ergebnis prüfen“
  öffnet die fertige Datei in der Medien-Info.

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
  rein/raus oder Schwenk in vier Richtungen, sanft/mittel/stark. Gerechnet über `perspective`
  mit Subpixel-Genauigkeit – auch langsame Schwenks ruckeln auf der LED-Wand nicht. Die Vorschau
  zeigt Anfang und Ende genau so, wie sie gerechnet werden.
- **Nahtlose Schleife:** Das Ende blendet in den Anfang – vom letzten zum ersten Bild der Datei
  gibt es keinen Sprung; Musik blendet dann ebenfalls vom Ende in den Anfang.
- **Ausgabe:** Größe (HD, 4K, Hochkant, eigene, „Wie Player-Wand“, „Aus LED-Wall-Konfigurator“),
  Bildrate (auch 23,976/29,97/59,94), Format wie im Video-Konverter (H.264, H.265, ProRes, HAP,
  HAP Q) mit GPU-Encoder und CPU-Rückfall.
- **Ton:** Originalton der Videos (in Übergängen verblendet), eine Musikdatei (geschnitten bzw.
  wiederholt, Ein-/Ausblenden, Pegel), Lautheit nach EBU R128 am fertigen Mix.
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

Wrapper um yt-dlp.

- Video (MP4) oder Audio (MP3/M4A) mit Auflösungsdeckel; Warteschlange mit Fortschritt, Tempo und
  Restzeit (zwei Downloads parallel, „Alle abbrechen“); Muxing über das gebündelte ffmpeg.
- **Playlists werden erkannt:** Jede Adresse wird vor dem Laden geprüft. Ein Video startet sofort,
  eine Playlist zeigt ihre Einträge mit Dauer zur Auswahl – „Alle/Keine“, Umschalt-Klick für
  Bereiche; private oder gelöschte Einträge sind gesperrt, Unter-Playlists (z. B. Kanal-Reiter)
  lassen sich einzeln öffnen. Jeder gewählte Eintrag wird ein eigener Download, in
  Playlist-Reihenfolge; auf Wunsch in einem Unterordner mit dem Playlist-Namen und mit
  vorangestellter Nummer („03 - Titel“). Sehr lange Playlists: die ersten 500 Einträge.
- **Video in einer Playlist** (`watch?v=…&list=…`): nur dieses Video ist vorgewählt, „Nur dieses
  Video laden“ startet es direkt.
- yt-dlp lädt die App selbst als eigenständiges Programm (Prüfsumme wird verglichen) und prüft
  beim Start auf neue Versionen – abschaltbar, der Knopf **Prüfen** stößt es von Hand an.
- Nur freigegebene oder eigene Inhalte laden.

## Strom, Rigging & Aufbau

### Packliste

Material-Checkliste mit Mengen, Einheiten und Notizen – abhakbar, nach Kategorie gruppiert,
als Jobs speicherbar. Aus der LED-Wall-Konfiguration befüllbar (Module, Standfüße, Ballast,
Kabelmengen aus den gezeichneten Ketten); Export als PDF oder JSON.

### Stromlast & Absicherung

Leistung ↔ Strom (1∼/3∼) und wie viele Geräte auf einen 16-/32-/63-A-Stromkreis passen.

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

## Übergaben zwischen Werkzeugen

- **Medien-Info → Video-Konverter:** „Konvertieren“ übergibt die Dateien samt Zielsystem und
  Show-Raster. Zurück geht es mit „Quelle“, „Details“ oder „Ergebnis in Medien-Info prüfen“.
- **Video-Konverter / Medien-Info → Video-Generator:** „Zu einem Video zusammenfügen …“ übergibt
  die Dateien (Ordner werden dort aufgelöst). Das Ergebnis geht mit „In Player-Bibliothek
  übernehmen“ an den Video-Player (Wand-Auflösung und Einpassen wie dort eingestellt) und mit
  „In Medien-Info prüfen“ zur Kontrolle.
- **LED-Wall-Konfigurator → Packliste:** übernimmt Module, Standfüße, Ballast und Kabel und
  öffnet die Packliste im eigenen Fenster.
- **Netzwerk-Scanner → NovaStar:** IP eines Geräts in die NovaStar-Steuerung bzw. die
  NovaStar-Kacheln der OSC-Steuerung übernehmen.
- **Video-Player → OSC-Steuerung:** Die Anzeige-Kachel kann die Restzeit des laufenden Clips
  zeigen.

In der Kundenansicht sind die Sprünge in andere Werkzeuge ausgeblendet.

Weitere Übergaben sind geplant: [ROADMAP.md](ROADMAP.md#verzahnung).

## Wo die Daten liegen

Alles liegt im Benutzerordner der App: Windows `%APPDATA%\Mottulbox`, macOS
`~/Library/Application Support/Mottulbox`, Linux `~/.config/Mottulbox`.

| Pfad                    | Inhalt                                                                   |
| ----------------------- | ------------------------------------------------------------------------ |
| `settings.json`         | App-Einstellungen inkl. Zielordner, NDI und Timer-Ablauf                 |
| `library.db`            | Bibliothek von Manuals und Video-Player (SQLite)                         |
| `player-media/`         | konvertierte Player-Medien und Thumbnails                                |
| `player-uploads/`       | vom Handy hochgeladene Originale                                         |
| `vgen-cache/`           | Video-Generator: Zwischenstücke (begrenzt, älteste zuerst gelöscht), Vorschaubilder |
| `jingles/`              | Audiodateien des Jingle-Players                                          |
| `manuals/`              | importierte Handbücher                                                   |
| `bin/`                  | yt-dlp                                                                   |
| `Local Storage/`        | Werkzeug-Zustände (OSC-Projekte, LED-Wall-Planungen, Packlisten …)       |
| `avtoolbox-debug.log`   | Debug-Log – erste Anlaufstelle bei Problemen im gepackten Build          |
