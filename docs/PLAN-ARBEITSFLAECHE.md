# Plan: Video-Player ohne Scrollen und die „Arbeitsfläche“ als Muster

Aus der Durchsicht vom November 2026 ([PLAN-DURCHSICHT.md](PLAN-DURCHSICHT.md), Teil C). Der
Video-Player ist das Werkzeug, das während der Show bedient wird – und das einzige große, bei dem
man heute scrollen muss, um Transport und Playlist zu sehen. Dieser Plan beschreibt das neue
Layout so genau, dass es sich Schritt für Schritt umsetzen lässt, und zieht daraus ein Muster,
das danach Stage-Timer, Testbild und Video-Generator übernehmen können.

- [Anlass: gemessen](#anlass-gemessen)
- [Ziele](#ziele)
- [Entwurf](#entwurf) – [Felder](#die-drei-felder), [Platzregeln](#platzregeln),
  [Bühne](#bühne), [Playlist](#playlist), [Bibliothek](#bibliothek), [Schublade](#schublade)
- [Bausteine](#bausteine)
- [Umsetzung in Schritten](#umsetzung-in-schritten)
- [Abnahme](#abnahme)
- [Auf andere Werkzeuge übertragen](#auf-andere-werkzeuge-übertragen)
- [Offene Fragen](#offene-fragen)
- [Nicht tun](#nicht-tun)

## Anlass: gemessen

Am 12. November 2026 in der gebauten App gemessen, frisches Profil, 14 Medien in Bibliothek und
Playlist, Schublade zu. „Sichtbar“ ist die Höhe der Arbeitsfläche unter Kopf- und Ausgabe-Leiste
(je 53 und 49 px), „Seite“ die Höhe ihres Inhalts:

| Fenster     | Sichtbar | Seite   | Vorschau  | Playlist zu sehen                 |
| ----------- | -------- | ------- | --------- | --------------------------------- |
| 1024 × 600  | 498 px   | 1305 px | 429 × 241 | nein                              |
| 1366 × 768  | 666 px   | 1323 px | 600 × 338 | nein – erst nach dem Scrollen     |
| 1920 × 1080 | 978 px   | 1479 px | 877 × 493 | die ersten zwei Einträge          |

Warum das so ist (alles in `src/renderer/src/tools/video-player/`):

- **Die Seite wächst statt der Listen.** `VideoPlayer.tsx` legt zwei Karten nebeneinander
  (`flex gap-6`, ab 900 px Breite), ohne Höhe; die Arbeitsfläche von `ToolShell.tsx` scrollt als
  Ganzes.
- **Die Vorschau wächst mit der Breite** (`aspect-video w-full` in `PlaybackPanel.tsx`): Je
  größer das Fenster, desto mehr Platz nimmt sie der Playlist – deshalb scrollt selbst Full HD.
- **Die Playlist steht ganz unten** in der Karte „Wiedergabe“, unter Vorschau, Titel,
  Suchleiste, Transport, Tastenkürzel-Zeile, Modi und Bild-Standzeit. Wer zur Playlist scrollt,
  sieht den Transport nicht mehr.
- **Die Bibliothek ist auf 460 px gedeckelt** (`max-h-[460px]` in `Library.tsx`); darunter
  bleibt die Karte leer, bei Full HD rund 400 px.
- **Feste Spalten nach Fensterbreite** (`grid-cols-2 sm:grid-cols-3`): `sm:` richtet sich nach
  dem Fenster, nicht nach dem Platz neben der Schublade (Skill `review-checkliste`, „Raster“).

Dazu vier Dinge, die beim Lesen auffielen und in dieselben Dateien gehören:

- Zwei Knöpfe heißen „Ordner“ mit demselben Symbol: oben importiert er einen Ordner, unten
  öffnet er den Medienordner (`Library.tsx`).
- Ein Medium löscht der Papierkorb ohne Rückfrage, „Playlist leeren“ ebenfalls – ein Klick
  daneben nimmt in der Show das Bild weg (danach zeigt die Ausgabe das Idle-Bild).
- Die Wiedergabe ist ab Werk stumm (`EMPTY_PLAYER_STATE` in `shared/player.ts`: `muted: true`);
  zu sehen ist das nur an einem kleinen Symbol und „0 %“.
- Was als Nächstes kommt und wie lange der laufende Titel noch dauert, steht nirgends groß. Die
  Reihenfolge kennt `nextIndex()` in `shared/player.ts` schon (auch bei Zufall).

## Ziele

1. **Ab 1024 × 600 ohne Scrollen:** Vorschau, Titel mit Restzeit, Transport und mindestens fünf
   Zeilen der Playlist sind gleichzeitig sichtbar – mit zugeklappter Schublade, bei 1366 × 768
   auch mit angehefteter.
2. **Der Platz folgt dem Fenster:** Bibliothek und Playlist füllen die Höhe und scrollen in
   sich. Die Vorschau bekommt, was übrig ist, und hat das Seitenverhältnis der Wand.
3. **Live zuerst:** Was läuft, wie lange noch und was danach kommt, steht groß. Was man einmal
   einstellt (Übergang, Bild-Standzeit), wandert in die Schublade.
4. **Kein Klick nimmt versehentlich das Bild weg:** Löschen und Leeren fragen nach.
5. **Wiederverwendbar:** Das Gerüst (Felder, Platzregeln) ist ein Baustein, kein Sonderbau des
   Players.

Nicht Ziel: neue Funktionen der Wiedergabe (Logo-Overlay, Zeitplan), ein anderes Aussehen der
Kopf- und Ausgabe-Leiste, Änderungen an `PlaybackEngine.tsx` oder am Zustand im main.

## Entwurf

### Die drei Felder

![Breites Fenster: Bibliothek, Playlist und Bühne nebeneinander](bilder/player-layout-breit.svg)

Von links nach rechts in der Reihenfolge der Arbeit: **Bibliothek** (Material) → **Playlist**
(Abfolge) → **Bühne** (was läuft). Bibliothek und Playlist liegen nebeneinander, weil man
zwischen ihnen zieht; die Bühne steht rechts, wo heute die Wiedergabe ist.

![Mittleres Fenster: Playlist über Bibliothek, rechts die Bühne](bilder/player-layout-mittel.svg)

### Platzregeln

Gemessen wird die Arbeitsfläche selbst (`useElementSize` aus `useElementSize.ts`), nicht das
Fenster – so stimmt es auch mit angehefteter Schublade und im eigenen Fenster.

| Stufe    | Bedingung                          | Aufbau                                                              |
| -------- | ---------------------------------- | ------------------------------------------------------------------- |
| `breit`  | Breite ≥ 1180 px, Höhe ≥ 420 px    | drei Spalten: Bibliothek · Playlist · Bühne                         |
| `mittel` | Breite 760–1179 px, Höhe ≥ 420 px  | zwei Spalten: links Playlist über Bibliothek (11 : 9), rechts Bühne |
| `schmal` | Breite < 760 px oder Höhe < 420 px | eine Spalte, die Seite scrollt: Bühne, Playlist, Bibliothek         |

Spalten als CSS-Raster, damit nichts von Hand gerechnet wird:

```text
breit:   grid-template-columns: minmax(280px, 1fr) minmax(280px, 1fr) clamp(420px, 40%, 960px)
mittel:  grid-template-columns: minmax(300px, 1fr) minmax(380px, 1.2fr)
         linke Spalte: grid-template-rows: minmax(0, 11fr) minmax(0, 9fr)
schmal:  flex-col, Listen höchstens 50vh hoch
```

Außenabstand und Lücken 12 px (`p-3`, `gap-3`) statt heute 24 px. Jedes Feld hat `min-h-0` und
`min-w-0`, sein Inhalt `overflow-auto` – sonst wächst wieder die Seite. Nachgerechnet:

| Fenster, Schublade     | Arbeitsfläche | Stufe    | Spalten            | Vorschau (16 : 9) |
| ---------------------- | ------------- | -------- | ------------------ | ----------------- |
| 1024 × 600, zu         | 1024 × 498    | `mittel` | 455 · 545          | etwa 520 × 293    |
| 1366 × 768, zu         | 1366 × 666    | `breit`  | 386 · 386 · 546    | etwa 522 × 294    |
| 1366 × 768, angeheftet | 1006 × 666    | `mittel` | 441 · 529          | etwa 505 × 284    |
| 1920 × 1080, zu        | 1920 × 978    | `breit`  | 552 · 552 · 768    | etwa 744 × 418    |
| 1024 × 600, angeheftet | 664 × 498     | `schmal` | eine               | Seite scrollt     |

### Bühne

Von oben nach unten, das Feld hat keinen eigenen Kopf:

1. **Vorschau:** nimmt die Höhe, die übrig bleibt (`flex-1`, mindestens 120 px). Darin ein
   Kasten im Seitenverhältnis der Wand (`pstate.wall`, heute fest 16 : 9), so groß wie Breite
   und Höhe erlauben, mittig auf Schwarz. Der Inhalt bleibt, wie er ist (`PlaybackEngine` bzw.
   Standbild mit Hinweis). Der Umschalter „Live-Vorschau“ und „FPS“ werden kleine Knöpfe oben
   rechts in der Vorschau, sichtbar beim Darüberfahren und bei Tastaturfokus.
2. **Jetzt-Zeile:** links Titel (`text-sm font-medium truncate`) und darunter Maße und
   Einpass-Art; rechts groß die **Restzeit** (`text-2xl tabular-nums`, „−0:48“), darunter klein
   „0:12 / 1:00“. Bei Bildern zählt die Standzeit herunter. Ohne Titel: „Nichts ausgewählt“.
3. **Suchleiste** wie heute.
4. **Transport:** in der Mitte Zurück, Play/Pause (groß), Weiter. Links Ton: Stumm-Knopf,
   Regler, Prozent – ist stumm geschaltet, steht dort **„Stumm“ in `warning`** statt „0 %“.
   Rechts Loop, Zufall und ein ⓘ (`InfoTip`) mit den Tastenkürzeln, die heute als Zeile unter
   dem Transport stehen. Ist die Spalte schmaler als 460 px, stehen Ton und Modi in einer
   zweiten Zeile darunter.
5. **„Danach: …“** (klein, gedämpft): Titel des nächsten Eintrags aus `nextIndex(pstate)`; bei
   −1 „Danach: Ende“. Gilt auch bei Zufall, weil der main den nächsten Index vorab würfelt.

### Playlist

- **Kopf:** „Playlist“, Anzahl und Gesamtdauer („14 · 2:05“; Videos mit ihrer Dauer, Bilder mit
  der Bild-Standzeit). Rechts „Speichern“ und ein Menü „⋯“ mit „Playlist leeren …“ (fragt nach).
- **Gespeicherte Playlists** als Zeile aus Marken direkt darunter – eine Zeile, bei vielen
  waagrecht scrollbar, kein Umbruch. Verhalten unverändert: Klick lädt und ersetzt die laufende
  Liste ohne Unterbrechung, ✕ löscht nach Rückfrage.
- **Liste:** füllt den Rest, scrollt in sich. Je Zeile Griff, Nummer bzw. Abspielzeichen,
  Miniatur (40 × 22 px aus `thumbUrl`), Titel, Dauer, ✕. Der nächste Eintrag trägt die Marke
  „Danach“. **Der laufende Eintrag bleibt sichtbar:** Wechselt `pstate.index`, scrollt die Liste
  ihn mit `scrollIntoView({ block: 'nearest' })` heran – nicht, während gezogen wird.
- **Umsortieren** über `useSortable` und `Griff` aus `sortable.tsx` (Ziehen nur am Griff,
  Pfeil-Knöpfe für die Tastatur) statt des heutigen Ziehens an der ganzen Zeile. Ziehen aus der
  Bibliothek (`text/x-media-id`) bleibt, die ganze Liste ist Ziel.
- Der `key` der Zeilen ist heute `id` plus Position. Beim Umsortieren lädt das die Miniaturen
  neu; mit Miniaturen fällt es auf. Dasselbe Medium darf mehrfach in der Liste stehen, also
  Schlüssel aus `id` und laufender Nummer **je Medium** bilden (das dritte Vorkommen von X heißt
  `X#3`), nicht aus dem Platz in der Liste.

### Bibliothek

- **Kopf:** „Bibliothek“ und Anzahl. Rechts ein Knopf **„Importieren“** mit den Einträgen
  „Dateien …“ und „Ordner …“ und ein Menü „⋯“: Ansicht (große Kacheln, kleine Kacheln, Liste),
  „Alle zur Playlist“, „Medienordner öffnen“, „Bibliothek leeren …“. Die Fußzeile entfällt, der
  doppelte Knopf „Ordner“ damit auch.
- **Suchfeld** darunter: filtert nach Titel, ohne Treffer „Kein Medium heißt so“.
- **Inhalt:** füllt den Rest, scrollt in sich, ohne `max-h`. Kacheln mit
  `repeat(auto-fill, minmax(…, 1fr))` – groß 170 px, klein 110 px – statt fester Spaltenzahlen.
- **Hineinziehen von Dateien:** Das ganze Feld nimmt sie an; der gestrichelte Rahmen erscheint
  nur, solange Dateien darüber schweben. Der Leerzustand bleibt als Text in der Mitte.
- **Import-Liste** (`ConvertQueue.tsx`): unten im Feld angeheftet, höchstens drei Aufträge hoch
  und in sich scrollbar. Ohne Aufträge unsichtbar. Fehler bleiben stehen, bis „Erledigte
  entfernen“ sie räumt.
- **Medium löschen** fragt nach (`api.confirm`, `danger`, wie „Bibliothek leeren“).
- Der Hinweis „n Medien ≠ Wand-Auflösung“ bleibt über dem Inhalt.

### Schublade

Neuer Bereich **„Wiedergabe“** in `SetupPanels.tsx`, nach „Bild einpassen“: Übergang (Schnitt
oder Überblenden), Dauer der Überblendung (nur bei Überblenden), Bild-Standzeit. Zusammenfassung
„Schnitt · Bilder 10 s“ bzw. „Überblenden 0,5 s · Bilder 10 s“. Die Befehle bleiben dieselben
(`setTransition`, `setImageDuration`), es ändert sich nur der Ort. Der Bereich ist auch in der
Kundenansicht da.

## Bausteine

Neue Dateien (Namen sind Vorschläge, alles im Renderer):

```text
src/renderer/src/components/WorkArea.tsx     Gerüst: misst sich, kennt die Stufe, legt Felder
src/renderer/src/components/ui/menu.tsx      kleines Aufklappmenü für „⋯“ und „Importieren“
src/renderer/src/tools/video-player/Stage.tsx          die Bühne (aus PlaybackPanel)
src/renderer/src/tools/video-player/layout.ts          Stufe, Gesamtdauer, Schlüssel – rein
src/renderer/src/tools/video-player/layout.test.ts
e2e/player-layout.mjs
```

**`WorkArea`** kapselt, was jedes Werkzeug mit Feldern braucht:

```tsx
// Stufe aus der gemessenen Größe – rein, getestet
export type Stufe = 'breit' | 'mittel' | 'schmal'
export function stufe(breite: number, hoehe: number, g = GRENZEN): Stufe

// füllt die Arbeitsfläche (h-full min-h-0), misst sich und reicht die Stufe herein;
// bei 'schmal' scrollt sie selbst, sonst nie
export function WorkArea(props: { children: (s: Stufe) => ReactNode; grenzen?: Grenzen })

// ein Feld: Kopf (Titel, Zahl, Aktionen), Inhalt scrollt in sich, optionaler Fuß
export function Pane(props: {
  title?: string
  count?: ReactNode
  actions?: ReactNode
  footer?: ReactNode
  /** false: der Inhalt regelt sein Scrollen selbst (Bühne) */
  scroll?: boolean
  children: ReactNode
  className?: string
  testId?: string
})
```

`Pane` ist `section` mit `aria-label`, `flex min-h-0 min-w-0 flex-col rounded-lg border
border-border bg-card`; Kopf 40 px hoch, Inhalt `min-h-0 flex-1 overflow-auto p-3`. `ToolShell`
bleibt unverändert: Seine Arbeitsfläche scrollt nur, wenn der Inhalt höher ist – ein Werkzeug
mit `WorkArea` ist nie höher (so macht es `LedWall.tsx` heute von Hand).

**Menü:** `WallMenu.tsx` und `ProjectFileMenu.tsx` bauen je ein eigenes Aufklappmenü (Knopf,
Liste, Klick daneben und Esc schließen). Daraus einen Baustein ziehen und im Player verwenden;
die beiden vorhandenen Menüs erst in einem späteren Schritt umstellen.

## Umsetzung in Schritten

Jeder Schritt ist ein eigener Pull Request und lässt den Player benutzbar zurück. Vorher lesen:
Skills `electron-e2e`, `review-checkliste`, `abschluss-check`; Ablauf und Regeln stehen in
[PLAN-DURCHSICHT.md](PLAN-DURCHSICHT.md#so-wird-ein-paket-umgesetzt).

| Schritt | Inhalt | Größe |
| ------- | ------ | ----- |
| **P1** | E2E `player-layout` mit den Prüfungen aus [Abnahme](#abnahme) schreiben und gegen den heutigen Stand laufen lassen – es muss rot sein (Seite 1323 statt 666 px). Dazu die reinen Helfer des Players (Datei „layout“ aus [Bausteine](#bausteine)) mit Tests: `stufe()`, Gesamtdauer, Schlüssel je Vorkommen. | klein |
| **P2** | `WorkArea` und `Pane` bauen; `VideoPlayer.tsx` auf die drei Felder umstellen. Inhalt der Felder zunächst unverändert aus `Library.tsx`, `Playlist.tsx` und dem Rest von `PlaybackPanel.tsx` – nur ohne `max-h`, ohne Karten in Karten. Danach scrollt die Seite nicht mehr. | mittel |
| **P3** | Bühne: Vorschau im Seitenverhältnis der Wand, Jetzt-Zeile mit Restzeit, „Danach“, „Stumm“ sichtbar, Tastenkürzel hinter ⓘ. Übergang und Bild-Standzeit in die Schublade (Bereich „Wiedergabe“). | mittel |
| **P4** | Playlist: Kopf mit Gesamtdauer, Marken in einer Zeile, Miniaturen, „Danach“, laufender Eintrag bleibt sichtbar, Sortieren mit Griff, „Leeren“ ins Menü mit Rückfrage. | mittel |
| **P5** | Bibliothek: „Importieren“, Menü „⋯“, Suche, Kacheln nach Platz, Import-Liste unten, Löschen mit Rückfrage, Menü-Baustein. | mittel |
| **P6** | Doku: Abschnitt Video-Player in `WERKZEUGE.md`, dieses Dokument dorthin überführen, was bleibt (Muster `WorkArea`) in den Skill `neues-werkzeug`; Lehren in `review-checkliste`. | klein |

Nach P2 ist das Hauptproblem behoben; P3–P5 sind unabhängig voneinander und können in jeder
Reihenfolge folgen.

## Abnahme

Neues Skript nach dem Muster von `e2e/player.mjs` (Testmedien per lavfi: zehn kurze Clips und
vier Bilder, alle in die Playlist, drei gespeicherte Playlists), eingetragen in `e2e/run.mjs`.
Maße liest `page.evaluate` aus der Seite. Jede Prüfung bei zugeklappter Schublade, sofern nichts
anderes dasteht:

1. **Kein Scrollen der Seite** bei 1024 × 600, 1366 × 768 und 1920 × 1080: Die Arbeitsfläche
   (`[data-testid="tool-content"]` und darin der Bereich von `ToolShell`) hat `scrollHeight`
   gleich `clientHeight`. Bei 1366 × 768 auch mit angehefteter Schublade.
2. **Alles Wichtige im Bild:** Die Rechtecke von Vorschau, Play/Pause-Knopf und der ersten fünf
   Zeilen der Playlist liegen ganz innerhalb des Fensters.
3. **Listen scrollen in sich:** Die Playlist hat bei 1024 × 600 `scrollHeight` größer als
   `clientHeight`; die Bibliothek ebenso.
4. **Vorschau frisst den Platz nicht:** Bei 1920 × 1080 ist sie höchstens 60 % der Höhe der
   Arbeitsfläche hoch.
5. **Seitenverhältnis der Wand:** Wand auf 3840 × 1080 stellen (über die Schublade, wie ein
   Nutzer) – Breite durch Höhe der Vorschau liegt zwischen 3,4 und 3,7.
6. **Laufender Eintrag sichtbar:** Befehl `goto` auf den letzten Eintrag – seine Zeile liegt
   danach im sichtbaren Teil der Liste.
7. **„Danach“:** Bei Eintrag 3 von 14 nennt die Bühne den Titel von Eintrag 4; mit Loop „Eines“
   denselben Titel wie jetzt; am Ende ohne Loop „Ende“.
8. **Schmal scrollt:** Bei 700 × 600 ist `scrollHeight` größer als `clientHeight`, und die Bühne
   steht vor der Playlist.
9. **Löschen fragt:** Papierkorb an einem Medium mit `stubConfirm(app, false)` – die Bibliothek
   hat danach gleich viele Einträge; mit `true` einen weniger. Ebenso „Playlist leeren …“.
10. **Stumm sichtbar:** Im frischen Profil steht „Stumm“ in der Bühne; nach einem Klick auf den
    Ton-Knopf nicht mehr.

Vorhandene Skripte, die den Player anfassen und angepasst werden müssen: `e2e/player.mjs`
(Playlist-Reiter, Importe), `e2e/layout.mjs` (Ausgabe-Leiste des Players, Monitorwechsel),
`e2e/mini-manual.mjs` (liest Playlists nur über die Einstellungen – vermutlich unberührt). Vor
dem Umbau mit `grep -n "video-player" e2e/*.mjs` nachsehen.

Von Hand, weil kein Test es sieht: ein echtes Video mit Ton abspielen, Ausgabe auf einem zweiten
Monitor öffnen, im laufenden Betrieb umsortieren und zwischen gespeicherten Playlists wechseln –
ohne Ruckeln und ohne Idle-Bild dazwischen.

## Auf andere Werkzeuge übertragen

Nach dem Player, je Werkzeug ein eigener Pull Request. Erst messen wie im
[Anlass](#anlass-gemessen) (Fenster 1024 × 600, 1366 × 768, 1920 × 1080; Höhe der Seite gegen
die sichtbare Höhe), dann umbauen – wo die Seite nicht scrollt, gibt es nichts zu tun.

| Werkzeug | Heute | Mit `WorkArea` |
| -------- | ----- | -------------- |
| **Stage-Timer** (`StageTimer.tsx`) | Vorschau, Transport und Nachricht links, Abschnitte rechts; bei 1024 × 600 mit Schublade rutschen die Abschnitte aus dem Bild | zwei Felder: Bühne (Vorschau, Transport, Nachricht) und Abschnitte, die in sich scrollen |
| **Testbildgenerator** (`TestPatterns.tsx`) | Vorschau, darunter die Karte „Export“ – bei 768 px Höhe unter dem Rand | Vorschau füllt die Höhe; Export als schmales Feld daneben, `schmal` darunter |
| **Video-Generator** (`VideoGenerator.tsx`) | Storyboard, darunter die Vorschau-Karte | Storyboard und Vorschau nebeneinander, das Storyboard scrollt in sich |

Listen-Werkzeuge (Video-Konverter, Medien-Info, Packliste, YouTube-Downloader, Handbücher) sind
Dokumente, die man von oben nach unten liest – sie scrollen als Seite und bleiben so. Der
LED-Wall-Konfigurator hat sein eigenes Gerüst und braucht keinen Umbau; ob er später `Pane`
übernimmt, entscheidet sich, wenn der Baustein sich bewährt hat.

## Offene Fragen

Vor P3 bis P5 zu klären – die Vorgabe in Klammern gilt, wenn nichts anderes entschieden wird:

1. **Übergang und Bild-Standzeit in die Schublade?** (ja) Am Handy bleiben sie auf der
   Steuerseite. Wer sie am Rechner oft live umstellt, will sie in der Bühne behalten.
2. **Löschen mit Rückfrage oder mit „Rückgängig“?** (Rückfrage) „Rückgängig“ ist angenehmer,
   braucht aber einen Papierkorb im main, der die Datei erst später entfernt.
3. **Reihenfolge der Felder:** Bibliothek · Playlist · Bühne (Vorgabe) oder die Bühne in der
   Mitte? Für die Vorgabe spricht das Ziehen zwischen benachbarten Feldern.
4. **Stumm ab Werk** bleibt? (ja – dieser Plan ändert nur die Sichtbarkeit.)
5. **Ansicht der Bibliothek** im Menü „⋯“ (Vorgabe) oder weiter als drei Knöpfe im Kopf?

## Nicht tun

- Keinen Zustand in den Renderer ziehen: Wiedergabe und Playlist bleiben im main, das Fenster
  spiegelt (`api.player.command`, `onState`). Neu sind nur Anordnung und Anzeige.
- Keine Höhen in Pixeln ausrechnen und setzen. Raster und `flex` mit `min-h-0` lösen es; gemessen
  wird nur für die Stufe.
- Nicht `sm:`/`lg:` für den Aufbau der Felder verwenden – die richten sich nach dem Fenster.
- Keine neue Farbe: Rot bleibt „live“, „Stumm“ ist `warning`, der laufende Eintrag `primary` wie
  heute.
- Die Steuerseite fürs Handy (`player/remotePage.ts`) bleibt, wie sie ist.
- Nicht mehrere Schritte in einen Pull Request legen, auch wenn sie dieselbe Datei berühren.
