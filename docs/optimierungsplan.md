# MegaToolBox — Analyse & Optimierungsplan

> Bestandsaufnahme aus vier unabhängigen Code-Analysen (Architektur, Abhängigkeiten/Sicherheit,
> Tool-Inventar/UX, Tests/Robustheit). **Reine Bewertung + Fahrplan — kein Code wurde geändert.**
> Stand: Juli 2026, Basis ~31.000 LOC TypeScript, 21 Tools, 125 IPC-Kanäle.

---

## 0. Gesamtbild (ehrliche Einordnung)

Die vier Analysen kommen unabhängig zum **gleichen Urteil: ein reifes, überdurchschnittlich
diszipliniertes Projekt.** Belege quer durch den Baum:

- **Sicherheits-Posture deutlich über dem Electron-Durchschnitt:** sandbox + contextIsolation +
  `nodeIntegration:false` in **allen 8** Fenstern, Preload exponiert nur eine getypte API (nie rohes
  `ipcRenderer`), `window.open` verboten, Custom-Protocols gegen Path-Traversal gehärtet, Remote-HTML
  escapt Nutzertext konsequent (kein XSS gefunden).
- **Typsicherheit exzellent:** kein einziges `@ts-ignore`/`@ts-nocheck`, nur 2× `: any` (das dynamisch
  geladene NDI-Binding, sauber gescoped). ESLint mit `--max-warnings 0`, `noUnusedLocals/Parameters`.
- **Subprozess-/Netzwerk-Dienste robust:** Cancel via SIGKILL, Map-Cleanup, Aufräumen unfertiger
  Ausgaben, Doppel-Resolve-Guards, NDI-Teardown vermeidet Use-after-free — echt sorgfältig.
- **Saubere Grundmuster:** electron-vite + Vite 7 + TS strict, IPC-Kanäle existieren genau einmal
  (0 verwaiste), Tool-Plugin-Muster (neues Tool = Ordner + 1 Zeile), main-autoritative Zustände
  (Player/Timer ticken im main), CI läuft (format, lint, typecheck, test, build), **kein einziges
  TODO/FIXME** im Baum, Reifegrade explizit markiert.

**Die Verbesserungsfelder sind daher nicht „kaputte Dinge", sondern:**

1. **Fehlende Sicherheitsnetze** — ein Fehler an der falschen Stelle wird zum weißen Bildschirm
   (Show-Risiko), ohne Diagnosemöglichkeit.
2. **Angesammelter Struktur-Debt** durch schnelles Feature-Wachstum — jedes neue Tool kopiert Muster
   (Remote-Panel, Job-Queue, Select, Statusfarbe), statt geteilte Bausteine zuerst zu extrahieren.
3. **Wartung/Modernisierung** — Electron 40 ist aus dem Sicherheits-Support gefallen.
4. **Testabdeckung nur bei reiner Rechenlogik** — genau die show-kritischen main-Reducer sind ungetestet.

---

## 1. Phase 1 — „Show-Härtung" (höchster Nutzen/Aufwand, zuerst)

> **Status: umgesetzt.** ErrorBoundary (global + pro Werkzeug) + `api`-Guard/Boot-Check, globale
> main-Fehler-Handler + Renderer-Fehler ins Debug-Log (`util.log`), In-App-Toasts, stille Fehler
> sichtbar (Jingle-Pad/-Audiogerät, Jingle-/Manuals-/netscan-Pfade), `settings.json`- und
> `library.db`-Wiederherstellung, Persist-Stores versioniert. Details unten.

Diese Punkte wurden von mehreren Analysen unabhängig markiert und/oder sind für eine **Live-Show-App**
das größte Risiko. Alle klein bis mittel.

