---
name: atem-steuerung
description: An der ATEM-Steuerung arbeiten – neuer Befehl, neue Seite, Dienst, Simulator, Hebel, Tastatur, atem-connection und ihr Socket-Thread, Schein-Mischer der E2E-Tests, Paketierung von FreeType. Verwenden, bevor an src/main/services/atem/, src/shared/atem*.ts, tools/atem-control/ oder e2e/atemFake.mjs gearbeitet wird.
---

# ATEM-Steuerung

Plan, Phasen und offene Abnahmen: `docs/PLAN-ATEM.md`. Benutzersicht: `docs/WERKZEUGE.md`.

## Aufbau

```text
Fenster  ──AtemCommand──▶  atemService (prüft mit atemCommand)  ──▶  AtemVerbindung
Fenster  ◀──AtemView────   atemViewAus(roh), gedrosselt          ◀──  roh = Zustand
```

- `shared/atem.ts`: Typen, `atemCommand(roh, view)` (Allowlist gegen den Stand des Mischers),
  `atemZiel`. `shared/atemView.ts`: verdichtet den Zustand. `AtemRoh` ist der Teil, den die Ansicht
  liest; `AtemState` der Bibliothek passt darauf, das prüft der Compiler in `atemVerbindung.ts`.
  So bleibt `shared` frei von der Bibliothek. Enums nur als Zahlen, Abgleich im Test
  (`atemView.test.ts` importiert `atem-connection/dist/enums`, das lädt kein FreeType).
- `services/atem/atemVerbindung.ts`: Schnittstelle und echte Fassung. `atem-connection` kommt per
  dynamischem `import()` erst beim Verbinden, sie zieht das native FreeType mit.
- `services/atem/atemSimulator.ts`: dieselbe Schnittstelle für den Probebetrieb.
- `services/atem/atemService.ts`: die eine Verbindung, nacheinander gestartet (`reihe`), alte
  Meldungen fallen über `aktuell` weg.
- `tools/atem-control/`: `AtemControl` (Leiste, Schublade, Status), `Seiten` darin hält Reiter und M/E,
  das `fieldset` für Sperre und Verlust liegt um Seite und Spalte. Links die Seite (`Seite*.tsx`,
  scrollt), rechts auf jeder Seite `UebergangSpalte` (Stil, Dauer, Cut, Auto, Hebel, FTB; volle Höhe,
  der Hebel nimmt den Rest). Gemeinsame Bausteine in `ui.tsx`. Die Tastatur hängt an `SeiteMischen`.

## Regeln

- **Der Knopf zeigt, was der Mischer meldet, nie, was gedrückt wurde.** Weder Dienst noch Fenster
  ändern die Ansicht selbst. Das Fenster zeigt nur „läuft“ (`data-zustand`), höchstens 1,5 s.
- **Alles aus dem Mischer, nichts fest verdrahtet:** Quellen, M/Es, Stile. Was er nicht kann,
  erscheint nicht. Immer mit M/E-Index arbeiten, auch wenn es nur eine gibt.
- **Fremde Eingaben:** auch Befehle aus dem eigenen Fenster gehen durch `atemCommand`.
- **Hohe Raten nie als Warteschlange:** Hebel über `hebelSenden` (immer der neueste Wert, nächster
  erst nach Bestätigung und 33 ms), Ansicht höchstens alle 40 ms.
- **Ruhelage des Hebels** kennt der Mischer nicht, sie liegt in `atemHebel.ts`. Der Wert läuft immer
  0…10000, auch wenn der Griff nach unten fährt. Jeder fertige Übergang dreht sie, auch Auto. Das Ende
  merkt sich der Dienst beim Senden (`hebelAmEnde`): Die gedrosselte Ansicht sieht bei einem Sprung ans
  Ende keinen hohen Wert, die Ruhelage bliebe stehen und der Griff am falschen Ende.
- **Zurückziehen ohne Absetzen:** `hebelZiehen` hält den Griff am Ende an, bis die gemeldete Ruhelage
  gedreht hat, und wartet auf 3 % Rückweg. Erst dann beginnt der nächste Übergang. Der Griff folgt der
  Maus dabei weiter.
- **Textauswahl:** Seite und Spalte sind `select-none` (am `fieldset`), der Hebel löscht beim Drücken
  jede Auswahl.
  Liegt er in einer, zieht Chromium den Text: `dragstart`, `pointercancel`, Verbotszeichen. Das sah
  aus wie ein hängender Hebel mit gewähltem Auto-Knopf (markierter Text darüber).
- **Dauern zählt der Mischer nicht in Bildern:** Ab 50p ist ein Schritt von `rate` und `rest` zwei Bilder
  (`bilderJeSchritt`). In `AtemView` und `AtemCommand` steht immer sein Wert, echte Bilder gibt es nur in
  `DauerFeld` und an den Restzählern. Der Probebetrieb läuft im selben Takt.
