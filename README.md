# MegaToolBox (project_mega)

Plattformübergreifende Desktop-App (Windows / macOS / Linux), die kleine AV-Arbeitswerkzeuge
unter einem Dach bündelt und über einen Launcher auswählbar macht. Läuft **offline**. Tools lassen
sich **in eigenen Fenstern parallel** öffnen (z.B. Video-Player + Jingles + Rechner gleichzeitig),
und ein Tool kann als **gesperrte Kundenansicht** beim Start direkt angezeigt werden (z.B. nur der
Video-Player ohne Konfiguration; Verlassen mit Strg+Shift+K). Der Homescreen zeigt je Tool an, was
gerade läuft (Konvertierungen, Downloads, Timer, Player-Ausgabe).

Enthaltene Werkzeuge (Runde 1):

- **HAP-Konverter** – Videos im Batch nach HAP / HAP Q / HAP Alpha konvertieren (z.B. für Resolume).
- **Manuals-Bibliothek** – Geräte-Handbücher (PDF) importieren und per **Volltextsuche** offline durchsuchen.

Tech-Stack: **Electron + React + TypeScript** (electron-vite), Tailwind CSS,
`better-sqlite3` (FTS5), `pdfjs-dist`, gebündeltes `ffmpeg`.

---

## Voraussetzungen

- **Node.js `^20.19` oder `≥ 22.12`** und npm (von vite 7 vorgegeben; `engine-strict=true` in
  `.npmrc` erzwingt es – ein zu altes Node bricht den Install mit klarer Meldung ab statt
  später kryptisch).
- **Kein C++-Compiler nötig.** Das einzige native Modul (`better-sqlite3`) wird beim `npm install`
  **nicht kompiliert**, sondern als geprüftes **Prebuild** für die Electron-ABI geladen
  (`postinstall` → `scripts/rebuild-native.mjs`).
  - _Fallback_ (nur falls für eine exotische Plattform/Arch kein Prebuild existiert): lokale
    Build-Werkzeuge – Windows „Desktop development with C++" (VS Build Tools) + Python 3,
    macOS `xcode-select --install`, Linux `build-essential python3`. Dann `npm run rebuild:native`.

---

## Installation & Entwicklung

```bash
git clone <repo-url>
cd project_mega

# Abhängigkeiten installieren. Der postinstall erledigt OHNE Compiler:
#   1. better-sqlite3-Prebuild für die Electron-ABI laden
#   2. die Electron-Laufzeit-Binary laden (in reinem Node – funktioniert auch in
#      gehärteten Umgebungen, die electrons eigenen install.js blockieren)
npm install

# App im Entwicklungsmodus starten (Hot Reload)
npm run dev

# Nur für den HAP-Konverter: einmalig HAP-fähiges ffmpeg holen
# (ohne dies zeigt das Tool eine Hinweis-Warnung; im fertigen Paket ist es enthalten)
npm run ff:fetch
```

> Hinweis: `npm run ff:fetch` lädt ein **HAP-fähiges** ffmpeg (mit libsnappy) aus offiziellen
> Quellen – BtbN (Windows + Linux), evermeet.cx (macOS). Die gängigen npm-ffmpeg-Pakete
> enthalten **kein** HAP. Die Binaries landen in `resources/ffmpeg/<os>/` und sind aus dem Git
> ausgenommen.

---

## Sicherheit (npm / supply-chain)

Angesichts der jüngsten npm-Angriffe (selbstreplizierende Worms über gekaperte Maintainer-Tokens,
bösartige Lifecycle-Scripts, Typosquatting) ist dieses Projekt bewusst defensiv aufgesetzt:

