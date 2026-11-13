---
name: review-checkliste
description: Projektspezifische Prüfliste für Änderungen an Mottulbox, abgeleitet aus bestätigten Review-Befunden (Parallelität, Fernsteuer-Seiten, veraltete Zustände nach await, Einstellungs-Migration, Projektdateien und Dateisystem, Rückfragen über mehrere Fenster). Verwenden zusätzlich zu /code-review, bevor eine Änderung als fertig gilt.
---

# Review-Checkliste Mottulbox

Aus dem Review über die Änderungen vom 7. Oktober 2026 (vier Prüf-Dimensionen, jeder Befund von
zwei Gegenprüfern widerlegt oder bestätigt): Diese Fehlerklassen kamen tatsächlich vor.
Zusätzlich gilt der allgemeine `/code-review`.

## Parallelität und Warteschlangen

- **Sperrschlüssel = Dedup-Identität.** Das Schloss pro Quelle hatte den vollen Pfad, die
  Deduplizierung (`convKeyFor`: Größe-Änderungszeit-Dateiname, ohne Ordner) nicht → zwei
  gleichnamige Kopien aus verschiedenen Ordnern liefen parallel und scheiterten an
  `UNIQUE conv_key`, mit verwaisten Dateien. Schlüssel müssen dieselbe Identität haben; zusätzlich
  vor dem Schreiben noch einmal prüfen (synchron = atomar) und bei Treffer die eigenen Ausgaben
  löschen.
- **Ausschluss gehört in die Warteschlange, nicht in einen belegten Slot.** Wer im Slot auf ein
  Schloss wartet, blockiert andere Quellen und lässt sich nicht abbrechen. Wartende bleiben in
  `waiting` (`JobQueue.add(…, key)`, in Auftragslisten `add(job, spec, key)`).
- Fehlerpfade räumen auf: Ausgabedateien, halbfertige Einträge, Sperren (`finally`).

## Zustand nach `await`

- **Nach einer Rückfrage (`api.confirm`) oder jedem `await` nicht mit dem Stand vom Klick
  weiterarbeiten.** Playlist löschen schrieb eine alte Liste zurück und löschte eine in einem
  anderen Fenster gespeicherte. Einstellungen ersetzen Listen, sie mergen sie nicht → frischen
  Stand holen (`api.getSettings()`) und daraus filtern.
- Der Einstellungs-Broadcast erreicht das auslösende Fenster nicht; mehrere Fenster mitdenken.
- **Fehlschläge nicht zwischenspeichern, wenn sie vorübergehend sein können** (Zeitlimit,
  Netz, gerade gesperrte Datei): `binaryVersion` merkte sich `null` bis zum Neustart, und die
  gepackte App meldete unter macOS „kein ffmpeg“, weil der erste Start länger als 10 s dauerte
  (22.10.2026). Erfolg merken, Fehlschlag beim nächsten Mal neu fragen.
- **Ein Start mit `await` kann von einem Stopp oder zweiten Start überholt werden.** Die
  NDI-Sender öffneten nach dem Erstellen des Senders ihr Offscreen-Fenster, auch wenn inzwischen
  gestoppt oder neu gestartet war → verwaiste Fenster, die unbemerkt weitersendeten (Oktober 2026).
  Generation zählen (Start und Stopp erhöhen), nach jedem `await` vergleichen und das gerade
  Erstellte wieder abbauen (`services/ndi/ndiSender.ts`, Regressionstest `e2e/ndi.mjs`). Ebenso
  beim Testton: Ein React-Effekt rief `update()`, während `start()` noch auf das Gerät
  wartete – zwei Stimmen spielten gleichzeitig (doppelter Pegel). Während des Starts nur den
  Stand merken, `start()` baut danach mit dem neuesten (`_tone/engine.ts`, `e2e/testton.mjs`).
  Und beim RTA: Wer das Werkzeug verlässt oder den Eingang wechselt, während die Freigabe noch
  läuft, ließ das Mikrofon offen – Zähler in `rta/engine.ts`, Gegenprobe in `e2e/rta.mjs`
  (offene Spuren über ein umgelenktes `getUserMedia` zählen).
- **zustand-Store und lokaler `useState` nach `await` nicht im selben Atemzug setzen, wenn ein
  Effekt beide liest.** Der Store rendert sofort (useSyncExternalStore), der lokale Zustand erst
  im nächsten Durchlauf – ein Wächter-Effekt sieht den Mischstand und dreht die Änderung zurück
  (Video-Generator, 8. Oktober 2026: „Gerechnet“ sprang auf „Live“ zurück). Den Store erst in
  einem Effekt auf den lokalen Zustand nachziehen.
- **Eine Liste aus main, die mehrere Teile anzeigen, nicht je Komponente einmal beim Einhängen
  laden.** Der Hinweis „Neuere Fassung“ hätte nach „Ersetzen“ im selben Fenster nichts gemerkt,
  weil er die eigenen Bausteine nur beim Aufbau las (22.10.2026). Ein Hook für alle
  (`useEigeneBausteine` in `mini-manual/ui/eigeneBausteine.ts`): lädt bei einem Fenster-Ereignis
  nach jeder Änderung und beim Fokus (anderes Fenster); nur die letzte Anfrage darf setzen.
- **`key` von Listen mit Medien nicht aus der Position bilden**, wenn Einträge den Platz
  wechseln: Das `<video>` wird sonst neu geladen und hakt (Live-Vorschau beim Übergang).

## Fernsteuer- und Browser-Seiten

