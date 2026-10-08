---
name: electron-e2e
description: E2E-Tests der gebauten Mottulbox-App mit Playwright schreiben, ausführen und Fehler daran suchen. Verwenden, wenn Oberfläche, IPC, Ausgabefenster, Fernsteuerung oder Importe geändert wurden oder ein Verhalten in der echten App geprüft werden soll.
---

# Electron-E2E

Ausführen: `npm run e2e` (baut die App, dann alle Skripte) oder gezielt
`npm run e2e -- timer player`; ohne neuen Build `npm run e2e:run -- smoke`. Skripte liegen in
`e2e/`, `run.mjs` kennt sie über die Liste `all` – **ein neues Skript dort eintragen**.

| Skript | Prüft |
|---|---|
| `smoke.mjs` | Start, Kachelhöhen, Suche, Werkzeug öffnen, Programmbrücke, keine Konsolenfehler |
| `testpattern.mjs` | 2-px-Rasterlinien pixelgenau (Raster und Mapping-Testbild) |
| `timer.mjs` | Startbildschirm-Status, Bühnen-Anzeige im Browser, Abbruch/Neuverbindung, Zeitzone, toter Strom |
| `player.mjs` | Playlist-Rückfrage, parallele Importe, doppelte Quelle, gleichnamige Kopien (braucht ffmpeg) |
| `shutdown.mjs` | App mitten in Konverter-, Generator- und Vorschau-Läufen beenden: kein ffmpeg läuft weiter, keine halben Dateien, Beenden unter 10 s |
| `video-generator.mjs` | Rechenlauf über die Brücke (Bilder/Samples exakt, Cache, Schleife, Abbrechen, Eingabeprüfung, Vorschau rechnen, Musik, Quelladressen), Oberfläche mit gestubbten Datei-/Speicherdialogen (Live-Vorschau, Ken-Burns-Rahmen, Bereichsregler, Musik-Panel) |

## Neues Skript

```js
import assert from 'node:assert/strict'
import { launchApp, openRoute, runSteps } from './harness.mjs'

const ctx = await launchApp() // frisches userData je Lauf (ctx.userData)
const { app, page } = ctx
try {
  await runSteps('Mein Werkzeug', [
    ['tut etwas', async () => { await openRoute(page, '/tool/meine-id') /* assert … */ }]
  ])
} finally {
  await ctx.close()
}
```

Helfer in `e2e/harness.mjs`: `launchApp`, `openRoute`, `waitFor` (statt `sleep`), `stubConfirm`,
`stubConfirmSequence`, `holdConfirm`/`resolveConfirm`, `openBrowserWindow`, `findFfmpeg`,
`portFree`, `Skip` (Schritt überspringen), `runSteps` (✓/✗/–, Exit-Code 1 bei Fehlern).

## Was sich bewährt hat (jeweils schon in Skripten gelöst)

- **Zustand über die Brücke setzen** statt klicken: `page.evaluate(() => window.api.…)`.
- **Native Dialoge ersetzen** (`api.confirm` → `dialog.showMessageBox` im main): Stub per
  `app.evaluate`; mit `holdConfirm` bleibt er offen, bis man ihn beantwortet.
- **Einstellungs-Broadcast erreicht das auslösende Fenster nicht.** „Ein anderes Fenster
  speichert“ also wirklich testen: `api.openToolWindow(id)` + `app.waitForEvent('window')`.
- **Dieselbe Route noch einmal setzen lädt nichts neu**, und Ausgabe-Routen (`#/output`) lesen
  ihre Konfiguration nur beim Öffnen: erst `/`, dann die Zielroute.
- **Gesteuerte Checkboxen:** `.check()` scheitert, wenn der Zustand erst nach dem Speichern
  umspringt – `click()` und dann mit `waitFor` auf das Ergebnis warten.
- **Zeichenflächen haben Fenstergröße:** vor Pixelprüfungen `page.setViewportSize(…)`, gelesen
  wird mit `getImageData`.
- **Fernsteuer-Seiten** in `openBrowserWindow` öffnen (unsichtbares Electron-Fenster ohne
  Preload, Zeitzone per `timezoneId`); Playwright-Chromium ist nicht installiert. Eigene Ports
  verwenden (z. B. 18092), damit eine laufende Mottulbox nicht stört; vor Tests auf den festen
  Port 8090 mit `portFree` prüfen.
- **Verbindungsabbruch:** eine TCP-Weiterleitung, die Sockets „einfriert“ (Beispiel
  `e2e/timer.mjs`), bildet das halboffene WLAN-Aussetzen nach; Erholung großzügig abwarten.
- **Testmedien per lavfi** (`findFfmpeg()`), ohne ffmpeg `throw new Skip(…)`.
- **Datei- und Speicherdialoge** ebenso per `app.evaluate` ersetzen: `dialog.showOpenDialog` /
  `dialog.showSaveDialog` liefern feste Pfade (Beispiel `e2e/video-generator.mjs`).
- **Beenden testen:** `app.quit()` per `app.evaluate` (in `setTimeout`, sonst reißt die Antwort
  ab), auf `app.process()` 'exit' warten; übrige Prozesse am Pfad des gebündelten ffmpeg
  erkennen (PowerShell `Get-Process … ; exit 0` – ohne Treffer endet es sonst mit 1). Beispiel
  `e2e/shutdown.mjs`.
- **Fehlersuche:** `E2E_DEBUG=1` schreibt Ausgabe und Ende des main-Prozesses sowie
  Fenster-Ereignisse (neu, geschlossen, abgestürzt) mit.
- `ELECTRON_RUN_AS_NODE` aus der Umgebung entfernt der Harness (sonst startet Electron als Node).

## Grenzen

- `timer.mjs` öffnet kurz das Timer-Ausgabefenster auf dem ersten Bildschirm.
- Unter Linux ohne Display `xvfb-run -a …`; der Harness setzt dort `--no-sandbox`. Die CI läuft
  die E2E-Skripte derzeit nicht.
- Fehlschlag zuerst als Testproblem prüfen (Zeitfenster zu eng, Route nicht neu geladen),
  bevor die App geändert wird – wie beim „toten Strom“, wo erst ein zweiter Anlauf die Verbindung
  wiederherstellt.
