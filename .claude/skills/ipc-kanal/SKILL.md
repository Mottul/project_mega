---
name: ipc-kanal
description: Neue IPC-Fläche in Mottulbox anlegen (Eintrag im Vertrag + Handler, optional Event an den Renderer). Verwenden, sobald ein Werkzeug etwas vom main-Prozess braucht – Dateien, ffmpeg, Dialoge, Dienste – oder main dem Renderer etwas melden soll.
---

# Neue IPC-Fläche anlegen

Zwei Stellen, dazu die Domain-Typen: Der Vertrag ist die einzige Quelle, `window.api` entsteht
daraus (`src/preload/baueApi.ts`), den Preload fasst niemand an. Der Compiler prüft den Handler
gegen den Vertrag; ein Test meldet Kanäle ohne Gegenstelle im main.

1. **Typen** in `src/shared/types.ts` (Anfrage, Antwort, Event-Nutzlast).
2. **Vertrag:** ein Eintrag in `Channels` (`src/shared/ipc-contracts.ts`), im Abschnitt des Bereichs
   und mit kurzem Kommentar zum Warum. Der Pfad ist auch der Name in `window.api`:

   ```ts
   converter: {
     /** … */
     enqueue: anfrage<(req: ConverterEnqueueRequest) => { jobIds: string[] }>('converter:enqueue'),
     cancelAll: anfrage('converter:cancelAll'), // ohne Typ: () => void
     onUpdate: ereignis<(job: ConverterJob) => void>('converter:update')
   },
   util: { log: einweg<(message: string) => void>('util:log') }
   ```

   - `anfrage`: Antwort kommt. Signatur **ohne** Promise, das ergänzt die API.
   - `ereignis`: main meldet. Name immer `onXyz`; der Typ ist der Callback, die API liefert das
     Abmelden.
   - `einweg`: ohne Antwort, nur für Häufiges oder was nie werfen darf (PCM-Blöcke, Log).
   - Der Kanalname (`bereich:aktion`) muss eindeutig sein – der Test prüft es.
3. **Handler** in `src/main/ipc/<bereich>.handlers.ts`: `handle(Channels.converter.enqueue, (_e, req) => …)`
   bzw. `on(…)` für Einweg, beide aus `ipc/kanal.ts`; `ipcMain` direkt sperrt ESLint.
   Parameter und Ergebnis kommen aus dem Vertrag, nicht wiederholen. Prüft der Handler selbst,
   nimmt er den Parameter als `unknown` an. Neue Datei → `registerXHandlers()` in
   `src/main/ipc/registry.ts` importieren und aufrufen.
   - Events: `broadcast(Channels.x.onY, payload)` (`services/broadcast`, alle Fenster),
     `broadcastExcept` (ohne auslösendes Fenster) oder `sendeAn(e.sender, …)` (nur der Anfrager).
     Nie `webContents.send` direkt: Das prüft die Nutzlast nicht. Dienste melden über einen Sink,
     z. B. `converterJobs.setSink((job) => broadcast(Channels.converter.onUpdate, job))`.
   - Fernsteuerung: vier gleich benannte Einträge (`remoteStatus`, `remoteStart`, `remoteStop`,
     `onRemoteChanged`) und `registerRemoteControl({ channels: Channels.<bereich>, … })`.

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
