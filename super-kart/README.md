# Super Kart

Ein Retro-Kart-Rennspiel im Mode-7-Stil der 16-Bit-Ära – als installierbare PWA,
die auf Desktop, Tablet, Telefon und Konsolen-Browsern läuft und nach dem ersten
Laden auch **offline** funktioniert.

Zwei Modi, beide mit **Splitscreen für zwei Spieler**:

- **Rennen** – Rundenrennen gegen bis zu sechs KI-Fahrer, mit Items, Drift-Turbo
  und Boost-Feldern über fünf Strecken.
- **Battle** – Ballonschlacht in zwei Arenen. Wer zuletzt noch Ballons hat, gewinnt.

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
  core/      Mathe, deterministischer Zufall, Eingabe, WebAudio-Synthese
  game/      Regeln: Strecken, Streckenaufbau, Fahrphysik, Items, KI, Welt
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
  Renderer; die Rundenzählung, die Item-Verteilung und die Ergebnisliste liegen
  in reinen Modulen (`progress.ts`, `items.ts`, `results.ts`) und sind ohne
  Browser testbar.

## Tests

- **Unit-Tests** (`npm test`) prüfen die reine Logik: Winkelmathematik,
  Rundenzählung über die Ziellinie, Item-Wahrscheinlichkeiten, Streckendaten
  und die Ergebnisliste.
- **Rauchtest** (`npm run smoke`) startet den echten Build in Chromium, klickt
  sich durch Titel, Menü, Einzelrennen, Splitscreen und Battle, prüft die
  Browser-Konsole auf Fehler und dass tatsächlich ein Bild entsteht.
  Screenshots landen in `screenshots/`. Ist bereits ein Chromium vorhanden,
  kann er über `PLAYWRIGHT_CHROMIUM_PATH` genutzt werden.

## Lizenz

MIT – siehe [LICENSE](LICENSE).
