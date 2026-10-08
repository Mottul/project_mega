# Entwicklung

Alles für die Arbeit am Code: Einrichtung, Skripte, Aufbau, Konventionen, Tests und Paketierung.
Die Installation für Anwender steht in [INSTALL.md](INSTALL.md).

- [Voraussetzungen](#voraussetzungen)
- [Einrichten und starten](#einrichten-und-starten)
- [NPM-Skripte](#npm-skripte)
- [Aufbau](#aufbau)
- [Ein neues Werkzeug](#ein-neues-werkzeug)
- [Konventionen](#konventionen)
- [Tests & CI](#tests--ci)
- [Build & Paketierung](#build--paketierung)

## Voraussetzungen

- **Node.js ≥ 22.12** und npm (von Electron 44 vorgegeben). `engine-strict=true` in `.npmrc`
  bricht den Install mit zu altem Node gleich mit klarer Meldung ab statt später kryptisch.
- **Kein C++-Compiler nötig.** Das einzige native Modul (`better-sqlite3`) nutzt seit Version 13
  die stabile N-API: Die fertigen Binaries (Windows, macOS, Linux; x64 und arm64) liegen im
  npm-Paket und laufen unter jeder Electron- und Node-Version – kein Rebuild nach einem
  Electron-Upgrade, und die Unit-Tests können die Datenbank direkt öffnen.

## Einrichten und starten

```bash
git clone <repo-url>
cd project_mega
npm ci              # exakt aus dem Lockfile; postinstall lädt die Electron-Binary (mit Prüfsumme)
npm run ff:fetch    # HAP-fähiges ffmpeg (Konverter, Player-Import …); hält sich danach selbst aktuell
npm run dev         # App mit Hot Reload
```

- **ffmpeg:** `npm run ff:fetch` lädt ein HAP-fähiges ffmpeg (mit libsnappy) aus offiziellen
  Quellen – BtbN (Windows, Linux), evermeet.cx (macOS) – nach `resources/ffmpeg/<os>/` (nicht im
  Git). Die gängigen npm-ffmpeg-Pakete können kein HAP. Vorhandenes wird nicht erneut geladen
  (`--force` erzwingt es, `--platform win|mac|linux` bzw. `--all` für andere Systeme). Ohne ffmpeg
  zeigen die betroffenen Werkzeuge einen Hinweis; im fertigen Paket ist es enthalten.
  **Bleibt automatisch aktuell:** Die Quellen liefern täglich neue Builds. `npm run dev`,
  `npm start` und `npm run e2e` laden vorher den neuesten, wenn der vorhandene älter als 7 Tage
  ist (Stand in `resources/ffmpeg/<os>/stand.json`); `npm run package` nimmt einen höchstens einen
  Tag alten; die CI testet jede Woche gegen den neuesten. Offline oder bei laufendem ffmpeg geht es
  mit dem vorhandenen weiter. Sofort aktualisieren: `npm run ff:update`. Die **fertige App**
  hält sich unter Windows und Linux selbst aktuell (`services/ffmpeg/ffmpegUpdate.ts`, Ablage
  `userData/ffmpeg/`; E2E `ffmpeg-update` mit lokalem Schein-Server über
  `MOTTULBOX_FFMPEG_RELEASES_URL`). ffmpeg-Pfade immer über `ffmpegBinPath()` – es liefert den
  in der App aktualisierten Build, wenn einer aktiv ist. So fallen
  Verhaltensänderungen beim Entwickeln auf, nicht erst im Installer (Beispiel: Farbort-Wechsel im
  Video-Generator, Oktober 2026).
- **Electron-Binary:** lädt `scripts/fetch-electron-bin.mjs` in reinem Node (als `postinstall` und
  vor `dev`/`start`). Das klappt auch dort, wo Sicherheits-Wrapper electrons eigenes `install.js`
  abfangen. Fehlt die Binary, bricht `npm run dev` mit „Electron uninstall“ ab →
  `npm run electron:bin`.
- **Ganz ohne Paket-Skripte** installieren: siehe [SICHERHEIT.md](SICHERHEIT.md#installation).

## NPM-Skripte

| Skript                              | Zweck                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------ |
| `npm run dev`                       | Entwicklungsmodus (electron-vite, Hot Reload)                            |
| `npm run start`                     | Produktions-Build lokal ansehen (electron-vite preview)                  |
| `npm test` · `npm run test:watch`   | Vitest einmalig bzw. im Watch-Modus                                      |
| `npm run lint` · `lint:fix`         | ESLint (warnungsfrei: `--max-warnings 0`)                                |
| `npm run format` · `format:check`   | Prettier schreiben bzw. prüfen                                           |
| `npm run typecheck`                 | TypeScript: main/preload/shared **und** renderer                         |
| `npm run typecheck:test`            | TypeScript: Testdateien                                                  |
| `npm run build`                     | Typecheck + Produktions-Bundles nach `out/`                              |
| `npm run e2e`                       | App bauen und die E2E-Skripte (`e2e/`) über Playwright laufen lassen    |
| `npm run package`                   | Installer fürs aktuelle OS (holt ffmpeg, baut, electron-builder via npx) |
| `npm run package:dir`               | nur die entpackte App, ohne Installer – zum schnellen Testen             |
| `npm run ff:fetch`                  | HAP-fähiges ffmpeg holen (vor `dev`/`start`/`e2e` automatisch erneuert, wenn älter als 7 Tage) |
| `npm run ff:update`                 | ffmpeg sofort auf den neuesten Build bringen                             |
| `npm run electron:bin`              | Electron-Laufzeit-Binary laden                                           |
| `npm run ndi:setup`                 | optionales NDI-Binding einrichten, siehe [NDI.md](NDI.md)                |

Einzelner Test: `npx vitest run src/renderer/src/tools/led-wall/math.test.ts`

## Aufbau

Drei Build-Ziele (electron-vite): **main** (Node: Dienste und IPC-Handler), **preload**
(contextBridge-API) und **renderer** (React-SPA mit HashRouter).

```
src/
├── main/
│   ├── index.ts              # App-Lebenszyklus, Fenster (sichere Defaults), globale Fehler-Handler
│   ├── ipc/                  # IPC-Handler je Bereich (*.handlers.ts), registry.ts, remoteControls.ts
│   └── services/
│       ├── store.ts · db.ts  # settings.json (Quelle der Wahrheit) · SQLite/FTS5 – je mit Wiederherstellung
│       ├── convert/          # Konvertierungs-Kern: ffmpeg-Argumente, Encoder (GPU), Runner, Warteschlange, Fähigkeiten;
│       │                     #   videoGen*: Rechenlauf, Vorschau rechnen, Zwischenspeicher, Vorschaubilder,
│       │                     #   Quelladressen (Live-Vorschau) des Video-Generators
│       ├── ffmpeg/           # ffmpeg-Pfade, Medien-Info (ffprobe-Analyse, Parser, Cache)
│       ├── player/           # Bibliothek, Import, Wiedergabezustand, Ausgabefenster, Fernsteuerung
│       ├── manuals/ · osc/ · novastar/ · netscan/ · ytdlp/   # Dienste einzelner Werkzeuge
│       ├── remoteHttp.ts · remoteApp*.ts · remotePwa.ts      # Fernsteuer-Basis, Fernsteuer-App, Web-App
│       └── …                 # Stage-Timer, Jingles, NDI, Testbild-Export, Log
├── preload/index.ts          # contextBridge → window.api (typisiert)
├── shared/                   # IPC-Vertrag, Domain-Typen, Konvertierungs-Plan, Video-Generator-Plan, Medien-Endungen, Marke
└── renderer/src/
    ├── launcher/             # Startbildschirm, Favoriten-Kategorien, ToolHost (Fehlergrenze je Werkzeug)
    ├── components/           # ToolShell, ErrorBoundary, Toaster, QrCode … + ui/ (Button, Select, Progress …)
    ├── lib/                  # api, toast, persistStorage, useDraft, handoff, Theme/Akzent …
    └── tools/                # je Werkzeug ein Ordner mit index.ts; registry.ts trägt sie ein
```

Außerhalb von `src/`: `build/` (Installer-Icons), `assets/brand/` (Logo-Quellen, nicht im Build),
`scripts/` (ffmpeg, Electron-Binary, native Module, NDI), `resources/` (geladenes ffmpeg, nicht im
Git), `vendor/` (optionales NDI-Binding) und `docs/`.

### Grundmuster

- **IPC-Vertrag:** `src/shared/ipc-contracts.ts` definiert `Channels` und `ToolboxApi` als einzige
  Quelle, `src/shared/types.ts` alle Domain-Typen. Neue IPC-Fläche = Channel +
  `ToolboxApi`-Methode + Preload-Mapping + Handler in `src/main/ipc/*.handlers.ts` (registriert in
  `registry.ts`).
- **Renderer nur über `api`** (`@renderer/lib/api`), nie direkt `ipcRenderer`.
- **Der Hauptprozess ist autoritativ** für alles, was fensterübergreifend laufen muss: Player- und
  Timer-Zustand ticken im main; Ausgabefenster (`#/output`, `#/player-output`, `#/timer-output`,
  `#/osc-monitor`) und Handy-Seiten spiegeln nur.
- **Speichern – eine Regel, drei Orte** (siehe [Was wohin gehört](#was-wohin-gehört)):
  Einstellungen in `settings.json`, Arbeitsdaten im Werkzeug-Store, Bedien-Kleinigkeiten über
  `usePersistentState`. Nie direkt `localStorage` mit eigenem Parser.
- **Eingabefelder mit Puffer:** `useDraft()` (`@renderer/lib/useDraft`) übernimmt den externen
  Wert nur, solange das Feld nicht fokussiert ist.
- **Fernsteuerungen:** abhängigkeitsfreie HTTP-Server je Werkzeug (`services/remoteHttp.ts`),
  Steuerseiten als HTML-Strings. Die Fernsteuer-App (fester Port 8090) bindet sie unter `/<id>/`
  ein – Steuerseiten sprechen ihre API deshalb **immer relativ** an (`api/…`, nie `/api/…`).
  Start, Stopp, Merken und Autostart laufen über `registerRemoteControl()`
  (`ipc/remoteControls.ts`). Befehle vom Handy sind fremde Eingaben: Feld für Feld prüfen, nur
  bekannte Befehle durchlassen, Werte begrenzen (Muster: `player/remoteCommand.ts`).
- **Konvertierung:** ein Kern für Video-Konverter und Player-Import; der Video-Generator nutzt
  Analyse, Encoder, Lautheit und Warteschlange (Zeitachse, Filter und Befehle rein in
  `shared/videoGenPlan.ts`), der Testbild-Export nur `runFfmpeg()` und die Farbkennung. Analyse per
  `probeMediaInfo` (mit Cache), alle Entscheidungen in `shared/convertPlan.ts` (rein, getestet,
  auch für die Vorschau im Renderer), Argumente, Runner und Warteschlange in
  `main/services/convert/`. Neue Korrekturen und Formate gehören dorthin, nicht ins einzelne
  Werkzeug; ffmpeg läuft immer über `runFfmpeg()`. Encoder (GPU bzw. schnelles ProRes) kommen aus
  `convert/encoders.ts`: Kandidaten erst nach Mini-Probelauf nutzen, Auswahl über
  `shared/encoderChoice.ts` (auch für die Anzeige im Konverter), Aufträge über
  `encodeWithFallback()` – scheitert die GPU, läuft er einmal auf der CPU. Lautheit in zwei
  Durchgängen: Der Plan liefert nur das Ziel, `convert/loudness.ts` misst vor dem Lauf
  (`measureLoudness()`), die Argumente setzen die Messwerte (Filter und Auswertung rein in
  `shared/loudness.ts`); ohne Messung wird einstufig angeglichen.
- **Theme:** Dunkel ist Standard, Hell über die Klasse `.light` am `<html>`; die Akzentfarbe kommt
  aus CSS-Variablen (`@renderer/lib/accent`). Farben immer über Tailwind-Tokens (`primary`,
  `border`, …), nie hart kodiert.

### Was wohin gehört

| Was | Wo | Wie |
| --- | --- | --- |
| **Einstellungen** – alles, was der Hauptprozess führt oder braucht und was ein Neustart nie verlieren darf: Pfade und Zielordner, Ausgabe und Geräte (Monitor, NDI, Ports, Fernsteuerungen), Player- und Timer-Ablauf | `settings.json` (`services/store.ts`) | im Renderer `useSettings(auswahl)` + `updateSettings(teiländerung)` aus `@renderer/lib/settings`; im main `getSettings`/`setSettings` |
| **Arbeitsdaten eines Werkzeugs**, die nur im Renderer leben: OSC-Projekte, Jingle-Bänke, LED-Wand-Planungen, Packlisten … | zustand-Store je Werkzeug | `persist` mit `debouncedStorage()`, `version` + `migrate`, `syncAcrossWindows(store)` |
| **Bedien-Kleinigkeiten** pro Rechner, deren Verlust nicht weh tut: aufgeklappte Panels, Vorschau an/aus, FPS-Anzeige | localStorage | `usePersistentState(key, vorgabe, codec)` aus `@renderer/lib/usePersistentState` |

Dazu gilt:

- **Teiländerungen statt Lesen-Ändern-Schreiben.** `setSettings`/`updateSettings` bekommen nur die
  geänderten Felder – auch innerhalb von `player`, `osc` … – und führen sie zusammen; Listen werden
  als Ganzes ersetzt. Die Datei wird atomar geschrieben.
- **Fenster bleiben aktuell.** `useSettings` gleicht sich über `api.onSettingsChanged` ab;
  Werkzeug-Stores über `syncAcrossWindows`. Wer Einstellungen anders im eigenen Zustand hält,
  abonniert `api.onSettingsChanged` selbst – sonst überschreibt das Fenster fremde Änderungen.
- **Textfelder puffern.** Eingaben, die in `settings.json` landen, über `TextField`/`NumberField`
  (übernommen beim Verlassen bzw. mit Enter), nicht bei jedem Tastendruck.
- **Alte Speicherorte einmalig übernehmen.** Zieht ein Wert um, liest
  `migrateLocalStorage(key, …)` den alten Eintrag, speichert ihn am neuen Ort und löscht ihn.
- **Ausnahme Boot-Spiegel:** Theme, Akzentfarbe und Dichte stehen zusätzlich im localStorage,
  damit das Fenster ohne Flackern startet; maßgeblich bleibt `settings.json`.

## Ein neues Werkzeug

1. Ordner `src/renderer/src/tools/<id>/` mit Komponente und `index.ts`, die ein `ToolModule`
   exportiert (`id`, `name`, `description`, `icon`, `category`, `keywords`, lazy `component`) –
   Vorbild: `tools/media-info/index.ts`.
2. In `src/renderer/src/tools/registry.ts` eintragen. Kategorien und ihre Überschriften stehen in
   `tools/types.ts`.
3. Braucht das Werkzeug den Hauptprozess: neue IPC-Fläche wie unter „Grundmuster“ beschrieben.

**Fertig heißt:**

- Layout über `ToolShell` (Inhalt + Seiten-Panel) bzw. `toolPageClass()` für schmale Seiten;
- Bausteine aus `components/ui` (Select, Progress, Badge, NumberField …) statt eigener Varianten;
- Speichern nach [Was wohin gehört](#was-wohin-gehört): Einstellungen in `settings.json`,
  Arbeitsdaten im Store **mit `version`** und `syncAcrossWindows`, Kleinigkeiten per
  `usePersistentState`;
- Fehler werden sichtbar (Toast über `@renderer/lib/toast`) – nichts wird still geschluckt;
- reine Logik in eigenen Modulen mit Unit-Tests (`*.test.ts` daneben);
- UI-Texte und Kommentare auf Deutsch, Kommentare erklären das Warum;
- das Werkzeug steht in [WERKZEUGE.md](WERKZEUGE.md) und im Überblick der [README](../README.md).

## Konventionen

- **Prettier:** kein Semikolon, einfache Anführungszeichen, 100 Zeichen (`.prettierrc.json`).
  Markdown ist davon ausgenommen.
- **ESLint** (Flat Config) muss warnungsfrei sein; `noUnusedLocals`/`noUnusedParameters` sind aktiv.
- **Aliase:** `@shared` → `src/shared`, `@renderer` → `src/renderer/src`.
- Deutsch für UI-Texte und Kommentare.
- Zeilenenden: Prettier steht auf `endOfLine: auto` und lässt LF wie CRLF gelten. Unter Windows
  (`core.autocrlf=true`) liegen die Dateien im Arbeitsordner mit CRLF, im Repository mit LF.

## Tests & CI

- **Vitest** (Umgebung Node, ohne DOM) prüft alles, was sich rein prüfen lässt: Rechenkerne der
  Werkzeuge, Konvertierungs-Plan und ffmpeg-Argumente, Encoder-Erkennung und -Rückfall (mit
  simuliertem ffmpeg), den ffprobe-Parser (Fixtures aus echten
  Ausgaben in `__fixtures__/`), OSC- und NovaStar-Codec, Netzwerk-Erkennung, Timer-Ablauf,
  Fernsteuer-Server und die Favoriten-Kategorien.
- main-Dienste lassen sich mit einem schlanken `vi.mock('electron', …)` ohne natives Modul testen.
- **E2E** (`e2e/`): `playwright-core` startet die **gebaute** App (`out/`) mit frischem userData-Ordner
  pro Lauf, das gebündelte Electron wird verwendet, Browser werden nicht geladen.
  `npm run e2e` baut und führt alle Skripte aus, `npm run e2e -- timer player` nur die genannten,
  `npm run e2e:run` ohne neuen Build. Skripte: `smoke` (Start, Kacheln, Suche, Werkzeug öffnen),
  `testpattern` (2-px-Rasterlinien pixelgenau), `timer` (Startbildschirm-Status, Bühnen-Anzeige im
  Browser samt Verbindungsabbruch, Zeitzone und totem Strom; öffnet kurz das Timer-Ausgabefenster),
  `player` (Playlist-Rückfrage, parallele Importe; braucht `npm run ff:fetch`), `video-generator`
  (Rechenlauf bild- und samplegenau, Zwischenspeicher, Schleife, Abbrechen, Eingabeprüfung,
  Oberfläche; braucht ffmpeg). `E2E_DEBUG=1` schreibt Ausgabe und Fenster des main-Prozesses mit.
  `e2e/harness.mjs`
  bringt `launchApp`, `openRoute`, `waitFor`, Dialog-Stubs, `openBrowserWindow` (unsichtbares
  Electron-Fenster als fremder Browser), `findFfmpeg`, `portFree` und `runSteps`. Ein neues Skript
  in `e2e/run.mjs` eintragen. Unter Linux ohne Display mit `xvfb-run` starten (der Harness setzt
  dort `--no-sandbox`). Tricks und Stolpersteine stehen im Projekt-Skill `electron-e2e`.
- **CI** (`.github/workflows/ci.yml`) läuft bei jedem Pull Request und auf `main`:
  - **Prüfungen** auf Linux mit Node 22 und 24: `npm ci`, Format, Lint, Typecheck (App und
    Tests), Tests, Build.
  - **App** auf Linux, Windows und macOS: `npm ci`, gebündeltes ffmpeg (`ff:fetch`, je Woche
    gecacht), Unit-Tests samt Labortest des Video-Generators, Build und alle E2E-Skripte (Linux
    mit `xvfb-run`). Arbeits-Branches laufen nur über ihren Pull Request; ein neuer Push bricht
    den veralteten Lauf ab.

## Build & Paketierung

```bash
npm run build      # Typecheck + Bundles nach out/
npm run package    # Installer fürs aktuelle OS: holt ffmpeg, baut, ruft electron-builder via npx
```

Der erste `package`-Lauf lädt electron-builder einmalig in den npx-Cache, nicht nach
`node_modules` (Begründung in [SICHERHEIT.md](SICHERHEIT.md)). Ergebnisse liegen in `dist/`:

| OS      | Ziel           | Datei                            |
| ------- | -------------- | -------------------------------- |
| Windows | NSIS-Installer | `Mottulbox-<Version>-setup.exe`  |
| macOS   | DMG            | `Mottulbox-<Version>.dmg`        |
| Linux   | AppImage       | `Mottulbox-<Version>.AppImage`   |

- Die entpackte App liegt zusätzlich unter `dist/win-unpacked/` bzw. `dist/linux-unpacked/`
  (macOS: `dist/mac*/`) und ist von dort direkt startbar; `npm run package:dir` baut nur diese.
- **Auf dem Zielsystem bauen:** ffmpeg und das native Modul sind plattformspezifisch. Für macOS
  liefert evermeet getrennte x64- und arm64-Binaries; ein DMG passt zur Architektur des
  Bau-Rechners (für Universal-Builds wären beide nötig).
- **Keine Code-Signierung** (`win.signAndEditExecutable: false` in `electron-builder.yml`): Sonst
  wollte electron-builder jede `.exe` signieren – auch `ffmpeg.exe`/`ffprobe.exe` – und dafür das
  `winCodeSign`-Paket laden, dessen Entpacken unter Windows an macOS-Symlinks scheitert („Dem
  Client fehlt ein erforderliches Recht“). Für den privaten Gebrauch ist kein Zertifikat
  vorgesehen; die Folgen sind fehlende Icon-/Versions-Metadaten in der `.exe` und die Warnungen
  von SmartScreen und Gatekeeper (siehe [INSTALL.md](INSTALL.md)).
- Ins Paket kommen `out/`, das ffmpeg des Zielsystems, das App-Icon und – falls eingerichtet – die
  Laufzeitdateien des NDI-Bindings ([NDI.md](NDI.md)).