| # | Maßnahme | Warum kritisch | Aufwand |
|---|---|---|---|
| 1.1 | **React ErrorBoundary** um `<Tool/>` (in `ToolHost.tsx`, aktuell nur `Suspense`) + optional pro `/tool/:id`; Fallback-UI „Werkzeug-Fehler" mit Reload | Wirft **ein** Tool beim Rendern (oder scheitert ein Lazy-Chunk), stirbt die **ganze** SPA zum weißen Fenster — mitten in der Show. Zwei Analysen nannten das das größte Einzelrisiko. | S–M |
| 1.2 | **`api`-Guard** in `lib/api.ts`: bei `window.api === undefined` klare Meldung statt stillem `TypeError` | Schlägt die Preload-Injektion fehl, ist die App tot ohne Hinweis. | S |
| 1.3 | **Globale Fehler-Handler im main** (`process.on('unhandledRejection'/'uncaughtException')` → `logLine`) + `.catch(logLine)` an die `void win.loadURL/loadFile`-Aufrufe | Im gepackten Build ist das Debug-Log die **einzige** Fehlerquelle; unbehandelte Rejections landen dort nie → Feld-Diagnose unmöglich. | S |
| 1.4 | **Stille Fehler sichtbar machen** — v. a. show-kritisch: (a) stumme Jingle-Pads bei fehlender/defekter Audiodatei (`engine.ts` `play().catch(()=>{})`); (b) `setSinkId`-Fehler fällt still aufs Standardgerät zurück → **Jingle auf falschen Lautsprechern**; (c) Jingle-Remote-Port-Fehler (`catch {}`) → `api.notify` wie im Player; (d) Manuals-Import ohne `catch`; (e) netscan „kopiert!" auch bei fehlgeschlagenem Clipboard | Auf der Bühne ist „passiert nichts / falsche Box" schlimmer als eine Fehlermeldung. | S |
| 1.5 | **Persist-Stores versionieren** — `led-wall`, `netscan`, `jingle-player`, `packing-list` haben weder `version` noch `migrate` (nur `osc-control` hat es, mit 4 Migrationen als Vorbild) | Eine spätere Schema-/Typänderung macht gespeicherte LED-Wand-Planungen/Jobs **stumm kaputt**, ohne nachrüstbaren Migrationspfad (weil Version 0 nie geschrieben wurde). 10 Zeilen je Store. | S |
| 1.6 | **`getDb()` + `settings.json` härten** — `new Database()` in try/catch; bei Korruption Datei nach `*.corrupt-<ts>` sichern, neu anlegen, loggen + UI melden. `store.ts`: bei Parse-Fehler alte Datei **sichern** statt beim nächsten Write kommentarlos zu überschreiben | Korrupte `library.db` (Stromausfall im WAL-Write, volle Platte) legt Manuals **und** Player-Bibliothek dauerhaft lahm; korrupte `settings.json` = **kompletter Einstellungsverlust ohne Warnung**. | S |
| 1.7 | **In-App-Toast** einführen (leichtgewichtig) — `api.notify` (nativer Dialog) nutzen nur 2 Tools; ein Toast macht 1.4 überall konsistent bedienbar | Fundament, damit Fehler/Erfolge einheitlich statt teils gar nicht angezeigt werden. | M |

---

## 2. Phase 2 — Konsolidierung (Tech-Debt abbauen)

> **Teilweise umgesetzt (die verifizierbaren Quick-Wins):** gemeinsame `MEDIA_EXTENSIONS`
> in `src/shared/` (behebt die Drift im Idle-Dialog – dort fehlten mxf/mpg/wmv/mts/tif …);
> `QrCode`/`qr` nach `components/` verschoben (kein verstecktes Cross-Tool-Import mehr);
> gemeinsames `components/ui/select.tsx` (drei `selectClass`-Kopien + HapConverters eigene
> Video-Liste vereint); vitest-`include` auf `{ts,tsx}` (künftige Komponententests laufen);
> Persist-Stores versioniert
> (in Phase 1). **Bewusst NICHT gemacht: N7** (electron-builder als devDependency) – das würde die
> im README dokumentierte Sicherheits-Entscheidung (node-gyp/tar aus `npm ci` heraushalten)
> rückgängig machen. Rest folgt.

