---
name: kabelverlauf
description: Am Kabelverlauf des LED-Wall-Konfigurators arbeiten – Ketten, Startecke und Richtung, gezeichnete Reihenfolge, Pfeile am Bildschirm und im PDF, Ansicht von hinten, Signal und Strom nebeneinander, Ports, Backup, Prozessor-Grenzen, Stromkreise, Phasen und Absicherung. Verwenden, bevor an cabling.ts, CableGrid.tsx, printHtml.ts, processors.ts, power.ts oder den Feldern sigMeta/pwrMeta/mains gearbeitet wird.
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
| Strom: Last je Kette und Kreis, Phasen-Vorschlag und -Bilanz, Warnungen | `led-wall/power.ts` + `power.test.ts` |
| Schublade „Strom“ (Netz, Absicherung), Karte „Strom“, Kreis/Phase in der Verlauf-Leiste | `led-wall/Settings.tsx` (`PowerPanel`), `led-wall/LedWall.tsx` (`PowerCard`), `CableGrid.tsx` (`power`) |
| IMs je Modul (Anzahl, Anordnung, wer tauschen darf) | `led-wall/data.ts` (`ims`) – Mini-Manual liest über `imTausch()` |
| Glasfaser-Strecke (CVT10): Daten `fiber`, Gruppen, Boxen, Fasern, Hot-Backup | `config.ts` (`FiberConfig`), `processors.ts` (`CVT10`, `FiberPlan`, `fiberSummary`, `backupLabel`); Schublade `FiberFields` in `Settings.tsx`; Packliste `packing-list/derive.ts` (`fiberItems`) |
| Pläne im Mini-Manual (Kapitel Verkabelung) | `gridSvg` aus `printHtml.ts` (eigene `markerId` je Wand), `mini-manual/seiten.ts` (`verkabelung`), Wände der Kopie über `geplanteWaende()` |
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

- **Strom** (`led-wall/power.ts`): gerechnet bei Maximalleistung und der Spannung der Wand
  (`mains`, auch in `computeWall`). Ein eingetragener Kreis (ohne Groß/Klein, Leerraum) ist eine
  Einheit: Ketten daran zählen zusammen und liegen auf einer Phase. **Phasen nie speichern, wenn
  sie nur vorgeschlagen sind** – leer = Vorschlag auf die gerade schwächste Phase in
  Kettenreihenfolge (wie die fortlaufenden Ports). Überlast meldet der Kreis, wenn mehrere Ketten
  daran hängen, sonst die Kette. Schieflage nur, wenn die beste Verteilung (größte Einheit zuerst)
  merklich besser wäre – zwei gleiche Ketten lassen L3 zwangsläufig leer. Der Hinweis zum
  Einschaltstrom ist `info` und entfällt neben einer Überlast.
- **Glasfaser** gehört zum Prozessor (`group[0].config.fiber`, wie Prozessorwahl) und geht nur am
  UHD Jr (sonst Warnung, `fiber: null` in der Rechnung). Gruppen aus den belegten Ports: 1–8 → Box A
  an OPT1, 9–16 → Box B an OPT2. **Hot-Backup:** Backup kommt vom selben Port der zweiten Box –
  belegt keinen Prozessor-Port (`backupBox`), ab Werk hat jede Kette eins (`hasBackup(meta,
  redundancy || hot)`), feste Backup-Ports gelten dann nicht. Anzeigen immer über `backupLabel`
  („B 3 (2. CVT10)“) und `fiberSummary` – Karte, PDF und Mini-Manual sagen dasselbe.
- **Fasern aus dem Lager:** Im Bestand ist nur Variante S mit Singlemode LC-LC (`FASER_LAGER_S`:
  1, 3, 20, 50, 100 m). `faserAusLager(länge)` nimmt das kürzeste Stück, das reicht, darüber
  die kleinste Summe aus k = ⌈Länge/100⌉ Stücken; Packliste (`faserItems` in
  `packing-list/derive.ts`, je Stoß eine LC-LC-Kupplung) und der Hinweis unter der Länge in
  `FiberFields` rechnen damit. Ändert sich das Lager, nur die Liste anpassen.
- Ein Textfeld in der Verlauf-Leiste (Kreis) bekommt `key={activeChain}`: Beim Wechsel der Kette
  baut es neu auf und speichert das Getippte noch für die alte Kette.

## Tests

- Rein: alle 8 Muster auf einem 2 × 3-Bereich, Praxisbeispiel (Viertel, Start innen unten,
  endet wieder in der Mitte), Bereiche ohne Rechteck, Abgleich, Hinweise, SVG (Marker, Spiegelung,
  kleine Zellen, Sprung), Store-Aktionen, PDF-HTML (Pfeile nur mit Verlauf, Ansicht von hinten).
- E2E `e2e/kabelverlauf.mjs`: Hinweis ohne Verlauf, Startecke → 7 Pfeile bei 8 Modulen, Hinten
  (Start wandert, Beschriftung „unten rechts“), Zeichnen per `page.mouse` und Verlängern,
  Signal + Strom nebeneinander (Rechtecke vergleichen), Prozessor und Ports, Strom (Kreis F3 auf L2,
  zweite Kette als Vorschlag, Überlast-Warnung, Absicherung 25 A in der Schublade), Glasfaser mit
  Hot-Backup („B 1 (2. CVT10)“, danach wieder aus), PDF geschrieben. Mini-Manual: Kapitel
  Verkabelung und Box-Schritte der Fehlersuche in `e2e/mini-manual.mjs`.
  Gespeicherte Werte (`localStorage`) mit `waitFor` lesen – der Store schreibt verzögert.
- Ausdruck ansehen (Skill `electron-e2e`, „PDF ansehen“): gelbe Kette (S2) im Ausdruck lesbar?
