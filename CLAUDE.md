# CLAUDE.md

Mottulbox (Repo `project_mega`, früher „MegaToolBox“): plattformübergreifende AV-Werkzeug-App
(Electron + React + TypeScript).
UI-Sprache und Code-Kommentare sind Deutsch.

## Kommandos

```bash
npm run dev             # Entwicklung (Hot Reload)
npm run lint            # ESLint (Flat Config, --max-warnings 0)
npm run format:check    # Prettier-Prüfung (format = schreiben)
npm run check:files     # Dateinamen, die unter Windows/macOS kollidieren (auch in der CI)
npm run check:refs      # Dateiverweise in CLAUDE.md, docs/ und Skills existieren (auch in der CI)
npm run typecheck       # tsc: node- + web-Projekt
npm run typecheck:test  # tsc: Testdateien
npm test                # Vitest (einmalig; test:watch für Watch)
npm run e2e             # App bauen + E2E-Skripte (Playwright, e2e/; `-- timer` wählt aus)
npm run build           # typecheck + electron-vite build -> out/
npm run package         # Installer via electron-builder (holt ffmpeg)
npm run pwa:build       # Rechner-PWA (Browser, ohne Electron) -> out-pwa/; pwa:dev, pwa:preview
```

Ein einzelner Test: `npx vitest run src/renderer/src/tools/led-wall/math.test.ts`

## Architektur

Drei Build-Targets (electron-vite, CJS für main/preload): `src/main` (Node,
Services + IPC-Handler), `src/preload` (contextBridge-API), `src/renderer`
(React SPA mit HashRouter). Aliase: `@shared`, `@renderer`. Dienste im main je Bereich in
`src/main/services/<bereich>/` (`windows`, `remote`, `ndi`, `player`, `timer`, `convert`, `projects` …); lose
Dateien dort nur fürs ganze Programm (`store`, `db`, `log`, `broadcast`, `fileDialogs`, `fsAtomic`,
`shutdown`, `binaryVersion`, `reachableDir`).
Im main nie synchron auf einen Prozess warten (`spawnSync`/`execSync`, ESLint sperrt es): Das hält
Fenster und IPC an – Versionen von Hilfsprogrammen über `services/binaryVersion.ts`; ebenso kein
`statSync` auf Nutzerordner (Netzlaufwerk), sondern `isDirReachable()` mit Zeitlimit.

- **IPC-Vertrag:** `src/shared/ipc-contracts.ts` definiert `Channels` +
  `ToolboxApi` als einzige Quelle; `src/shared/types.ts` alle Domain-Typen.
  Neue IPC-Fläche = Channel + ToolboxApi-Methode + preload-Mapping +
  Handler in `src/main/ipc/*.handlers.ts` (Registrierung: `registry.ts`).
- **Renderer-Zugriff nur über `api`** (`@renderer/lib/api`), nie direkt ipcRenderer.
- **Datei-Dialoge** im main nur über `services/fileDialogs.ts` (merkt den Ordner je Art; Electron
  startet sie seit Version 43 sonst immer in „Downloads“).
- **PDF und Fotos:** PDF nur über `api.util.exportPdf` (`services/pdf/htmlToPdf.ts`: temporäre
  Datei, gesperrte Partition – Externes lädt nicht); Fotos der Projektdateien nur als Hash
  (`shared/fotos.ts`, Protokoll `foto:`, Ablage und Einfügen in `services/fotos/`).
- **Werkzeug-Layout** (für alle gleich): `ToolShell` mit `bar` (`ToolBar`: Ausgabe, rot solange
  live – oder `kind="job"` für den Auftrag) und `aside` (Schublade links aus `PanelSection`s mit
  `summary`; Felder per `Field`/`Checkbox` mit `hint` = ⓘ). Aktionen nie in die Schublade;
  App-weites (Design, Akzent, ffmpeg, yt-dlp) ins App-Menü `components/app/AppMenu.tsx`.
  Kleine Werkzeuge (Rechner) öffnen sich immer im eigenen, kleinen Fenster: Eintrag mit Breite in
  `SMALL_TOOLS` (`shared/toolWindows.ts`), die Höhe folgt dem Inhalt; Bausteine aus
  `tools/_calc/ui` (Erklärungen per `hint` hinter das ⓘ, Zahlen mit Komma, verknüpfte Felder per
  `useLinkedFields`). Fenster: `main/services/windows/appWindows.ts` (`createWindow`),
  `smallToolWindows.ts` (kleine Werkzeuge), Hauptfenster in `main/index.ts`.