Siehe `/fernsteuerung-seite`: relative Pfade (Schrägstrich-Variante umleiten), Lebenszeichen und
Watchdog gegen halboffene Verbindungen, Zeitzone des Rechners, ES5. Jede neue Route bekommt
einen Test **mit** und **ohne** Schrägstrich.

- **„Im selben Netz“ schließt Websites ein, die dort in einem Browser offen sind.** Die
  Fernsteuerungen nahmen einen blinden POST jeder fremden Seite an (10.11.2026, in der gebauten
  App gemessen: 200 statt 403). Jeder Server läuft deshalb über `createRemoteHost` und damit durch
  `nurEigeneHerkunft()` (`Origin` ≠ `Host` → fremde Seite, fremder Name im `Host` → DNS-Rebinding;
  Regeln in `remoteHerkunft.ts`). Folgen für neue Routen: Zustand ändern nur per **POST** (ein GET
  trägt kein `Origin`, der Wächter sähe eine fremde Seite dort nicht), kein eigener
  `createServer`, kein `Access-Control-Allow-Origin`. Anfragen ohne `Origin` (Companion, curl)
  bleiben erlaubt – das ist Absicht, kein Loch.

Drei Fehler aus der Durchsicht vom November 2026 (Pakete A1–A3, je am alten Stand im Test
nachgestellt, bevor etwas geändert wurde):

- **`strom.pipe(res)` lässt den Lesestrom offen, wenn der Empfänger abbricht.** Die Medien der
  Player-Fernsteuerung gingen so hinaus; ein `<video>`, das springt, kappt die Verbindung
  ständig – die Datei blieb bis zum Beenden der App geöffnet (unter Windows: nicht löschbar,
  nicht neu einzubacken). `pipeline()` aus `node:stream` zerstört ihn. Dateien nur über
  `services/serveFile.ts` ausliefern; ein Abbruch (`ERR_STREAM_PREMATURE_CLOSE`) ist kein
  Fehler fürs Protokoll. Nachstellen: große Datei, nach dem ersten Block `req.destroy()`, dann
  `strom.destroyed` prüfen (`serveFile.test.ts`).
- **Eine Berechnung an drei Stellen läuft auseinander.** Den Byte-Bereich (`Range`) rechneten
  `media:`, `jingle:` und die Fernsteuerung je selbst; nur eine verstand `bytes=-500` (die
  letzten 500 Bytes), die anderen lieferten die ersten 501. Heute `parseRange()` in
  `shared/range.ts`. Ebenso bei der dritten Kopie eines HTTP-Details: einen Baustein ziehen.
- **Text aus einem Strom nie blockweise mit `+=` zusammensetzen.** Jeder Block wird einzeln als
  UTF-8 gelesen; ein Umlaut auf der Grenze zweier Blöcke wird zu zwei Ersatzzeichen (U+FFFD,
  die Raute mit Fragezeichen). `req.setEncoding('utf8')` vor dem ersten `data` –
  Node setzt geteilte Zeichen dann selbst zusammen. Nachstellen: den Körper als zwei `write()`
  mitten durch ein Zeichen schicken (`remoteHttp.test.ts`).

## Speichern im Renderer (November 2026)

- **Ein gescheitertes Speichern darf den Stand nicht vergessen.** `debouncedStorage` fing den
  Fehler von `localStorage.setItem` (Speicher voll) ab und leerte danach trotzdem die
  Vormerkliste – die Arbeit war nach dem nächsten Start still weg. Nur entfernen, was wirklich
  geschrieben ist; Gescheitertes bleibt vorgemerkt und geht beim nächsten Versuch mit.
- **Melden ja, aber einmal und von außen.** Ein Fehler beim Speichern kommt bei jedem
  Tastendruck wieder – gemeldet wird einmal je Ausfall und Store, nach einem Erfolg erst wieder
  beim nächsten Ausfall. Module, die auch in der Rechner-PWA laufen (`persistStorage.ts`),
  ziehen weder Toasts noch `api` herein: Die App setzt beim Start einen Melder
  (`setStorageErrorHandler` in `main.tsx`), die PWA keinen. Ein Melder, der selbst wirft, darf
  die übrigen Stores nicht am Schreiben hindern.

## Raster und SVG (Oktober 2026)

- **SVG mit `viewBox` nie `height:100%; width:auto` in eine Rasterzelle.** Die Breite folgt dann
  der Höhe: In der Bank der OSC-Steuerung ragten hohe Potis in die Nachbarn (App), am Handy
  verbreiterten sie ihre Spalte und schoben die hinteren aus der Kachel. Beide Maße auf 100 %
  setzen (`viewBox` hält das Bild rund und mittig) und Spalten als `minmax(0, 1fr)` statt `1fr`.
  Prüfen mit hoher, schmaler Kachel (`e2e/osc.mjs`, Rechtecke vergleichen).

- **`sm:` und `lg:` richten sich nach dem Fenster, nicht nach dem Platz.** Die Schublade nimmt davon
  360 px. Im Raster der ATEM-Steuerung lag das Dauer-Feld dadurch über den Stil-Knöpfen, unklickbar
  (31.10.2026, nur auf den kleinen CI-Bildschirmen von Windows und macOS rot, lokal und unter Linux
  grün). Für Inhalte neben der Schublade `flex-wrap` mit `min-w-…`, und im E2E einmal mit
  `page.setViewportSize({ width: 1024, height: 700 })` und `click({ trial: true })` prüfen.
  Für ganze Anordnungen gibt es dafür `WorkArea` (Stufe aus dem gemessenen Platz).

Aus dem Umbau des Video-Players auf die Arbeitsfläche (P1/P2, 13.11.2026):

