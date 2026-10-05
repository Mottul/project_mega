# CLAUDE.md

Mottulbox (Repo `project_mega`, früher „MegaToolBox“): plattformübergreifende AV-Werkzeug-App
(Electron + React + TypeScript).
UI-Sprache und Code-Kommentare sind Deutsch.

## Kommandos

```bash
npm run dev             # Entwicklung (Hot Reload)
npm run lint            # ESLint (Flat Config, --max-warnings 0)
npm run format:check    # Prettier-Prüfung (format = schreiben)
npm run typecheck       # tsc: node- + web-Projekt
npm run typecheck:test  # tsc: Testdateien
npm test                # Vitest (einmalig; test:watch für Watch)
npm run build           # typecheck + electron-vite build -> out/
npm run package         # Installer via electron-builder (holt ffmpeg)
```

Ein einzelner Test: `npx vitest run src/renderer/src/tools/led-wall/math.test.ts`

## Architektur

Drei Build-Targets (electron-vite, CJS für main/preload): `src/main` (Node,
Services + IPC-Handler), `src/preload` (contextBridge-API), `src/renderer`
(React SPA mit HashRouter). Aliase: `@shared`, `@renderer`.

- **IPC-Vertrag:** `src/shared/ipc-contracts.ts` definiert `Channels` +
  `ToolboxApi` als einzige Quelle; `src/shared/types.ts` alle Domain-Typen.
  Neue IPC-Fläche = Channel + ToolboxApi-Methode + preload-Mapping +
  Handler in `src/main/ipc/*.handlers.ts` (Registrierung: `registry.ts`).
- **Renderer-Zugriff nur über `api`** (`@renderer/lib/api`), nie direkt ipcRenderer.
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
  (`services/remoteHttp.ts`), Steuerseiten als HTML-Strings. Die Fernsteuer-App
  (`remoteApp*.ts`, fester Port 8090) bindet laufende Fernsteuerungen unter `/<id>/` ein ->
  Steuerseiten sprechen ihre API IMMER relativ an (`api/…`, nie `/api/…`); PWA-Kopf und
  Client-Skript kommen aus `remotePwa.ts`. Start/Stopp/Merken/Autostart je Fernsteuerung
  über `registerRemoteControl()` (`ipc/remoteControls.ts`). Befehle vom Handy sind fremde
  Eingaben: feldweise prüfen (Allowlist, Werte begrenzen – Muster `player/remoteCommand.ts`).
- **Konvertierung:** EIN Kern für Video-Konverter (Tool-id `hap-converter`), Player-Import
  und Testbild-Export: Analyse per `probeMediaInfo` (Cache), alle Entscheidungen in
  `shared/convertPlan.ts` (rein, getestet, auch Vorschau im Renderer), Argumente/Runner/
  Warteschlange (Spuren `player`/`converter`) in `main/services/convert/`. Neue Korrekturen
  und Formate dort einbauen, nicht je Tool; ffmpeg immer über `runFfmpeg()`. GPU-/Schnell-Encoder
  nur nach Probelauf (`convert/encoders.ts`, Wahl in `shared/encoderChoice.ts`), Aufträge über
  `encodeWithFallback()` (GPU scheitert -> einmal CPU).
- **Native/optionale Module:** better-sqlite3 (Prebuild via
  `scripts/rebuild-native.mjs`, KEIN node-gyp im Baum); NDI-Binding
  `grandiose` ist optional + lazy (rollup-external, siehe `docs/NDI.md`).

## Konventionen

- Prettier: kein Semikolon, einfache Quotes, 100 Zeichen (`.prettierrc.json`);
  ESLint muss warnungsfrei sein; `noUnusedLocals/Parameters` sind aktiv.
- Deutsch für UI-Texte und Kommentare; Kommentare erklären das WARUM.
- Theme: Dunkel ist Standard, Hell über `.light` am `<html>`; Akzentfarbe über
  CSS-Variablen (`@renderer/lib/accent`). Farben immer über Tailwind-Tokens
  (`primary`, `border`, …), nie hart kodieren.
- **Speichern – drei Orte, nie eigener localStorage-Parser** (Tabelle in docs/ENTWICKLUNG.md):
  Einstellungen (Pfade, Geräte/Ausgaben, Player/Timer, alles, was main braucht) in
  settings.json – Renderer: `useSettings(sel)` + `updateSettings(patch)` aus
  `@renderer/lib/settings`; Arbeitsdaten eines Werkzeugs im zustand-Store (s. o.);
  Bedien-Kleinigkeiten per `usePersistentState(key, vorgabe, codec)`. localStorage sonst nur als
  Boot-Spiegel (Theme/Akzent/Dichte). `setSettings`/`updateSettings` nur mit geänderten Feldern
  (feldweise gemergt, Listen ersetzt) – nie `{ ...getSettings().player, … }`; Textfelder für
  Einstellungen puffern (`TextField`/`NumberField`); Umzüge per `migrateLocalStorage`.

## Doku

README = kurzer Einstieg; Details in `docs/`: WERKZEUGE (Funktionen je Tool), FERNSTEUERUNG,
NDI, ENTWICKLUNG (Setup, Aufbau, Paketierung), SICHERHEIT, ROADMAP, INSTALL (Anwender).
Neue oder geänderte Funktionen in `docs/WERKZEUGE.md` (neue Tools auch im README-Überblick)
nachtragen, Erledigtes aus `docs/ROADMAP.md` streichen. Markdown ist von Prettier ausgenommen.
