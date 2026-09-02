# Super Kart

Ein Retro-Kart-Rennspiel im Mode-7-Stil der 16-Bit-Ära – als installierbare PWA,
die auf Desktop, Tablet, Telefon und Konsolen-Browsern läuft und nach dem ersten
Laden auch **offline** funktioniert.

Zwei Modi, beide mit **Splitscreen für bis zu vier Spieler**:

- **Rennen** – Rundenrennen gegen KI-Fahrer, mit Items, Drift-Turbo und
  Boost-Feldern über fünf gebaute Strecken plus beliebig viele Zufallsstrecken.
- **Battle** – Ballonschlacht in zwei Arenen (ebenfalls per Zufall erzeugbar).
  Wer zuletzt noch Ballons hat, gewinnt.

Gespielt wird mit Tastatur, Gamepad oder auf dem Touchscreen – auch gemischt.

Das Spiel ist eine eigenständige Hommage an das Genre: eigene Strecken, eigene
Fahrer, eigene Grafik und Musik. Es enthält keine Inhalte Dritter – **alle**
Grafiken, Sounds und Musikstücke werden zur Laufzeit im Browser erzeugt, das
Repository enthält keine Medien-Assets.

## Schnellstart

```bash
npm install
npm run dev       # Entwicklungsserver mit Hot Reload
```

Dann im Browser öffnen und losfahren.

## Kommandos

```bash
npm run dev          # Entwicklungsserver
npm run build        # Icons erzeugen, Typen prüfen, nach dist/ bauen
npm run preview      # gebautes Ergebnis lokal ausliefern
npm run typecheck    # nur TypeScript prüfen
npm test             # Unit-Tests (Vitest)
npm run smoke        # Build + Rauchtest im echten Browser (Playwright)
npm run format       # Prettier schreiben (format:check nur prüfen)
npm run check        # alles zusammen, wie in der CI
```

Einzelner Test: `npx vitest run test/progress.test.ts`

## Steuerung

| Aktion         | Spieler 1                 | Spieler 2      | Gamepad       |
| -------------- | ------------------------- | -------------- | ------------- |
| Lenken         | ← →                       | A D            | Stick / Kreuz |
| Gas / Bremse   | ↑ / ↓                     | W / S          | A / B         |
| Drift (Hopser) | Leertaste, Shift rechts   | Shift links, Q | L / R         |
| Item           | Enter, Punkt, Strg rechts | E, R           | X / Y         |
| Pause          | Esc oder P                | –              | Start         |

Auf Touchgeräten blendet die erste Berührung ein Lenkfeld (links) und die
Tasten (rechts) ein – im Splitscreen für jede Bildhälfte getrennt.
Gamepad 1 steuert Spieler 1, Gamepad 2 steuert Spieler 2. Doppelklick bzw.
Doppeltipp schaltet den Vollbildmodus um.

### Drift und Mini-Turbo

Drift-Taste kurz drücken → das Kart hüpft. Wird die Taste beim Aufsetzen
gehalten und dabei gelenkt, beginnt der Drift: Das Heck bricht aus, die
Funken wechseln von weiß über gelb nach rosa. Wer beim Loslassen weit genug
geladen hat, bekommt einen Mini-Turbo (zwei Stufen).

## Items

| Item           | Wirkung                                                |
| -------------- | ------------------------------------------------------ |
| Turbo          | Kurzer Geschwindigkeitsschub                           |
| Dreifach-Turbo | Drei Schübe nacheinander                               |
| Zielrakete     | Sucht das nächste Kart vor einem                       |
| Prallkugel     | Fliegt geradeaus, prallt in Arenen von Wänden ab       |
| Ölfleck        | Wird nach hinten abgelegt, lässt Getroffene ausbrechen |
| Stachelmine    | Wie der Ölfleck, explodiert aber beim Treffer          |
| Schutzschild   | Fängt einen Treffer ab                                 |
| Blitz          | Staucht alle Gegner – nur für weit Zurückliegende      |