- **Ein Wechsel der Anordnung darf den React-Baum nicht ändern.** Rendert eine Stufe andere
  Hüllen oder eine andere Reihenfolge, baut React beim Öffnen der Schublade die Kinder neu auf –
  im Player die Wiedergabe-Engine, deren Video dann neu lädt. Die Felder stehen deshalb immer in
  derselben Reihenfolge; die Anordnung kommt aus `grid-template-areas`. Geprüft wird das mit
  einer Marke am Element (`video.__marke = 1`), Stufe wechseln, Marke noch da
  (`e2e/player-layout.mjs`).
- **`container-type: size` braucht eine Größe, die nicht vom Inhalt kommt.** Das Element zählt
  seinen Inhalt dann nicht mit – mit Höhe `auto` hat es die Höhe 0. Größe aus dem Seitenverhältnis
  (`aspect-ratio` und `w-full`) oder aus dem umgebenden Flex/Raster geben.
- **Freie Höhe nicht mit `flex-1` an die Vorschau geben, wenn darunter Knöpfe stehen.** Dann
  schwebt die Vorschau in großen Fenstern mitten im Feld, und die Knöpfe kleben am unteren Rand
  (1920 × 1080, im Bild gesehen – der Messtest war grün). Besser: Rahmen mit Seitenverhältnis, der
  nur schrumpft (`flex-shrink`, `min-h-…`), der Kasten darin per Container-Einheiten
  (`width: min(100cqw, calc(100cqh * w / h))` mit dem Verhältnis der Wand); freier Platz bleibt
  unten.
- **Ein Test, der am alten Stand absichtlich scheitert, ist kein eigener Pull Request.** Er
  machte die CI rot. Test und Umbau in einen Pull Request, als zwei Commits; das Skript erst mit
  dem Umbau in `e2e/run.mjs` eintragen.
- **Messen, dann bauen – und nachrechnen, bevor man Verhältnisse festlegt.** Geplant war links
  11 : 9 (Playlist zu Bibliothek); nachgerechnet hätte die Playlist bei 1024 × 600 nur vier statt
  fünf Zeilen gezeigt. Erst mit 5 : 3 und kompakteren Zeilen passte es.

Aus der Bühne des Video-Players (P3, 13.11.2026):

- **Knöpfe über der Wiedergabe-Engine brauchen `z-20`.** Ihre Video-Ebenen tragen `z-index` bis 10
  ohne eigenen Stapelkontext; ein Knopf ohne `z-index` liegt darunter – unsichtbar beim
  Darüberfahren und nicht klickbar. Im Messtest unauffällig, im Bild gesehen; seither klickt das
  E2E den Knopf „FPS“ (Playwright scheitert, wenn etwas darüber liegt).
- **`pstate.wall` ist nicht die Wand aus den Einstellungen.** Der main zieht es erst nach, wenn
  das Ausgabefenster aufgeht. Für Anzeigen im Fenster (Seitenverhältnis der Vorschau) die
  Wand-Auflösung aus den Einstellungen nehmen (`wallW`/`wallH` in `VideoPlayer.tsx`).

## Einstellungen und gemerkte Stände

- Ändert eine Option, was ein bestehender Schalter bedeutet (Beispiel: „Kennung“ blendete früher
  Uhr und Sekundenring mit aus), prüfen, was gespeicherte Voreinstellungen jetzt anzeigen –
  Migration oder bewusst begründete Ausnahme.
- Neue Felder: `DEFAULT_SETTINGS`, nur geänderte Felder patchen, Stores mit `version`/`migrate`.
- Textfelder für Einstellungen puffern (`useDraft`/`TextField`).
- **Gemerktes auch zurücklesen.** Der Codec der M/E-Wahl las wegen eines fehlenden Backslash nie etwas
  (`/^d$/`), geschrieben wurde richtig, nichts fiel auf (ATEM, 31.10.2026, gefunden beim Lesen). Im E2E
  Wert setzen, Werkzeug zu und auf, Wert prüfen.

## Projektdateien und fremde Dateien (Oktober 2026)

- Fremde Dateien nur in den Speicher lesen, mit Grenzen (Größe, Anzahl, Namen ohne `..`), und
  Feld für Feld prüfen – Muster `src/main/services/projects/zip.ts` und `sanitize…` je Werkzeug.
  Ein kaputter Teil macht die Datei ungültig, statt beim Speichern still wegzufallen.
- Schreiben nur in freigegebene Pfade (Dialog, geöffnete Datei) – nie in einen Pfad, den der
  Renderer einfach schickt (`projectFiles.ts`, Freigabe).
- Datei-Bindung nach `await`: Prüfsumme vor dem Speichern nehmen, danach nur binden, wenn nicht
  inzwischen anders gebunden wurde (`lib/projectFile.ts`).
- Bindung und Bedienzustand nicht in Vorlagen bzw. nicht in den Datei-Abschnitt.

Aus dem Review von Phase 0 (16. Oktober 2026, alle mit Test oder E2E-Schritt belegt):

- **Fehlercodes unterscheiden.** `load()` machte aus JEDEM `stat`-Fehler „fehlt“ – ein kurzer
  Aussetzer des Netzlaufwerks ließ eine vorhandene Datei als neu gelten, und sie wurde ohne
  Sicherung durch eine mit nur dem eigenen Abschnitt ersetzt. Nur `ENOENT`/`ENOTDIR` heißt
  „fehlt“; alles andere bricht ab. Neue Dateien **exklusiv** anlegen (`'wx'`,
  `fsAtomic.writeNewFileAsync`) – legt sie jemand dazwischen an, neu lesen statt ersetzen.