- **Rechner-PWA** (`src/pwa/`, `vite.pwa.config.ts`): die kleinen Werkzeuge zusätzlich als
  Web-App fürs Handy, gleiche Module ohne Electron (Liste `src/pwa/tools.ts` = `SMALL_TOOLS`).
  Rechner dürfen daher weder `api` noch Einstellungen nutzen – der PWA-Build bricht sonst ab.
  Ihr CSS nimmt Tailwind-Klassen nur aus `src/pwa/build/sources.ts` (neue Abhängigkeit dort
  eintragen, der Build meldet sie).
- **Tools** liegen unter `src/renderer/src/tools/<id>/` und registrieren sich
  über `index.ts` (`ToolModule`) in `tools/registry.ts`; Kategorien/Labels in
  `tools/types.ts`. Lazy geladen über den Launcher (`/tool/:id`).
- **Zustand:** zustand-Stores je Tool; persistierte Stores (OSC, Jingle, LED-Wall, Packliste,
  Netzwerk-Scanner, Medien-Info, Video-Konverter) nutzen `debouncedStorage()` aus
  `@renderer/lib/persistStorage` (NIE die synchrone Default-Storage – Tipp-Lag), tragen
  eine `version` (migrierbar) und rufen `syncAcrossWindows(store)` (Fenster-Abgleich).
- **Eingabefelder mit Puffer:** immer `useDraft()` aus `@renderer/lib/useDraft`
  verwenden (externer Wert wird nur unfokussiert übernommen).
- **Ausgabefenster** (Testbild, Player, Timer, OSC-Monitor) sind eigene
  BrowserWindows auf Renderer-Routen (`#/output`, `#/player-output`,
  `#/timer-output`, `#/osc-monitor`); der main-Prozess bleibt autoritativ
  (Player-/Timer-Zustand tickt im main, Renderer spiegeln).
- **Handy-Fernsteuerungen** (Player/Jingle/OSC/Timer): dependency-freie HTTP-Server je Tool
  (`services/remote/remoteHttp.ts`), Steuerseiten als HTML-Strings. Die Fernsteuer-App
  (`remoteApp*.ts`, fester Port 8090) bindet laufende Fernsteuerungen unter `/<id>/` ein ->
  Steuerseiten sprechen ihre API IMMER relativ an (`api/…`, nie `/api/…`); PWA-Kopf und
  Client-Skript kommen aus `remotePwa.ts`. Start/Stopp/Merken/Autostart je Fernsteuerung
  über `registerRemoteControl()` (`ipc/remoteControls.ts`); im Werkzeug `useRemoteControl`,
  `RemoteToggle` und `RemoteSection` aus `components/RemoteControl.tsx`. Befehle vom Handy sind fremde
  Eingaben: feldweise prüfen (Allowlist, Werte begrenzen – Muster `player/remoteCommand.ts`).
- **Konvertierung:** EIN Kern für Video-Konverter (Tool-id `hap-converter`) und Player-Import;
  der Video-Generator nutzt ihn mit (Zeitachse/Filter rein in `shared/videoGenPlan.ts`), der
  Testbild-Export nur `runFfmpeg()` und die Farbkennung. Analyse per `probeMediaInfo` (Cache), alle Entscheidungen in
  `shared/convertPlan.ts` (rein, getestet, auch Vorschau im Renderer), Argumente/Runner in
  `main/services/convert/`. Neue Korrekturen
  und Formate dort einbauen, nicht je Tool; ffmpeg immer über `runFfmpeg()`, Pfade nur über
  `ffmpegBinPath()` (liefert ggf. den in der App aktualisierten Build). GPU-/Schnell-Encoder
  nur nach Probelauf (`convert/encoders.ts`, Wahl in `shared/encoderChoice.ts`), Aufträge über
  `encodeWithFallback()` (GPU scheitert -> einmal CPU). Lautheit zweistufig: vor dem Lauf
  `measureLoudness()`, Ergebnis als `loudness` an `buildConvertArgs` (`shared/loudness.ts`).