- **Direktes Kabel ohne DHCP:** Mischer und Rechner geben sich Link-Local-Adressen irgendwo in
  169.254.x.x/16. Der Netzwerk-Scanner findet ihn dann über ARP und mDNS (`_blackmagic._tcp`), nicht
  über den Sweep; Beispiel und Regeln in `review-checkliste`, Abschnitt Netzwerk.

## Bausteine der Seiten

**Jede Art Bedienelement sieht überall gleich aus** (mit dem Nutzer festgelegt, 2.11.2026: „die
Optionen sind nicht klar als solche erkennbar“). Neues fügt sich ein, statt eine fünfte Art zu erfinden:

| Art | Aussehen | Baustein | Beispiele |
| --- | --- | --- | --- |
| Löst sofort aus | massiv, `AKTION` (`bg-foreground`) | eigener `button` mit `KNOPF` + `AKTION` | Cut, Auto, Makro, DSK-Auto, Griff des Hebels |
| Auf Sendung | Rot, `ton="live"` | `SchaltKnopf` | Keyer und DSK „Auf Sendung“, Programm |
| Vorschau | Grün | nur die Vorschau-Reihe | |
| Wirkt beim Übergang | Gelb, `ton="gewaehlt"` / `Wahl` | `SchaltKnopf`, `Wahl` | Stil, Dauer-Schnellwahl, „Mit Übergang“ |
| Sonst an | hell umrandet, `ton="an"` | `SchaltKnopf` | Clip spielt, Schleife |

Gelb ist `warning`, **nie die Akzentfarbe**: Die ist wählbar (auch Grün = Vorschau) und ab Werk fast
dasselbe Gelb, deshalb ist auch der Griff des Hebels massiv. Ein- und Ausgeschaltetes steht als
Text im Knopf („An“/„Aus“, „Ja“/„Nein“), mit `label` für Vorlesewerkzeuge.

- `SchaltKnopf`: an/aus nach Meldung, „läuft“ dazwischen. Kein eigener Knopf für etwas, das der Mischer
  meldet.
- `Bereich`: Karte mit Überschrift für einen Teil einer Seite (Quellen, Keyer, Makros).
- `DauerFeld`: Dauer in echten Bildern mit Sekunden und Einheit im Feld, siehe Regeln oben. Es nutzt
  `NumberField` mit `zeigtMeldung`: Nach der Eingabe steht wieder der gemeldete Wert im Feld, bis der
  Mischer den neuen meldet, wie bei den Auswahllisten. Ohne das blieb in der Windows-CI die Eingabe
  stehen: Eingabe und Schnellwahl fielen in ein Fenster der Ansicht (40 ms), der gemeldete Wert sah
  unverändert aus, und `useDraft` übernimmt nur Änderungen.
- **Keyer-Streifen** (`SeiteMischen`): einzige Stelle, an der Keyer geschaltet werden. Die Seite „Keyer“
  richtet nur ein und zeigt `AufSendung` als Marke.
- **Quellen in den Reihen:** `atemViewAus` sortiert (Eingänge, dann MP, SuperSource, Farben, Schwarz,
  Balken, Wunsch des Nutzers), die Reihen lassen `schluessel` (Key-Signal der MP) weg.
- `QuellenWahl` und jede andere Auswahlliste: gesteuert vom gemeldeten Wert. Nach `onChange` springt sie
  zurück, bis der Mischer antwortet, das ist gewollt. Immer `aria-label`, siehe `electron-e2e`.
- **Neue Seite:** Eintrag in `SEITEN`, `hatSeite` nach dem, was der Mischer meldet, `Seite*.tsx`. Raster
  nach dem Platz (`grid-cols-[repeat(auto-fill,minmax(17rem,1fr))]`), nie `sm:`, siehe
  `review-checkliste`.
- **Nächster Übergang** ist eine Bitmaske (`ATEM_HINTERGRUND`, `keyerBit`). Das Fenster schickt die ganze
  Maske, nicht „Bit an“: So überholen sich zwei schnelle Klicks nicht im Dienst. Null lehnt
  `atemCommand` ab.

## Neuer Befehl

1. `AtemCommand` und Prüfung in `atemCommand` (mit Test, auch Grenzen und fremde Werte).
2. `anGeraet` in `atemVerbindung.ts`. Ein fehlendes `case` meldet der Compiler nicht.
3. `ausfuehren` im Simulator, mit Test.
4. Liest die Seite neue Felder: `AtemRoh`, `atemViewAus`, Typ in `atem.ts`.
5. `e2e/atemFake.mjs`: Antwort und Anfangszustand, Schritt in `e2e/atem.mjs` mit Rückmeldung.

Befehle ohne `me` prüft `befehlOhneMe`: Hat ein Objekt kein Feld `me`, landet es dort, DSKs, Makros,
Medien und AUX gelten für den ganzen Mischer. Quellen für Key und AUX prüft `quelleMit` gegen
`verfuegbar`, nicht gegen die M/E: Eine AUX-Quelle wie das Multiview nimmt keine M/E an. Sie steht
deshalb in `view.quellen`, die Reihen filtern mit `quelleAufMe`.

Format der Kommandos steht in `node_modules/atem-connection/dist/commands/`: `serialize` für den
Weg zum Mischer, `deserialize` für die Meldung zurück.

