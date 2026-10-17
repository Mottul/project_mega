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
| `layout.mjs` | Werkzeug-Muster: Kopfleiste, Leiste/Schublade von LED-Wall, NovaStar, Netzwerk-Scanner, YouTube-Downloader und Packliste, yt-dlp im App-Menü, App-Menü (13 Akzentfarben), Schublade (anheften/lösen/schließen, je Werkzeug gemerkt), ⓘ, Ausgabe-Leiste live/aus (Esc und Schließen von außen), Monitorwechsel von Testbild- und Player-Ausgabe, Auftrags-Leiste, LED-Wall (Projekt-Leiste, Reiter, Draufsicht nur mit Curving, Kette zeichnen), kleine Werkzeuge im eigenen Fenster (Kachel, Umleitung, eines je Werkzeug, Breite/Lage gemerkt, Höhe folgt dem Inhalt ohne Sprung, zweispaltig, 320 px ohne Querscrollen, Kompaktmodus live, gehen mit dem Hauptfenster) |
| `testpattern.mjs` | 2-px-Rasterlinien pixelgenau (Raster und Mapping-Testbild) |
| `testton.mjs` | Testton gemessen: Analysator vor dem Ausgang (`AudioNode.prototype.connect` umgelenkt, je Kanal einer) – Einblenden und Pegel −18 dBFS, Deckel −6 dBFS, 1 kHz, alle Signale unter dem Pegel, Kanal „Links“, Kennungs-Pausen je Kanal, AV-Sync-Piep zur vollen Sekunde (gemessen etwa −55 ms = Ausgabelatenz), Blitz in der Vorschau, Ton endet beim Verlassen. Ohne laufende Audioausgabe übersprungen |
| `timer.mjs` | Startbildschirm-Status, Ausgabe schließen bei minimiertem Hauptfenster, Bühnen-Anzeige im Browser, Abbruch/Neuverbindung, Zeitzone, toter Strom |
| `player.mjs` | Playlist-Rückfrage, parallele Importe, doppelte Quelle, gleichnamige Kopien (braucht ffmpeg) |
| `rta.mjs` | RTA mit eingespeistem Mikrofon (Fake-Gerät liest eine WAV, Signale per lavfi): Sinus 1 kHz −20 dBFS – Pegel, Terz und Nachbarn über die Fadenkreuz-Ablesung, Feedback-Finder (H5), Kalibrieren auf 94 dB, Referenz/Differenz 0 dB, Wasserfall (Linie unter der Spitze, Ablesung) und Zeitachse per Pixel, Stopp; rosa Rauschen – Terzen 63 Hz … 4 kHz flach, kein Feedback. Freigabe über die echte Berechtigungsregel |
| `osc.mjs` | OSC-Steuerung gegen einen lokalen UDP-Empfänger: leeres Set, Kacheln aller Arten über „+ Widget“, Learn, Bank (Hinzufügen-Knopf je Modus; hohe Potis bleiben in ihrer Kachel – App und Handy-Seite per Rechteck-Vergleich), Schalter im Live-Modus, Befehle vom Handy (`api/command`), Feedback per UDP an den Feedback-Port, Monitor; Zustand über `api/state` der Handy-Fernsteuerung |
| `ffmpeg-update.mjs` | ffmpeg-Aktualisierung der fertigen App gegen einen lokalen Schein-Release-Server (`MOTTULBOX_FFMPEG_RELEASES_URL`): 7-Tage-Regel, Prüfsumme, Aktivierung nach Neustart (`launchApp({ userData })`), zurück zum mitgelieferten |
| `ndi.mjs` | NDI-Ausgabe von Timer und Player mit dem echten Binding (ohne `vendor/grandiose`, z. B. in der CI, übersprungen): Bilder gehen raus, Werte begrenzt, Start/Stopp in schneller Folge ohne verwaiste Offscreen-Fenster, Fenster von außen geschlossen |
| `youtube.mjs` | YouTube-Downloader mit echtem yt-dlp gegen einen lokalen Server (direkte Dateiadressen, kein Netz): fertiger Download, Abbrechen mitten im Laden (Verbindung und Prozess weg), höchstens zwei gleichzeitig, Beenden der App mitten im Download, Anmeldung per cookies.txt (Adresse nur mit Cookie), Cloudflare-artige Sperre (403 mit `cf-mitigated`, erst der zweite Versuch als Browser kommt durch). yt-dlp aus `MOTTULBOX_E2E_YTDLP` oder der installierten Mottulbox, sonst übersprungen (CI) |
| `projektdatei.mjs` | Projektdatei am LED-Wall-Konfigurator: Projektordner (Standard und eigener), Speichern unter im Projektordner, Punkt „ungespeichert“ und Fenstertitel, Strg+S, Bedienzustand bleibt sauber, Konflikt mit anderswo geänderter Datei (Rückfrage, Datei unverändert, dann Überschreiben), Neu mit Rückfrage, Öffnen, Schreiben nur in freigegebene Pfade; zwei Wände anlegen, benennen, wechseln, speichern (Abschnitt Version 4), Packliste je Wand (aus `localStorage` `packing-list`), wieder öffnen |
| `kabelverlauf.mjs` | Kabelverlauf im LED-Wall-Konfigurator: Kette ohne Verlauf (Hinweis, kein Pfeil-SVG), Startecke → 7 Pfeile bei 8 Modulen (Pfeil-SVG über `getByTestId('sig-verlauf')`), Hinten (Startpunkt wandert, Beschriftung „unten rechts“), Kette zeichnen per `page.mouse` (down, move mit `steps`, up) und verlängern, gespeicherter Stand aus `localStorage` `led-wall-konfigurator`, Signal + Strom nebeneinander (Rechtecke), Backup mit „B“ (`data-backup` im Pfeil-SVG), Warnung über der Grenze je Port (`getByTestId('signal-warnungen')`), VX4S mit 4 Ports, zweite Wand teilt den Prozessor (Tabelle „Signalketten“ mit fortlaufenden Ports), PDF |
| `pdf.mjs` | PDF-Export über die Brücke: gut 4 MB HTML mit Fotos (die frühere `data:`-URL brach ab 2 MB mit `ERR_INVALID_URL` ab), A4 hoch/quer und A5 (MediaBox mit 2 pt Spiel), fremde Adressen werden nie angefragt (lokaler Spion-Server, Datei außerhalb im Debug-Log) |
| `fotos.mjs` | Fotos für Projektdateien: Einfügen über den gestubbten Dialog (3000 × 1500 mit EXIF 6 → 1000 × 2000, Farben oben/unten im main gelesen, kein EXIF mehr), falsches Format, Anzeige über `foto://`, Speichern in die Datei und Zurückholen beim Öffnen, Einsetzen ins PDF |
| `mini-manual.mjs` | Mini-Manual wie ein Nutzer: Werkzeug-Muster, Firmenprofil über den Dialog im App-Menü, Gerät mit Kurzname → Platzhalter fett in der Vorschau (Shadow DOM, `getComputedStyle`), Kontakt aus dem Profil (Prüfung meldet ihn nicht mehr), Fall aus der Bibliothek, Kurzkarte A5 genau eine Seite, Handbuch A4 ≥ 6 Seiten, Projektdatei mit Foto (Hochformat behält auf dem Deckblatt sein Seitenverhältnis; Datei enthält `fotos/<hash>.jpg`, Abschnitt per `projects.peek`), LED-Wall derselben Datei übernehmen (Abschnitt Version 2, also auch die alte Form) und „Planung geändert (Stand 1 → 2)“ mit Unterschieden, dann eine zweite Wand per Version 3 („Bar (neu)“, Liste und Vorschau nennen beide); Signalweg: Prozessor bespielt beide Wände (Checkboxen in der Gruppe „Bespielt“), Laptop mit Ausgang, Bildgröße und Ausschnitt, Liste der Signalwege in der Vorschau, Datei mit Anleitung Version 3 |
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
- **Nach Öffnen oder Klick nie sofort zählen oder Attribute lesen:** Auf macOS in der CI sind
  Leiste und Schublade dann oft noch nicht nachgezogen (rot bei #153: Schublade noch da, Knopf
  „PDF exportieren“ noch nicht da). `expectCount(locator, n, was)` / `expectAttr(…)` in
  `e2e/layout.mjs` warten bis 5 s; sonst `assert.ok(await waitFor(…))` mit Trefferzahl in der Meldung.
  Ebenso **Zustand, den ein anderer Teil nachmeldet**: Der Stand der OSC-Fernsteuerung
  (`api/state`) kommt erst nach dem OSC-Paket vom Renderer zurück – einmal gelesen stand die
  Auswahl in der macOS-CI noch auf 0 (17.10.2026, `e2e/osc.mjs`). Ein Ereignis abwarten heißt
  nicht, dass alles danach Gemeldete schon da ist. Feste Pausen (`sleep(900)`, dann einmal
  messen) kippen unter Last: In der vollen Suite blendete der Testton nach 900 ms noch ein
  (`e2e/testton.mjs`). Liegt der Zielwert auf dem Weg einer Rampe (Einblenden, Pegel-Deckel),
  **zweimal in Folge** treffen lassen – sonst besteht ein kaputter Wert, der nur durchläuft.
