# Mottulbox

Desktop-App für Veranstaltungstechnik (Windows, macOS, Linux): 23 AV-Werkzeuge unter einem Dach –
vom Video-Player für LED-Wände über Jingles, Stage-Timer und OSC-Pult bis zu Rechnern für Strom,
Rigging und Projektion. Läuft offline – Internet braucht nur der YouTube-Downloader.

- **Parallel arbeiten:** Große Werkzeuge lassen sich auch im eigenen Fenster öffnen, die Rechner
  öffnen sich immer in einem eigenen, passend kleinen Fenster; der Startbildschirm zeigt, was
  gerade läuft, und ordnet Favoriten in eigenen Kategorien.
- **Show-tauglich:** Vollbild-Ausgaben auf wählbarem Monitor (oder als Fenster, zweimal Esc
  schließt), optional NDI, eine Fehlergrenze je
  Werkzeug und eine gesperrte Kundenansicht (Start direkt in einem Werkzeug, Strg+Shift+K beendet
  sie).
- **Handy als Fernbedienung:** Video-Player, Jingles, OSC-Pult und Stage-Timer im WLAN steuern.
- **Ein Konvertierungs-Kern:** Video-Konverter, Player-Import und Testbild-Export nutzen dieselbe
  Analyse und dieselben Korrekturen (Deinterlace, HDR → SDR, Bildraten-Raster, anamorphe Pixel …).

## Werkzeuge

**🎬 Wiedergabe & Show**

- **Video-Player** – Playlist-Player für LED-Wände/Beamer: Medien auf Wand-Auflösung eingebacken,
  Vollbild-Ausgabe mit Überblenden, NDI, Handy-Fernsteuerung mit Upload.
- **Jingle-Player** – Audio-Pads mit Waveform-Editor, Sets, wählbarem Ausgabegerät,
  Handy-Fernsteuerung.
- **Stage-Timer & Uhr** – Sprechzeit-Timer mit Abschnitten, Farbwarnung, Bühnen-Nachrichten,
  Vollbild-Anzeige, NDI, Handy-Fernsteuerung.
- **Testbildgenerator** – statische, bewegte und Mapping-Testbilder, pixelgenaue Vollbild-Ausgabe,
  PNG-/Video-Export; Testtöne (Sinus, Sweep, Rauschen, Metronom, Kanal-Kennung, Polarität) und
  AV-Sync-Messung (Blitz + Piep).

**🎛️ Steuerung**

- **OSC-Steuerung** – frei belegbares Steuerpult (Fader, Taster, XY, Farbe, Bank …) mit
  Feedback/Learn, NovaStar-Kacheln und Handy-Fernsteuerung.
- **NovaStar-Steuerung** – LED-Prozessor über TCP 5200: Helligkeit, Fade-to-Black,
  Blackout/Freeze, Presets.
- **ATEM-Steuerung** – Blackmagic-ATEM-Mischer über das Netzwerk: Programm, Vorschau, Cut, Auto, Hebel,
  Fade to Black, Keyer, Makros, Media-Player und AUX, mit Rückmeldung vom Mischer und Probebetrieb
  ohne Gerät.
- **Netzwerk-Scanner** – Geräte im LAN finden (IP, Hersteller, Typ): ATEM, PTZ-Kameras, NovaStar
  u. a.
- **DMX-Dip-Schalter** – DMX-Startadresse ↔ Dip-Schalterbild.

**📽️ Bild & Projektion**

- **LED-Wall-Konfigurator** – Auflösung, Gewicht, Strom, Ballast, Verkabelungspläne,
  Curving-Planung, PDF-Doku; Planungen als Projektdatei (`.mottul`) speichern und öffnen.
- **Projektionsverhältnis**, **Kameraobjektiv**, **Beamer-Lumen** – Objektiv-, Bildausschnitt-
  und Lumen-Rechner.

**📚 Medien & Bibliothek**

- **Video-Konverter** – Clips fürs Zielsystem: HAP/HAP Q/HAP Alpha, H.264, H.265, ProRes, WAV –
  mit Deinterlace, Show-Raster, HDR → SDR, Vorschau je Datei und GPU für H.264/H.265.
