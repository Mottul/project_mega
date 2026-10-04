# Werkzeuge

Alle 22 Werkzeuge im Detail, gegliedert wie auf dem Startbildschirm. Die Handy-Fernsteuerung hat
eine eigene Seite: [FERNSTEUERUNG.md](FERNSTEUERUNG.md).

- [Startbildschirm & Bedienung](#startbildschirm--bedienung)
- [Wiedergabe & Show](#wiedergabe--show) – Video-Player, Jingle-Player, Stage-Timer & Uhr,
  Testbildgenerator
- [Steuerung](#steuerung) – OSC-Steuerung, NovaStar-Steuerung, Netzwerk-Scanner,
  DMX-Dip-Schalter
- [Bild & Projektion](#bild--projektion) – LED-Wall-Konfigurator, Projektionsverhältnis,
  Kameraobjektiv, Beamer-Lumen
- [Medien & Bibliothek](#medien--bibliothek) – Video-Konverter, Medien-Info,
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
- **Was gerade läuft**, zeigt die Kachel: laufende Konvertierungen, Downloads, Timer,
  Player-Ausgabe – und ob die Handy-Fernsteuerung des Werkzeugs aktiv ist. Der Handy-Knopf oben
  zeigt den QR-Code der [Fernsteuer-App](FERNSTEUERUNG.md).
- **Eigene Fenster:** Jedes Werkzeug lässt sich zusätzlich in einem eigenen Fenster öffnen
  („In neuem Fenster öffnen“ an der Kachel oder in der Kopfzeile) – etwa Video-Player, Jingles
  und Rechner gleichzeitig. Ist ein Werkzeug in mehreren Fenstern offen, zeigen alle denselben
  Stand; Änderungen kommen nach spätestens einer halben Sekunde in den anderen Fenstern an.
- **Kundenansicht:** „Als Kundenansicht starten“ in der Kopfzeile eines Werkzeugs sperrt es
  sofort und öffnet es auch bei jedem weiteren App-Start direkt – ohne „Zurück“ und ohne heikle
  Einstellungen (der Video-Player verbirgt z. B. Wand/Auflösung, Encoder, Lautheit und Idle-Bild,
  Medien-Info und Video-Konverter die Sprünge in andere Werkzeuge). **Strg+Shift+K** verlässt die
  Kundenansicht und hebt den Autostart auf.
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
  vor Gebrauch geprüft, sonst übernimmt libx264.
- **Über den gemeinsamen Konvertierungs-Kern** (siehe [Video-Konverter](#video-konverter)):
  Deinterlace, HDR → SDR, konstante Bildrate, Drehung von Handyvideos und anamorphe Pixel werden
  richtig eingerechnet; passendes H.264 wird nur umverpackt. Bilder werden mit frei wählbarer
  Standzeit gebacken, GIFs zu Loop-Videos. Importe haben eine eigene Spur in der Warteschlange und
  warten nie auf einen Konverter-Stapel.
- **Lautheit angleichen** (optional, EBU R128): Ziel −23, −16 oder −14 LUFS – gilt für neu oder
  erneut konvertierte Medien.
- **Ausgabe & Wand** (erste Sektion im Seiten-Panel): Ausgabe-Monitor wählen, Vollbild öffnen
  und die Wand-Auflösung festlegen – per Eingabe, Vorgabe oder „von Monitor“.
- **Vollbild-Ausgabe** mit doppelt gepuffertem Player: nahtlose Übergänge, wahlweise Schnitt oder
  echtes Überblenden (das alte Video läuft weiter, Ton blendet mit). Shuffle ist lückenlos – das
  nächste Zufallsmedium wird vorab geladen.
- **Bedienung:** Play/Pause, Skip, Seek, Loop, Shuffle, Stumm; Playlist per Drag & Drop,
  gespeicherte Playlists als Tabs.
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
- **Am Ende:** stehen bleiben, rot blinkend überziehen oder automatisch zum nächsten Abschnitt.
- **Live:** ±1 Minute, Nachrichten an die Bühne (auf Wunsch blinkend, mit Schnellnachrichten).
- **Vollbild-Anzeige** auf wählbarem Monitor, synchron zur Vorschau – der Timer läuft im
  Hauptprozess. Alternativ eine große Uhr mit Sekunden.
- **NDI-Ausgabe** (optional): [NDI.md](NDI.md). **Handy-Fernsteuerung**, die auch bei
  geschlossenem Werkzeug funktioniert.
- **Ablauf bleibt erhalten:** Abschnitte, Schwellen, Ende-Verhalten und Anzeige merkt sich die App
  über Neustarts – auch wenn der Timer nur vom Handy aus bedient wurde.

### Testbildgenerator

- **Muster:** Gitter/Module, Geometrie, Farbbalken, Graustufen, Siemensstern, Konvergenz.
- **Mapping-Testbild** im MadMapper-Stil: Raster, Eckmarken, Farb- und Graufelder, Spektrum,
  laufende Uhrzeit, eigene Texte und Farben.
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
- **Sicher:** überschreibt nie (`…_2`), halbfertige Dateien werden entfernt; „Ergebnis prüfen“
  öffnet die fertige Datei in der Medien-Info.

**Der gemeinsame Konvertierungs-Kern** – genutzt von Video-Konverter, Player-Import und
Testbild-Export – entscheidet je Datei:

- Drehung/Spiegelung und anamorphe Pixel fest einrechnen,
- Deinterlace (25i → 50p), variable → konstante Bildrate,
- **Show-Raster:** 29,97 ↔ 30 und 23,976 ↔ 24 per minimaler Tempo-Anpassung statt Bildsprung,
- HDR → SDR, Alpha automatisch (HAP Alpha/ProRes 4444) bzw. sauber auf Schwarz,
- Größe: Original, höchstens oder genau – mit Letterbox, Füllen, Blur oder Strecken; gerade bzw.
  durch 4 teilbare Maße,
- Farbmatrix und Range, Ton (48 kHz, AAC/PCM, Stereo, Lautheit),
- passendes H.264 nur umverpacken.

Die Warteschlange hat eine eigene Spur für den Player. Geprüft mit über 60 echten
Konvertierungen (Kontrolle per ffprobe).

### Medien-Info

Video- und Audio-Eckdaten per ffprobe: Auflösung, Bildrate, Codec, Bitrate, Ton, Timecode …

- **Analyse** im Hauptprozess mit Timeout, lesbaren Fehlermeldungen und Cache; Ordner werden
  rekursiv eingelesen (ohne `._`- und Systemdateien).
- **Tiefenanalyse** (optional): Keyframe-Abstand/GOP, VFR-Nachweis, Scan-Typ, HDR10-Metadaten.
- **Show-Check:** Ampel-Hinweise je Prüfprofil (Zielsystem, Show-Raster, Datenträger).
- **Playlist-Vergleich** mit hervorgehobenen Abweichungen.
- **Kopieren** als Steckbrief, Kurzzeile oder Tabelle; **Export** als CSV (für Excel) oder JSON.
- **„Konvertieren“** übergibt die Dateien samt Zielsystem und Show-Raster an den Video-Konverter.

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
| `jingles/`              | Audiodateien des Jingle-Players                                          |
| `manuals/`              | importierte Handbücher                                                   |
| `bin/`                  | yt-dlp                                                                   |
| `Local Storage/`        | Werkzeug-Zustände (OSC-Projekte, LED-Wall-Planungen, Packlisten …)       |
| `avtoolbox-debug.log`   | Debug-Log – erste Anlaufstelle bei Problemen im gepackten Build          |