- **Native Dialoge ersetzen** (`api.confirm` → `dialog.showMessageBox` im main): Stub per
  `app.evaluate`; mit `holdConfirm` bleibt er offen, bis man ihn beantwortet.
- **Einstellungs-Broadcast erreicht das auslösende Fenster nicht.** „Ein anderes Fenster
  speichert“ also wirklich testen: `api.openToolWindow(id)` + `app.waitForEvent('window')`.
- **Dieselbe Route noch einmal setzen lädt nichts neu**, und Ausgabe-Routen (`#/output`) lesen
  ihre Konfiguration nur beim Öffnen: erst `/`, dann die Zielroute.
- **Gesteuerte Checkboxen:** `.check()` scheitert, wenn der Zustand erst nach dem Speichern
  umspringt – `click()` und dann mit `waitFor` auf das Ergebnis warten.
- **Ton messen statt hören:** vor dem Start per `page.evaluate` `AudioNode.prototype.connect`
  umlenken – jede Verbindung zum `AudioDestinationNode` bekommt zusätzlich Splitter und
  Analysatoren (je Kanal); Spitzen per `getFloatTimeDomainData`, Frequenz per FFT, Verläufe per
  `setInterval` in der Seite (Beispiel `e2e/testton.mjs`). Der Analysator sieht den Ton um die
  Ausgabelatenz früher, als er aus dem Gerät kommt. Messfenster so legen, dass beide Grenzen
  sicher im Ton liegen, nicht in einer Pause.