- **Nur schreiben, was sich wieder lesen lässt.** Gespeichert wurde nach einer Grenze in
  Zeichen über kompaktes JSON, geschrieben eingerückt, gelesen mit einer Grenze in Bytes – eine
  riesige Wand (Tippfehler in den Maßen) ließ sich speichern, aber nie wieder öffnen. Vor dem
  Schreiben dieselben Grenzen und Prüfungen wie beim Lesen anwenden (`packProject`).
- **Schlüssel aus fremden Dateien nie mit `obj[key] ?? …` oder `key in obj` nachschlagen.**
  „constructor“ lieferte eine Funktion – die IPC-Antwort ließ sich nicht klonen, die Datei nicht
  öffnen. `Object.hasOwn` (oder `Map`).
- **Rückfragen sperren nur das eigene Fenster.** Wer nach einem Dialog Daten und Bindung frisch
  aus dem Store liest, schreibt womöglich, was ein anderes Fenster inzwischen geöffnet hat, und
  kapert dessen Bindung. Stand zu Beginn der Aktion festhalten, genau den schreiben und nach
  JEDER Rückfrage prüfen, ob sich etwas geändert hat (`changedMeanwhile`) – auch nach „Änderungen
  speichern?“, sonst wirft „Verwerfen“ die Arbeit des anderen Fensters weg. E2E: Abgleich per
  `localStorage` + `StorageEvent` während der Rückfrage auslösen (`e2e/projektdatei.mjs`).
- **Zerstörende Schritte erst nach Erfolg.** „Leere anlegen“ setzte die Planung vor dem
  Schreiben zurück – scheiterte das Schreiben, hing eine leere Planung an der alten Datei, und
  Strg+S hätte sie überschrieben. Weicht so eine Aktion auf „Speichern unter …“ aus, den
  festgehaltenen Stand mitgeben (`doSaveAs(carry)`), sonst speichert sie den alten.
- **Tastenkürzel nehmen den Fokus nicht weg.** Strg+O aus einem gepufferten Feld: Der Entwurf
  zählte nicht als ungespeichert und landete nach dem Öffnen in der neuen Planung. Vor JEDER
  Aktion, die den Arbeitsstand liest oder ersetzt, offene Eingaben übernehmen.
- **Rückfragen nennen das wirkliche Ziel** (Dateiname des Pfads, in den geschrieben wird), nicht
  die gebundene Datei.
- **`writeSync` schreibt bei fast voller Platte still nur einen Teil** und wirft nicht – die
  settings.json war danach abgeschnitten, beim nächsten Start alles zurückgesetzt. Ganze Inhalte
  mit `writeFileSync(fd, …)`/`fh.writeFile` schreiben; jeder Fehlerweg räumt seine Nachbardatei
  weg (eindeutige Namen werden sonst nie wiederverwendet). Unter Windows `rename` bei
  EPERM/EACCES/EBUSY kurz wiederholen, bevor ein nicht-atomarer Notweg greift.
- **Nie synchron auf Nutzerordner zugreifen** (`statSync`, `existsSync`): Ein getrenntes
  Netzlaufwerk hält den main bis zum SMB-Timeout an. `isDirReachable()` mit Zeitlimit.
- **Was die App selbst erzeugt, muss ihre eigene Prüfung bestehen.** `sanitize` verwarf Builder
  mit mehr als 50 Modulen (die „Im Builder weiterbearbeiten“ erzeugt), Raster über 200 Spalten
  (100-m-Wand) und Bögen, deren Winkel nach dem Verkleinern über Anzahl × 45° lag – beim Öffnen
  war die Form samt Verkabelung still weg. Grenzen an die Oberfläche koppeln, kappen statt
  verwerfen, und einen Test „was die App erzeugt, übersteht die Prüfung“.
- **Abgeleitete Größen nicht zerstörend anpassen.** `ensureGridSize` schnitt die Raster beim
  Umschalten von Modul oder Curving ab; zurückgeschaltet war die Verkabelung weg. Abgeschnittenes
  für die Sitzung merken (`led-wall/store.ts`, `shadow`) – aber **nur Belegtes**: Die erste
  Fassung merkte die Hülle aller je erreichten Größen, nach zwei korrigierten Tippfehlern
  (4000 statt 4 m, 2500 statt 2,5 m) 40 Mio. Zellen, 16 s je Tastendruck.
- **Grenzen in Summe prüfen, nicht nur je Teil.** 1000 Builder-Abschnitte zu je 1000 Modulen
  bestanden jede Einzelprüfung – eine 33-KB-Datei hätte eine Wand mit 1 Mio. Spalten angelegt.
  Vor dem Übernehmen die errechnete Größe prüfen (`fileSection.ts`).
- **Sicherungen** je Datei (Name + Pfad-Hash) und nie überschreiben (`COPYFILE_EXCL`).
- **Exklusiv anlegen heißt nicht: unter dem Zielnamen schreiben.** `open(…, 'wx')` und dann
  schreiben hinterließ bei einem Abbruch eine halbe Datei, die den Pfad sperrte. Erst fertig in
  die Nachbardatei, dann `link()` (atomar, EEXIST) bzw. ohne Hardlinks reservieren + umbenennen
  (`writeNewFileAsync`).

## Fenster (Oktober 2026)

- **`before-quit`: `preventDefault()` hält die übrigen Handler nicht an.** Alle registrierten
  Listener laufen trotzdem – der NDI-Stopp hätte die Ausgabe beendet, obwohl die Rückfrage
  „Wirklich beenden?“ noch offen war und danach „Abbrechen“ kam. Deshalb fragt
  `services/beenden/rueckfrage.ts` als ERSTER Handler, und jeder weitere prüft
  `beendenFreigegeben()`. Beim Schließen des letzten Fensters muss die Frage schon in `'close'`
  kommen – bei `before-quit` wäre das Fenster weg.