## Testen

| Weg | Prüft | Prüft nicht |
| --- | --- | --- |
| Unit `atemService.test.ts` | Reihenfolge, Drossel, veraltete Meldungen; Mock der Verbindung | Bibliothek |
| Probebetrieb im E2E | Oberfläche, Modelle | Protokoll |
| Schein-Mischer (`e2e/atemFake.mjs`) | echter Weg: Bibliothek, Socket-Thread, UDP, Bytes der Befehle; hält Antworten zurück, ändert von außen, verstummt | echtes Gerät: nachgebaut aus der Bibliothek, gemessen wird dort nichts |
| Abnahme am Mischer | alles | CI hat kein Gerät |

Schein-Mischer: `startAtemFake()` liefert `host` (für `api.atem.connect`), `empfangen`,
`halteZurueck()`/`freigeben()`, `fremdesProgramm(n)`, `fremderDsk(i, an)`, `makroZuEnde()`,
`verstummen()`/`wieder()`, `anmeldungen`.
Die Pakete müssen fortlaufend nummeriert sein, die Bibliothek puffert sonst und wartet. Ohne
Lebenszeichen alle 500 ms meldet sie nach 5 s den Verlust. Die Nutzlast des letzten Kommandos muss
über 0 Byte sein: `_parseCommands` läuft nur `while (length > 8)`.

Im Test nach jedem Schalten auf die Rückmeldung warten, auch vor dem nächsten Feld: Das Feld „Dauer in
Bildern“ gehört zum gemeldeten Stil. Wer nach dem Klick auf „Dip“ sofort tippt, ändert noch die
Mix-Dauer (rot im vollen Lauf, allein grün).

## Messen am Gerät

Was nur das Gerät weiß, wird gemessen, nicht geraten: Die Bibliothek nennt `remainingFrames`, das sind
ab 50p aber keine Videobilder. Ein kleines Skript im Scratch-Ordner, `createRequire` mit der
`package.json` des Projekts, `new Atem({})`, `connect`, dann `stateChanged` mitschreiben. **Lauschen
ändert nichts und geht jederzeit; schalten nur nach Absprache**, das Bild kann auf Sendung sein. Direkt
nach `connected` liegt in `a.state` der ganze Stand.

Gemessen am ATEM Mini Extreme, 1080p50, Auto-Mix mit Dauer 50:

| Was | Wert |
| --- | --- |
| Dauer | 1981 ms |
| Hebel-Meldungen (`TrPs`) | alle 20 ms, je Bild eine |
| `handlePosition` | 100, 200 … 9900, Schritte von 100 = je Videobild, das Ende (10000) wird nie gemeldet |
| `remainingFrames` | 49, 49, 48, 48 … also 25 je Sekunde; ruhend steht dort die eingestellte Dauer |
| Letzte Meldung | `inTransition` false, Hebel 0 |

## Paket und Bibliothek

Gemessen im Oktober 2026 auf allen drei Systemen, aus dem echten Installer:

- **Socket-Thread** läuft aus dem `app.asar` als `worker_threads`, `disableMultithreaded` ist nicht
  nötig. Die Bibliothek darf nicht gebündelt werden: `threadedclass` sucht `./atemSocketChild`
  relativ zu ihrer Aufrufdatei. Bleibt extern, weil sie in `dependencies` steht.
- **FreeType** ist N-API, Binaries je System im Paket, `pkg-prebuilds` findet sie auch im
  `app.asar.unpacked`. `electron-builder.yml` nimmt nur das der Zielplattform mit (14 MB weniger).
  Fehlt es, scheitert schon `import('atem-connection')`: Der Dienst meldet das im Status, die App
  läuft weiter.
- **exit-hook** aus der Bibliothek beendet bei SIGTERM/SIGINT hart. `signaleUebernehmen()` lenkt
  das auf `app.quit()` um; nur die Listener zu entfernen genügte nicht, denn danach gilt das
  Standardverhalten des Systems. Prüfung in `e2e/atem.mjs` (nur macOS und Linux).
- **Thread-Absturz:** `threadedclass` startet den Thread neu, die Bibliothek verbindet sich selbst
  wieder. Der Dienst muss nichts tun, der Schritt in `e2e/atem.mjs` beendet den Worker hart.

## Tastatur

`tastatur.ts`, ausgelöst an genau einer Stelle (`SeiteMischen`). Drei Fehler kamen im E2E heraus:

- Der Griff behält nach dem Ziehen den Fokus. Ein Ausschluss von `role="slider"` stellte die
  Tastatur danach still ab.
- Ein angeklickter Knopf behält den Fokus: Die Leertaste trennte die Verbindung oder löste die
  Sperre. Deshalb gibt `AtemControl` den Fokus nach Mausklicks ab (`e.detail > 0`). `:focus-visible`
  taugt nicht als Unterscheidung, Chromium setzt es beim ersten Tastendruck auch dort.
- Gesperrt muss die Taste trotzdem verschluckt werden, sonst wirkt sie auf den Knopf mit Fokus.