Das schnelle Feature-Wachstum hat Duplikate hinterlassen. Reihenfolge nach „Nutzen pro Aufwand".

### Duplikate zusammenführen
- **NDI-Dienste** (`timerNdi.ts` / `playerNdi.ts`, ~70 % identisch inkl. der subtilen Crash-Fixes) →
  ein `createNdiOffscreenSender(opts)`. Divergenz der Crash-Fixes ist sonst nur eine Frage der Zeit. **[M]**
- **Drei Job-Queues** (`JobManager`, `ConvertManager`, `YtManager`) teilen jobs-Map/Sink/schedule/cancel →
  `JobQueue<TJob>`-Basis. ~150 Zeilen dreifach. **[M]**
- **Drei Remote-Server-Handler + drei Remote-Panels** (Player/OSC/Jingle) → `registerRemoteHandlers(...)`
  + gemeinsame `<RemotePanel>` (Port, Start/Stop, QR, URLs). **Dabei Jingle-Kommando-Validierung auf
  OSC-Niveau heben** (aktuell nur Cast statt feldweiser Prüfung an unauth. LAN-Fläche). **[M]**
- **Medien-Endungslisten 4×** (mit realer Drift: Idle-Dialog ohne tif/tiff) → ein `MEDIA_EXTENSIONS`
  in `src/shared/`. **[S]**
- **`selectClass` 3×** + Inline-Varianten → ein `components/ui/select.tsx` (fehlt schlicht). **[S]**

### Konsistenz herstellen
- **Persistenz vereinheitlichen:** aktuell dreigleisig (settings.json / persistierte zustand-Stores /
  rohes localStorage in 8+ ad-hoc-Parse-Blöcken). Ein `useLocalStorage<T>(key, validate)`-Hook +
  klare, dokumentierte Regel welcher Weg wofür. (yt-dlp-Zielordner z. B. überlebt heute nur im
  localStorage, entgegen CLAUDE.md.) **[M, mechanisch]**
- **`setSettings` tief mergen** (bereichsweise `player`/`osc`, wie `getSettings` beim Lesen schon):
  behebt den **Lost-Update** (Renderer patcht mit veraltetem Snapshot über zwei IPC-Roundtrips, kann
  parallele main-Writes überschreiben) und macht die 7× `{...getSettings().player, …}`-Spreads löschbar. **[M]**
- **Statusfarben:** `success`/`warning`-Token in Tailwind ergänzen — 42 handkopierte
  `text-emerald-400 light:text-emerald-700`-Stellen in 14 Dateien beenden. **[S]**
- **`Progress`/`Badge` konsequent nutzen:** youtube-dl baut Balken + Status von Hand statt der
  vorhandenen Bausteine (HAP-Tool macht es vorbildlich). **[S]**
- **`main/services` aufräumen:** `playerNdi.ts` → `player/`, `oscRemoteServer/Page` → `osc/`,
  `jingle*` → `jingle/`, `timer*` → `timer/` (12 lose Dateien neben 7 Ordnern ohne Kriterium). **[S]**
- **Kleinkram:** `QrCode.tsx` → `components/` (wird cross-Tool importiert); `window.*`-Handler in ein
  `window.handlers.ts` (statt in `index.ts`); `attachWindow`-Fehlnutzung auflösen; redundante
  `wired`-Guards entfernen; `tsconfig.web` `"types":["node"]` raus (Renderer nutzt keine Node-Typen). **[S]**

### Gott-Dateien entzerren
- **`OscControl.tsx` (3.318 Z., ~40 Komponenten)** → Modulpaket: `widgets/`, `editor/`, `panels/`,
  `surface/`, Helfer nach `utils.ts`. **[L]**