- **Electron meldet `'closed'` asynchron.** Wer ein Fenster schließt und sofort ein neues in
  dieselbe Modul-Variable legt (Monitorwechsel der Ausgaben), bekommt das `'closed'` des ALTEN
  Fensters erst danach – ein `win = null` dort verliert das neue Fenster (Zustand „zu“, Schließen
  wirkt nicht, das Fenster bleibt verwaist offen). Immer `const self = win` im Handler und
  `if (win !== self) return`. Regressionstest: `e2e/layout.mjs` (zweimal öffnen, dann prüfen).
- **„Live“-Anzeigen** brauchen die Wahrheit aus dem main (Event), nicht den letzten Klick im
  Renderer: Ausgabefenster schließen auch per Esc oder vom Betriebssystem.
- **`Field` umschließt sein Kind mit einem `<label>`.** Bei einer Knopfgruppe (`Segmented`) gilt es
  für den ersten Knopf: Er hieß „Dokument Dokument“ statt „Handbuch“, und ein Klick auf die
  Beschriftung schaltete still um. Knopfgruppen immer mit `<Field group>`.
- **Tasten eines Werkzeugs, die auf Sendung wirken** (ATEM, 31.10.2026, alle im E2E gefunden):
  Ein angeklickter Knopf behält den Fokus, die Leertaste löst ihn dann erneut aus: Sie trennte die
  Verbindung und öffnete die Sperre. Fokus nach Mausklicks abgeben (`e.detail > 0`), die Taste auch
  im gesperrten Zustand mit `preventDefault` verschlucken, gehaltene Tasten (`repeat`) nie
  wiederholen, und den Griff eines Hebels nicht wie ein Textfeld von der Tastatur ausschließen.
- **Exit-Hooks aus Bibliotheken:** Sie beenden bei SIGTERM gern hart per `process.exit` und übergehen
  Rückfrage und Aufräumen. Nur entfernen genügt nicht, dann gilt das Standardverhalten des Systems
  statt Electrons: eigener Listener mit `app.quit()` (`atemVerbindung.ts`).
- **Ziehflächen brauchen `select-none`, auch drumherum.** Der Hebel hatte `touch-none`, aber kein
  `select-none`, und wer ihn knapp verfehlte, markierte „Cut“ und „Auto“ (ATEM, 1.11.2026). Lag er dann
  in dieser Auswahl, zog Chromium den Text: `dragstart`, `pointercancel`, Verbotszeichen, der Griff
  stand. Sah aus wie ein Fehler am Hebel und trat „ab und zu“ auf. Bedienflächen ganz `select-none`,
  und beim Drücken eine vorhandene Auswahl löschen (Strg+A). Gegen so etwas hilft kein Blick in den
  Code: Bei „hängt ab und zu“ `pointercancel` und `dragstart` im Capture mitschreiben.
- **Gepufferte Felder für Werte, die ein Gerät zurückmeldet, zeigen nach der Eingabe den Stand des
  Geräts** (`NumberField` mit `zeigtMeldung`). `useDraft` übernimmt einen Wert nur, wenn er sich
  ändert; fallen zwei Änderungen in eine gedrosselte Meldung und endet sie beim alten Wert, blieb die
  Eingabe stehen, obwohl das Gerät anderes fuhr (ATEM, 2.11.2026, nur in der langsamen Windows-CI).
  Nachstellen mit zurückgehaltenen Antworten (`halteZurueck()` am Schein-Mischer).
- **Bedeutungsfarben nie aus der Akzentfarbe.** Die ATEM-Steuerung zeigte „gewählt für den Übergang“
  im Akzent. Der ist wählbar, Grün sähe aus wie die Vorschau, und ab Werk ist er fast dasselbe Gelb,
  das sonst „gewählt“ heißt (2.11.2026). Was eine Bedeutung trägt (live, Vorschau, gewählt, Warnung),
  kommt aus festen Tokens; der Akzent bleibt Schmuck und Fokus.
- **Ein Name ist keine Einheit.** `remainingFrames` und „Dauer in Bildern“ klangen nach Videobildern,
  der ATEM zählt ab 50p aber in Schritten von zwei Bildern. Aus Modus und Dauer gerechnet stand „1 s“
  neben einem Übergang von 2 s, und der Plan rechnete mit dem Gegenteil. Was ein Gerät zählt, am Gerät
  messen, und im Code nach dem nennen, was der Wert ist (`rate`, nicht `bilder`).
- **Eine Taste an genau einer Stelle auswerten.** Testbild und Timer schlossen bei Esc doppelt
  (before-input-event im main UND keydown im Renderer) – harmlos, solange ein Druck genügte. Mit
  „zweimal Esc“ hätte so schon ein Druck geschlossen. Tasten der Ausgabefenster nur im main
  (`services/windows/outputWindow.ts`).
- **Drei Kopien laufen auseinander.** Die Ausgabefenster waren dreimal kopiert und unterschieden
  sich nach und nach (Esc ja/nein, Knopf oben/unten, Drosselung an/aus, kein „Monitor wechseln“
  beim Timer). Bei der dritten Kopie einen gemeinsamen Baustein ziehen.
- **Fenster ohne App-Menü** (kleine Werkzeuge): Was app-weit wirkt, darf nicht an einem
  Bedienelement hängen, das dort fehlt. Die Darstellung hing am App-Menü – ein offenes kleines
  Fenster bekam Akzent, Design und Kompaktmodus nie mit. Heute `useAppearanceSync` an der
  App-Wurzel; neue app-weite Zustände ebenso.