- **Zeichenflächen haben Fenstergröße:** vor Pixelprüfungen `page.setViewportSize(…)`, gelesen
  wird mit `getImageData`.
- **Fernsteuer-Seiten** in `openBrowserWindow` öffnen (unsichtbares Electron-Fenster ohne
  Preload, Zeitzone per `timezoneId`); Playwright-Chromium ist nicht installiert. Eigene Ports
  verwenden (z. B. 18092), damit eine laufende Mottulbox nicht stört; vor Tests auf den festen
  Port 8090 mit `portFree` prüfen.
- **Verbindungsabbruch:** eine TCP-Weiterleitung, die Sockets „einfriert“ (Beispiel
  `e2e/timer.mjs`), bildet das halboffene WLAN-Aussetzen nach; Erholung großzügig abwarten.
- **Testmedien per lavfi** (`findFfmpeg()`), ohne ffmpeg `throw new Skip(…)`.
- **Mikrofon einspeisen:** `launchApp({ args: ['--use-fake-device-for-media-stream',
  '--use-file-for-fake-audio-capture=<datei.wav>'] })` (Beispiel `e2e/rta.mjs`). **Nicht**
  `--use-fake-ui-for-media-stream`:
  Das umgeht die Berechtigungsregel der App – so blieb unbemerkt, dass sie dem RTA das Mikrofon
  sperrte. Chromium spielt die Datei in Schleife; an der Naht spritzt es kurz breitbandig (eine
  Nachbarterz las −56 statt −134 dB) – Signale lang machen (60 s). Zeichenflächen prüfen über
  `getImageData` mit dem hellsten Wert in einem kleinen Fenster (eine Sinus-Linie ist ~1 px –
  Wasserfall/Zeitachse in `e2e/rta.mjs`). Messwerte nie einmal sofort ablesen, sondern mit
  `waitFor` bis eingeschwungen: Direkt nach dem Start klingt das Einschwingen breitbandig ab –
  die Windows-CI las eine Nachbarterz mit −59,4 statt unter −60 dB (Oktober 2026; die CI-Karte
  läuft dazu mit 44,1 statt 48 kHz). Ihr `aria-label` nie wie ein Feld nennen, sonst findet
  `getByLabel` beide. Ganze Werte zeigt die
  Oberfläche ohne „,0“ (`fmt`) – Muster mit optionaler Nachkommastelle.
