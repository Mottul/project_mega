# Plan: Die kleinen Werkzeuge angleichen

Wunsch vom 13. November 2026: ein **Testtongenerator** als kleines Werkzeug – in der App und in
der Handy-PWA –, und die **kleinen Werkzeuge einheitlicher und leichter zu bedienen**; was
doppelt oder überflüssig ist, fliegt raus.

**Stand 13. November 2026:** Der Testtongenerator ist gebaut (Schritte T1 bis T3) – was er
kann, steht in [WERKZEUGE.md](WERKZEUGE.md#testtongenerator), wie er gebaut ist, in
`docs/ENTWICKLUNG.md` und im Skill `rechner-pwa`. Dabei entstanden die Bausteine aus K2, die er
braucht (`FieldRow`, `ChoiceField`, `Segmented` mit `wrap`, `RangeField`, `QuickPick`,
`RunButton`, `useWakeLock`, das ⓘ am Handy). Drei Abweichungen vom ersten Entwurf, jeweils mit
Grund:

- Die Karte „Ausgabe“ (Start, Pegel, Kanäle) steht oben, „Signal“ darunter: Die Felder je
  Signal wechseln unten, oben verrutscht beim Umschalten nichts.
- Das ⓘ läuft beim Scrollen mit, statt zu schließen – ein Klick auf ein ⓘ weiter unten scrollt
  es erst ins Bild, die Blase ging sonst gleich wieder zu (Skill `review-checkliste`).
- Metronom und Polaritätspuls beginnen ohne das Einblenden von 0,5 s; eingeblendet ging der
  erste Schlag unter. Dauertöne werden weiter eingeblendet.

**Offen** sind K1, der Rest von K2, K3 und K4 sowie die [Abnahme am Gerät](#abnahme-am-gerät).
Ein Auftrag lautet **„Setze Schritt K1 aus docs/PLAN-TESTTON.md um.“** Ablauf, Regeln und
Stolpersteine stehen in [PLAN-DURCHSICHT.md](PLAN-DURCHSICHT.md#so-wird-ein-paket-umgesetzt) und
gelten hier genauso: frischer Branch ab `main`, erst nachstellen, ein Schritt = ein Pull
Request, Doku und Skills nachziehen, den Schritt hier streichen. Vor jedem Schritt den Skill
`rechner-pwa` lesen.

Alles hier ist Vorschlag. Was gebaut wird, entscheidet Matthias; zwei
[Entscheidungen](#entscheidungen) sind offen.

- [Die kleinen Werkzeuge heute](#die-kleinen-werkzeuge-heute)
- [Befunde](#befunde)
- [Umsetzung in Schritten](#umsetzung-in-schritten) – [K1](#k1--rechenkerne-mit-tests),
  [K2 (Rest)](#k2-rest--bausteine-für-die-rechner), [K3](#k3--die-rechner-angleichen),
  [K4](#k4--rechner-merken-sich-die-eingaben)
- [Abnahme am Gerät](#abnahme-am-gerät)
- [Doku und Skills](#doku-und-skills)
- [Entscheidungen](#entscheidungen)
- [Nicht tun](#nicht-tun)
- [Später möglich](#später-möglich)

## Die kleinen Werkzeuge heute

Elf Werkzeuge stehen in `SMALL_TOOLS` (`src/shared/toolWindows.ts`): Kreisrechner,
DMX-Dip-Schalter, Projektionsverhältnis, Audio-Delay & SPL, RTA, Testtongenerator, Beamer-Lumen,
Timecode-Rechner, Stromlast, Kameraobjektiv, Rigging-Last. Jedes öffnet sich im eigenen kleinen
Fenster (Höhe folgt dem Inhalt, schmal bis 320 px) und läuft unverändert in der PWA
(`src/pwa/tools.ts`). Die Bausteine liegen in `tools/_calc/ui.tsx`: `CalcPage`, `SectionCard`,
`FieldRow` und darauf `NumField`, `SelectField`, `ChoiceField`, `RangeField`; dazu `Readout`,
`ReadoutGrid`, `QuickPick`, `RunButton`, `useLinkedFields`.

Das Grundmuster ist gut und bleibt: eine kurze Zeile je Karte, alles Weitere hinter dem ⓘ,
Zahlen mit Komma, berechnete Felder in Akzentfarbe. Neun der Werkzeuge sind Formulare aus
diesen Bausteinen; um sie geht es hier.

## Befunde

Am Code geprüft am 13. November 2026; vor jedem Schritt erst nachsehen, ob die Stelle noch so
aussieht. Erledigt und gestrichen sind die Befunde 3, 10, 12, 15 und 16 (mit dem
Testtongenerator); die Nummern der übrigen bleiben, damit die Schritte darauf zeigen können.

| Nr. | Befund | Fundstelle | Schritt |
| --- | ------ | ---------- | ------- |
| 1 | Sieben Rechner rechnen mitten in der Komponente, ohne einen einzigen Test – darunter Rigging-Last und Stromlast, wo ein Rechenfehler am meisten schadet. Nur Kameraobjektiv (`optics.ts`), Timecode (`tc.ts`) und RTA haben einen geprüften Kern | `CircleCalc.tsx`, `DmxAddress.tsx`, `ThrowRatio.tsx`, `AudioDelay.tsx`, `ProjectorLumen.tsx`, `PowerLoad.tsx`, `Rigging.tsx` | K1 |
| 2 | Ungültige Eingaben bleiben stumm: Das Feld sieht aus wie immer, das Ergebnis zeigt „–“. Zwei Werte werden sogar heimlich ersetzt – Leinwand-Gain ≤ 0 rechnet mit 1, cos φ über 1 mit 1 | `NumField` in `tools/_calc/ui.tsx`; `ProjectorLumen.tsx`, `PowerLoad.tsx` | K2, K3 |
| 4 | Timecode am Handy: Das Feld ist ein `NumField` mit Dezimaltastatur (Ziffern und Komma), ohne Doppelpunkt. Tippen lässt sich „1,02,03,12“ (Komma wird als Trenner gelesen) – darauf kommt niemand; reine Ziffern „01020312“ lehnt `parseTc` ab | `Timecode.tsx`, `tc.ts` | K3 |
| 5 | Temperatur unter 0 °C lässt sich am iPhone nicht eintippen: Die Dezimaltastatur hat dort kein Minus (WebKit-Fehler 193825; am Gerät zu prüfen) | `AudioDelay.tsx`, `NumField` (`inputMode="decimal"`) | K2, K3 |
| 6 | Auswahl aus zwei bis vier Möglichkeiten ist mal eine Liste (zwei Tipps, Optionen verdeckt), mal eine Knopfgruppe: Stromlast „Anschluss“ und „Auslastung“ sowie neun Listen im RTA. Den Baustein `ChoiceField` gibt es jetzt | `PowerLoad.tsx`, `RtaCards.tsx` | K3 |
| 7 | Dasselbe Ergebnis steht doppelt: Der DMX-Dip-Schalter zeigt die Adresse im Feld und gleich darunter noch einmal groß | `DmxAddress.tsx` | K3 |
| 8 | Status steht als Zeichen im Text statt über die Statusstufen der App: „ausreichend ✓ / zu dunkel ✗“, Warnungen mit „⚠“ | `ProjectorLumen.tsx`, `Rigging.tsx`; Vorgabe `components/ui/status.ts` | K2, K3 |
| 9 | Die Schalter des DMX-Dip-Schalters sagen Vorlesewerkzeugen nicht, ob sie an sind (nur `title`) | `DmxAddress.tsx` | K3 |
| 11 | Alle Eingaben sind weg, sobald das Fenster zugeht oder das Handy die PWA aus dem Speicher wirft; es erscheinen wieder die Beispielwerte (der Testtongenerator merkt sich seinen Stand schon) | alle Rechner (`useState`) | K4 |
| 13 | Totes und Doppeltes: `NumField` hat eine Eigenschaft `readOnly`, die niemand nutzt; `parseNum` und `parseDecimal` (`components/ui/decimal-field.tsx`) tun dasselbe | `tools/_calc/ui.tsx` | K2 |
| 14 | Die PWA nennt alles „Rechner“ („Weitere Rechner“, „Alle Rechner“), obwohl RTA und Testtongenerator keine sind (Manifest und Beschreibung sind schon nachgezogen) | `src/pwa/App.tsx` | K3 |

Nicht Teil dieses Plans, weil schon woanders geplant: kürzere Beschreibungen aller Werkzeuge
(Paket B6 der Durchsicht), `Rta.tsx` teilen (E1), gefüllte Stopp-Symbole in Stage-Timer und
Jingle-Player (B4; der RTA hat sein gefülltes Quadrat schon über `RunButton`).

## Umsetzung in Schritten

Größen wie in der Durchsicht: **S** bis etwa zwei Stunden, **M** ein halber bis ganzer Tag.

| Schritt | Inhalt | Größe | Braucht |
| ------- | ------ | ----- | ------- |
| **K1** | Rechenkerne der sieben Rechner mit Tests – ohne sichtbare Änderung | M | – |
| **K2** (Rest) | `NumField` zeigt Fehleingaben, Minus am Handy; `Readout` mit Statusstufe | S | – |
| **K3** | Die Rechner angleichen | M | K2, besser nach K1 |
| **K4** | Rechner merken sich die Eingaben | M | K3, Entscheidung 3 |

K1 und K2 hängen nicht voneinander ab.

Stolpersteine zusätzlich zu denen der Durchsicht:

- **Nach jedem Schritt `npm run pwa:build`.** Er bricht ab, wenn ein kleines Werkzeug `api`
  oder Einstellungen hereinzieht oder eine Datei außerhalb von `src/pwa/build/sources.ts`
  einbindet. `npx vitest run src/pwa` prüft, dass PWA-Liste und `SMALL_TOOLS` gleich sind.
- **Es gibt keine Komponententests** (Vitest läuft ohne DOM, keine Datei endet auf
  „.test.tsx“). Rechnen und Entscheiden gehören in reine Module mit Test; Verhalten der
  Oberfläche prüft ein E2E-Schritt.
- **Kleine Werkzeuge sind keine Route im Hauptfenster:** im E2E über
  `window.api.openToolWindow('<id>')` öffnen und auf das neue Fenster warten (`openSmall` in
  `e2e/layout.mjs`).
- **Geplante Dateien** stehen hier in Textblöcken – in Backticks fände `npm run check:refs`
  sie nicht.

### K1 – Rechenkerne mit Tests

**Heute:** Befund 1. **So:** Je Rechner ein reines Modul neben der Komponente (wie
`tools/camera-lens/optics.ts`), mit Test. Zahlen hinein, Zahlen oder `null` heraus; die
Komponente liest nur noch Text und zeigt an. **Keine sichtbare Änderung**, keine neue Formel,
keine andere Rundung.

```text
src/renderer/src/tools/circle-calc/math.ts        je mit math.test.ts daneben
src/renderer/src/tools/dmx-address/math.ts
src/renderer/src/tools/throw-ratio/math.ts
src/renderer/src/tools/audio-delay/math.ts
src/renderer/src/tools/projector-lumen/math.ts
src/renderer/src/tools/power-load/math.ts
src/renderer/src/tools/rigging/math.ts
```

Die Tests halten zuerst fest, was die Rechner heute mit ihren Vorgabewerten zeigen:

| Rechner | Eingabe | Ergebnis |
| ------- | ------- | -------- |
| Kreis | Durchmesser 1 | Radius 0,5 · Umfang π · Fläche π ÷ 4 |
| DMX | Adresse 1 / 10 / 512 | alle aus / Schalter 1 und 4 an / alle neun an; und zurück |
| Projektionsverhältnis | 16 : 9, Breite 5 m, Abstand 8 m | Höhe 2,8125 m · Diagonale 5,737 m · Throw Ratio 1,6 |
| Audio-Delay | 20 °C, 10 m | 343,42 m/s · 29,119 ms · 1.398 Samples bei 48 kHz |
| Pegel über Distanz | 100 dB in 1 m, Ziel 10 m | 80 dB |
| Beamer-Lumen | 4 × 2,25 m, gedimmt (400 lx), Gain 1; vorhanden 6.500 lm | 3.600 lm · 722 lx, ausreichend |
| Stromlast | einphasig 230 V, cos φ 1, 16 A / dreiphasig 400 V, 16 A | 3.680 W / 11.085 W |
| Geräte je Stromkreis | 500 W an 230 V, 16 A bei 100 % / 80 % | 2,174 A je Gerät · 7 / 5 Geräte |
| Traverse | Spannweite 8 m, Last 120 kg bei 3 m, Eigengewicht 10 kg/m | Punkt A 115 kg · Punkt B 85 kg |
| Bridle | 200 kg, Höhe 2 m, Punktabstand 4 m | 45° · Faktor 1,414 · 141,4 kg je Strang · Stranglänge 2,828 m · Stufe „gelb“ (genau auf der Grenze) |

Dazu je Rechner die Ränder: leere und negative Eingaben, Lastposition außerhalb der Spannweite,
Bridle ab 60° („rot“), Adresse unter 1 und über 512.

**Abnahme:** `npx vitest run src/renderer/src/tools`; `npm run e2e -- layout` unverändert grün;
`npm run pwa:build`. In den sieben Komponenten steht keine Formel mehr.

### K2 (Rest) – Bausteine für die Rechner

Alles in `tools/_calc/ui.tsx`, sofern nicht anders genannt. Das Aussehen der Rechner ändert
sich erst in K3.

1. **`NumField`:** `readOnly` entfällt. Ein nicht leeres Feld, das `parseNum` nicht lesen kann,
   ist rot umrandet (`border-danger`) und trägt `aria-invalid`; zusätzlich `invalid` für Werte,
   die lesbar, aber nicht rechenbar sind. `signed` öffnet am Handy eine Tastatur mit Minus
   (`inputMode="text"` statt `decimal`; taugt das am Gerät nicht, stattdessen ein Knopf „±“ am
   Feld). `parseNum` reicht nur noch `parseDecimal` weiter (`components/ui/decimal-field.tsx`)
   – eine Lese-Funktion statt zwei.
2. **`Readout` mit `tone`** (`success`, `warning`, `danger`): Wert in der Statusfarbe, davor das
   Symbol aus `STATUS` (`components/ui/status.ts`).
3. Skill `neues-werkzeug`, kleine Werkzeuge: die beiden Eigenschaften nennen.

**Abnahme:** `npm run typecheck`; `npm run e2e -- layout` unverändert grün; `npm run pwa:build`.

### K3 – Die Rechner angleichen

Sichtbare Änderungen, je Rechner klein. Ein Pull Request; wird er zu groß, RTA und PWA-Texte
abtrennen.

- **Alle:** Ein Feld, mit dessen Wert nicht gerechnet wird, ist rot umrandet (`invalid`) –
  leere Felder nicht. Heimliches Ersetzen entfällt: Gain ≤ 0 und cos φ außerhalb von 0 bis 1
  ergeben kein Ergebnis mehr statt eines mit 1 gerechneten; ein leeres Feld rechnet dort
  weiter mit 1 und zeigt die 1 als Platzhalter. Hervorgehoben (`accent`) ist je Karte nur die
  Antwort auf ihre Frage, `big` nur zusammen mit `accent`.
- **DMX-Dip-Schalter:** das Ergebnis „Adresse“ entfällt (steht im Feld), „Binär“ bleibt. Jeder
  Schalter trägt `aria-pressed` und einen Namen („Schalter 3, Wert 4“). Klassen über `cn` statt
  zusammengesetzter Zeichenketten.
- **Timecode:** Die drei Timecode-Felder werden Textfelder in einem `FieldRow` mit
  Zifferntastatur (`inputMode="numeric"`). `parseTc` liest zusätzlich reine Ziffern paarweise
  von rechts („1020312“ = 01:02:03:12, „312“ = 00:00:03:12); ein oder zwei Ziffern bleiben
  Frames wie heute, Eingaben mit Trennzeichen ändern sich nicht. Tests in
  `tools/timecode/tc.test.ts`. Ungültige Timecodes markieren ihr Feld – auch „A“ und „B“ in
  der zweiten Karte, die heute nur leer bleibt.
- **Audio-Delay:** „Temperatur“ mit `signed`.
- **Beamer-Lumen:** „Bewertung“ als `Readout` mit `tone` – „ausreichend“ (`success`), „zu
  dunkel“ (`danger`), ohne ✓ und ✗.
- **Stromlast:** „Anschluss“ („1∼ 230 V“, „3∼ 400 V“) und „Auslastung“ („100 %“, „80 %
  Dauer“) als `ChoiceField`.
- **Rigging-Last:** die beiden Winkel-Warnungen als `Alert` mit Titel und Symbol aus `STATUS`
  („Flacher Winkel“, „So nicht anschlagen“), ohne „⚠“ im Text.
- **RTA:** Listen mit bis zu vier kurzen Möglichkeiten werden `ChoiceField` – Kanal,
  Kalibrator, Mittelung, Spitzen, Pegelmesser, Skala, Farbe, Spektrogramm, Empfindlichkeit;
  „Eingang“ bleibt eine Liste. `e2e/rta.mjs` wählt Spektrogramm, Kanal und Mittelung heute per
  `selectOption` und zieht mit. (Lässt sich weglassen, wenn der Schritt zu groß wird.)
- **PWA:** „Rechner“ wird in den sichtbaren Texten von `src/pwa/App.tsx` zu „Werkzeuge“
  („Weitere Werkzeuge“, „Alle Werkzeuge“, der Tipp zum Stern).

**Abnahme:** `npm run e2e -- layout rta`; neue Schritte in `e2e/layout.mjs`: im Kreisrechner
„abc“ tippen – das Feld trägt `aria-invalid`; im Timecode-Rechner „01020312“ – „Frames
(gesamt)“ zeigt 93087 (25 fps: 3.723 s × 25 + 12). `npx vitest run src/renderer/src/tools
src/pwa`, `npm run pwa:build`.

### K4 – Rechner merken sich die Eingaben

Nur nach Entscheidung 3. **Heute:** Befund 11. **So:**

```text
src/renderer/src/tools/_calc/useCalcFields.ts        gemerkte Felder eines Rechners
src/renderer/src/tools/_calc/useCalcFields.test.ts   Prüfung beim Lesen
```

- Je Rechner ein Eintrag über `usePersistentState` (das ist der Ort für Bedien-Kleinigkeiten),
  Schlüssel `calc:<kennung>`: alle Eingaben als Text, bei verknüpften Feldern auch, welches die
  Quelle ist. Beim Lesen geprüft: nur bekannte Felder, nur Text bis 40 Zeichen, sonst die
  Vorgabe – rein und getestet.
- `useLinkedFields` nimmt den gemerkten Stand wahlweise entgegen; ohne bleibt es wie heute.
- **„Zurücksetzen“** unter den Karten (`CalcPage`), nur sichtbar, wenn etwas von der Vorgabe
  abweicht: stellt die Beispielwerte wieder her.
- Nicht für RTA und Testtongenerator – die haben ihren Store.

**Abnahme:** Unit-Test der Prüfung (Unsinn, fehlende und fremde Felder). E2E in
`e2e/layout.mjs`: Kreisrechner, Durchmesser 3 tippen, Fenster schließen, wieder öffnen – 3
steht da; „Zurücksetzen“ – 1 steht da, der Knopf ist weg. `npm run pwa:build`.

## Abnahme am Gerät

Was kein Test kann – der Testtongenerator ist gebaut, das Folgende aber nur nachgelesen, nicht
an einem Handy ausprobiert. Mit der veröffentlichten PWA (nach dem Merge) oder
`npm run pwa:preview` im LAN (dort ohne HTTPS: kein Wachhalten, kein Offline):

- **iPhone, als App installiert:** Testton startet nach einem Tipp; hörbar auch bei umgelegtem
  Stummschalter (ab iOS 17); der Bildschirm bleibt an (in der installierten App ab iOS 18.4);
  App wechseln und zurück – der Knopf zeigt „Ton starten“, ein Hinweis sagt warum; danach misst
  der RTA wieder (Mikrofon geht).
- **Android (Chrome):** dasselbe; dazu, ob das Metronom bei gesperrtem Bildschirm sauber läuft
  oder anhält – beides ist in Ordnung, solange die Anzeige stimmt.
- **Beide:** Metronom mit „Tippen“, Knopfgruppen ohne Querscrollen; ⓘ antippen – Blase da;
  daneben tippen – weg; scrollen – sie läuft mit. Nach K3: Timecode nur mit Ziffern eintippen,
  −5 °C im Audio-Delay.
- **Rechner:** Ausgabegerät des Testtons im Betrieb wechseln.

Ergebnis in `docs/WERKZEUGE.md` und im Skill `rechner-pwa` festhalten (auch, was nicht geht).

## Doku und Skills

Mit dem jeweiligen Schritt, nicht am Ende gesammelt:

- `docs/WERKZEUGE.md`: was sich an den Rechnern ändert (K3, K4).
- `docs/ROADMAP.md`: Der Eintrag unter „Neue Werkzeuge“ schrumpft mit jedem Schritt und
  entfällt mit dem letzten.
- Skills: `neues-werkzeug` (neue Eigenschaften der Bausteine), `rechner-pwa` (Tastaturen,
  Ergebnis der Abnahme am Gerät), `review-checkliste` (bestätigte Befunde mit Messwert).
- Ist alles umgesetzt: Rest nach `docs/WERKZEUGE.md` überführen, diese Datei löschen.

## Entscheidungen

Entschieden am 13. November 2026 („der Plan ist gut“, umgesetzt): Der Testbildgenerator behält
seinen Ton (beide nutzen denselben Kern), „Gegenphase“ ist die fünfte Kanalwahl, zuerst kam der
Testton. Offen – die Vorgabe in Klammern gilt, wenn du nichts anderes sagst:

3. **Sollen sich die Rechner ihre Eingaben merken** (Schritt K4)? (Ja, mit „Zurücksetzen“.)
4. **Heißt die Kategorie weiter „Rechner“?** (Ja.) Mit RTA und Testtongenerator wäre „Rechner &
   Messen“ treffender – das ändert eine Beschriftung in `tools/types.ts` und die Überschriften
   in Doku und README.

## Nicht tun

- **Kein `api`, keine Einstellungen, kein Toast** in einem kleinen Werkzeug (Skill
  `rechner-pwa`).
- **Keine neuen Formeln, Einheiten oder Felder** in den Rechnern.
- **Keinen zweiten Ton-Kern** – Töne nur über `tools/_tone`.
- **`tools/rta/testSignals.ts` nicht mit dem Rauschen des Ton-Kerns zusammenlegen:** andere
  Verteilung, die Tests des RTA hängen an den Zahlen.
- **`Rta.tsx` nicht teilen** (E1) und **keine Beschreibungen vorhandener Werkzeuge ändern**
  (B6).
- **Namen der PWA im Code lassen:** „Rechner-PWA“, `out-pwa`, der Cache-Name im Service Worker
  (ein neuer ließe die alten Caches auf den Handys liegen). Geändert werden nur sichtbare Texte.

## Später möglich

Ideen aus der Planung, bewusst nicht Teil davon:

- Testtongenerator: rosa Rauschen je Oktav- oder Terzband (einzelne Wege prüfen), Sweep mit
  wählbarem Bereich.
- Im RTA ein Knopf „Rauschen“, der rosa Rauschen aus dem Ton-Kern spielt – Generator und
  Analysator auf einem Gerät.
- „Immer im Vordergrund“ für die Fenster der kleinen Werkzeuge.
- Der Punkt „läuft“ an der Kachel des Startbildschirms (`launcher/useToolActivity.ts` kennt
  heute nur, was der main-Prozess selbst weiß).
- LTC-Generator und -Leser (Teil G der Durchsicht) auf dem Ton-Kern.