- **Feste, auf einem Rechner gemessene Maße** (Fensterhöhe) stimmen unter Linux/macOS (andere
  Schrift) und im Kompaktmodus nicht – am echten Inhalt ausrichten. Messen im versteckten
  Fenster: `requestAnimationFrame`/`ResizeObserver` sind dort gedrosselt, die erste Messung
  synchron.
- **macOS beendet die App mit dem letzten Fenster nicht** – Tests, die auf das Ende warten,
  dort anders prüfen (Fensterzahl).

## Ton im Fenster (Testton, 13. November 2026)

- **Vorausplanen heißt nicht nachholen.** Der Testton plant Klicks und Pulse alle 100 ms bis
  0,4 s voraus. Hing die Seite, startete der nächste Takt alle verpassten Ereignisse zugleich:
  nach 1,6 s zwei Polaritätspulse übereinander, Spitze 0,252 statt 0,126 – am Pegel-Deckel
  vorbei (im alten Stand gemessen, `e2e/testton.mjs`). Was beim Planen schon vorbei ist,
  entfällt; das Raster bleibt (`planMetronome` in `_tone/plan.ts`, `beep` in `_tone/engine.ts`).
- **Was man im Betrieb ändert, darf den Ablauf nicht neu starten.** Jede Tempo-Änderung baute
  die Stimme des Metronoms neu, es begann wieder bei der Eins – mit „schneller/langsamer“-Knöpfen
  stottert das (aus dem Code). Fortlaufend planen: der nächste Schlag im neuen Abstand nach dem
  zuletzt eingeplanten, schon Eingeplantes bleibt. E2E: Jeder Abstand ist der alte oder der neue.
- **Overlays am `<body>` beim Scrollen mitlaufen lassen, nicht schließen.** Das ⓘ schloss beim
  Scrollen – ein Klick auf ein ⓘ weiter unten scrollt es aber erst ins Bild, und die gerade
  geöffnete Blase ging wieder zu (`e2e/layout.mjs`). Schließen beim Tippen daneben
  (`pointerdown`, capture): Auf dem Handy kommt dabei oft kein `blur`.
- **Wer nach Mausklicks den Fokus wegräumt (Tastenkürzel), lässt Elemente aus, die beim
  Fokusverlust schließen** – das ⓘ trägt dafür `data-infotip`.

## Was Electron und das System von selbst tun (10. November 2026)

Vier Funde aus einer Durchsicht der ganzen App, alle in der gebauten App nachgestellt, bevor
etwas geändert wurde (`e2e/haertung.mjs` war gegen den alten Stand in 9 von 10 Schritten rot).
Gemeinsam ist ihnen: Der eigene Code war richtig, die Vorgabe darunter nicht.

- **Electron hängt ein Standardmenü an jedes Fenster, und seine Tastenkürzel gelten auch
  unsichtbar** (`autoHideMenuBar` blendet nur die Leiste aus). Strg+W schloss ein Ausgabefenster
  am „zweimal Esc“ vorbei, Strg+R lud das Hauptfenster neu (Jingles und Testton brachen ab),
  Strg+Minus zoomte, F11 nahm das Vollbild, „View“ führte in der Kundenansicht zu den DevTools.
  Heute `Menu.setApplicationMenu(null)`, macOS mit eigener Vorlage (`appMenuTemplate` in
  `windowPolicy.ts`). Eine neue Rolle dort nur, wenn sie kein Fenster schließt, lädt, zoomt oder
  ausblendet – auch Cmd+H und Cmd+M nähmen eine Ausgabe vom Schirm. Tastenkürzel der App laufen
  über `before-input-event` (main) oder `keydown` (Renderer), nie über Menü-Rollen.
- **Chromium merkt sich den Zoom im Benutzerordner – je Seite, für alle Fenster gemeinsam.**
  Gemessen: `setZoomFactor(0.8)` im Hauptfenster zoomte auch die Timer-Ausgabe und galt nach dem
  Neustart weiter. `loadRoute` setzt ihn deshalb bei jedem Laden auf 1. Wer etwas entfernt, womit
  der Nutzer einen Zustand verstellen konnte, setzt den gemerkten Zustand mit zurück – sonst
  bleibt er für immer stehen.
- **Nichts hält den Rechner wach, nur weil die App etwas zeigt.** Chromium tut das allein für ein
  laufendes Video; Timer, Testbild, pausierter Player und jeder Auftrag liefen in den Standby.
  `energie/wachhalten.ts` fragt den Stand aus `beenden/laufend.ts` alle drei Sekunden ab: Was die
  Rückfrage beim Beenden nennt, hält den Rechner wach, eine Ausgabe auch den Bildschirm
  (`wachBedarf.ts`). Etwas Neues, das läuft, gehört also in `LaufendStand` – dann fragt das
  Beenden danach UND der Rechner bleibt wach.
- **Wer einen Stand im Takt abfragt, liest nach, was die Abfrage auslöst.** `getTimerNdiStatus()`
  und `getPlayerNdiStatus()` laden über `available` das NDI-Modul; im Takt gefragt, wäre es bei
  jedem Start geladen worden. Dafür gibt es `isTimerNdiRunning()`/`isPlayerNdiRunning()`.
- **Zwei Prozesse auf einem Benutzerordner** überschreiben einander `settings.json` (jeder hält
  sie im eigenen Zwischenspeicher). `requestSingleInstanceLock()` in `main/index.ts`; die zweite
  Instanz endet mit `app.exit(0)`, nicht `quit()` – das liefe durch die `before-quit`-Schritte
  und fasste dabei Einstellungen und Datenbank der laufenden App an. Die Sperre legt den
  Benutzerordner an: Was auf „Ordner fehlt noch“ prüft (`migrateUserData`), läuft davor.
  Nebenwirkung: `npm run dev` startet nicht neben der installierten App (gleicher Ordner).