- **`package-lock.json` ist eingecheckt** – mit sha512-Integrity je Paket.
- **`better-sqlite3` ist exakt gepinnt** (`12.8.0`) und bewusst **nicht** die brandneueste Version
  („Cooldown" – kompromittierte Releases fallen meist in den ersten Tagen auf).
- **`.npmrc`**: `save-exact=true` (neue Pakete werden exakt gepinnt), `engine-strict=true`.
- **Schlanker Install-Baum:** `electron-builder` ist **keine** Standard-Abhängigkeit, sondern wird
  beim Paketieren on-demand via `npx` geladen. Dadurch bleibt die gesamte
  `node-gyp` / `tar` / `app-builder`-Kette aus `npm ci` heraus. Der native Rebuild läuft über
  `prebuild-install` (Prebuild-Download) statt über node-gyp.
- Die App läuft offline.

**Empfohlene Installation:**

```bash
# installiert exakt aus dem Lockfile und verifiziert die Integrity-Hashes
npm ci
npm audit signatures   # optional: Registry-Signaturen prüfen
```

> `npm audit` meldet aktuell **0 Findings**. Erreicht durch: `electron-builder` aus den
> Standard-Deps entfernt (eliminiert die `node-gyp`/`tar`-Kette), Electron auf eine **unterstützte**
> Version (40.x statt EOL-33), und das Dev-Tooling (`vite`/`electron-vite`) auf aktuelle Stände.

**Maximal vorsichtig** (blockiert den häufigsten Vektor – Install-Scripts beliebiger Transitive-Deps):

```bash
npm ci --ignore-scripts   # kein Paket-Script läuft automatisch
npm run rebuild:native    # better-sqlite3-Prebuild für die Electron-ABI (reines Node)
npm run electron:bin      # Electron-Laufzeit-Binary laden (reines Node; sonst "Electron uninstall")
```

> Beide Skripte laufen in reinem Node und laden nur geprüfte Prebuilds (kein Compiler, keine
> Transitive-Install-Scripts). `npm run electron:bin` umgeht bewusst electrons eigenen
> `install.js` – der wird von manchen Security-Wrappern abgefangen.

> Bei `--ignore-scripts` läuft auch Electrons eigener postinstall **nicht** – ohne den manuellen
> `electron/install.js`-Schritt fehlt die Electron-Binary und `npm run dev` bricht mit
> **„Electron uninstall"** ab. Die beiden Folge-Befehle laden nur geprüfte Prebuilds (kein Compiler).

> Tipp: `npm install <pkg> --before 2026-05-01` installiert nur Versionen vor einem Datum –
> praktisch, um brandneue (potenziell kompromittierte) Releases zu meiden.

---

## Build & Paketierung

```bash
# Typecheck + Bundles bauen
npm run build

# Installer für das aktuelle Betriebssystem erzeugen
#   - holt ffmpeg (ff:fetch), baut, und ruft electron-builder on-demand via npx
#   - der erste Lauf lädt electron-builder einmalig in den npx-Cache (nicht in node_modules)
npm run package
```

Ergebnis-Installer liegen unter `dist/`:

| OS      | Target      |
| ------- | ----------- |
| Windows | NSIS `.exe` |
| macOS   | `.dmg`      |
| Linux   | AppImage    |

> Die fertig gepackte (noch nicht installierte) App liegt zusätzlich unter
> `dist/win-unpacked/` (bzw. `*-unpacked/`) und ist von dort direkt startbar – praktisch
> zum Testen ohne Installation.

**Code-Signierung ist absichtlich deaktiviert** (`win.signAndEditExecutable: false` in
`electron-builder.yml`). Sonst würde electron-builder **jede** `.exe` signieren wollen (auch die
gebündelten `ffmpeg.exe`/`ffprobe.exe`) und dafür das `winCodeSign`-Paket laden, dessen Entpacken
auf Windows an macOS-Symlinks scheitert („Dem Client fehlt ein erforderliches Recht"). Ein
Zertifikat ist für den privaten Gebrauch nicht nötig; Kosten sind nur fehlende
Icon-/Versions-Metadaten in der `.exe` (kosmetisch).

> `npm run ff:fetch` lädt ffmpeg nur, wenn es noch nicht in `resources/ffmpeg/<os>/` liegt
> (mit `--force` erzwingbar) – wiederholte `npm run package`-Läufe sind dadurch schnell.

> Plattform-Hinweis: Installer baut man jeweils **auf dem Zielbetriebssystem**, weil `ff:fetch`
> und der native Rebuild plattformspezifisch sind. Für macOS liefert evermeet getrennte
> x64/arm64-Binaries (für Universal-Builds beide nötig).

---

## Projektstruktur

```
src/
├── main/                     # Electron Main-Prozess
│   ├── index.ts              # App-Lifecycle, Fenster (sichere Defaults), Protocol
│   ├── ipc/                  # IPC-Handler (dialog, ffmpeg, manuals, player) + Registry
│   └── services/
│       ├── db.ts             # SQLite (better-sqlite3) + FTS5-Migrationen + media_items
│       ├── ffmpeg/           # ffmpegPath, probe, hapEncoder, jobManager (Queue)
│       ├── manuals/          # manualsService, pdfText (pdfjs)
│       └── player/           # mediaLibrary, encoder (Fit/GPU), convertManager, playerState, playerWindow
├── preload/index.ts          # contextBridge -> window.api (typisiert)
├── shared/                   # ipc-contracts.ts + types.ts (single source of truth)
└── renderer/src/
    ├── launcher/             # Launcher + ToolHost (Router)
    ├── components/ui/        # UI-Primitives (Button, Card, …)
    └── tools/
        ├── registry.ts       # ◀ EINZIGE Stelle zum Eintragen neuer Tools
        ├── hap-converter/
        ├── manuals/
        ├── test-patterns/
        └── video-player/     # Steuer-UI (VideoPlayer) + Vollbild-Ausgabe (PlayerOutput)
```

### Ein neues Tool hinzufügen

1. Ordner unter `src/renderer/src/tools/<mein-tool>/` anlegen mit einer Komponente und einer
   `index.ts`, die ein `ToolModule` exportiert (siehe `tools/hap-converter/index.ts`).
2. In `src/renderer/src/tools/registry.ts` **eine Zeile** ergänzen:
   ```ts
   export const tools: ToolModule[] = [hapConverterTool, manualsTool, meinTool]
   ```
3. Braucht das Tool Main-Prozess-Logik: Kanäle in `src/shared/ipc-contracts.ts` ergänzen,
   Handler in `src/main/ipc/` registrieren.

---

## NPM-Skripte

| Skript              | Zweck                                                        |
| ------------------- | ------------------------------------------------------------ |
| `npm run dev`       | Entwicklungsmodus (electron-vite, Hot Reload)                |
| `npm run build`     | Typecheck + Produktions-Bundles (`out/`)                     |
| `npm run typecheck`     | TypeScript-Prüfung (main/preload/shared **und** renderer)    |
| `npm run ff:fetch`      | HAP-fähiges ffmpeg holen (`--all` / `--platform <os>` mögl.) |
| `npm run rebuild:native`| better-sqlite3-Prebuild für die Electron-ABI laden (kein Compiler) |
| `npm run electron:bin`  | Electron-Laufzeit-Binary laden (reines Node; Fix für „Electron uninstall") |
| `npm run package`       | Installer fürs aktuelle OS (inkl. ff:fetch, electron-builder via npx) |
| `npm run start`         | Produktions-Build lokal previewen                            |

---

## Status

**Umgesetzt:**

- **Fundament** – electron-vite (main/preload/renderer), sichere Fenster-Defaults, typisierte
  IPC-Brücke, Tool-Modulsystem, Launcher mit Suche, Gold-Akzent (#ffce2c) auf kühlem Dark-Theme,
  App-Icon, **0 npm-Vulnerabilities in den Laufzeit-Abhängigkeiten**, schlanker Install ohne Compiler
  (Prebuilds). **Unit-Tests (Vitest)** für die Rechenkerne und eine **Mini-CI** (Typecheck + Tests +
  Build je Push, Node 20/22).
- **HAP-Konverter** – Batch nach HAP/HAP Q/HAP Alpha, gebündeltes ffmpeg, Parallel + Kompressor,
  Auto-Padding auf ×4-Maße. End-to-end getestet.
- **Manuals-Bibliothek** – PDF-Import (SHA-256-Dedup), FTS5-Volltextsuche mit aufklappbaren
  Trefferboxen, **Kategorien** (Filter), In-App-PDF-Viewer (Scroll, Zoom/Pinch, Seiten-Sprung,
  **Suche im PDF**).
- **Testbildgenerator** – Muster (Gitter/Module, Geometrie, Farbbalken, Graustufen, Siemensstern,
  Konvergenz), **bewegte** Muster (Pixelcheck-Loop, Scroll, Timecode), **Vollbild-Ausgabe** auf
  gewähltem Monitor (pixelgenau, live), PNG- + Video-Export, **Presets**.
- **Video-Player / LED-Wall-Player** – Playlist-Player für LED-Wände/Beamer. Medien werden auf die
  **Wand-Auflösung eingebacken** (Fit-Modi **Blur-Fill / Schwarze Ränder / Strecken**) und nach
  **H.264/MP4** konvertiert (Chromium dekodiert das hardwarebeschleunigt; **GPU-Encoder** wie
  NVENC/QSV/AMF/VideoToolbox werden erkannt **und validiert**, sonst libx264-Fallback). Bilder
  werden gebacken (freie Standzeit), GIFs zu Loop-Videos. **Vollbild-Ausgabe** auf gewähltem
  Monitor mit **doppelt gepuffertem** HTML5-Player (nahtlose Übergänge), wahlweise **Schnitt oder
  echtes Overlap-Überblenden** zwischen Medien (das alte Video läuft durch die Blende weiter,
  mit Audio-Crossfade); **Shuffle ist gapless** (das nächste Zufallsmedium wird vorab bestimmt
  und vorgeladen). Transport
  (Play/Pause/Skip/**Seek**/**Loop**/**Shuffle**/Stumm), **Playlist** mit Drag&Drop, verwaltete
  Bibliothek (Thumbnails, Datei-**Drag&Drop**-Import, Listen-/Kachelansichten) und eine **In-App-Vorschau**
  (treibt die Wiedergabe auch ohne geöffnetes Ausgabefenster – praktisch ohne zweiten Bildschirm).
  **Fernsteuerung per Tablet/Handy** über einen eingebetteten, dependency-freien Webserver
  (mobile Steuerseite + Live-Sync via SSE, LAN, einschaltbar, mit **QR-Code**). Dazu
  **gespeicherte Playlists** (als Tabs), **Idle-/Fallback-Testbild** auf der Ausgabe (nutzt den
  vorhandenen Generator), **Batch-Reconvert** bei Auflösungswechsel und optionale **Lautheits-
  Angleichung (EBU R128 / ffmpeg loudnorm)** beim Einbacken. Adaptiert den bestehenden
  „LED Wall Player V4" (Python/mpv) in die Electron/React-Suite – nutzt das
  Multi-Monitor-Ausgabefenster und das gebündelte ffmpeg.
- **LED-Wall-Konfigurator** – Wandgröße + Modultyp (Bestand: 496-2,0 / uS2+ / rX3ioBF) ->
  Auflösung, **16:9-Einpassung**, Gewicht, Strom, **Ballast-Rechnung** (LSU-Füße); **zeichenbare
  Signal-/Strom-Verkabelungspläne** (farbcodierte Ketten), **Curving-Planung** für uS2+
  (Vollkreis-Tabelle mit **auswählbaren Kreisen**, Kreissegment aus Sehne+Stichhöhe – auch als
  Startpunkt **in den Segment-Builder übernehmbar** –, freier Segment-Builder, Squircle; je mit
  Draufsicht-SVG, Winkelverteilung und **belegter Grundfläche B×T**). Die Curving-Form bestimmt
  Modulzahl/Breite der Wand mit (Sehne/Squircle-Breite = Wandbreite, Vollkreis gibt seine Größe
  vor) und wandert **inkl. Draufsicht und Winkeln in die PDF-Projektdoku**. Konfiguration bleibt
  über App-Neustarts erhalten. Ersetzt den bisherigen Einzeldatei-HTML-Konfigurator (und behebt
  dessen Messfehler bei der „erreichten Stichhöhe").
- **Jingle-Player** – kurze Audios (Auftrittsmusik/Stinger) auf **belegbaren Pads**, mit
  **Edit-/Live-Modus**: in Live spielt ein Klick/Hotkey (1–9, q…) ab, im Edit-Modus wählt der Klick
  ein Pad aus und seine Einstellungen erscheinen im **Seiten-Panel** (wie in den anderen Tools).
  Je Pad Farbe/Lautstärke/**Loop**/Modus (One-Shot oder Toggle) und **Fade-Out**. Je Pad ein
  **Start-/Stopp-Ausschnitt** mit **Waveform-Editor** (Datei wird per Web Audio dekodiert,
  **zoombar**, Marker **millisekundengenau** ziehbar, Vorschau-Wiedergabe mit Abspielkopf,
  **„Stille trimmen"** schneidet Pausen am Anfang/Ende automatisch weg). **Audio-Ausgabegerät wählbar** (`setSinkId` →
  Interface/Pult statt Laptop-Lautsprecher), **Solo-Modus** (nur einer gleichzeitig), großer
  **Fade-All-Stopp** (Esc), mehrere **Sets/Bänke**. **Fernsteuerung per Handy/Tablet** über einen eingebetteten, dependency-
  freien Webserver (Pad-Raster + Live-Status via SSE, LAN, mit QR-Code; der Jingle-Tab spielt das
  Audio). Dateien werden nach userData kopiert und über das `jingle://`-Protocol abgespielt (kein
  file://-Zugriff); Belegung übersteht App-Neustarts.
- **YouTube-Downloader** – Wrapper um **yt-dlp** (Video MP4 / Audio MP3 / M4A, Auflösungsdeckel),
  Queue mit **Fortschritt/Speed/ETA**, Muxing über das gebündelte ffmpeg. yt-dlp wird bei Bedarf
  als **eigenständige Binary nach userData/bin geladen** und per Knopf **aktualisiert** (YouTube
  ändert ständig etwas). Hinweis im UI: nur freigegebene/eigene Inhalte laden.
- **Packliste** – Material-Checkliste mit Mengen/Einheiten/Notizen, abhakbar, gruppiert nach
  Kategorie. **Aus der LED-Wall-Konfiguration befüllbar** (Module, Standfüße, Ballast und
  Kabelmengen aus den gezeichneten Ketten), Export als PDF. Übersteht App-Neustarts.
- **Stage-Timer & Uhr** – Sprechzeit-Timer mit **mehreren Abschnitten** (laufen nacheinander),
  **Farbwarnung nach Restzeit** (weiß → gelb → rot, Schwellen einstellbar), wählbarem
  **Ablauf-Verhalten** (stehen bleiben / Überziehung rot blinkend / automatisch weiter),
  **±1-Minute-Korrektur live**, **Nachrichten an die Bühne** (mit Blink-Option und
  Schnellnachrichten) und **Vollbild-Anzeige** auf gewähltem Monitor – synchron zur Vorschau,
  da der main-Prozess autoritativ tickt. Alternativ **große Uhr mit Sekundenanzeige**.
- **OSC-Steuerung** – frei belegbares **Steuerpult** für MadMapper & Co.: Kacheln vom Typ **Fader**
  (horizontal/vertikal), **Knopf** (Poti oder Endlos-Encoder), **Taster, Schalter, XY-Pad, Farbe,
  Anzeige/Meter, Label, Auswahl (1-aus-n)** und **Bank** (umschaltbar Taster/Schalter/Knopf, Spalten
  einstellbar) auf einem **feinen, im Edit-Modus sichtbaren Raster** – per
  Drag **frei positionierbar** (Kacheln **überlappen nicht**: beim Loslassen rückt eine Kachel auf die
  nächste freie Stelle) und **per Eckgriff in der Größe** veränderbar (mit **Mindestgrößen je
  Typ**, damit Regler/Pads nicht verschwinden), je mit eigener **OSC-Adresse** (gleiche Typen werden
  beim Hinzufügen automatisch durchnummeriert). Eine **Geräte-Vorschau**
  (Handy/Tablet, dreh­bar) zeigt die Fläche im **Geräterahmen**. Wie der Jingle-Player mit
  **Sets** (mehrere gespeicherte Setups als Tabs in der Kopfzeile) und **Edit-/Live-Umschalter
  rechts in der Kopfzeile**: im Edit-Modus wählt der Klick eine Kachel und ihre Einstellungen
  erscheinen im **Seiten-Panel**, im Live-Modus sendet die Kachel. **Fader, XY-Pad und Farb-Regler
  ziehen relativ** ab der aktuellen Position (springen nicht auf den Klickpunkt); die **Farb-Kachel**
  zeigt alle Regler dauerhaft (Hue, R/G/B und **Pipette**/EyeDropper). Gesendet wird über einen **UDP-Socket im
  main-Prozess** (`node:dgram`) mit **eigenem, abhängigkeitsfreiem OSC-Codec**; **Host/Ports** sind
  einstellbar (MadMapper-Standard out 8000 / in 9000). Optional **Feedback empfangen** (lauscht auf
  dem Eingangs-Port und **spiegelt** Werte zurück in passende Kacheln) samt **OSC-Monitor** und
  **Learn-Modus** (die nächste eingehende Adresse wird ins gewählte Widget übernommen).
  **Fernsteuerung per Handy/Tablet**: ein eingebetteter Webserver (nur im LAN, ohne Passwort, wie beim
  Jingle-Player) zeigt dieselbe Oberfläche im Browser – Tippen/Ziehen dort löst den **OSC-Versand am
  Rechner** aus (QR-Code zum Öffnen); **Sets lassen sich auch am Handy/Tablet umschalten**. Sets und
  Oberfläche überstehen App-Neustarts.
- **NovaStar-Steuerung** (Vorabversion) – steuert einen **NovaStar-Prozessor** (NovaPro UHD Jr & Co.)
  über **TCP 5200** mit eigenem, abhängigkeitsfreiem **Paket-Codec** (Header 0x55AA + Prüfsumme).
  **Helligkeit** und **Fade-to-Black** als zeitgesteuerte Helligkeits-Rampe (es gibt keinen echten
  Blackout-Befehl), plus **Roh-Befehl-Sender** und editierbares Register zum Verifizieren der exakten
  Frames am Gerät. _(v0: Transport/Framing/FTB gesichert; Befehls-Bytes am echten NovaPro zu
  bestätigen.)_
- **Rechner-Tools** – kleine Helfer für den Event-Alltag: **Kreisrechner**, **Projektionsverhältnis**
  (Throw Ratio / Objektivwahl), **Kameraobjektiv** (Bildausschnitt bei Personen aus
  Brennweite/Sensor/Telekonverter, mit Visualisierung des sichtbaren Anteils),
  **Beamer-Lumen** (Bedarf aus Bildgröße + Umgebungslicht),
  **DMX-Dip-Schalter**, **Stromlast & Absicherung** (1∼/3∼, Geräte pro Stromkreis),
  **Audio-Delay & SPL** (Laufzeit aus Distanz, Pegelabfall über Entfernung), **Rigging-Last**
  (Auflagerkräfte einer Traverse auf 2 Punkten + Bridle-Strangkräfte nach Anschlagwinkel, mit
  Warnstufen – Richtwerte, ersetzt keinen Sachkundigen) und **Timecode-Rechner** (SMPTE-Timecode ↔
  Frames ↔ Echtzeit inkl. **Drop-Frame** 29,97/59,94, Dauer zwischen In/Out). Berechnete Werte
  sind farblich markiert (Gold = Ergebnis), Kernaussagen als hervorgehobene Ergebniszeilen.
- **PDF-Export** – LED-Wall-Doku und Packliste werden über ein verstecktes Fenster (`printToPDF`)
  gespeichert; die LED-Wall-Doku wahlweise im **Querformat**.
- **Theme** – umschaltbarer **Hell-/Dunkelmodus** (System/Hell/Dunkel) in allen Werkzeugen.

## Roadmap

- **OSC-Steuerung – Ausbaustufen**: **MadMapper-Vorlagen** (Surfaces/Medien/Cues),
  **tool-übergreifende OSC-Trigger** (z. B. aus Jingle-/Timer-/Video-Player) und **„Restzeit aus
  OSC-Position"** – ein Anzeige-Kachel-Modus, der aus der eingehenden MadMapper-Position (0–1) und
  einer eingetragenen Clip-Dauer die verbleibende Zeit als **mm:ss** berechnet und auf einem Monitor
  zeigt (MadMapper liefert nur die Position, keine Restzeit). _(Erledigt: Learn-Modus, Widgets
  Auswahl/1-aus-n + Bank Taster/Schalter/Knopf + Knopf/Endlos-Encoder + Anzeige/Meter + Label,
  Fader-Ausrichtung, Raster-Spalten, Auto-Nummerierung, Handy-Hue, Set-Wechsel am Handy.)_
- **Weitere OSC-Bedienelemente** (vorgemerkt): **Auto-Center-Fader/Wippe** (federt nach dem Loslassen
  in die Mitte – Jog/PTZ/Speed), **Tap-Tempo/BPM** (aus mehreren Taps ein Tempo mitteln),
  **Set-Wechsel-Button** (per Tipp ein anderes Set aktivieren) und **Farb-Regler horizontal/vertikal**
  umstellbar.
- **NovaStar-Steuerung – Ausbau**: Befehls-Bytes am echten **NovaPro UHD Jr** bestätigen, dann
  **Preset-Abruf**, **Testbild** und **Display-Mode** ergänzen (Befehlssatz aus dem offenen
  Companion-Modul `novastar-controller`); optional weitere Modelle (VX-Serie, MCTRL).
- **Logo-Overlay** im Video-Player (PNG mit Alpha, Größe/Position/Deckkraft, als Overlay – nicht
  eingebacken).
- **Stecker-/Kabel-Kompendium** mit Pin-Layouts, Steckertypen und technischen Daten (evtl. in der
  Manuals-Bibliothek).
- **Teleprompter** im Stage-Timer (scrollender Text auf dem Referentenmonitor).
- **ArtNet/sACN-Tester** (DMX über Netzwerk senden + Node-Discovery) und **DMX-Universum-Planer**
  (automatische Adressvergabe, Kollisions-Check) – verzahnt mit dem Dip-Schalter-Rechner.
- Kleinere Event-Rechner: **Edge-Blend** (Beamer-Softedge), **Video-Datenrate/Dateigröße**,
  **Funkfrequenz-Planer**, **Sonnenstand/Dämmerung** für Open-Air.
- **Verbesserungen bestehender Tools**: **Audio-Test-Töne** im Testbildgenerator (Sinus/Rosa/Sweep,
  Kanal-ID), **Ducking + MIDI-Pads** im Jingle-Player, **OCR** für gescannte PDFs in der
  Manuals-Bibliothek, **Prozessor-Presets** (Novastar/Brompton) im LED-Wall-Konfigurator.
  _(Erledigt: Loudness-Normalisierung EBU R128 beim Einbacken im Video-Player.)_
- **Neue Rechner (klein)**: **IP-/Subnetz-Rechner** (Dante/NDI/AV-over-IP), **Gel-/Farbfilter-
  Konverter** (Lee↔Rosco↔RGB), **Spannungsabfall/Kabelquerschnitt** (an die Stromlast angedockt).
- **Mobile Manuals-Companion** (Idee) – die Manuals-Bibliothek ließe sich als Tablet-/Handy-App
  (Capacitor) umsetzen; HAP/Testbilder bleiben Desktop (siehe Diskussion).
