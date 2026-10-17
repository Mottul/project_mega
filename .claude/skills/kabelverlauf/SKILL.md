---
name: kabelverlauf
description: Am Kabelverlauf des LED-Wall-Konfigurators arbeiten – Ketten, Startecke und Richtung, gezeichnete Reihenfolge, Pfeile am Bildschirm und im PDF, Ansicht von hinten, Signal und Strom nebeneinander, später Ports, Backup, Stromkreise und Prozessor-Grenzen. Verwenden, bevor an cabling.ts, CableGrid.tsx, printHtml.ts oder den Feldern sigMeta/pwrMeta gearbeitet wird.
---

# Kabelverlauf (LED-Wall-Konfigurator)

Plan und Festlegungen: `docs/PLAN-MINI-MANUAL.md`, Abschnitt „Kabelverlauf im
LED-Wall-Konfigurator“ (Festlegungen 21, 24–34). Kurz: **Verlauf nur von Hand**, kein
Einspeisepunkt, keine Automatik.

## Wo was liegt

| Was | Datei |
|---|---|
| Reine Funktionen: Zählung je Kette, Schlange (8 Muster), Abgleich der gezeichneten Reihenfolge, Hinweise, Pfeil-SVG | `src/renderer/src/tools/led-wall/cabling.ts` + `cabling.test.ts` |
| Daten je Kette (`start`, `axis`, `order`; später `port`, `backup`, `circuit`, `phase`) | `sigMeta`/`pwrMeta` in `led-wall/config.ts` (Prüfung `sanitizeLedWallConfig`) |
| Aktionen `setRoute`, `drawChain`, `resetGrid` | `led-wall/store.ts` + `store.test.ts` |
| Raster mit Verlauf-Leiste, Zeichnen, Pfeil-Overlay, Spiegelung | `led-wall/CableGrid.tsx` |
| Reiter Signal / Strom / Signal + Strom, Umschalter Vorne/Hinten | `led-wall/LedWall.tsx` (`Drawing`) |
| PDF-Doku (rein, getestet) und dünner Export | `led-wall/printHtml.ts` + `printHtml.test.ts`, `led-wall/print.ts` |
| Prozessoren (Handbuch-Werte), Karte je Modul, Vorbelegung, Gruppen, Port-Vergabe, Lasten, Warnungen | `led-wall/processors.ts` + `processors.test.ts` |
| Schublade „Prozessor“, Karte „Signal“ | `led-wall/Settings.tsx` (`ProcessorPanel`), `led-wall/LedWall.tsx` (`SignalCard`) |
| E2E | `e2e/kabelverlauf.mjs` |

## Regeln

- **Eine Zeichenquelle** für Bildschirm und PDF: `routeSvg` liefert SVG-Teile. Am Bildschirm
  absolut über dem Knopf-Raster (`pointer-events: none`), im PDF in `gridSvg` angehängt.
  Marker-IDs je Plan eindeutig (`sig-raster`, `pdf-S` …) – Signal und Strom stehen auf einer Seite.
- **Daten immer in der Ansicht von vorne** (Zeile 0 oben, Spalte 0 links). „Hinten“ spiegelt nur
  die Darstellung (`mirror`); Spalten- und Kettennummern bleiben am Modul, Startecken werden in
  der Ansicht beschriftet, in der man die Wand sieht (`mirrorCorner`). Blickrichtung ist
  Bedienzustand (`usePersistentState('led-wall:planSide')`), nie in der Datei.
- **Ohne Startecke und ohne Zeichnung kein Verlauf** – keine Pfeile, Hinweis „S2 ohne Verlauf“.
  Nichts vorschlagen, was niemand festgelegt hat.
- **Gezeichnet hat Vorrang** vor Startecke/Richtung; Startecke wählen löscht die Zeichnung,
  Zeichnen löscht die Startecke. Übrige Felder der Kette (Port …) bleiben dabei (`omit`).