## Bilder, PDF und fremdes HTML (Phase 1 Mini-Manual, 16. Oktober 2026)

- **Nicht übernehmen, was ein Werkzeug „sicher“ tut – messen.** Electrons `nativeImage`
  ignoriert die EXIF-Ausrichtung: Ein hochkant gehaltenes Handyfoto käme quer an. Die App liest
  die Ausrichtung selbst und dreht (`services/fotos/fotoImage.ts`); Test mit einem JPEG, dem
  eine EXIF-Ausrichtung 6 eingesetzt wurde (`e2e/fotos.mjs`, Farben oben/unten prüfen).
- **Neu kodieren entfernt Metadaten** (GPS des Aufbauorts) – gewollt bei allem, was an Kunden geht.
- **Inhalte aus fremden Dateien nur unter ihrem geprüften Hash ablegen**, sonst ersetzt eine
  präparierte Datei ein Foto einer anderen Planung (`extractFotos` in `projectFiles.ts`).
- **Fremdes HTML in einem Fenster lädt alles, was es nennt** – auch `file://server/…` (UNC,
  Windows meldet sich an) und protokollrelative Adressen (`//host/x` wird bei einer Datei-Seite
  zu UNC). Eigene Partition mit Anfragefilter, Gegenprobe mit lokalem Spion-Server.
- **URLs über 2 MB** (`data:`) lehnt Chromium ab – große Inhalte über eine temporäre Datei laden.
- **Nummern im Text müssen zur Reihenfolge der Ausgabe passen.** Das Handbuch gab die
  Fehlerfälle nach Bereich gruppiert aus, nummerierte sie aber nach der Liste – „6.“ stand vor
  „2.“, und „weiter mit Fall 3“ suchte man vergeblich. Aufgefallen erst beim Ansehen des PDFs
  (Skill `electron-e2e`, „PDF ansehen“); Test `seiten.test.ts` prüft die Reihenfolge.
- **Stilwerte aus Einstellungen oder Dateien nie ungeprüft ins CSS** (Akzentfarbe als Hex prüfen,
  sonst Vorgabe) – `red;}body{display:none` wäre sonst ein Stylesheet.
- **Bilder als Flex-Kind brauchen `align-self`** (oder einen Block drumherum): In einer
  Flex-Spalte streckt der Browser ein `<img>` auf die volle Breite und begrenzt nur die Höhe –
  das Deckblatt-Foto war verzerrt (17.10.2026), obwohl `max-width`/`max-height` gesetzt waren.
  Im Test **Hochformat** nehmen: Ein Querformat blieb in der schmalen Vorschau unter der
  Höhengrenze, der Test war auch ohne Korrektur grün (Gegenprobe!).

## Fremde Programme (YouTube-Downloader, 31.10.2026)

- **Code 0 heißt nicht: Ergebnis da.** yt-dlp überspringt einen vergebenen Dateinamen und meldet
  Erfolg („Fertig“ nach zwei Sekunden, Datei fehlte: Arte nennt jede Folge nur „Tracks“, im Ordner
  lag eine andere). Ebenso eine leere Playlist. „Fertig“ erst, wenn das Programm das Ergebnis
  ausdrücklich genannt hat (`--print after_move:…`), sonst Fehler.
- **Eine Pipe unter Windows ist nicht UTF-8.** Ohne Konsole schreibt ein Programm in der
  Systemkodierung: `ä` kam als Byte 0xE4, in Node als „�“, `：` fehlte ganz. Kodierung erzwingen
  (`--encoding utf-8`) und `stream.setEncoding('utf8')` statt `chunk.toString()`, sonst zerreißt
  ein Zeichen an der Grenze zweier Stücke. Im Labor wie die App starten: `spawn` mit
  `windowsHide`, Rohbytes ansehen. **Lesen nie bei einem Dekodierfehler beenden:** Hört der
  Leser auf, ist die Pipe zu, und das Programm scheitert beim nächsten Schreiben – yt-dlp unter
  Windows mit „Unable to download video: [Errno 22] Invalid argument“, noch vor dem ersten
  Fortschritt. Gesehen im MottulVideoLoader (Rust, `lines()` endete am Byte 0xA0 eines
  ARTE-Titels, 7.11.2026); die Mottulbox war durch `--encoding utf-8` und `setEncoding` sicher.
- **Pfade nie aus Anzeigezeilen lesen.** Sie sind für Menschen geschrieben und können von dem
  abweichen, was auf der Platte liegt. Einen eigenen, maschinenlesbaren Weg nehmen.
- **`shell.showItemInFolder` schweigt bei einem Pfad, den es nicht gibt** (gemessen: kein Fenster,
  kein Fehler). Ein falscher Pfad fällt also niemandem auf; im E2E prüfen, dass die Datei existiert.
- **Eine Sicherung kann selbst schaden: an den Wiederholungsfall denken.** Die erste Fassung lud
  bei vergebenem Namen immer unter eindeutigem Namen – eine erneut gestartete Playlist hätte jede
  Folge doppelt geladen, die yt-dlp vorher übersprang. Erst der Vergleich der Länge trennt
  „dasselbe Video“ von „anderes Video, gleicher Name“.
