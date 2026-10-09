# Roadmap

Was ansteht – Funktionen und Technik. Erledigtes wandert raus: Was die Werkzeuge heute können,
beschreibt [WERKZEUGE.md](WERKZEUGE.md), die Geschichte steht im Git-Log.

**Stand:** 9. Oktober 2026

- [Als Nächstes](#als-nächstes)
- [Funktionen](#funktionen) – [bestehende Werkzeuge](#bestehende-werkzeuge-ausbauen),
  [neue Werkzeuge](#neue-werkzeuge), [Verzahnung](#verzahnung), [Ideen](#ideen)
- [Technik & Qualität](#technik--qualität) – [Sicherheit](#sicherheit),
  [Konsolidierung](#konsolidierung), [Große Umbauten](#große-umbauten), [Tests & CI](#tests--ci),
  [Upgrades](#upgrades)
- [Bereits erledigt](#bereits-erledigt)

## Als Nächstes

Empfohlene Reihenfolge für die Technik; Funktionen nach Show-Bedarf.

1. **Update-PRs von Dependabot** jeden Montag durchsehen und nach grüner CI mergen (7 Tage
   Abstand, [SICHERHEIT.md](SICHERHEIT.md#updates-einspielen)) – als Nächstes kommen u. a.
   pdfjs-dist 6.4.299 und Electron 44.7.0. Eine neue Electron-Hauptversion vor dem Merge an den
   Breaking Changes prüfen.
2. **Restliche Härtungen** – Fenster-Wächter, `shellOpenPath`-Allowlist, Prüfsumme für den
   ffmpeg-Download beim Einrichten (siehe [Sicherheit](#sicherheit)).
3. **Paketierung in der CI** – Installer je Betriebssystem probeweise bauen (heute prüft die CI
   Build, Tests und E2E auf allen drei, aber nicht `electron-builder`).
4. **App-Aktualisierung** – darauf aufbauend (siehe [Große Umbauten](#große-umbauten)).

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
- **Testbildgenerator:** Audio-Testtöne (Sinus, Rosa Rauschen, Sweep, Kanal-Identifikation).
- **Jingle-Player:** Ducking, MIDI-Pads.
- **Manuals-Bibliothek:** OCR für gescannte PDFs; Stecker-/Kabel-Kompendium mit Pin-Belegungen,
  Steckertypen und technischen Daten.
- **LED-Wall-Konfigurator:** Prozessor-Presets (NovaStar, Brompton).

### Neue Werkzeuge

- **ArtNet/sACN-Tester** (DMX übers Netz senden, Node-Discovery) und **DMX-Universum-Planer**
  (automatische Adressvergabe, Kollisions-Check) – verzahnt mit dem DMX-Dip-Schalter.
- **Rechner:** IP-/Subnetz (Dante, NDI, AV-over-IP – passend zum Netzwerk-Scanner),
  Spannungsabfall/Kabelquerschnitt (an die Stromlast angedockt), Edge-Blend (Beamer-Softedge),
  Video-Datenrate/Dateigröße, Gel-/Farbfilter (Lee ↔ Rosco ↔ RGB), Funkfrequenz-Planer,
  Sonnenstand/Dämmerung für Open-Air.

### Verzahnung

Heute gibt es Medien-Info ↔ Video-Konverter, Video-Konverter/Medien-Info → Video-Generator →
Video-Player, LED-Wall → Packliste und Netzwerk-Scanner → NovaStar (siehe [WERKZEUGE.md](WERKZEUGE.md#übergaben-zwischen-werkzeugen)). Geplant:

- **Übergabe-Speicher verallgemeinern** – heute gibt es nur einen NovaStar-IP-Slot. Deshalb setzt
  „IP in der OSC-Steuerung verwenden“ nur die NovaStar-IP, nicht das OSC-Ziel. Ein Slot „Wert +
  Zielwerkzeug“ ist die Grundlage für alles Weitere.
- **Fertiger Auftrag → Player-Bibliothek:** Download oder Konvertierung mit einem Klick in den
  Video-Player (spart den Umweg über den Dateimanager kurz vor der Show) – der Video-Generator kann
  es schon, YouTube-Downloader und Video-Konverter noch nicht.
- **LED-Wall → Video-Player:** Wandauflösung übernehmen (das Testbild kann es schon: Raster und
  Auflösung „Aus LED-Wall-Konfigurator“).
- **LED-Wall → Stromlast/Rigging:** Gewicht und Stromaufnahme sind schon berechnet.
- **Netzwerk-Scanner → Manuals:** den erkannten Hersteller als Handbuch-Suche öffnen.
- **Packliste aus mehr Quellen:** Rigging (Anschlagmittel je Bridle) und Stromlast (Kabel und
  Verteiler je Kreis).
- **Show-Profil:** Wandauflösung, Geräte-IPs, NovaStar-/OSC-Ziele und Packliste
  werkzeugübergreifend speichern und als „Event“ laden.

### Ideen

- **Manuals am Tablet/Handy** als eigene App (z. B. Capacitor); Konverter und Testbilder bleiben
  am Desktop.

## Technik & Qualität

### Sicherheit

- **Letzte `npm audit`-Meldungen** (Tailwind-3-Kette, nur Build-Zeit) verschwinden mit
  [Tailwind 4](#upgrades).
- **PIN/Token für die Fernsteuerungen** (optional): Sie sind ohne Passwort; Befehle werden
  geprüft, Uploads begrenzt – wer im selben Netz ist, kann aber steuern.
- **CSP ohne `'unsafe-inline'`** für Skripte im Produktiv-Build; braucht eine eigene Dev-CSP, weil
  der Vite-Dev-Server eine Inline-Präambel lädt. (`'unsafe-eval'` ist bereits entfernt.)
- **Zentrale Fenster-Wächter** (`web-contents-created`: Berechtigungen, `will-navigate`,
  `setWindowOpenHandler`) auch für Ausgabe-, NDI- und PDF-Fenster – heute nur in Haupt- und
  Werkzeugfenstern.
- **`shellOpenPath`/`shellShowItem`** nur für App-Ablage und gewählte Ausgabeordner.
- **Prüfsumme** für den ffmpeg-Download beim Einrichten (`scripts/download-ffmpeg.mjs` lädt
  „latest“ ungeprüft). Die Aktualisierung in der App prüft schon gegen die `checksums.sha256` von
  BtbN – dieselbe Logik lässt sich übernehmen; yt-dlp prüft gegen `SHA2-256SUMS`, die
  Electron-Binary gegen `checksums.json`.

### Konsolidierung

- **Restliche Werkzeuge aufs Werkzeug-Muster** (Ausgabe-/Auftrags-Leiste, Schublade links): LED-Wall,
  NovaStar (Verbindung und Blackout in die Leiste), Netzwerk-Scanner, YouTube-Downloader
  (Auftrags-Leiste), Packliste und die Rechner haben noch eigene Kartenlayouts. Dabei die übrigen
  Erklärtexte hinter ⓘ legen.
- **NDI:** `timerNdi.ts` und `playerNdi.ts` zu einem gemeinsamen Offscreen-Sender zusammenführen –
  sonst müssen Absturz-Korrekturen doppelt gepflegt werden.
- **Auftrags-Warteschlangen:** Konverter und Player-Import teilen sich die Spuren-Warteschlange,
  halten aber je eigene Auftragslisten; der YouTube-Downloader hat eine ganz eigene. Eine
  gemeinsame `JobQueue<T>`-Basis.
- **Fernsteuer-Panel im Renderer** (Port, Start/Stopp, QR) als gemeinsame Komponente – heute vier
  Kopien.
- **Statusfarben als Tokens** `success`/`warning` statt rund 30 kopierter
  `emerald`-/`amber`-Paare.
- **UI-Bausteine konsequent nutzen:** YouTube-Downloader auf `Progress`/`Badge`; `Select` als
  echte Komponente mit Größen-Varianten (heute eine Klassen-Konstante, dazu abgewandelte Kopien
  in Video-Player, Netzwerk-Scanner, OSC-Steuerung, Packliste und Startbildschirm).
- **`main/services` ordnen:** Jingle-, Timer-, NDI- und Fernsteuer-Dateien in Unterordner
  (heute 24 lose Dateien neben den Ordnern).
- **Kleinkram:** Fenster-Handler aus `main/index.ts` in eine `window.handlers.ts`;
  `"types": ["node"]` aus `tsconfig.web.json` entfernen.

### Große Umbauten

- **App-Aktualisierung** (`electron-updater` über GitHub Releases): Electron mit Chromium und
  alle npm-Pakete kommen heute nur mit einem neuen Installer – selbst aktuell halten sich nur
  ffmpeg und yt-dlp. Braucht gebaute Installer in der CI (Releases); Windows warnt ohne Signatur
  beim Installieren, macOS geht nur mit einem Apple-Entwicklerzertifikat.
- **IPC-Vertrag generieren:** ein generischer Preload-Proxy aus `Channels` und ein typisierter
  `handle(Channels.x, fn)`-Wrapper. Neue Kanäle brauchen dann zwei statt vier Stellen, die 26
  `as never`-Casts im Preload entfallen, falsche Handler-Signaturen werden zu Compile-Fehlern.
  Größter langfristiger Gewinn.
- **Große Dateien teilen:** `OscControl.tsx` (~3.300 Zeilen) in Kacheln, Editor, Panels und
  Fläche; `VideoPlayer.tsx` (~1.700 Zeilen) in NDI-Panel, Bibliothek/Konvertier-Liste, Playlist
  und Fernsteuer-Panel.
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
- **Paketierung in der CI** (`electron-builder --dir` je Betriebssystem) – Tests und E2E laufen
  schon auf Linux, Windows und macOS.

### Upgrades

- **React 18 → 19** – mechanisch: 160× globales `JSX.Element` → `React.JSX.Element`.
- **Tailwind 3 → 4** – eigene Tokens und die `light:`-Variante auf `@theme`/`@custom-variant`
  umstellen; postcss/autoprefixer entfallen, ebenso die letzten `npm audit`-Meldungen
  (`braces`-Kette).
- **lucide-react 0.469 → 1.x** – Icon-Umbenennungen prüfen.
- **Beobachten:** Vite 8 (electron-vite unterstützt bis Vite 7), TypeScript 7 („tsgo“).

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
  OSC, Medien-Info und Handbücher.
- **Startbildschirm:** Favoriten in eigenen Kategorien, Kachelgröße, Ansicht „Favoriten“, gleich
  hohe Kacheln, Ausgabe-Status von Player und Stage-Timer.
- **Gemeinsame Bausteine:** Medien-Endungen in `shared/`, QR-Code und `selectClass` in
  `components/`.
- **CI auf drei Betriebssystemen:** Unit-Tests (mit Labortest), Build und alle E2E-Skripte der
  echten App auf Linux, Windows und macOS; Prüfungen (Format, Lint, Typen) auf Node 22 und 24.
- **Werkzeuge:** OSC (Learn-Modus, Auswahl, Bank, Poti/Encoder, Anzeige, Label,
  Fader-Ausrichtung, Raster-Spalten, Auto-Nummerierung, Set-Wechsel am Handy), NovaStar
  (Preset-Abruf, Blackout/Freeze), Video-Player (Lautheit nach EBU R128, NDI mit Ton, „Ausgabe &
  Wand“ als erste Sektion), LED-Wall-Vorlagen, YouTube-Downloader (yt-dlp mit Prüfsumme,
  Playlist-Erkennung mit Auswahl), Testbild (eigenes Mapping-Testbild mit schaltbaren Elementen
  und Cabinet-Raster aus dem LED-Wall-Konfigurator).
