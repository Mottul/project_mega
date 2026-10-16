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
  jeder Rückfrage prüfen, ob sich etwas geändert hat (`changedMeanwhile`).
- **Zerstörende Schritte erst nach Erfolg.** „Leere anlegen“ setzte die Planung vor dem
  Schreiben zurück – scheiterte das Schreiben, hing eine leere Planung an der alten Datei, und
  Strg+S hätte sie überschrieben.
- **Tastenkürzel nehmen den Fokus nicht weg.** Strg+O aus einem gepufferten Feld: Der Entwurf
  zählte nicht als ungespeichert und landete nach dem Öffnen in der neuen Planung. Vor JEDER
  Aktion, die den Arbeitsstand liest oder ersetzt, offene Eingaben übernehmen.
- **Rückfragen nennen das wirkliche Ziel** (Dateiname des Pfads, in den geschrieben wird), nicht
  die gebundene Datei.

## Fenster (Oktober 2026)

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

## Tests

- **Ein Test darf die Regeln der App nicht umgehen.** Der RTA-Test startete Chromium mit
  `--use-fake-ui-for-media-stream` – das übergeht den Berechtigungs-Handler der App, der Test
  war grün, in der echten App hätte „Messen“ mit „Zugriff verweigert“ geendet (Oktober 2026).
  Prüfen, was ein Testschalter außer dem Gewünschten noch abschaltet; danach eine Gegenprobe
  gegen den alten Stand: Der Test muss dort scheitern.

## Vor dem Abschluss

Hat der Befund ein Gegenstück in der echten App? Mit `/electron-e2e` nachstellen, bevor man
ihn behebt, und danach als Regressionstest behalten. Behebungen einzeln bestätigen: Ein Teil der
Befunde war real, aber geringfügig (Durchsatz statt Datenverlust), ein Teil nicht haltbar
(Preset-Migration, fehlender EventSource-Schutz auf einer reinen Anzeigeseite) – das Gewicht
benennen, nicht alles gleich schwer nehmen.