- **Die letzte Fehlerzeile nennt oft nicht die Ursache** (7.11.2026). Mit Firefox-Cookies kam
  „age-restricted“, Cookies und Konto stimmten aber. `yt-dlp -v` zeigte `JS runtimes: none`:
  Seit 2025.11 löst yt-dlp YouTubes Prüfaufgaben nur mit einer JavaScript-Laufzeit, ohne sie fiel
  der Zugang weg, der das Video geliefert hätte. Fremde Fehler mit `-v` nachstellen und die
  Warnungen davor lesen; ein selbst aktualisiertes Programm ändert seine Voraussetzungen. Electron
  bringt Node mit (`process.execPath` + `ELECTRON_RUN_AS_NODE=1` nur im Kindprozess).

## Netzwerk (Scanner, 1.11.2026)

- **Eine Deckelung für den Aufwand ist kein Filter fürs Ergebnis.** `hostRange` kürzt ein /16 aufs
  /24 um die eigene Adresse, und dieselben Grenzen verwarfen auch ARP und mDNS. Ein ATEM ohne DHCP
  (169.254.36.88 neben 169.254.164.96) fehlte im Scanner, obwohl `arp -a` ihn zeigte. „Gehört
  dazu“ entscheidet das echte Netz (`inSubnet`), und was der Sweep nicht erfasst hat, wird gezielt
  nachgeprüft (`probeExtra`).
- **Mehrere Adapter können im selben Netz liegen.** Kabel zum Mischer und Loopback-Adapter hatten
  beide 169.254.x.x/16 mit gleicher Metrik: Ohne Bindung entscheidet die Route, und `addMembership`
  ohne Adresse nimmt den bevorzugten Adapter, meist das WLAN. Absender festlegen: `localAddress`
  (TCP), `bind(0, adresse)` (UDP), `addMembership(gruppe, adresse)` + `setMulticastInterface`, unter
  Windows `arp -a -N adresse`. Gemessen: über Ethernet antwortet der Mischer, über Loopback nicht.
- **Langsame Systembefehle nicht vor die Anzeige hängen.** PowerShell braucht unter Windows 2–3 s
  bis zur ersten Ausgabe. Was nur Komfort ist (Adapter-Namen), bekommt einen eigenen Kanal und kommt
  nach; die Liste selbst bleibt sofort da. Ausgabe per `[Console]::OutputEncoding` auf UTF-8 setzen.

## Tests

- **Tests laden nichts aus dem Netz – auch nicht nebenbei.** Jeder E2E-Start lud wegen der
  yt-dlp-Prüfung beim Start yt-dlp herunter; die gesperrte `yt-dlp.exe` machte die Windows-CI
  immer wieder rot (Aufräumen mit EPERM), obwohl kein Schritt fehlschlug. Hintergrund-Arbeit, die
  die App beim Start anwirft (Downloads, Prüfungen), im Harness abschalten; Aufräumen darf nie
  einen Lauf scheitern lassen (`e2e/harness.mjs`).
- **Ein Messskript ist keine Gegenprobe.** Das erste Skript zum PDF-Weg zeigte einen Absturz der
  ganzen App bei einer `data:`-URL über 2 MB – er kam aber vom Skript (es druckte nach dem
  Ladefehler weiter). Die echte App warf nur `ERR_INVALID_URL`. Aussagen über das Verhalten der
  App erst nach der Gegenprobe in der App (E2E gegen den alten Stand) in Doku und Commits schreiben.
- **Ein Test darf die Regeln der App nicht umgehen.** Der RTA-Test startete Chromium mit
  `--use-fake-ui-for-media-stream` – das übergeht den Berechtigungs-Handler der App, der Test
  war grün, in der echten App hätte „Messen“ mit „Zugriff verweigert“ geendet (Oktober 2026).
  Prüfen, was ein Testschalter außer dem Gewünschten noch abschaltet; danach eine Gegenprobe
  gegen den alten Stand: Der Test muss dort scheitern.
- **Erwartungen, die nie scheitern können** (beide im eigenen Review gefunden, 18.10.2026):
  `expect(liste).not.toContain(expect.stringMatching(/…/))` – `toContain` vergleicht strikt, ein
  Matcher-Objekt ist nie enthalten, das `not` ist also immer wahr; stattdessen
  `expect(liste.some((t) => /…/.test(t))).toBe(false)`. Und kein stilles `if (…) return` im Test,
  wenn eine Vorbedingung fehlt – dann prüft er nichts und bleibt grün; die Vorbedingung selbst
  erwarten (`expect(ids).toContain('lib-wand-dunkel')`).

- **Reine Module importieren Stores anderer Werkzeuge nur als Typ.** Ein Store zieht `api`
  (`window.api`) mit – in den Node-Tests gibt es kein `window`, der Test bricht schon beim Import.
  Was ein reines Modul an Werten braucht (Beschriftungen, Tastenkürzel), liegt in einer eigenen
  Datei ohne Store (`osc-control/labels.ts`, `jingle-player/hotkeys.ts`, der Store exportiert es
  weiter); die Oberfläche lädt den Store erst beim Klick per `await import(…)` (Übernahme ins
  Mini-Manual, 23.10.2026). Ebenso Druck-HTML: Wer `PrintDialog` füttert, baut das HTML in
  einer eigenen reinen Datei (`packing-list/printHtml.ts`, `led-wall/printHtml.ts`) und testet dort.

## Vor dem Abschluss

Hat der Befund ein Gegenstück in der echten App? Mit `/electron-e2e` nachstellen, bevor man
ihn behebt, und danach als Regressionstest behalten. Behebungen einzeln bestätigen: Ein Teil der
Befunde war real, aber geringfügig (Durchsatz statt Datenverlust), ein Teil nicht haltbar
(Preset-Migration, fehlender EventSource-Schutz auf einer reinen Anzeigeseite) – das Gewicht
benennen, nicht alles gleich schwer nehmen.