- **Frische Stores sind nicht leer:** Die OSC-Steuerung startet mit einem Beispiel-Set (fünf
  Kacheln) – Zählungen und eindeutige Knöpfe („AUS“) nur in einem neu angelegten Set.
- **Zustand eines Werkzeugs mit Handy-Fernsteuerung** über deren `api/state` lesen und Befehle per
  `api/command` schicken (eigener Port, vorher `portFree`): so sieht der Test, was das Handy sieht.
- **UDP-Ziele** (OSC): `dgram`-Socket auf Port 0 binden, die App per `setConfig` dorthin zeigen;
  Pakete im Test lesen und schreiben (OSC-Kodierung steht in `e2e/osc.mjs`).
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
  merken) nicht wie beim Bediener. Helfer in `e2e/layout.mjs`: `toolWin(id, methode, …args)` ruft
  eine BrowserWindow-Methode auf (ohne Methode: Größe und Lage), `closeToolWindow`, `openSmall`,
  `assertFits`.
- **Screenshots nach `setContentSize`:** Playwrights `page.screenshot()` kennt die neue Größe
  nicht (liefert die alte) – über Electron aufnehmen: `(await w.webContents.capturePage())
  .toPNG()` per `app.evaluate`, als Base64 zurückgeben. Größe und Inhalt der Seite selbst
  (`innerHeight`, `scrollHeight`) stimmen.
- **Versteckte Fenster** (`show: false`, bis main sie zeigt): `requestAnimationFrame` und
  `ResizeObserver` laufen dort gedrosselt – wer im Renderer misst, misst das erste Mal synchron.
  Ob ein Fenster ungemessen erschien, steht im Debug-Log (`ctx.userData`/avtoolbox-debug.log,
  Prüfung `assertNoJump` in `e2e/layout.mjs`).
- **Die CI-Bildschirme sind klein** (Windows/macOS etwa 1024 × 768, Arbeitsfläche ~730 px):
  Fenster werden dort auf Bildschirmhöhe gekürzt oder nach oben gerückt; ein Klick weiter unten
  scrollt die Seite – vor Mausbewegungen auf ein Element `scrollIntoViewIfNeeded()`. Lage-, Größen- und
  „wird niedriger“-Prüfungen mit einem niedrigen Werkzeug (Kreisrechner) machen; lokal auf
  großem Bildschirm fällt das nicht auf.
- **Kleine Werkzeuge sind keine Route im Hauptfenster mehr:** `openRoute(page, '/tool/timecode')`
  öffnet ein eigenes Fenster und springt zurück zu `/`. Für „irgendein Werkzeug öffnen“ ein großes
  nehmen (Rauchtest: `/tool/media-info`).
- `ELECTRON_RUN_AS_NODE` aus der Umgebung entfernt der Harness (sonst startet Electron als Node).
- **Frischer Benutzerordner ohne Downloads:** `launchApp()` legt eine `settings.json` mit
  `ytdlpAutoUpdate: false` an. Die yt-dlp-Prüfung beim Start lud sonst yt-dlp aus dem Netz und
  startete es; schloss ein kurzes Skript die App mittendrin, blieb `yt-dlp.exe` unter Windows
  gesperrt und das Aufräumen (`rmSync` → EPERM) brach den ganzen Lauf ab – Windows-CI rot,
  obwohl alle Schritte grün waren. Aufräumen versucht es jetzt mehrmals und lässt den Ordner
  notfalls liegen. Wer den Download testen will, startet mit eigenem `userData` (wie
  `e2e/youtube.mjs`, `e2e/ffmpeg-update.mjs`).
