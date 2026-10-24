---
name: ipc-kanal
description: Neue IPC-Fläche in Mottulbox anlegen (Channel + ToolboxApi-Methode + Preload-Mapping + Handler, optional Event an den Renderer). Verwenden, sobald ein Werkzeug etwas vom main-Prozess braucht – Dateien, ffmpeg, Dialoge, Dienste – oder main dem Renderer etwas melden soll.
---

# Neue IPC-Fläche anlegen

Vier Stellen gehören immer zusammen (Git-Historie: `types.ts`, `ipc-contracts.ts` und
`preload/index.ts` werden fast bei jeder Funktion gemeinsam geändert). `ToolboxApi` zwingt den
Preload per Typ zur Vollständigkeit – `npm run typecheck` zeigt vergessene Stellen.

1. **Typen** in `src/shared/types.ts` (Anfrage, Antwort, Event-Nutzlast).
2. **Vertrag** in `src/shared/ipc-contracts.ts`:
   - `Channels`: Schema `<bereich><Aktion>: '<bereich>:<aktion>'`, z. B.
     `converterEnqueue: 'converter:enqueue'`. Events mit Kommentar `// Event: Typ`.
   - `ToolboxApi`: Methode im Namensraum des Bereichs (`converter: { … }`) mit kurzem
     Kommentar zum Warum. Events als `onXyz(cb): () => void` (Rückgabe = Abmelden).
3. **Preload** `src/preload/index.ts`: Aufruf `ipcRenderer.invoke(Channels.x, …)`; Events
   über `subscribe(Channels.x, (v) => cb(v as never))` (räumt Listener auf).
4. **Handler** in `src/main/ipc/<bereich>.handlers.ts`: `ipcMain.handle(Channels.x, (_e, arg) => …)`.
   Neue Datei → `registerXHandlers()` in `src/main/ipc/registry.ts` importieren und aufrufen.
   - Events: `broadcast(Channels.x, payload)` (`services/broadcast`, alle Fenster) bzw.
     `broadcastExcept` (ohne auslösendes Fenster). Dienste melden über einen Sink, z. B.
     `converterJobs.setSink((job) => broadcast(Channels.converterUpdate, job))`.

## Regeln

- **Eingaben prüfen**, auch vom eigenen Renderer: Typen, Allowlist, Grenzen für Zahlen/Längen
  (Muster `src/main/ipc/pattern.handlers.ts`, `services/player/remoteCommand.ts`). Keine
  ungeprüften Pfade oder URLs an ffmpeg, Shell oder `openPath`. Kein `file://`, kein neues
  Protokoll-Schema ohne Eintrag in `docs/SICHERHEIT.md`.
- Der Renderer spricht **nur** über `api` (`@renderer/lib/api`), nie direkt mit `ipcRenderer`.
- Logik aus dem Handler in einen Dienst im Ordner seines Bereichs (`src/main/services/<bereich>/`,
  siehe `/aufraeumen`) oder in `src/shared/` ziehen
  und dort mit vitest testen; der Handler bleibt eine dünne Hülle.
- ffmpeg-Aufrufe immer über `runFfmpeg()` (siehe CLAUDE.md, Abschnitt Konvertierung).
- **Schreiben in Pfade des Nutzers** nur, wenn main den Pfad selbst freigegeben hat (aus einem
  Dialog oder einer geöffneten Datei) – Muster `services/projects/projectFiles.ts`; atomar über
  `services/fsAtomic.ts`. Rückfragen mit mehr als zwei Antworten: `api.choose`. Ein Ordner aus
  den Einstellungen, den der Nutzer im Ordner-Dialog gewählt hat (Projektordner, Online-Ablage),
  zählt als freigegeben – darin aber nur Namen, die main selbst erzeugt, und vorher mit Zeitlimit
  prüfen (`isDirReachable`; Muster `services/html/onlineAblage.ts`).
- **Datei-Dialoge** immer über `showOpenDialog`/`showSaveDialog` aus `services/fileDialogs.ts`,
  nie direkt `dialog.show…Dialog`: Seit Electron 43 startet ein Dialog ohne absoluten Pfad im
  Downloads-Ordner; der Helfer merkt sich den Ordner (je Art, in settings.json). Eine neue Art
  (wie `'fotos'`) braucht einen Eintrag in `DialogDirKind` und `DEFAULT_SETTINGS.dialogDirs`.
- **Große Daten nie über IPC hin und her** (Fotos, Medien; Ausnahme PDF-Bytes, wo pdf.js sie im
  Renderer braucht: `manuals.bytes`, `util.renderPdf` für die Seitenansicht des Mini-Manuals): Sie bleiben im main, der Renderer
  bekommt einen Schlüssel (Hash, Name) und lädt über ein eigenes Protokoll. Ein neues Protokoll
  braucht vier Stellen: `protocol.registerSchemesAsPrivileged` vor `app.whenReady` und
  `protocol.handle` danach (`main/index.ts`, Muster `ipc/fotos.handlers.ts`: nur ein
  geprüfter Schlüssel, nur aus der eigenen Ablage), die CSP in `src/renderer/index.html`
  (`img-src`/`media-src` …) und `docs/SICHERHEIT.md`.
- **Unsichtbare Fenster mit fremdem Inhalt** (PDF-Druck): eigene, flüchtige Partition mit
  `webRequest.onBeforeRequest`, der nur die eigenen Dateien durchlässt – sonst lädt die Seite
  Bilder von Servern oder UNC-Freigaben (`file://server/…`, unter Windows mit Anmeldeversuch).
  Muster `services/pdf/htmlToPdf.ts`, Test `e2e/pdf.mjs` mit lokalem Spion-Server.

## Abschluss

`/abschluss-check` ausführen; bei neuer Fähigkeit `docs/WERKZEUGE.md` ergänzen.
