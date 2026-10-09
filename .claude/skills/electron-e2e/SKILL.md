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
| `smoke.mjs` | Start, Kachelhöhen, Suche, Werkzeug öffnen, Programmbrücke, Datei-Dialoge merken sich den Ordner, keine Konsolenfehler |
| `layout.mjs` | Werkzeug-Muster: Kopfleiste, App-Menü (13 Akzentfarben), Schublade (anheften/lösen/schließen, je Werkzeug gemerkt), ⓘ, Ausgabe-Leiste live/aus (Esc und Schließen von außen), Monitorwechsel von Testbild- und Player-Ausgabe, Auftrags-Leiste, kleine Werkzeuge im eigenen Fenster (Kachel, Umleitung, eines je Werkzeug, Breite/Lage gemerkt, Höhe folgt dem Inhalt ohne Sprung, zweispaltig, 320 px ohne Querscrollen, Kompaktmodus live, gehen mit dem Hauptfenster) |
| `testpattern.mjs` | 2-px-Rasterlinien pixelgenau (Raster und Mapping-Testbild) |
| `timer.mjs` | Startbildschirm-Status, Ausgabe schließen bei minimiertem Hauptfenster, Bühnen-Anzeige im Browser, Abbruch/Neuverbindung, Zeitzone, toter Strom |
| `player.mjs` | Playlist-Rückfrage, parallele Importe, doppelte Quelle, gleichnamige Kopien (braucht ffmpeg) |
| `ffmpeg-update.mjs` | ffmpeg-Aktualisierung der fertigen App gegen einen lokalen Schein-Release-Server (`MOTTULBOX_FFMPEG_RELEASES_URL`): 7-Tage-Regel, Prüfsumme, Aktivierung nach Neustart (`launchApp({ userData })`), zurück zum mitgelieferten |
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
  `dialog.showSaveDialog` liefern feste Pfade (Beispiel `e2e/video-generator.mjs`). Die Optionen
  stehen im letzten Argument (davor ggf. das Elternfenster) – so lässt sich auch der Startpfad
  prüfen (Beispiel `e2e/smoke.mjs`).
- **`app.evaluate` in Warteschleifen** mit `.catch(() => false)`: Kurz nach dem Start wirft
  Playwright gelegentlich „Resulting promise was garbage collected“ (CI unter Linux).
- **Beenden testen:** `app.quit()` per `app.evaluate` (in `setTimeout`, sonst reißt die Antwort
  ab), auf `app.process()` 'exit' warten; übrige Prozesse am Pfad des gebündelten ffmpeg
  erkennen (PowerShell `Get-Process … ; exit 0` – ohne Treffer endet es sonst mit 1). Beispiel
  `e2e/shutdown.mjs`.
- **Fehlersuche:** `E2E_DEBUG=1` schreibt Ausgabe und Ende des main-Prozesses sowie
  Fenster-Ereignisse (neu, geschlossen, abgestürzt) mit.
- **Werkzeug-Muster greifen:** `page.getByTestId('tool-bar')` (Attribute `data-active`, `data-kind`)
  und `getByTestId('settings-drawer')` (`data-pinned`); Knöpfe über ihre Namen („Einstellungen“,
  „Schublade lösen“, „Vollbild starten“). Eine Bereichs-Überschrift heißt Titel + Zusammenfassung –
  mit Regex suchen (`{ name: /Anzeige im Browser/ }`).
- **Tastendruck im Ausgabefenster** (Esc schließt): `win.keyboard.press` erreicht
  `before-input-event` nicht zuverlässig. Erst warten, bis das Fenster geladen ist
  (`webContents.isLoading()` = false), dann per `app.evaluate` `w.focus()` und
  `w.webContents.sendInputEvent({ type: 'keyDown' | 'keyUp', keyCode: 'Escape' })` (Beispiel
  `e2e/layout.mjs`).
- **Fenster eines kleinen Werkzeugs** (`#/tool/<id>?fenster=1`): `app.waitForEvent('window')`
  VOR dem Klick anlegen. Zum Suchen in `BrowserWindow.getAllWindows()` immer
  `!x.isDestroyed() && !x.webContents.isDestroyed()` prüfen – ein Fenster, das gerade schließt,
  ist noch in der Liste, `getURL()` wirft dann „Object has been destroyed“. Schließen über
  `app.evaluate(… w.close())` statt `page.close()`, sonst läuft der 'close'-Handler (Lage
  merken) nicht wie beim Bediener (Helfer `closeToolWindow` in `e2e/layout.mjs`).
- **Screenshots nach `setContentSize`:** Playwrights `page.screenshot()` kennt die neue Größe
  nicht (liefert die alte) – über Electron aufnehmen: `(await w.webContents.capturePage())
  .toPNG()` per `app.evaluate`, als Base64 zurückgeben. Größe und Inhalt der Seite selbst
  (`innerHeight`, `scrollHeight`) stimmen.
- **Versteckte Fenster** (`show: false`, bis main sie zeigt): `requestAnimationFrame` und
  `ResizeObserver` laufen dort gedrosselt – wer im Renderer misst, misst das erste Mal synchron.
  Ob ein Fenster ungemessen erschien, steht im Debug-Log (`ctx.userData`/avtoolbox-debug.log,
  Prüfung `assertNoJump` in `e2e/layout.mjs`).
- **Kleine Werkzeuge sind keine Route im Hauptfenster mehr:** `openRoute(page, '/tool/timecode')`
  öffnet ein eigenes Fenster und springt zurück zu `/`. Für „irgendein Werkzeug öffnen“ ein großes
  nehmen (Rauchtest: `/tool/media-info`).
- `ELECTRON_RUN_AS_NODE` aus der Umgebung entfernt der Harness (sonst startet Electron als Node).

## Grenzen

- `timer.mjs` öffnet kurz das Timer-Ausgabefenster auf dem ersten Bildschirm und minimiert
  einmal das Hauptfenster.
- **Das Hauptfenster erscheint erst bei `ready-to-show`**, manchmal nach dem ersten Inhalt;
  `launchApp` wartet deshalb, bis es sichtbar ist (sonst galt es beim Schließen einer Ausgabe
  noch nicht als gezeigt, und die App beendete sich – timer.mjs war jeden zweiten Lauf rot).
- **Windows meldet minimierte Fenster als unsichtbar** (`isVisible()` = false) – nie daraus
  schließen, dass kein Fenster mehr offen ist. **macOS zeichnet minimierte Fenster nicht neu**:
  Bei minimiertem Fenster den Zustand im main prüfen (`app.evaluate`), nicht in dessen Seite.
- Unter Linux ohne Display `xvfb-run -a …`; der Harness setzt dort `--no-sandbox`. Die CI läuft
  alle E2E-Skripte auf Linux, Windows und macOS (Job „App“ in `.github/workflows/ci.yml`) – ein
  neues Skript in `e2e/run.mjs` läuft dort automatisch mit.
- Fehlschlag zuerst als Testproblem prüfen (Zeitfenster zu eng, Route nicht neu geladen),
  bevor die App geändert wird – wie beim „toten Strom“, wo erst ein zweiter Anlauf die Verbindung
  wiederherstellt.