Die Ziehwahrscheinlichkeit hängt von der Platzierung ab: Vorn gibt es
hauptsächlich Defensivitems, hinten die starken Sachen.

## Zufallsstrecken

Unter _Strecke wählen_ liegt hinter der Streckenliste der Eintrag **ZUFALL**.
Jede Zufallsstrecke ergibt sich vollständig aus ihrem **Seed** – dieselbe Zahl
erzeugt immer dieselbe Strecke, Thema und Namen inklusive. Eine gelungene
Strecke lässt sich damit wiederfinden und einfach als Zahl weitergeben.

Erzeugt wird die Streckenmitte als Radiusfunktion über dem Winkel: eine Summe
weniger Sinusschwingungen. Das hat zwei angenehme Eigenschaften – die Kurve
liegt sternförmig um die Mitte und kann sich damit praktisch nicht selbst
schneiden, und die Oberwellen erzeugen von allein Wechsel aus Geraden, weiten
Bögen und engeren Kurven statt eines Kreises.

Erzeugen allein reicht aber nicht: Jeder Vorschlag wird geprüft, bevor er
angenommen wird – auf Selbstüberschneidung (sonst überlappt die Fahrbahn und
die Rundenzählung bricht), auf Kurven, die enger sind als ein Kart fahren kann,
und auf Abstand zum Weltrand. Fällt ein Vorschlag durch, wird flacher und
glatter neu gewürfelt; erst wenn alles scheitert, greift eine garantiert
fahrbare Ausweichstrecke. Über 400 Seeds gemessen braucht es dafür im Schnitt
sechs Anläufe und die Ausweichstrecke kein einziges Mal.

Arenen entstehen nach demselben Prinzip: Die Hindernisse liegen auf einem
Raster und werden an beiden Achsen gespiegelt, damit kein Startplatz im
Vorteil ist und zwischen den Blöcken garantiert Gassen bleiben.

## Installation als App

Die Anwendung bringt ein Web-App-Manifest und einen Service Worker mit:

- **Android/Chrome/Edge:** Menü → „App installieren“ (oder der Menüpunkt
  _Einstellungen → App installieren_ im Spiel selbst).
- **iOS/Safari:** Teilen → „Zum Home-Bildschirm“.
- **Desktop:** Installationssymbol in der Adressleiste.

Nach dem ersten Laden liegen Programm, Manifest und Icons im Cache – das Spiel
startet danach ohne Netzverbindung. Der Service Worker wird beim Build
erzeugt (siehe `vite.config.ts`) und enthält die gehashten Dateinamen des
jeweiligen Builds, sodass ein neuer Build den alten Cache sauber ersetzt.

## Veröffentlichen

`npm run build` legt alles nach `dist/`; der Ordner ist rein statisch und
funktioniert unter jedem Pfad (`base: './'`). Der mitgelieferte Workflow
`.github/workflows/pages.yml` veröffentlicht `main` automatisch auf GitHub
Pages; jeder andere Static-Host (Netlify, Vercel, S3, nginx) tut es genauso.

## Architektur

Reines TypeScript auf Canvas 2D, ohne Spiel-Framework. Build: Vite.

```
src/
  core/      Mathe, deterministischer Zufall, Eingabe, Gamepads, WebAudio
  game/      Regeln: Strecken, Streckenaufbau, Zufallsgenerator, Fahrphysik,
             Items, KI, Welt
  render/    Mode-7-Renderer, Sprite-Erzeugung, Szene, HUD
  ui/        Menü, Touch-Steuerung, Streckenvorschau
  app.ts     Zustandsmaschine, Spielschleife, Splitscreen
scripts/     Icon-Generator (eigener PNG-Encoder), Browser-Rauchtest
test/        Unit-Tests der reinen Logik
```

Die tragenden Entscheidungen:

- **Mode 7 in Software.** `render/mode7.ts` rechnet je Bildschirmzeile eine
  affine Abbildung auf eine 1024×1024-Streckentextur – dasselbe Prinzip wie beim
  SNES. Die interne Auflösung ist fest auf 240 Zeilen begrenzt und wird
  ungeglättet hochskaliert: das erzeugt den Pixel-Look und hält die Bildrate
  auch auf Telefonen stabil, unabhängig von der Bildschirmgröße.
- **Strecken als Daten.** Eine Strecke in `game/tracks.ts` besteht nur aus
  Stützpunkten und einem Farbthema. `game/trackgen.ts` erzeugt daraus per
  Catmull-Rom die Mittellinie und malt zwei Ebenen: die sichtbare Farbtextur
  und eine ID-Karte für die Kollision (Fahrbahn, Randstein, Gelände, Boost,
  Wand, Abgrund). Wegpunkte, Startaufstellung, Item-Boxen und Deko fallen
  dabei mit ab. Eine neue Strecke ist ein Eintrag in einem Array.
- **Alles prozedural.** Karts sind Mini-3D-Modelle aus Quadern, die beim Start
  für 32 Blickwinkel abgezeichnet werden (`render/sprites.ts`) – wie die
  vorgerenderten Frames der Vorlage. Musik und Effekte entstehen in
  `core/audio.ts` aus Oszillatoren. Deshalb wiegt der gesamte Build nur einige
  Dutzend Kilobyte.
- **Wände als Billboards.** Mode 7 kennt keine Geometrie über dem Boden. Die
  Arenamauern werden deshalb zusätzlich als Reihe von Billboards aufgestellt,
  während die Kollision weiterhin aus der ID-Karte kommt.
- **Trennung von Regel und Bild.** `game/world.ts` simuliert vollständig ohne
  Renderer; Rundenzählung, Item-Verteilung, Ergebnisliste und der
  Zufallsgenerator liegen in reinen Modulen (`progress.ts`, `items.ts`,
  `results.ts`, `procedural.ts`) und sind ohne Browser testbar.
- **Gamepads getrennt von der Eingabe.** `core/gamepad.ts` normalisiert Pads
  (Layout-Erkennung, Hat-Achse, Totzone, feste Spielerplätze, angelernte
  Belegung) und liefert einen einheitlichen Zustand; `core/input.ts` mischt ihn
  nur noch mit Tastatur und Touch zusammen.

## Tests

- **Unit-Tests** (`npm test`) prüfen die reine Logik: Winkelmathematik,
  Rundenzählung über die Ziellinie, Item-Wahrscheinlichkeiten, Streckendaten,
  Ergebnisliste, die Gamepad-Normalisierung (mit simulierten Pads) und den
  Zufallsgenerator. Letzterer wird gegen genau die Eigenschaften geprüft, die
  eine Strecke unspielbar machen würden – Selbstüberschneidung, zu enge Kurven,
  Weltgrenzen – und zusätzlich darauf, dass die Formen nicht in langweilige
  Kreise zusammenfallen.
- **Rauchtest** (`npm run smoke`) startet den echten Build in Chromium und
  klickt sich durch Titel, Menü, Einzelrennen, Splitscreen, Viererraster,
  Zufallsstrecke, Controller-Seite und Battle. Ein Gamepad lässt sich dabei
  nicht anstecken, also wird eins vorgetäuscht – bewusst ohne Standard-Layout –
  und das Anlernen der Belegung bis in den gespeicherten Zustand geprüft.
  Nebenbei laufen die Browser-Konsole auf Fehler und die Prüfung, dass
  tatsächlich ein Bild entsteht. Screenshots landen in `screenshots/`. Ist
  bereits ein Chromium vorhanden, kann er über `PLAYWRIGHT_CHROMIUM_PATH`
  genutzt werden.

## Lizenz

MIT – siehe [LICENSE](LICENSE).
