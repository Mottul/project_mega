# Roadmap

Was ansteht – Funktionen und Technik. Erledigtes wandert raus: Was die Werkzeuge heute können,
beschreibt [WERKZEUGE.md](WERKZEUGE.md), die Geschichte steht im Git-Log.

**Stand:** 31. Oktober 2026

- [Als Nächstes](#als-nächstes)
- [Funktionen](#funktionen) – [bestehende Werkzeuge](#bestehende-werkzeuge-ausbauen),
  [neue Werkzeuge](#neue-werkzeuge), [Verzahnung](#verzahnung), [Ideen](#ideen)
- [Technik & Qualität](#technik--qualität) – [Sicherheit](#sicherheit),
  [Große Umbauten](#große-umbauten), [Tests & CI](#tests--ci), [Upgrades](#upgrades)
- [Bereits erledigt](#bereits-erledigt)

## Als Nächstes

Empfohlene Reihenfolge für die Technik; Funktionen nach Show-Bedarf.

1. **Update-PRs von Dependabot** jeden Montag durchsehen und nach grüner CI mergen (7 Tage
   Abstand, [SICHERHEIT.md](SICHERHEIT.md#updates-einspielen)). Eine neue Electron-Hauptversion vor
   dem Merge an den Breaking Changes prüfen.
2. **App-Aktualisierung** – baut auf der Paketierung in der CI auf: „Installer bauen“ baut die
   Installer je Betriebssystem und hängt sie bei einem Tag `v*` an ein GitHub Release; es fehlt
   noch `electron-updater` (siehe [Große Umbauten](#große-umbauten)). Danach NDI im Installer
   (die Lizenz erlaubt die Weitergabe mit Auflagen, die die App noch nicht erfüllt – siehe
   [NDI.md](NDI.md)).

## Funktionen

### Bestehende Werkzeuge ausbauen

- **OSC-Steuerung**
  - **MadMapper-Vorlagen** (Surfaces, Medien, Cues) – bisher gibt es nur Beispiel-Kacheln.
  - **„Restzeit aus OSC-Position“:** Anzeige-Modus, der aus der eingehenden MadMapper-Position
    (0–1) und einer eingetragenen Clip-Dauer die Restzeit als mm:ss errechnet – MadMapper liefert
    nur die Position. (Die Restzeit des eigenen Video-Players kann die Anzeige schon.)
  - **OSC-Trigger aus anderen Werkzeugen** (Jingle-Player, Stage-Timer, Video-Player senden OSC).
  - **Weitere Bedienelemente:** Auto-Center-Fader/Wippe (federt in die Mitte zurück – Jog, PTZ,
    Speed), Tap-Tempo/BPM, Set-Wechsel-Knopf, Farbregler wahlweise vertikal.
- **NovaStar-Steuerung:** Testbild, Ist-Zustand vom Gerät lesen (heute zeigt die Oberfläche den
  zuletzt gesendeten Stand), weitere Modelle (VX-Serie, MCTRL).
- **Video-Player:** Logo-Overlay (PNG mit Alpha; Größe, Position, Deckkraft – als Ebene, nicht
  eingebacken).
- **Video-Konverter:** ProRes auf der GPU auch unter Windows/Linux (ffmpegs neuer
  `prores_ks_vulkan`) prüfen; ProRes 4444 mit Alpha über VideoToolbox freigeben, sobald auf einem
  Mac bestätigt (heute geht Transparenz bewusst über die CPU).
- **Video-Generator** (Phase 3 aus [PLAN-VIDEO-GENERATOR.md](PLAN-VIDEO-GENERATOR.md)): Titel-/
  Texttafeln, Logo, LUT, Vorlagen und Transparenz (HAP Alpha/ProRes 4444); offen aus Phase 2: die
  4:4:4-Zwischenstufe für ProRes/HAP-Ziele messen und den Neustart des Players an der Naht einer
  nahtlosen Schleife prüfen.
- **Stage-Timer:** Teleprompter (scrollender Text auf dem Referentenmonitor); Steuerung per OSC
  (Start/Pause/±1 min aus Companion oder Stream Deck – heute nur über die HTTP-Fernsteuerung).
- **Testbildgenerator:** AV-Sync auch als Video mit Ton exportieren (für Medienserver und Player
  ohne Mottulbox).
- **Jingle-Player:** Ducking, MIDI-Pads.
- **Manuals-Bibliothek:** OCR für gescannte PDFs; Stecker-/Kabel-Kompendium mit Pin-Belegungen,
  Steckertypen und technischen Daten.

### Neue Werkzeuge

- **ATEM-Steuerung** mit dem Funktionsumfang von MixEffect Pro: Blackmagic-ATEM-Mischer vom Laptop
  oder Tablet bedienen, mit SuperSource, bildgenau animierten Layoutwechseln und Multiview im
  Werkzeug – Plan mit Aufbau, Entwurf und Phasen in [PLAN-ATEM.md](PLAN-ATEM.md). Zum Testen
  braucht es einen ATEM-Mischer.
- **ArtNet/sACN-Tester** (DMX übers Netz senden, Node-Discovery) und **DMX-Universum-Planer**
  (automatische Adressvergabe, Kollisions-Check) – verzahnt mit dem DMX-Dip-Schalter.
- **Rechner:** IP-/Subnetz (Dante, NDI, AV-over-IP – passend zum Netzwerk-Scanner),
  Spannungsabfall/Kabelquerschnitt (an die Stromlast angedockt), Edge-Blend (Beamer-Softedge),
  Video-Datenrate/Dateigröße, Gel-/Farbfilter (Lee ↔ Rosco ↔ RGB), Funkfrequenz-Planer,
  Sonnenstand/Dämmerung für Open-Air.

### Verzahnung

Heute gibt es Medien-Info ↔ Video-Konverter, Video-Konverter/Medien-Info → Video-Generator →
Video-Player, Video-Konverter/YouTube-Downloader → Video-Player, LED-Wall → Packliste und
Video-Player, Netzwerk-Scanner → NovaStar und Manuals, Jingle-Player/OSC-Steuerung/Video-Player →
Mini-Manual (siehe [WERKZEUGE.md](WERKZEUGE.md#übergaben-zwischen-werkzeugen)). Geplant:

- **Übergabe-Speicher verallgemeinern** – heute gibt es nur einen NovaStar-IP-Slot. Deshalb setzt
  „IP in der OSC-Steuerung verwenden“ nur die NovaStar-IP, nicht das OSC-Ziel. Ein Slot „Wert +
  Zielwerkzeug“ ist die Grundlage für alles Weitere.
- **LED-Wall → Stromlast/Rigging:** Gewicht und Stromaufnahme sind schon berechnet.
- **Packliste aus mehr Quellen:** Rigging (Anschlagmittel je Bridle) und Stromlast (Kabel und
  Verteiler je Kreis).
- **Show-Profil:** Grundlage ist die Projektdatei `.mottul` (ein Abschnitt je Werkzeug, heute
  LED-Wall und Anleitung; Weg dorthin: Phase 5 in [PLAN-MINI-MANUAL.md](PLAN-MINI-MANUAL.md#phasen)).
  Wandauflösung, Geräte-IPs, NovaStar-/OSC-Ziele und Packliste
  werkzeugübergreifend speichern und als „Event“ laden.

### Ideen

- **Manuals am Tablet/Handy** als eigene App (z. B. Capacitor); Konverter und Testbilder bleiben
  am Desktop.

## Technik & Qualität

### Sicherheit

- **PIN/Token für die Fernsteuerungen** (optional): Sie sind ohne Passwort; Befehle werden
  geprüft, Uploads begrenzt – wer im selben Netz ist, kann aber steuern.
- **CSP ohne `'unsafe-inline'`** für Skripte im Produktiv-Build; braucht eine eigene Dev-CSP, weil
  der Vite-Dev-Server eine Inline-Präambel lädt. (`'unsafe-eval'` ist bereits entfernt.)

### Große Umbauten

- **App-Aktualisierung** (`electron-updater` über GitHub Releases): Electron mit Chromium und
  alle npm-Pakete kommen heute nur mit einem neuen Installer – selbst aktuell halten sich nur
  ffmpeg und yt-dlp. Die Installer baut die CI schon und legt sie bei einem Tag `v*` als
  GitHub Release ab („Installer bauen“); `electron-updater` braucht dort zusätzlich die
  `latest*.yml` und `.blockmap`-Dateien. Windows warnt ohne Signatur beim Installieren, macOS
  geht nur mit einem Apple-Entwicklerzertifikat.
- **IPC-Vertrag generieren:** ein generischer Preload-Proxy aus `Channels` und ein typisierter
  `handle(Channels.x, fn)`-Wrapper. Neue Kanäle brauchen dann zwei statt vier Stellen, die 31
  `as never`-Casts im Preload entfallen, falsche Handler-Signaturen werden zu Compile-Fehlern.
  Größter langfristiger Gewinn.
- **Handy-Steuerseiten** (~1.200 Zeilen HTML/CSS/JS in Template-Strings, ungelintet) als echte
  Build-Artefakte bzw. `?raw`-Importe.

### Tests & CI

- **Tests** für `playerState` (better-sqlite3 läuft seit Version 13 auch unter Node – eine
  `:memory:`-Datenbank statt Mock), yt-dlp-Argumente und -Ausgabezeilen
  sowie die Fernsteuer-Parser (Body, OSC-/Jingle-Befehle, Upload).
- **Komponententests:** jsdom und @testing-library ergänzen (`*.test.tsx` werden schon
  eingesammelt, laufen aber ohne DOM).
- **GPU-Encoder auf echter Hardware gegenprüfen** (NVENC, Quick Sync, AMF, VideoToolbox inkl.
  ProRes): ohne GPU im Testrechner sind nur Erkennung, Argumente und der Rückfall auf die CPU
  geprüft.

### Upgrades

- **React 18 → 19** – mechanisch: 160× globales `JSX.Element` → `React.JSX.Element`.
- **Tailwind 3 → 4** – eigene Tokens und die `light:`-Variante auf `@theme`/`@custom-variant`
  umstellen; postcss/autoprefixer entfallen.
- **lucide-react 0.577 → 1.x** – Icon-Umbenennungen prüfen.
- **Beobachten:** Vite 8 (electron-vite 6 kann es schon; offen sind @vitejs/plugin-react und
  vitest), TypeScript 7 („tsgo“).

## Bereits erledigt

Damit nichts doppelt geplant wird:

- **Show-Härtung:** Fehlergrenzen je Werkzeug, globale Fehler-Handler, In-App-Hinweise statt
  stiller Fehler, Wiederherstellung von `settings.json`/`library.db`, versionierte Stores.
- **Eine Persistenz-Regel:** Einstellungen in `settings.json` (jetzt auch Downloader-Zielordner,
  NDI und Timer-Ablauf, den der main selbst speichert), Arbeitsdaten im Werkzeug-Store,
  Bedien-Kleinigkeiten über `usePersistentState` – keine eigenen localStorage-Parser mehr.
- **Kein Datenverlust zwischen Fenstern:** `settings.json` nimmt Teiländerungen (feldweise
  zusammengeführt, atomar geschrieben) und meldet Änderungen an alle Fenster; Werkzeug-Stände
  gleichen sich zwischen Fenstern ab (eigene, noch ungespeicherte Eingaben gewinnen).
- **Upgrades:** Electron 40 → 42 → 44 (Datei-Dialoge merken sich ihren Ordner selbst),
  better-sqlite3 12 → 13 (N-API: kein Rebuild mehr je Electron-Version), pdfjs-dist 4 → 6,
  react-router 6 → 7; Stand 9. Oktober 2026 `npm audit --omit=dev` ohne Befund. Dependabot hält
  die Abhängigkeiten seitdem mit 7 Tagen Abstand aktuell, die Electron-Binary wird gegen ihre
  Prüfsumme geprüft.
- **ffmpeg aktuell:** beim Entwickeln (`npm run dev`, `e2e`: wöchentlich) und in der fertigen App
  (Windows, Linux: neuester Build ab 7 Tagen Alter, Prüfsumme, Selbsttest, aktiv ab dem nächsten
  Start).
- **Kleine Härtungen:** Uploads der Player-Fernsteuerung begrenzt (8 GB je Datei, 2 GB Reserve,
  Aufräumen bei Abbruch), Fernsteuer-Befehle von Player und Jingle feldweise geprüft, CSP ohne
  `unsafe-eval`, yt-dlp nur mit http(s)-Adressen hinter `--`.
- **Fenster-Wächter und Shell:** Wächter für alle Fenster (`services/windows/windowGuards.ts`: keine neuen
  Fenster, keine fremde Navigation, keine Webviews, Berechtigungen nach Allowlist); alle Fenster
  mit App-Seite über `secureWebPreferences`/`loadRoute` (statt fünf Kopien in den
  Ausgabefenstern); „Ordner öffnen“ nur für lokale Ordner, „Im Ordner zeigen“ nur mit absolutem
  Pfad; ffmpeg-Download beim Einrichten geprüft (BtbN: Prüfsumme, evermeet: Größe).
- **Konvertierung:** gemeinsamer Kern für Video-Konverter, Player-Import und Testbild-Export
  (ersetzt den alten HAP-Auftragsmanager), eigene Player-Spur (parallele Importe einstellbar,
  dieselbe Quelle nie doppelt), Medien-Info als Analyse-Werkzeug;
  Video-Konverter mit GPU für H.264/H.265 (geprüft, Rückfall auf die CPU) und schnellem ProRes
  (VideoToolbox bzw. prores_aw); Lautheit in zwei Durchgängen (messen, dann gleichmäßig
  verstärken) in Konverter und Player-Import, „Neu einbacken“ wendet sie auch auf vorhandene
  Medien an.
- **Fernsteuerung:** Fernsteuer-App mit gemeinsamer Startseite (Port 8090), Stage-Timer am Handy,
  Bühnen-Anzeige des Timers im Browser (für Geräte ohne NDI), Zustand wird gemerkt, Start/Stopp über `registerRemoteControl()`.
- **Werkzeug-Muster:** gleiche Kopfleiste in allen Werkzeugen (App-Menü „Mottulbox“ für Design,
  13 Akzentfarben, ffmpeg, yt-dlp; Aktionen mit Text), Ausgabe-Leiste (rot, solange live; Auftrag
  bernstein) und Einstellungs-Schublade links (anheftbar, Bereiche mit Zusammenfassung, ⓘ statt
  Absätzen) für Video-Player, Stage-Timer, Testbild, Video-Konverter, Video-Generator, Jingles,
  OSC, Medien-Info, Handbücher und LED-Wall (Arbeitsfläche ohne Scrollen: Kennzahlen,
  Zeichenfläche mit Ansicht, Draufsicht, Signal- und Stromplan), seit 12. Oktober auch NovaStar
  (Verbindung, Blackout, Einfrieren, Fade in der Leiste), Netzwerk-Scanner, YouTube-Downloader
  (yt-dlp-Version und Prüfen jetzt im App-Menü) und Packliste – damit alle großen Werkzeuge.
- **Kleine Werkzeuge im eigenen Fenster:** Die neun Rechner öffnen sich immer in einem eigenen
  Fenster (eines je Werkzeug, Lage gemerkt, Höhe folgt dem Inhalt, ab 320 px breit, zweispaltig
  wenn breit genug), einheitlich mit ⓘ statt Absätzen und Zahlen mit Komma; Design, Akzent und
  Kompaktmodus gelten live in jedem Fenster.
- **Aufgeräumt:** Statusfarben als Tokens (`success`/`warning`/`danger` statt 126 kopierter
  Farbklassen, ein Rot je Zweck), gemeinsame Hinweisbox `Alert` statt kopierter getönter Boxen,
  Fensterlogik aus `main/index.ts` in `services/windows/appWindows.ts`, `smallToolWindows.ts` und
  `ipc/window.handlers.ts` (ohne Sonderfälle in `createWindow`), Renderer ohne Node-Typen
  (`"types": []`), verknüpfte Rechnerfelder über einen gemeinsamen Hook; `main/services` nach
  Bereichen in Unterordnern (Fernsteuerung, Timer, Jingle, OSC, NDI, Testbild, Fenster), eine
  Status-Tabelle (`components/ui/status.ts`) für Toasts und Hinweise; `VideoPlayer.tsx` von 1.765 auf
  291 Zeilen (Bibliothek, Konvertier-Liste, Wiedergabe, Playlist, Schublade, NDI je eigene Datei),
  `OscControl.tsx` von 3.276 auf 387 (Bedienelemente, Kachel, Fläche, Editor, Panels, Kopfzeile,
  Hooks), dazu der erste E2E-Test der OSC-Steuerung.
- **Startbildschirm:** Favoriten in eigenen Kategorien, Kachelgröße, Ansicht „Favoriten“, gleich
  hohe Kacheln, Ausgabe-Status von Player und Stage-Timer.
- **Gemeinsame Bausteine:** Medien-Endungen in `shared/`, QR-Code und Auswahlliste
  (`Select`) in `components/`.
- **CI auf drei Betriebssystemen:** Unit-Tests (mit Labortest), Build und alle E2E-Skripte der
  echten App auf Linux, Windows und macOS; Prüfungen (Format, Lint, Typen) auf Node 22 und 24.
- **Werkzeuge:** OSC (Learn-Modus, Auswahl, Bank, Poti/Encoder, Anzeige, Label,
  Fader-Ausrichtung, Raster-Spalten, Auto-Nummerierung, Set-Wechsel am Handy), NovaStar
  (Preset-Abruf, Blackout/Freeze), Video-Player (Lautheit nach EBU R128, NDI mit Ton, „Ausgabe &
  Wand“ als erste Sektion), LED-Wall-Vorlagen, YouTube-Downloader (yt-dlp mit Prüfsumme,
  Playlist-Erkennung mit Auswahl), Testbild (eigenes Mapping-Testbild mit schaltbaren Elementen
  und Cabinet-Raster aus dem LED-Wall-Konfigurator).