- **`VideoPlayer.tsx` (1.744 Z., 29 `useState`)** → `PlayerNdiPanel`, Bibliothek/Konvertier-Queue,
  Playlist, Remote-Panel in eigene Dateien. **[M]**

### Das große Ergonomie-Thema
- **IPC-Vertrag generieren statt 4× pflegen** (Kanal = `Channels` + `ToolboxApi` + preload-Mapping +
  `ipcMain.handle`; Handler-Payloads sind reine Behauptung, 23× `cb(x as never)` im preload). Ein
  generischer Preload-Proxy aus `Channels` + ein typisierter `handle(Channels.x, fn)`-Wrapper (Signatur
  per Mapped Type aus `ToolboxApi`) reduziert neue Kanäle auf 2 Stellen, eliminiert die Casts und macht
  falsche Handler-Signaturen zu **Compile-Fehlern** — ohne Laufzeitänderung. **[L, größter langfristiger Gewinn]**
- **Mobile-Remote-Seiten** (823 Z. HTML/CSS/JS in Template-Literalen, ungelintet) als echte
  Build-Artefakte/`?raw`-Importe; Touch-Widget-Logik als geteiltes Modul mit dem Desktop. **[L]**

---

## 3. Phase 3 — Modernisierung

| Upgrade | Nutzen | Aufwand | Anmerkung |
|---|---|---|---|
| **Electron 40 → 42/43** | **Muss.** 40 ist EOL (seit Release 43), keine Chromium/Node-Security-Backports mehr — relevant, weil der Renderer Fremd-PDFs/-Medien parst | M | Scripts sind versionsagnostisch, NDI baut per ABI-Marker neu; `<video>`/Offscreen (NDI) testen |
| **pdfjs-dist 4 → 6** | Sicherheit: parst **importierte Fremd-PDFs**, v4 ungepflegt (2 Majors zurück) | S–M | Nur 2 Stellen (PdfViewer-Worker, main pdfText) |
| **react-router 6 → 7** | Endpflege 6.x; Library-Mode praktisch drop-in | S | Nur HashRouter/Routes/Route |
| **React 18 → 19** | Zukunftssicherheit; Codebasis ist schon 19-ready | M | Hauptarbeit mechanisch: 128× globales `JSX.Element` in 49 Dateien → `ReactElement`/`React.JSX.Element` |
| **Tailwind 3 → 4** | Schnellere Builds (Oxide), postcss/autoprefixer entfällt | M | Eigenes Token-System + `light:`-Variante auf `@theme`/`@custom-variant`; kein Druck |
| Kleinkram | `npm audit fix` (1 low: esbuild Dev-Server, nur Win/`npm run dev`); lucide-react 0.469→1.x (Icon-Renames prüfen); better-sqlite3 12.11.x mit Cooldown; README-Sicherheitsabschnitt an Electron-Stand anpassen | S | |
| Beobachten (gated) | **Vite 8** (electron-vite@5 peert nur ≤7), **TS 7 „tsgo"** (würde den doppelten `tsc`-Build stark beschleunigen) | — | Warten auf Ökosystem |

Keine veralteten APIs gefunden (createRoot+StrictMode, keine Klassen/`ReactDOM.render`/`new Buffer`).

---

## 4. Phase 4 — Tests & CI (kontinuierlich)