- **Namen matchen als Teilstring:** `getByRole('cell', { name: 'Breite' })` trifft auch
  „Auflösung (Breite)“, `/^Kapitel/` auch „Kapitel nach oben“ – `exact: true` oder ein genaues
  Muster (`/^Kapitel \d+ von/`). Meldungen stehen oft doppelt (Hinweis im Inhalt und Prüfung in
  der Schublade) – auf das gemeinte Element eingrenzen.
- **Shadow DOM** (Vorschau des Mini-Manuals): Playwright-Locator gehen hinein, Text am
  einfachsten über `el.shadowRoot.textContent` per `evaluate` (Beispiel `e2e/mini-manual.mjs`).
- **Gepufferte Felder** (`LiveInput`, `TextArea`) übernehmen nach 250 ms Pause oder beim
  Verlassen – nach `fill()` einmal `Tab`, dann prüfen.
- **PDF ansehen statt nur zählen:** Im main ein `BrowserWindow` mit `webPreferences: { plugins:
  true }` die PDF-Datei laden lassen, nach 2–3 s `capturePage()` – zeigt Chromiums Betrachter mit
  der ersten Seite (so fiel die Reihenfolge der Fehlerfälle im Handbuch auf). Die Zieldatei
  vorher löschen: `waitFor(() => existsSync(f))` ist sonst sofort wahr, und man sieht das PDF
  vom letzten Lauf (so fehlte scheinbar die neue Tabelle, 17.10.2026).

## Grenzen

- `timer.mjs` öffnet kurz das Timer-Ausgabefenster auf dem ersten Bildschirm und minimiert
  einmal das Hauptfenster.
- **Das Hauptfenster erscheint erst bei `ready-to-show`**, manchmal nach dem ersten Inhalt;
  `launchApp` wartet deshalb, bis es sichtbar ist (sonst galt es beim Schließen einer Ausgabe
  noch nicht als gezeigt, und die App beendete sich – timer.mjs war jeden zweiten Lauf rot).
- **Verdeckte und minimierte Fenster bekommen kein `requestAnimationFrame`:** Was im Bildtakt
  misst oder zählt, steht dann still. Messen per Timer; Prüfung: Fenster minimieren und schauen,
  dass Werte nachkommen (`e2e/rta.mjs`).
- **Fake-Mikrofon auf macOS (CI) liefert Stille** – auch eine vom Werkzeug unabhängige Kette
  misst −∞ dBFS bei laufendem Kontext und sichtbarem Fenster. `e2e/rta.mjs` misst das vorab
  (`probeSignal`) und überspringt die Signal-Schritte dort mit dieser Begründung; Stille auf
  Windows/Linux bleibt ein Fehler. Erst so eine Vorab-Messung trennt Testumgebung von App-Fehler –
  die erste Vermutung (angehaltener Bildtakt) war falsch.
- **Windows meldet minimierte Fenster als unsichtbar** (`isVisible()` = false) – nie daraus
  schließen, dass kein Fenster mehr offen ist. **macOS zeichnet minimierte Fenster nicht neu**:
  Bei minimiertem Fenster den Zustand im main prüfen (`app.evaluate`), nicht in dessen Seite.
- Unter Linux ohne Display `xvfb-run -a …`; der Harness setzt dort `--no-sandbox`. Die CI läuft
  alle E2E-Skripte auf Linux, Windows und macOS (Job „App“ in `.github/workflows/ci.yml`) – ein
  neues Skript in `e2e/run.mjs` läuft dort automatisch mit.
- Fehlschlag zuerst als Testproblem prüfen (Zeitfenster zu eng, Route nicht neu geladen),
  bevor die App geändert wird – wie beim „toten Strom“, wo erst ein zweiter Anlauf die Verbindung
  wiederherstellt.
