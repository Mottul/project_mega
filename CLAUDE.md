# CLAUDE.md

MegaToolBox: plattformübergreifende AV-Werkzeug-App (Electron + React + TypeScript).
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
  über `index.ts` (ToolDef) in `tools/registry.ts`; Kategorien/Labels in
  `tools/types.ts`. Lazy geladen über den Launcher (`/tool/:id`).
- **Zustand:** zustand-Stores je Tool; persistierte Stores (OSC, Jingle,
  LED-Wall, Packliste) nutzen `debouncedStorage()` aus
  `@renderer/lib/persistStorage` (NIE die synchrone Default-Storage – Tipp-Lag).
- **Eingabefelder mit Puffer:** immer `useDraft()` aus `@renderer/lib/useDraft`
  verwenden (externer Wert wird nur unfokussiert übernommen).
- **Ausgabefenster** (Testbild, Player, Timer, OSC-Monitor) sind eigene
  BrowserWindows auf Renderer-Routen (`#/output`, `#/player-output`,
  `#/timer-output`, `#/osc-monitor`); der main-Prozess bleibt autoritativ
  (Player-/Timer-Zustand tickt im main, Renderer spiegeln).
- **Native/optionale Module:** better-sqlite3 (Prebuild via
  `scripts/rebuild-native.mjs`, KEIN node-gyp im Baum); NDI-Binding
  `grandiose` ist optional + lazy (rollup-external, siehe README „NDI-Ausgabe").

## Konventionen

- Prettier: kein Semikolon, einfache Quotes, 100 Zeichen (`.prettierrc.json`);
  ESLint muss warnungsfrei sein; `noUnusedLocals/Parameters` sind aktiv.
- Deutsch für UI-Texte und Kommentare; Kommentare erklären das WARUM.
- Theme: Dunkel ist Standard, Hell über `.light` am `<html>`; Akzentfarbe über
  CSS-Variablen (`@renderer/lib/accent`). Farben immer über Tailwind-Tokens
  (`primary`, `border`, …), nie hart kodieren.
- settings.json (main, `services/store.ts`) ist Quelle der Wahrheit für
  App-Einstellungen; localStorage nur als Boot-Spiegel (Theme/Akzent).