- **Reducer zuerst** (DOM-frei, sofort lauffähig, höchster Wert, weil main-autoritativ):
  - `stageTimer.applyTimerCommand` ✅ (10 Tests inkl. Wanduhr-Countdown + End-Verhalten stop/next/overtime).
  - `convertManager.analyzeFit`/`canStreamCopy` ✅ (7 Tests; die „Warum-neu-konvertieren?"-Logik).
    Dabei etabliert: ein schlanker `vi.mock('electron', …)` reicht, um main-Services **ohne** natives
    Modul zu testen (Muster für die nächsten).
  - Offen: `playerState` (importiert `db` → better-sqlite3, braucht mehr Mock-Aufwand),
    `ytDlp`-Args/Zeilen-Parser, `remoteHttp`-Parsing. **[M]**
- **Komponententests:** `jsdom` + `@testing-library/react` ergänzen, vitest-`include` von `.ts` auf
  `{ts,tsx}` erweitern (heute würde ein `*.test.tsx` typgeprüft, aber nie ausgeführt). **[M]**
- **CI:** Matrix um `windows-latest`/`macos-latest` (Kernversprechen „plattformübergreifend" wird heute
  nie plattformweit gebaut/getestet — native `better-sqlite3` + Electron-Bundling!); optional
  Coverage-Schwelle. **[S]**

---

## 5. Neue Ideen (AV-Techniker-Perspektive)

Bestehende Verzahnungen als Muster: netscan → novastar/osc (`lib/handoff.ts`), led-wall → packing-list
(`deriveFromLedWall`), Launcher-Aktivitätsbadges. Darauf aufbauend:

1. **Handoff-Store generalisieren** — heute nur `novastarHost` (von `openInOsc` zweckentfremdet). Ein
   ziel-agnostischer Slot (`pendingIp` + Zieltool) ist die Basis für alle weiteren Übergaben.
2. **Job → Player-Bibliothek** — am fertigen youtube-dl-/HAP-Job „In Player importieren" (`outputFile`
   liegt vor, der Player bäckt ohnehin ein). Spart den Dateimanager-Umweg kurz vor der Show.
3. **led-wall → video-player / test-patterns** — Wandauflösung per Klick als Player-Wandgröße bzw.
   Testbildauflösung setzen; das Testbild-Gitter den **echten Modulraster** der LED-Wand nutzen lassen
   (Pixelfehlersuche pro Modul).
4. **led-wall → power-load / rigging** — `computeWall` liefert Gewicht + Stromaufnahme; ein Klick „In
   Stromlast prüfen" / „Als Punktlast ins Rigging" schließt den Kreis Wand → Strom → Traverse.
