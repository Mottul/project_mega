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
  Stand merken, `start()` baut danach mit dem neuesten (`tone/engine.ts`, `e2e/testton.mjs`).
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

## Raster und SVG (Oktober 2026)

- **SVG mit `viewBox` nie `height:100%; width:auto` in eine Rasterzelle.** Die Breite folgt dann
  der Höhe: In der Bank der OSC-Steuerung ragten hohe Potis in die Nachbarn (App), am Handy
  verbreiterten sie ihre Spalte und schoben die hinteren aus der Kachel. Beide Maße auf 100 %
  setzen (`viewBox` hält das Bild rund und mittig) und Spalten als `minmax(0, 1fr)` statt `1fr`.
  Prüfen mit hoher, schmaler Kachel (`e2e/osc.mjs`, Rechtecke vergleichen).

## Einstellungen und gemerkte Stände

- Ändert eine Option, was ein bestehender Schalter bedeutet (Beispiel: „Kennung“ blendete früher
  Uhr und Sekundenring mit aus), prüfen, was gespeicherte Voreinstellungen jetzt anzeigen –
  Migration oder bewusst begründete Ausnahme.
- Neue Felder: `DEFAULT_SETTINGS`, nur geänderte Felder patchen, Stores mit `version`/`migrate`.
- Textfelder für Einstellungen puffern (`useDraft`/`TextField`).

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
  Mini-Manual, 23.10.2026). Ebenso Druck-HTML: Wer `api.util.exportPdf` ruft, baut das HTML in
  einer eigenen reinen Datei (`packing-list/printHtml.ts`, `led-wall/printHtml.ts`) und testet dort.

## Vor dem Abschluss

Hat der Befund ein Gegenstück in der echten App? Mit `/electron-e2e` nachstellen, bevor man
ihn behebt, und danach als Regressionstest behalten. Behebungen einzeln bestätigen: Ein Teil der
Befunde war real, aber geringfügig (Durchsatz statt Datenverlust), ein Teil nicht haltbar
(Preset-Migration, fehlender EventSource-Schutz auf einer reinen Anzeigeseite) – das Gewicht
benennen, nicht alles gleich schwer nehmen.