- **Abgleichen statt mitpflegen:** Zellen-Klicks, ganze Linien und Größenänderungen ändern nur das
  Raster. Beim Lesen fallen Module, die nicht mehr in der Kette sind, aus der Reihenfolge; neue
  hängen hinten an und heißen „nachzeichnen“ (`chainRoute`).
- **Zeichnen:** `pointerdown` auf einer Zelle beginnt, `pointermove` auf dem Raster findet die
  Zelle per `elementFromPoint` und `data-cell` (geht auch mit Touch-Capture), `pointerup` am
  Fenster beendet. Am letzten Modul ansetzen verlängert, sonst ersetzt der Strich die Kette.
  Im Zeichenmodus wirken Klicks auf Module nicht (sonst nähme der Klick sie wieder heraus).
- **Pfeile zwischen den Modulen**, nicht durch die Mitte – dort steht die Kettennummer; Start als
  Punkt in der Ecke. Bei kleinen Zellen (< 26 px) Spitzen nur an Richtungswechseln und am Ende;
  Sprünge zwischen nicht benachbarten Modulen gestrichelt („lange Brücke“).
- **Signal + Strom nebeneinander**, sobald die Module dort gut zu treffen sind (ab 28 px) oder
  nicht kleiner werden als untereinander (`bothSideBySide`). Nie beide in einem Raster
  (Festlegung 30).
- **Ketten zählen nur über `chainCells`/`chainCounts`/`chainStats`** – früher gab es vier Kopien
  (Raster, Kopfzeile, PDF-Legende, Packliste).
- Fremde Schlüssel in `sigMeta` mit `Object.hasOwn` lesen (`constructor` aus einer Datei).
- **Prozessor-Grenzen** (`led-wall/processors.ts`): Werte nur aus den Handbüchern, Quelle je
  Prozessor im Code; Grenze je Port = kleinerer Wert aus Prozessor und Empfangskarte (`CARDS`
  je Modul; ohne bekannte Karte nur der Prozessor). Neue Prozessoren in `PROCESSORS` samt
  `bitDepths`, `backup` ('port' NovaStar, 'pairs' Tessera) und Test gegen die Tabelle des
  Handbuchs.
- **Ports nie speichern, wenn sie nur fortlaufend sind:** Leer = fortlaufend (feste Ports zuerst,
  dann die übrigen in Kettenreihenfolge; Tessera mit Backup nimmt ein freies Paar ungerade →
  gerade). So verschiebt eine neue Kette keine fest vergebenen Ports.
- **Backup:** ohne eigene Angabe gilt die Vorgabe der Wand (`redundancy`, `hasBackup`); `null` =
  ausdrücklich keins. Tessera: Last der Paare zählt doppelt, höchstens 50 Module je Kette.
- **Geteilter Prozessor** (`processor.shareWith`, nur gleiches Modul anbieten): `processorGroups`
  folgt Ketten von Verweisen, Kreise und fehlende Wände zählen als eigener Prozessor; die Wand mit
  dem Prozessor zuerst. Alles, was alle Wände braucht (Karte, PDF, Packliste), rechnet über
  `analyzeProcessors(plannedWalls(s))`.

## Tests

- Rein: alle 8 Muster auf einem 2 × 3-Bereich, Praxisbeispiel (Viertel, Start innen unten,
  endet wieder in der Mitte), Bereiche ohne Rechteck, Abgleich, Hinweise, SVG (Marker, Spiegelung,
  kleine Zellen, Sprung), Store-Aktionen, PDF-HTML (Pfeile nur mit Verlauf, Ansicht von hinten).
- E2E `e2e/kabelverlauf.mjs`: Hinweis ohne Verlauf, Startecke → 7 Pfeile bei 8 Modulen, Hinten
  (Start wandert, Beschriftung „unten rechts“), Zeichnen per `page.mouse` und Verlängern,
  Signal + Strom nebeneinander (Rechtecke vergleichen), PDF geschrieben.
- Ausdruck ansehen (Skill `electron-e2e`, „PDF ansehen“): gelbe Kette (S2) im Ausdruck lesbar?