5. **netscan → manuals** — erkannten Hersteller (aus MAC) direkt als Volltextsuche in der
   Handbuch-Bibliothek öffnen („Handbuch zu diesem Gerät").
6. **stage-timer OSC-steuerbar** (Start/Pause/±1 min als OSC-Eingang) — aus Companion/Streamdeck
   bedienbar; deckt sich mit dem Roadmap-Punkt „tool-übergreifende OSC-Trigger".
7. **Packliste aus mehr Quellen** — das `deriveFromLedWall`-Muster auf Rigging (Anschlagmittel je
   Bridle) und Stromlast (Kabel/Verteiler je Kreis) ausdehnen.
8. **Übergreifendes „Projekt/Show"-Profil** *(neue Idee)* — ein leichtes Show-Profil, das Wandauflösung,
   Geräte-IPs, NovaStar-/OSC-Ziele, Packliste **tool-übergreifend** setzt und speichert. Die
   Einzel-Handoffs oben werden damit zu einem kohärenten „Event laden". Passt zum Offline-Show-Charakter.
9. **README-Roadmap priorisieren** (schon geplant, nicht neu erfinden): ArtNet/sACN-Tester ↔
   dmx-address, IP-/Subnetz-Rechner ↔ netscan, Audio-Testtöne im Testbildgenerator.

---

## 6. Sicherheit — gezielt härten

Die Posture ist gut; das sind Feinschliffe (außer Electron):

- **Electron-Upgrade** (Phase 3) — der einzige echte Sicherheits-Muss-Punkt.
- **Remote-Upload begrenzen** — `/api/upload` läuft ohne Größenlimit (`req.pipe(ws)` → Disk-Fill) und
  durch ffmpeg (Parser-Angriffsfläche mit Fremddatei): Content-Length-/Byte-Cap; optional PIN/Token in
  der Remote-URL. (Server ist bewusst standardmäßig AUS.)
- **Produktive CSP ohne `unsafe-eval`** (pdfjs `isEvalSupported:false` testen), Dev-CSP separat.
- **Zentrale `web-contents-created`-Guards** — `setPermissionRequestHandler`, `will-navigate`,
  `setWindowOpenHandler` auch für Ausgabe-/Offscreen-Fenster (heute nur Hauptfenster).
- **`shellOpenPath`-Allowlist** (userData + gewählte Ausgabeordner) statt beliebiger Pfade.
- **Download-Härtung** — Hash-Pinning für ffmpeg/yt-dlp/electron-bin (heute HTTPS + offizielle Quellen,
  aber keine Checksumme); `--` vor die yt-dlp-URL, damit `-…`-Eingaben nicht als Flag gelesen werden.
- **README** — Sicherheitsabschnitt aktualisieren (Electron nicht mehr „unterstützt", `npm audit` jetzt
  1 low statt 0).

---

## 7. Reflexion — was strukturell besser gemacht werden kann

- **Konsolidierung hinkt dem Tempo hinterher.** Jedes neue Tool kopiert Muster (Remote-Panel,
  Job-Queue, Select, Statusfarbe, localStorage-Parse), statt zuerst den geteilten Baustein zu
  extrahieren. Die Lösung ist eine dünne **„Plattform-Schicht"**: ein vollständiges UI-Kit
  (Select/Progress/Badge/Toast) + Service-Basen (JobQueue, NDI-Sender, RemoteHost), die neue Tools
  nur noch **komponieren**. Das ist der rote Faden hinter fast allen Phase-2-Punkten.
- **Der IPC-Vertrag ist die größte Ergonomie-Steuer** und eine latente Fehlerquelle (4 Stellen,
  untypisierte Handler). Ihn zu generieren zahlt dauerhaft ein.
- **Persistenz braucht eine einzige, dokumentierte Regel** (heute drei Wege). Ein Hook + klare
  Zuständigkeit beendet die Drift.
- **Tests sind stark, aber nur bei reiner Mathematik** — genau die show-kritischen main-Reducer
  (Timer-Ablauf, Player-Zustand, Konvertier-Entscheidung) sind ungetestet, obwohl DOM-frei und damit
  ohne Umbau testbar.
- **Vorschlag: eine leichte „Definition of Done" für neue Tools** — nutzt ToolShell (oder begründet
  warum nicht); nutzt das geteilte Select/Progress/Badge; persistiert über den **einen** gesegneten
  Weg **mit Version**; Fehler werden über Toast/notify sichtbar; Reducer-Logik ist unit-getestet.
  Das hält den bereits hohen Standard, ohne die Feature-Geschwindigkeit zu bremsen.

---

## Kurzfassung / empfohlene Reihenfolge

1. **Jetzt (Phase 1, alles S–M):** ErrorBoundary + api-Guard, globale main-Fehler-Handler, stille
   Fehler sichtbar machen (v. a. Jingle-Audio!), Persist-Stores versionieren, DB/Settings-Backup,
   Toast-Fundament. → Nimmt die realen Show-Risiken raus.
2. **Als Nächstes (Phase 3-Sicherheit):** Electron 40 → 42/43 + pdfjs 4 → 6. → Zurück ins
   Sicherheitsfenster.
3. **Laufend (Phase 2):** Duplikate zusammenführen + geteilte UI-/Service-Bausteine — beginnend mit den
   billigsten (MEDIA_EXTENSIONS, Select, Farbtoken, Store-Versionen), dann NDI/JobQueue/Remote.
4. **Geplant (Phase 4 + Rest Phase 3):** Reducer-Tests + CI-Matrix; React 19/Router 7; später IPC-Vertrag
   generieren, Gott-Dateien splitten, Tailwind 4.
5. **Wenn Luft ist (Phase 5):** die Cross-Tool-Verzahnungen + das „Show-Profil" — der eigentliche
   Mehrwert-Hebel für den Show-Alltag.
