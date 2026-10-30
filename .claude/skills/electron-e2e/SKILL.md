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
| `layout.mjs` | Werkzeug-Muster: Kopfleiste, Leiste/Schublade von LED-Wall, NovaStar, Netzwerk-Scanner, YouTube-Downloader und Packliste, yt-dlp im App-Menü, App-Menü (13 Akzentfarben), Schublade (anheften/lösen/schließen, je Werkzeug gemerkt), ⓘ, Ausgabe-Leiste live/aus (Esc und Schließen von außen), Monitorwechsel von Testbild- und Player-Ausgabe, Auftrags-Leiste, LED-Wall (Projekt-Leiste, Reiter, Draufsicht nur mit Curving, Kette zeichnen), kleine Werkzeuge im eigenen Fenster (Kachel, Umleitung, eines je Werkzeug, Breite/Lage gemerkt, Höhe folgt dem Inhalt ohne Sprung, zweispaltig, 320 px ohne Querscrollen, Kompaktmodus live, gehen mit dem Hauptfenster); Packliste: langer Blocktitel breiter als die frühere Grenze von 240 px, Farbe über die Auswahl am Tupfen (Rand des Blocks), Bereich „PDF“ in der Schublade |
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
| `kabelverlauf.mjs` | Kabelverlauf im LED-Wall-Konfigurator: Kette ohne Verlauf (Hinweis, kein Pfeil-SVG), Startecke → 7 Pfeile bei 8 Modulen (Pfeil-SVG über `getByTestId('sig-verlauf')`), Hinten (Startpunkt wandert, Beschriftung „unten rechts“), Kette zeichnen per `page.mouse` (down, move mit `steps`, up) und verlängern, gespeicherter Stand aus `localStorage` `led-wall-konfigurator`, Signal + Strom nebeneinander (Rechtecke), Backup mit „B“ (`data-backup` im Pfeil-SVG), Warnung über der Grenze je Port (`getByTestId('signal-warnungen')`), VX4S mit 4 Ports, zweite Wand teilt den Prozessor (Tabelle „Signalketten“ mit fortlaufenden Ports), PDF; „Backup bei allen an“ (Paare 1 → 2, 3 → 4), Backup-Ports in Hälften (1 → 9, 2 → 10, gespeichert als `processor.backupPorts`), danach wieder wie vorher – die Schritte danach rechnen mit S1 + Backup 2 |
| `pdf.mjs` | PDF-Export über die Brücke: gut 4 MB HTML mit Fotos (die frühere `data:`-URL brach ab 2 MB mit `ERR_INVALID_URL` ab), A4 hoch/quer und A5 (MediaBox mit 2 pt Spiel), fremde Adressen werden nie angefragt (lokaler Spion-Server, Datei außerhalb im Debug-Log) |
| `fotos.mjs` | Fotos für Projektdateien: Einfügen über den gestubbten Dialog (3000 × 1500 mit EXIF 6 → 1000 × 2000, Farben oben/unten im main gelesen, kein EXIF mehr), falsches Format, Anzeige über `foto://`, Speichern in die Datei und Zurückholen beim Öffnen, Einsetzen ins PDF |
| `mini-manual.mjs` | Mini-Manual wie ein Nutzer: Werkzeug-Muster, Firmenprofil über den Dialog im App-Menü, Gerät mit Kurzname → Platzhalter fett in der Vorschau (Shadow DOM, `getComputedStyle`), Kontakt aus dem Profil (Prüfung meldet ihn nicht mehr), Fall aus der Bibliothek, Kurzkarte A5 genau eine Seite, Handbuch A4 ≥ 6 Seiten, Projektdatei mit Foto (Hochformat behält auf dem Deckblatt sein Seitenverhältnis; Datei enthält `fotos/<hash>.jpg`, Abschnitt per `projects.peek`), LED-Wall derselben Datei übernehmen (Abschnitt Version 2, also auch die alte Form) und „Planung geändert (Stand 1 → 2)“ mit Unterschieden, dann eine zweite Wand per Version 3 („Bar (neu)“, Liste und Vorschau nennen beide); Signalweg: Prozessor bespielt beide Wände (Checkboxen in der Gruppe „Bespielt“), Laptop mit Ausgang, Bildgröße und Ausschnitt, Liste der Signalwege in der Vorschau, Datei mit Anleitung Version 3; eigene Bausteine (gleicher Name, Export/Import); Vorschlag nach Stichworten (Knopf „1 passt“, „passt zum Projekt“ in der Auswahl) und „Neuere Fassung“: eigenen Baustein einfügen, per „Ersetzen“ auf Version 2 heben, Hinweis „Aktualisieren“ verschwindet danach; Bedienfeld: Taste beschriften, zweite Seite mit Navigationstaste, Taste per Ziehen (in Schritten) tauschen, kleineres Gerät mit Rückfrage. Achtung: Jedes Kapitel hat in der Schublade eine Checkbox „… in der Anleitung“ – `getByLabel(…, { exact: true })`; Knöpfe zum Hinzufügen tragen ein eigenes `aria-label` („Bedienfeld hinzufügen“), sonst gleicht ihr Text einem Kapitelnamen; Übernahme: Jingle-Belegung vorher per `localStorage.setItem('jingle-player', …)` im Hauptfenster setzen (der Store ist dort noch nicht geladen und liest sie beim dynamischen Import), zweimal übernehmen = Rückfrage „ersetzen?“ und weiter nur ein Feld; OSC nimmt das Beispiel-Projekt einer frischen App (Vorschau Desktop – der Kopf nennt „· Desktop“; die Handy-Vorschau stellt man im Werkzeug über den Knopf mit Titel „Handy-Vorschau“ ein, derselbe Store gilt dann sofort im Mini-Manual desselben Fensters), Video-Player den Text ohne Playlist; Vorschau „Seiten“: echtes PDF über `util.renderPdf`, mindestens 3 Seiten (`pdf-seite`, bis 30 s – gedruckt wird nach einer Pause im main), Liste zum Kapitel gescrollt (`scrollTop > 0`), danach zurück auf „Kapitel“, weil die späteren Schritte die Shadow-DOM-Vorschau lesen; Bedienbarkeit: „Was fehlt noch“ (Summe „x von y erledigt“, Klick auf „Kontakt wählen“ springt ins Kapitel), „Mehr“ zugeklappt (keine Häkchen, aber Marke „Antwort aus der Planung“), Stufen-Knopf (Klick schaltet weiter, drei Klicks zurück). **Felder unter „Mehr“** (Signalweg, IP, Hinweis eines Geräts; Foto, Hinweis, Häkchen eines Schritts) erst mit dem Knopf „Mehr zu <Name bzw. Schritt n>“ öffnen; geführter Einstieg (als letzter Schritt, er ersetzt die Anleitung): Datei → „Neu“ mit `stubConfirmSequence(app, [1])` (ungespeichert = Verwerfen), Hinweis `einstieg-hinweis` → „Einrichten“, Dialog „Neue Anleitung einrichten“ (Felder per Label; Geräte über „Rolle des neuen Geräts“, „Name des neuen Geräts“ und Knopf „Gerät“ mit `exact: true`), Kapitel-Vorschlag an den Checkboxen im Dialog ablesen, nach „Fertig“ verschwinden Dialog und Hinweis |
| `shutdown.mjs` | App mitten in Konverter-, Generator- und Vorschau-Läufen beenden: kein ffmpeg läuft weiter, keine halben Dateien, Beenden unter 10 s |
| `paket.mjs` | Die **gepackte** App (`dist/*-unpacked`, nur auf Wunsch: `npm run package:dir`, dann `npm run e2e -- paket`; CI je Betriebssystem nach den E2E): Start aus dem `app.asar`, ffmpeg aus `extraResources`, PDF über die Brücke erzeugen, als Handbuch importieren und auf Seite 1 finden (pdfjs-dist aus `app.asar.unpacked`, better-sqlite3). Gegenprobe: ohne `app.asar.unpacked/node_modules/pdfjs-dist` wird der Import-Schritt rot. `launchApp({ executablePath, settings })` |
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