- **Aufträge** (Konverter, Player-Import, Video-Generator, YouTube-Downloader): eine Warteschlange
  mit Spuren `player`/`converter`/`download` (`services/jobs/queue.ts`), jede Auftragsliste erbt
  von `JobList` (`services/jobs/jobList.ts`: melden, abbrechen, Fertige entfernen, Fehler vs.
  Abbruch) und schreibt nur ihr `run()`.
- **Native/optionale Module:** better-sqlite3 (ab 13 über N-API: die Binaries liegen im Paket und
  laufen unter jeder Electron- und Node-Version, kein Rebuild, KEIN node-gyp im Baum); NDI-Binding
  `grandiose` ist optional + lazy (rollup-external, siehe `docs/NDI.md`); NDI-Ausgaben nur über den
  gemeinsamen Offscreen-Sender `services/ndi/ndiSender.ts` (Timer und Player sind dünne Hüllen).

## Konventionen

- Prettier: kein Semikolon, einfache Quotes, 100 Zeichen (`.prettierrc.json`);
  ESLint muss warnungsfrei sein; `noUnusedLocals/Parameters` sind aktiv.
- Deutsch für UI-Texte und Kommentare; Kommentare erklären das WARUM.
- Theme: Dunkel ist Standard, Hell über `.light` am `<html>`; Akzentfarbe über
  CSS-Variablen (`@renderer/lib/accent`). Farben immer über Tailwind-Tokens
  (`primary`, `border`, Status `success`/`warning`/`danger` …), nie hart kodieren. Rot: `danger`
  für Schrift, Rahmen und Tönung, `destructive` nur für volle Flächen (Knöpfe, „Live“); Hinweise
  im Inhalt als `Alert` (`components/ui/alert`); Symbol und Farbe je Statusstufe aus `STATUS`
  (`components/ui/status`).
- **Speichern – vier Orte, nie eigener localStorage-Parser** (Tabelle in docs/ENTWICKLUNG.md):
  Einstellungen (Pfade, Geräte/Ausgaben, Player/Timer, alles, was main braucht) in
  settings.json – Renderer: `useSettings(sel)` + `updateSettings(patch)` aus
  `@renderer/lib/settings`; Arbeitsdaten eines Werkzeugs im zustand-Store (s. o.);
  Bedien-Kleinigkeiten per `usePersistentState(key, vorgabe, codec)`; Dateien des Nutzers als
  Projektdatei `.mottul` (ein Abschnitt je Werkzeug, `useProjectFile` + `ProjectFileMenu`, Skill
  `projektdatei`). localStorage sonst nur als
  Boot-Spiegel (Theme/Akzent/Dichte). `setSettings`/`updateSettings` nur mit geänderten Feldern
  (feldweise gemergt, Listen ersetzt) – nie `{ ...getSettings().player, … }`; Textfelder für
  Einstellungen puffern (`TextField`/`NumberField`); Umzüge per `migrateLocalStorage`.

## Doku

README = kurzer Einstieg; Details in `docs/`: WERKZEUGE (Funktionen je Tool), FERNSTEUERUNG,
NDI, ENTWICKLUNG (Setup, Aufbau, Paketierung), SICHERHEIT, ROADMAP, INSTALL (Anwender).
Ausgearbeitete Pläne für größere Vorhaben: `docs/PLAN-*.md` (z. B. Video-Generator) – vor der
Umsetzung lesen, offene Fragen klären, nach der Umsetzung in WERKZEUGE überführen und löschen.
Wiederkehrende Abläufe als Projekt-Skills in `.claude/skills/` (`ipc-kanal`, `neues-werkzeug`,
`abschluss-check`, `electron-e2e`, `fernsteuerung-seite`, `konvertierungs-kern`, `ffmpeg-labor`,
`review-checkliste`, `abhaengigkeiten`, `aufraeumen`, `projektdatei`).
Neue oder geänderte Funktionen in `docs/WERKZEUGE.md` (neue Tools auch im README-Überblick)
nachtragen, Erledigtes aus `docs/ROADMAP.md` streichen. Markdown ist von Prettier ausgenommen.
