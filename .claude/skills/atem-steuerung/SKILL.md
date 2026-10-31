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

## Regeln

- **Der Knopf zeigt, was der Mischer meldet, nie, was gedrückt wurde.** Weder Dienst noch Fenster
  ändern die Ansicht selbst. Das Fenster zeigt nur „läuft“ (`data-zustand`), höchstens 1,5 s.
- **Alles aus dem Mischer, nichts fest verdrahtet:** Quellen, M/Es, Stile. Was er nicht kann,
  erscheint nicht. Immer mit M/E-Index arbeiten, auch wenn es nur eine gibt.
- **Fremde Eingaben:** auch Befehle aus dem eigenen Fenster gehen durch `atemCommand`.
- **Hohe Raten nie als Warteschlange:** Hebel über `hebelSenden` (immer der neueste Wert, nächster
  erst nach Bestätigung und 33 ms), Ansicht höchstens alle 40 ms.
- **Ruhelage des Hebels** kennt der Mischer nicht, sie liegt in `atemHebel.ts`. Der Wert läuft immer
  0…10000, auch wenn der Griff nach unten fährt. Jeder fertige Übergang dreht sie, auch Auto.

## Neuer Befehl

1. `AtemCommand` und Prüfung in `atemCommand` (mit Test, auch Grenzen und fremde Werte).
2. `anGeraet` in `atemVerbindung.ts`. Ein fehlendes `case` meldet der Compiler nicht.
3. `ausfuehren` im Simulator, mit Test.
4. Liest die Seite neue Felder: `AtemRoh`, `atemViewAus`, Typ in `atem.ts`.
5. `e2e/atemFake.mjs`: Antwort und Anfangszustand, Schritt in `e2e/atem.mjs` mit Rückmeldung.

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
`halteZurueck()`/`freigeben()`, `fremdesProgramm(n)`, `verstummen()`/`wieder()`, `anmeldungen`.
Die Pakete müssen fortlaufend nummeriert sein, die Bibliothek puffert sonst und wartet. Ohne
Lebenszeichen alle 500 ms meldet sie nach 5 s den Verlust. Die Nutzlast des letzten Kommandos muss
über 0 Byte sein: `_parseCommands` läuft nur `while (length > 8)`.

Im Test nach jedem Schalten auf die Rückmeldung warten, auch vor dem nächsten Feld: Das Feld „Dauer in
Bildern“ gehört zum gemeldeten Stil. Wer nach dem Klick auf „Dip“ sofort tippt, ändert noch die
Mix-Dauer (rot im vollen Lauf, allein grün).

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