`openRoute` setzt nur den Hash und wartet nicht aufs Rendern. Beim Wechsel zwischen Werkzeugen
deshalb erst warten, bis die alte Leiste weg ist (`getByTestId('tool-bar').waitFor({ state:
'detached' })` nach `openRoute(page, '/')`, Muster `tool()` in `e2e/layout.mjs`) – sonst liest
der nächste Schritt auf dem macOS-Runner noch Attribute des vorigen Werkzeugs.

## Was sich bewährt hat (jeweils schon in Skripten gelöst)

- **Zustand über die Brücke setzen** statt klicken: `page.evaluate(() => window.api.…)`.
- **Vorbedingung prüfen, wenn ein Test auf laufende Arbeit angewiesen ist:** Testdaten so lang
  wählen, dass die Arbeit auch auf einem schnellen Rechner noch läuft, und das vor dem Schritt
  ausdrücklich feststellen (`api.converter.list()` = `running`). `shutdown.mjs` hatte 60 s Video:
  ProRes war nach gut 10 s fertig, das vollständige Ergebnis sah wie eine liegen gebliebene halbe
  Datei aus. Lehre: Vor einer Ursache im App-Code das Protokoll ansehen (`avtoolbox-debug.log` im
  `userData` des Tests, die Rückfrage nennt die Zahl der Aufträge) und gegen `main` gegenprüfen.