- **Video-Generator** – Bilder und Videos zu einem Video: Diashow mit Ken Burns, Übergängen,
  Musik und nahtloser Schleife für Sponsor-Loops, bild- und samplegenau gerechnet.
- **Medien-Info** – Video-/Audio-Eckdaten per ffprobe, Show-Check mit Ampel, Playlist-Vergleich,
  CSV-/JSON-Export.
- **Manuals-Bibliothek** – Geräte-Handbücher (PDF) mit Offline-Volltextsuche und Viewer.
- **YouTube-Downloader** – yt-dlp mit Playlist-Auswahl, Warteschlange und Selbst-Update.

**⚡ Strom, Rigging & Aufbau**

- **Packliste** – Material-Checkliste, aus der LED-Wall befüllbar, PDF-/JSON-Export.
- **Mini-Manual** – Kurz-Anleitungen für die Leute vor Ort: Bedienung und Fehlersuche Schritt
  für Schritt je Kenntnisstufe, Handbuch und Kurzkarte als PDF.
- **Stromlast & Absicherung**, **Rigging-Last** – Stromkreise bzw. Auflager- und
  Bridle-Strangkräfte.

**🧮 Rechner**

- **Kreisrechner**, **Audio-Delay & SPL**, **Timecode-Rechner** (SMPTE ↔ Frames ↔ Echtzeit,
  Drop-Frame).
- **RTA (Echtzeit-Analysator)** übers Mikrofon: Terzen bis 1/12 Oktave, Pegel in dB(A/C) mit
  Leq, Referenzkurven mit Differenz, Kalibrierung samt Messmikrofon-Korrektur, Spektrogramm und
  Feedback-Finder.
- **Fürs Handy:** Alle zehn Rechner (auch der RTA) gibt es zusätzlich als eigenständige, offline-fähige Web-App
  (PWA) – ohne den Rest der Mottulbox: https://mottul.github.io/project_mega/

Alles im Detail: [docs/WERKZEUGE.md](docs/WERKZEUGE.md)

## Schnellstart

**Anwender:** Installer für Windows, macOS und Linux unter *Releases* laden und ausführen –
Schritte und die Warnungen bei unsignierten Paketen stehen in [docs/INSTALL.md](docs/INSTALL.md).
ffmpeg ist im Paket enthalten.

**Entwicklung** (Node.js ≥ 22.12, kein C++-Compiler nötig):

```bash
npm ci              # Abhängigkeiten exakt aus dem Lockfile, ohne Install-Skripte
npm run ff:fetch    # einmalig: HAP-fähiges ffmpeg
npm run dev         # App mit Hot Reload
npm run package     # Installer fürs aktuelle Betriebssystem nach dist/
```

Weiter in [docs/ENTWICKLUNG.md](docs/ENTWICKLUNG.md).

## Dokumentation

| Dokument                                  | Inhalt                                                           |
| ----------------------------------------- | ---------------------------------------------------------------- |
| [INSTALL.md](docs/INSTALL.md)             | Installation und erster Start (Windows, macOS, Linux)            |
| [WERKZEUGE.md](docs/WERKZEUGE.md)         | Alle Werkzeuge, Startbildschirm, Kundenansicht, Datenablage      |
| [FERNSTEUERUNG.md](docs/FERNSTEUERUNG.md) | Handy-/Tablet-Fernsteuerung und Fernsteuer-App                   |
| [NDI.md](docs/NDI.md)                     | Optionale NDI-Ausgabe von Video-Player und Stage-Timer           |
| [ENTWICKLUNG.md](docs/ENTWICKLUNG.md)     | Einrichtung, Skripte, Aufbau, neues Werkzeug, Tests, Paketierung |
| [SICHERHEIT.md](docs/SICHERHEIT.md)       | Supply Chain, bekannte Lücken, Härtung der App                   |
| [ROADMAP.md](docs/ROADMAP.md)             | Geplante Funktionen und technische Verbesserungen                |

## Technik

Electron 44, React 18 und TypeScript (electron-vite), Tailwind CSS, zustand, react-router 7,
`better-sqlite3` (FTS5), `pdfjs-dist`, `atem-connection`, gebündeltes ffmpeg mit HAP.