- **Zeitgrenzen im Bildtakt nie als feste Millisekunden** („hell nur bis 60 ms“): Ein Frame kann
  auf dem macOS-Runner 30 ms und mehr dauern, und wer im selben Frame vor dem Zeichnen misst,
  sieht das alte Bild. Stattdessen den Verzug am vorigen Frame messen – „hell nach 60 ms nur,
  wenn der Frame davor noch im Blitz lag“ (`e2e/testton.mjs`, AV-Sync, macOS rot bei #179 mit
  39 → 69 ms). Gegenprobe: ein Blitz zur falschen Zeit muss weiter rot werden.
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
  `app.evaluate`; mit `holdConfirm` bleibt er offen, bis man ihn beantwortet. `api.choose`
  (mehr als zwei Antworten) läuft über denselben Dialog: `stubConfirmSequence(app, [1])` wählt
  den zweiten Knopf („Beide behalten“, `e2e/mini-manual.mjs`). Eine leere Folge antwortet mit 1
  – vor dem nächsten Bestätigen wieder `stubConfirm(app, true)` setzen.
- **Ziehen zum Sortieren** (`components/ui/sortable.tsx`): **nicht `dragTo`**, sondern von Hand
  in Schritten – `griff.hover()`, `mouse.down()`, ein Stück bewegen (Ziehen startet), dann über
  die Zielzeile bewegen (mit `steps`, zweimal), `mouse.up()`. `dragTo` bewegt die Maus nur einmal:
  unter Windows ging das, in der macOS-CI kam kein `dragover`/`drop` an, und die Reihenfolge blieb
  (PR #166, 18.10.2026; Playwright-Doku: „mindestens zwei Mausbewegungen“). Die obere Hälfte der
  Zielzeile heißt „davor“. Der Griff (`role="img"`, Name „Gerät ziehen zum Verschieben“) macht
  die Zeile erst beim Drücken ziehbar, also am Griff ansetzen, nicht an der Zeile. Danach die
  Reihenfolge prüfen (Wert vorher feststellen, sonst besteht der Test ohne Ziehen). Muster
  `e2e/mini-manual.mjs`.
- **Einstellungs-Broadcast erreicht das auslösende Fenster nicht.** „Ein anderes Fenster
  speichert“ also wirklich testen: `api.openToolWindow(id)` + `app.waitForEvent('window')`.
  Umgekehrt: `window.api.setSettings(…)` aus dem Testfenster ändert zwar settings.json, aber
  nicht die Oberfläche desselben Fensters (Menüpunkt blieb „deaktiviert“, 18.10.2026) – solche
  Einstellungen über die Oberfläche setzen (App-Menü, Dialog per Stub), wie ein Nutzer.
- **Exportierte HTML-Seite durchklicken** (Handy-Fassung mit eigenem Skript): in main ein
  `BrowserWindow` die Datei `loadFile`-en lassen und es über `app.waitForEvent('window')` als
  Playwright-Seite greifen (`e2e/mini-manual.mjs`) – so laufen Skript und Klicks wie im Browser.
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
- **Tastendruck im Ausgabefenster** (zweimal Esc schließt): `win.keyboard.press` erreicht
  `before-input-event` nicht zuverlässig. Erst warten, bis das Fenster geladen ist
  (`webContents.isLoading()` = false), dann per `app.evaluate` `w.focus()` und
  `w.webContents.sendInputEvent({ type: 'keyDown' | 'keyUp', keyCode: 'Escape' })` – zweimal
  innerhalb einer Sekunde. Dass ein einzelner Druck NICHT schließt: einmal drücken, 1,3 s warten,
  Fenster noch da; danach zählt der nächste Druck wieder als erster (Beispiel `e2e/layout.mjs`).
- **Knopf sichtbar, `getByRole(…, { name })` findet ihn nicht:** Der barrierefreie Name weicht ab.
  `await locator.ariaSnapshot()` zeigt ihn. Fund: Ein `Segmented` in einem `Field` ohne `group` –
  das `<label>` benennt den ersten Knopf um. Fehlermeldungen kürzt `runSteps`; für die ganze
  Meldung `e.message` im `catch` ausgeben.
- **Druckvorschau** (`PrintDialog`): Knopf „Drucken / PDF“ in der Leiste, Dialog per
  `getByRole('dialog', { name: /drucken$/ })`. Erst warten, bis die Seiten stehen
  (`druck-stand` nennt das Format, `druck-seite` je Seite), dann „Als PDF speichern…“ mit
  ersetztem `dialog.showSaveDialog`. Das Mini-Manual fragt bei Prüffehlern nach: vorher
  `stubConfirm(app, true)`, sonst wartet der Klick ewig. **„Drucken…“ nie echt klicken:**
  `window.print()` hält das Fenster an, bis der Systemdialog zu ist, und auch Playwrights Klick
  kommt erst dann zurück (Windows 11: `PrintDialog.exe`, Fenster „… – Drucken“ einer fremden
  App-Hülle, nicht im Electron-Prozess). Stattdessen `window.print` per `page.evaluate` ersetzen,
  darin Wurzel und Stil festhalten und über `webContents.printToPDF({ preferCSSPageSize: true,
  margins: { marginType: 'none' } })` nachstellen – das zeigt Seitenzahl und Format des Drucks
  (Muster `e2e/mini-manual.mjs`).
- **Ausgabe „Als Fenster“ und der Schließen-Knopf:** `bar().getByLabel('Ausgabe-Monitor')
  .selectOption('fenster')`, Knopf „Im Fenster starten“, danach „Fenster schließen“; Vollbild
  per `isFullScreen()` im main prüfen. Den Knopf im Ausgabefenster greift man über dessen
  Playwright-Seite (`app.windows().find((p) => p.url().endsWith('#/output'))`) und
  `getByTestId('ausgabe-schliessen')`: ohne Mausbewegung `opacity` 0 und Mauszeiger `none`, nach
  `out.mouse.move(…)` sichtbar. Danach die Auswahl zurück auf einen Monitor stellen – die
  folgenden Schritte erwarten ihn.
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
- **Segmented** (Umschalter wie „Ausgabe für“, „Blickrichtung der Pläne“) ist eine `group` mit
  Knöpfen (`aria-pressed`), keine Radios: `getByRole('group', { name: 'Ausgabe für' })
  .getByRole('button', { name: 'Technik' })`. Die Modulwahl der LED-Wall dagegen sind Radios.
- **HTML-Seite ansehen** (Kapitel des Mini-Manuals ohne den ganzen Klickweg): das HTML einmal mit
  einem temporären vitest-Test aus `handbuchHtml()` in den Scratch-Ordner schreiben (Test danach
  löschen), dann in der gebauten App ein verstecktes `BrowserWindow` `loadFile` + `capturePage`
  (per `launchApp` und `app.evaluate`). Das Browser-Fenster der Desktop-App zeigt lokale Dateien
  nur als Standbild ohne Werkzeuge.
- **PDF ansehen statt nur zählen:** Im main ein `BrowserWindow` mit `webPreferences: { plugins:
  true }` die PDF-Datei laden lassen, nach 2–3 s `capturePage()` – zeigt Chromiums Betrachter mit
  der ersten Seite (so fiel die Reihenfolge der Fehlerfälle im Handbuch auf). Die Zieldatei
  vorher löschen: `waitFor(() => existsSync(f))` ist sonst sofort wahr, und man sieht das PDF
  vom letzten Lauf (so fehlte scheinbar die neue Tabelle, 17.10.2026).

## Grenzen

- **Alle Skripte laufen in einem Prozess nacheinander** (`run.mjs` importiert sie): Hängt eines,
  steht der ganze Lauf bis zum Abbruch der CI (45 min). Deshalb beendet `ctx.close()` die App mit
  Zeitlimit (20 s) und danach hart – in der macOS-CI hing `app.close()` nach `player.mjs` mit
  allen Schritten grün (PR #169). Steht im Log „App nach 20 s nicht beendet“, hängt das Beenden,
  nicht ein Test. Neue Wartestellen im Skript immer mit Zeitlimit (`waitFor`, `timeout`).
- **Rückfrage „Wirklich beenden?“:** `ctx.close()` beantwortet sie mit „Beenden“ (Knopf 0). Wer
  selbst `app.quit()` auslöst oder das letzte Fenster schließt, während etwas läuft, stubbt
  `dialog.showMessageBox` vorher (Muster `e2e/shutdown.mjs`: Antworten mitschreiben, erst
  „Abbrechen“, dann „Beenden“) – sonst wartet die App auf den Dialog. Betroffen sind alle
  Skripte mit `app.quit()` (`grep -n "quit()" e2e/*.mjs`: shutdown, youtube) – `youtube.mjs` war
  nach Einführung der Rückfrage rot, weil es niemand gesucht hatte.
- **`app.process()` nur beim Start holen:** Hat sich die App schon selbst beendet (Hauptfenster
  zu in `layout.mjs`, `shutdown.mjs`), wirft Playwright beim Abfragen („reading '_object'“) – so
  war #170 unter Windows und macOS rot. Änderungen am Harness gegen **alle** Skripte prüfen, nicht
  nur gegen das, um das es ging; besonders die, in denen die App sich selbst beendet.
- `timer.mjs` öffnet kurz das Timer-Ausgabefenster auf dem ersten Bildschirm und minimiert
  einmal das Hauptfenster.
- **Das Hauptfenster erscheint erst bei `ready-to-show`**, manchmal nach dem ersten Inhalt;
  `launchApp` wartet deshalb, bis es sichtbar ist (sonst galt es beim Schließen einer Ausgabe
  noch nicht als gezeigt, und die App beendete sich – timer.mjs war jeden zweiten Lauf rot).
  In der Linux-CI blieb es zweimal über 15 s unsichtbar (22.10.2026, im Neulauf grün): Der Harness
  wartet jetzt 30 s und nennt im Fehler Fenster (sichtbar, lädt, URL) und Konsolenfehler;
  `createWindow` zeigt das Fenster nach 5 s auch ohne `ready-to-show`.
- **Gepackte App unter macOS:** Der erste Start einer frisch gepackten Binary (ffmpeg) dauert
  länger als das Zeitlimit der App (10 s) – Versionen deshalb mit `waitFor` erneut abfragen
  (`e2e/paket.mjs`); `binaryVersion` merkt sich ein `null` nicht. Liegen mehrere Mac-Pakete in
  `dist/` (der Ablauf „Installer bauen“ baut arm64 und x64), nimmt das Skript das, was auf dem
  Rechner nativ läuft (`mac-arm64` auf Apple Silicon) – ffmpeg ist dort trotzdem ein Intel-Build
  (evermeet), der über Rosetta läuft; daher der langsame erste Aufruf.
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
