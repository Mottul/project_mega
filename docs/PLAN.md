# Gesamtplan

Alles, was an der Mottulbox ansteht – Bedienung, Funktionen, Technik – in einem Dokument, mit
einer Reihenfolge und einheitlichen Paketen. Er ersetzt seit dem 14. November 2026 die Roadmap und
die Pläne zur Durchsicht, zur Arbeitsfläche des Video-Players und zu den kleinen Werkzeugen. Was
die Werkzeuge heute können, beschreibt [WERKZEUGE.md](WERKZEUGE.md); die Geschichte steht im
Git-Log.

**Stand:** 14. November 2026

Die Punkte sind Vorschläge. Was umgesetzt wird und in welcher Reihenfolge, entscheidet Matthias.
Was noch zu entscheiden ist, steht gesammelt unter [Entscheidungen](#entscheidungen); was sich nur
am Gerät prüfen lässt, unter [Abnahmen am Gerät](#abnahmen-am-gerät).

Vier große Vorhaben haben zusätzlich einen **Entwurf** mit Messwerten, Festlegungen und
Stolpersteinen: [PLAN-ATEM.md](PLAN-ATEM.md), [PLAN-MINI-MANUAL.md](PLAN-MINI-MANUAL.md),
[PLAN-VIDEO-GENERATOR.md](PLAN-VIDEO-GENERATOR.md) und [PLAN-BILDZEIT.md](PLAN-BILDZEIT.md)
(Stream, ST6). Dort steht, **wie** gebaut wird. **Was** offen
ist und **wann** es drankommt, steht nur hier.

- [Leitbild: zwei Muster](#leitbild-zwei-muster) – [Arbeitsfläche](#muster-1-arbeitsfläche),
  [Kleines Werkzeug](#muster-2-kleines-werkzeug)
- [So wird ein Paket umgesetzt](#so-wird-ein-paket-umgesetzt)
- [Übersicht und Reihenfolge](#übersicht-und-reihenfolge)
- **Bedienung:** [W – Arbeitsfläche für weitere Werkzeuge](#w--arbeitsfläche-für-weitere-werkzeuge),
  [K – Kleine Werkzeuge](#k--kleine-werkzeuge),
  [B – kleine Pakete](#b--bedienung-und-design-kleine-pakete), [D – Rückgängig](#d--rückgängig)
- **Funktionen:** [F – Mehr Nutzen](#f--mehr-nutzen), [Verzahnung](#verzahnung),
  [AT – ATEM-Steuerung](#at--atem-steuerung), [MM – Mini-Manual](#mm--mini-manual),
  [VG – Video-Generator](#vg--video-generator), [G – Neue Werkzeuge](#g--neue-werkzeuge)
- **Technik:** [S – Sicherheit und Auslieferung](#s--sicherheit-und-auslieferung),
  [E – Aufräumen und Qualität](#e--aufräumen-und-qualität), [U – Upgrades](#u--upgrades),
  [H – Skills](#h--skills-und-einstellungen-für-die-arbeit-mit-claude)
- [Abnahmen am Gerät](#abnahmen-am-gerät) · [Entscheidungen](#entscheidungen) ·
  [Nicht tun, nicht geplant](#nicht-tun-nicht-geplant) ·
  [Erledigt](#erledigt--nicht-neu-planen)

## Leitbild: zwei Muster

Zwei Umbauten vom November 2026 haben die Bedienung deutlich verbessert (Rückmeldung von Matthias,
14. November 2026): der **Video-Player ohne Scrollen** und der **neue Aufbau von Testtongenerator
und RTA**. Beide sollen auf andere Werkzeuge übertragen werden. Dieser Abschnitt hält fest, was
die Vorbilder ausmacht, und misst jedes andere Werkzeug daran. Daraus entstehen die Teile
[W](#w--arbeitsfläche-für-weitere-werkzeuge) und [K](#k--kleine-werkzeuge).

### Was beide gemeinsam haben

Sieben Regeln für jede Oberfläche der App – neue Werkzeuge werden gleich so gebaut:

1. **Im Betrieb zuerst.** Was man in der Show greift – Start und Stopp, Transport, die Antwort
   eines Rechners –, steht oben, groß und immer an derselben Stelle. Es verrutscht nicht, wenn
   darunter etwas wechselt.
2. **Einmal Eingestelltes aus dem Weg.** Im großen Werkzeug in die Schublade, im kleinen in eine
   zugeklappte Karte, die ihre Werte als Kurzfassung zeigt.
3. **Ohne Scrollen im kleinsten üblichen Format.** Großes Werkzeug: Fenster 1024 × 600. Kleines
   Werkzeug: Handy im Browser, 393 × 710. Listen scrollen in sich, die Seite nicht.
4. **Der Zustand sagt sich selbst.** Restzeit, „Danach“, „Stumm“, die Kurzfassung einer
   zugeklappten Karte – nichts Wichtiges steckt nur in einem kleinen Symbol.
5. **Wählen mit einem Tipp.** Wenige Möglichkeiten als Knopfgruppe statt als Liste, übliche Werte
   als Schnellwahl, Erklärungen hinter dem ⓘ.
6. **Kein Klick nimmt versehentlich etwas weg.** Löschen und Leeren fragen nach – oder lassen
   sich zurücknehmen (Teil [D](#d--rückgängig)).
7. **Gemessen, nicht geschätzt.** Jede Umstellung beginnt mit einer Messung am heutigen Stand und
   endet mit einer E2E-Prüfung derselben Maße.

### Muster 1: Arbeitsfläche

**Vorbild:** Video-Player (Schritte P1 bis P3, November 2026). **Für:** große Werkzeuge mit
mehreren Bereichen, die gleichzeitig zu sehen sein müssen. Vor dem Umbau war die Seite des Players
bei 1366 × 768 doppelt so hoch wie das Fenster (1323 statt 666 px): Wer zur Playlist scrollte, sah
den Transport nicht mehr.

![Breites Fenster: Bibliothek, Playlist und Bühne nebeneinander](bilder/player-layout-breit.svg)

![Mittleres Fenster: Playlist über Bibliothek, rechts die Bühne](bilder/player-layout-mittel.svg)

- **Felder statt Seite:** Die Arbeitsfläche besteht aus Feldern (`Pane`) in einem Raster
  (`WorkArea`). Jedes Feld hat einen Kopf – Titel, Anzahl, höchstens zwei Aktionen und ein Menü
  „⋯“ – und scrollt in sich.
- **Drei Stufen aus dem gemessenen Platz,** nicht aus der Fensterbreite: `breit` (ab 1180 px),
  `mittel` (ab 760 px), `schmal` (darunter oder niedriger als 420 px: eine Spalte, die
  Arbeitsfläche scrollt). So stimmt es auch mit angehefteter Schublade und im eigenen Fenster:
  1024 × 600 ergibt `mittel` (Arbeitsfläche 1024 × 498) – auch mit offener Schublade, denn in
  Fenstern unter 1100 px Breite schwebt sie über der Arbeitsfläche (`ToolShell.tsx`);
  1366 × 768 ergibt `breit` (1366 × 666), angeheftet `mittel` (1006 × 666); 1920 × 1080 ist
  immer `breit`.
- **Die Felder stehen in jeder Stufe in derselben Reihenfolge,** nur ihr Platz im Raster wechselt.
  Sonst baut React beim Öffnen der Schublade alles neu auf – im Player lüde das laufende Video
  neu.
- **Ein Feld für das, was läuft** („Bühne“): Vorschau im Seitenverhältnis der Ausgabe, darunter
  groß, was läuft, wie lange noch und was danach kommt. Sie bekommt den Platz, der übrig ist.
- **Abstände 12 px,** keine Höhen in Pixeln: Raster und `flex` mit `min-h-0` lösen es, gemessen
  wird nur für die Stufe.
- **Bausteine:** `components/WorkArea.tsx` (`WorkArea`, `Pane`, `useStufe`),
  `components/workAreaRaster.ts` (Stufen und Raster, rein und getestet) und
  `components/ui/menu.tsx` (das Menü „⋯“; seine Liste hängt am `<body>`, weil ein Feld abschneidet,
  was über seinen Rand ragt), `lib/useDateiAblage.ts` (Dateien ins ganze Feld ziehen, `Pane` mit
  `ablage`). Vorbild für das Raster eines Werkzeugs: `video-player/layout.ts`; für ein Feld mit
  Liste: `video-player/Playlist.tsx`; mit Kacheln, Suche und einer Auftragsliste als Fuß:
  `video-player/Library.tsx`; für die Abnahme: `e2e/player-layout.mjs`. Anleitung im Skill
  `neues-werkzeug`, Lehren im Skill `review-checkliste` („Raster und SVG“).
- **Nicht für Dokumente:** Werkzeuge, die man von oben nach unten liest – Video-Konverter,
  Medien-Info, Packliste, YouTube-Downloader, Handbücher, Netzwerk-Scanner –, scrollen weiter
  als Seite.

**Gemessen am 14. November 2026** in der gebauten App mit frischem Profil: um wie viele Pixel
die Seite höher ist als die sichtbare Arbeitsfläche. „zu“ und „an“ heißt: Schublade zugeklappt
bzw. offen und angeheftet. „passt“: Die Seite scrollt nicht. Die Spalte 1024 × 600 ist nach B8
neu gemessen (17. und 21. November 2026): Dort schwebt die Schublade, auch wenn sie angeheftet
ist.

| Werkzeug | 1024 × 600 (zu · an) | 1366 × 768 (zu · an) | 1920 × 1080 (zu · an) | Folge |
| -------- | -------------------- | -------------------- | --------------------- | ----- |
| Video-Player | passt · passt (Stufe `mittel`, vorher `schmal`) | passt · passt | passt · passt | Vorbild |
| Video-Generator (12 Bilder) | +732 · +732 (vorher +1074) | +490 · +639 | +169 · +318 | **W1** |
| Stage-Timer (8 Abschnitte à 5 min) | +114 · +114 (am 14.11. +142 · +771) | passt · passt | passt · passt | **W2** |
| Testbildgenerator | +124 · +124 (vorher +143) | +57 · +57 | passt · passt | **W3** |
| NovaStar-Steuerung | +96 · +96 (vorher +112) | passt · passt | passt · passt | **W4** |
| Mini-Manual (leere Anleitung) | +404 · +404 (vorher +817) | +196 · +196 | passt · passt | **W5** |
| LED-Wall-Konfigurator | +46 · +46 (vorher +1009) | passt · passt | passt · passt | später W6 |
| ATEM-Steuerung (Probebetrieb, Mini Extreme) | passt · passt | passt · passt | passt · passt | nichts: links scrollt die Seite in sich, die Spalte „Übergang“ steht |
| Jingle-Player (acht leere Pads), OSC-Steuerung (Vorgabe) | passt · passt | passt · passt | passt · passt | nichts |
| Video-Konverter, Medien-Info, Packliste, YouTube-Downloader, Handbücher, Netzwerk-Scanner | leer: passt | leer: passt | leer: passt | Dokumente – bleiben |

- **Die Schublade war der größte einzelne Hebel:** Angeheftet ließ sie der Arbeitsfläche in
  einem 1024 px breiten Fenster nur 664 px – daher die großen Zahlen, die in der Spalte „an“ in
  Klammern stehen. Seit B8 schwebt sie in Fenstern unter 1100 px Breite über der Arbeitsfläche,
  auch wenn sie angeheftet ist; „angeheftet“ bleibt gemerkt und gilt wieder, sobald das Fenster
  breiter ist. Bei 1024 × 600 gleicht die Spalte „an“ deshalb der Spalte „zu“.
- **So wurde gemessen:** Playwright über `e2e/harness.mjs`, je Werkzeug und Fenstergröße
  `scrollHeight` gegen `clientHeight` des Bereichs `data-testid="tool-main"`. Inhalte: im
  Stage-Timer acht Abschnitte (Befehl `setSegments`; seit dem 17. November je 5 min mit kurzem
  Sprecher und Titel – am 14. November, mit anderen Abschnitten, 28 px mehr, obwohl der
  Stage-Timer dazwischen unverändert war), im Video-Generator zwölf Bilder über „Bilder &
  Videos“, die ATEM-Steuerung im Probebetrieb. Jedes W-Paket stellt seine Messung als
  E2E-Schritt nach, bevor es etwas ändert.

### Muster 2: Kleines Werkzeug

**Vorbild:** Testtongenerator und RTA (November 2026). **Für:** die elf kleinen Werkzeuge im
eigenen Fenster und in der Handy-PWA – und jedes neue. Vor dem Umbau zeigte der RTA am Handy beim
ersten Öffnen über 1.800 px; im Testtongenerator blieben neben der Beschriftung kaum 150 px für
die Bedienelemente.

- **Eine Karte, ein Strich:** oben, was man im Betrieb greift (Start, Pegel, Kanäle); unter dem
  Strich, was je nach Wahl wechselt (die Felder des Signals). Oben verrutscht beim Umschalten
  nichts.
- **Start und Hauptwert in einer Zeile:** großer Knopf (`RunButton` mit `big`; läuft es, eine
  rote Fläche „Stopp“), daneben das, worum es geht – der Pegel, das gespielte Signal.
- **Bedienfelder in ganzer Breite:** Knopfgruppen, Schieber und Schnellwahl mit der Beschriftung
  darüber und dem Wert rechts (`FieldBlock`). Knopfgruppen brechen in gleichmäßig gefüllten
  Reihen um (`Segmented` mit `wrap`), Schnellwahlen sehen aus wie Knopfgruppen (`QuickPick` mit
  `fill`). Zahlenfelder bleiben Zeilen mit der Beschriftung links (`FieldRow`) – die brauchen die
  Breite nicht.
- **Selten Gebrauchtes zugeklappt:** `FoldCard` zeigt zugeklappt eine Zeile mit dem Stand
  („Mittelung schnell“, die stärkste Feedback-Spitze in Rot). Welche Karten offen sind, bleibt
  gemerkt. Ein Rechner mit zwei Fragen (Pilot Stromlast, K5) klappt beide Karten so und zeigt
  zugeklappt die Antwort („7 Geräte je Kreis“); die zweite ist ab Werk nur offen, wenn sie neben
  der ersten steht (`defaultOpen="nebeneinander"`) – am Handy zu, im breiten Fenster offen.
- **Passt aufs Handy:** Bei 393 × 710 steht das Wichtige ohne Scrollen da – der
  Testtongenerator ganz, beim RTA Messen, Pegel, Spektrum und dessen Bedienung.
- **Meldungen in der Seite** (`Alert`), der Stand bleibt gemerkt, Erklärungen hinter dem ⓘ.
- **Bausteine:** `tools/_calc/ui.tsx` und `components/ui/segmented.tsx`; Regeln fürs Handy im
  Skill `rechner-pwa`. Vorbild für einen Rechner: `tools/power-load/PowerLoad.tsx` (Antwort
  zuerst, Knopfgruppen, zwei zuklappbare Karten), für die Abnahme der Schritt „Stromlast (Pilot
  Muster 2)“ in `e2e/layout.mjs`.

**Gemessen am 14. November 2026** in der PWA bei 393 × 710 (sichtbar unter der Kopfzeile: 657 px,
ohne Tastatur):

| Werkzeug | Höhe der Seite | Karten (Höhe in px) | Listen (Einträge) | Folge |
| -------- | -------------- | ------------------- | ----------------- | ----- |
| Testtongenerator | passt | eine (603) | – | Vorbild |
| RTA | 824 px (+167) | Kopf mit Messen, Pegel und Spektrum; vier zugeklappte Karten (je 64) | zehn, in den Karten | Vorbild; Listen → K6 |
| Rigging-Last | 1281 px (+624; seit K3 die Winkel-Warnung mit Titel, vorher 1209) | Traverse 447, Bridle 723 | – | K6 |
| Kameraobjektiv | 1071 px (+414) | Kamera 423, Motiv 601 | Sensor (8), Telekonverter (4) | K6 |
| Stromlast & Absicherung | passt: 508 px (vor K5 929, +272) | Last 362 offen, Geräte je Stromkreis 50 zugeklappt (offen 524; vor K5 315 und 519) | – (vor K5 Anschluss (2), Absicherung (4), Auslastung (2)) | Pilot (K5, 24. November 2026), Vorbild für K6 |
| Timecode-Rechner | 749 px (+92) | Umrechnen 321, Dauer 381 | Bildrate (10) | K6 |
| Beamer-Lumen | 741 px (+84) | Projektion 423, Vorhandener Beamer 271 | Umgebungslicht (4) | K6 |
| Audio-Delay & SPL | 695 px (+38) | Delay 367, Pegel über Distanz 281 | – | K6 |
| Projektionsverhältnis | passt | Leinwand 337, Objektiv 171 | Seitenverhältnis (6) | K6, nur die Liste |
| DMX-Dip-Schalter | passt | eine (287; vor K3 mit der Zeile „Adresse“ 389) | – | nichts |
| Kreisrechner | passt | eine (267) | – | nichts |

**Wo die Antwort steht:** In den Rechnern steht das hervorgehobene Ergebnis unter den Feldern –
außer in der Stromlast, die seit K5 die Antwort über die Felder stellt (vorher endete „Max.
Geräte“ bei 757 px von 710). Bei Rigging („Kraft je Strang“) und Kameraobjektiv (Bildausschnitt)
liegt es damit unter dem Rand des Bildschirms (Unterkante bei 795 und 797 px), bei Audio-Delay
(„Pegel in Ziel-Distanz“) halb. Mit offener Tastatur bleibt noch weniger: Wer tippt, sieht die
Antwort nicht – am Gerät zu prüfen.

## So wird ein Paket umgesetzt

Ein Auftrag lautet: **„Setze Paket B3 aus docs/PLAN.md um.“** Mehr braucht es nicht – alles
Weitere steht hier und in den genannten Dateien. So lässt sich ein Paket auch einem anderen Modell
geben, das die Vorgeschichte nicht kennt.

1. **Frisch anfangen:** `git switch main`, `git pull --ff-only`, gemergte lokale Branches
   löschen, neuen Branch anlegen (Name wie das Paket, z. B. `scanner-adapter`). Nach einem
   Dependabot-Merge zuerst `npm ci` und `npm run electron:bin`.
2. **Lesen:** `CLAUDE.md`, das [Leitbild](#leitbild-zwei-muster), dann die im Paket genannten
   Skills (`.claude/skills/<name>/SKILL.md`) und Dateien; bei AT, MM und VG zuerst den Entwurf. Die
   Fundstellen stammen vom November 2026 – **erst am Code prüfen, ob der Befund noch stimmt.**
   Stimmt er nicht mehr, das Paket hier streichen und es sagen.
3. **Nachstellen, bevor etwas geändert wird:** einen Test schreiben, der am heutigen Stand
   scheitert – Unit-Test (`npx vitest run <datei>`) oder E2E-Schritt (`node e2e/<name>.mjs`
   gegen den gebauten alten Stand). Ein Test, der schon vorher grün ist, prüft nichts.
4. **Umsetzen:** nur dieses Paket. Fällt dabei etwas anderes auf, hier als neuen Punkt
   eintragen, nicht mit erledigen.
5. **Prüfen:** Skill `abschluss-check` (Format, `check:refs`, `check:files`, Lint, Typen, Tests,
   bei Änderungen an der Oberfläche `npm run e2e`), bei kleinen Werkzeugen zusätzlich
   `npm run pwa:build`, dazu der Skill `review-checkliste`.
6. **Nachziehen:** `docs/WERKZEUGE.md` (was die App jetzt kann), bei Bedarf weitere Doku, die
   Skills in `.claude/skills/` (jede Änderung zieht sie nach: neue Lehren, neue E2E-Skripte) –
   und **das Paket aus diesem Dokument streichen:** die Zeile in der Tabelle seines Teils und den
   Abschnitt, in der [Übersicht](#übersicht-und-reihenfolge) seine Kennung. Ist ein Teil leer,
   auch seine Überschrift. Was sonst doppelt geplant würde, bekommt eine Zeile unter
   [Erledigt](#erledigt--nicht-neu-planen).
7. **Abliefern:** ein Commit, Push, Pull Request (Freigabe vom 8. Oktober 2026). Gemergt wird
   von Matthias.

Regeln, die für jedes Paket gelten:

- **Ein Paket, ein Pull Request.** Ausnahme: die mit „zusammen“ gekennzeichneten.
- **Nichts erfinden, was das Paket nicht verlangt** – keine neuen Optionen, keine Umbauten
  „bei der Gelegenheit“.
- **Offene Frage im Paket?** Erst fragen, dann bauen. Eine Vorgabe in Klammern gilt nur, wenn
  Matthias sie bestätigt hat.
- **Punkte ohne Abnahme** (F6 bis F17, V1 bis V5, Teil G) sind Wünsche, keine Aufträge: erst als
  Paket ausarbeiten – Heute, So, Abnahme – und freigeben lassen.
- Größen: **S** bis etwa zwei Stunden, **M** ein halber bis ganzer Tag, **L** mehrere Tage und
  ein eigener Entwurf (`docs/PLAN-<THEMA>.md`), bevor Code entsteht. Der Entwurf hält fest, wie
  gebaut wird; Stand, Reihenfolge und Entscheidungen bleiben hier.
- **Größere Änderungen an der Bedienung eines Show-Werkzeugs** beginnen mit einer Skizze und der
  Freigabe durch Matthias, nicht mit Code – das gilt für W1, W2, W5 und die ATEM-Steuerung.

Stolpersteine aus der bisherigen Arbeit:

- Die Arbeitskopie hat unter Windows CRLF. Dateien mit dem Edit-Werkzeug ändern, nicht per
  Skript neu schreiben; danach `npx prettier --write <dateien>` nur auf die geänderten.
- Backslashes gehen auf dem Weg durch Shell und Skript leicht verloren. Reguläre Ausdrücke in
  neuen Dateien nachlesen und `node --check <datei>` laufen lassen.
- `npm run check:refs` prüft jeden Dateinamen in Backticks. **Geplante Dateien** deshalb in
  einen Textblock schreiben, nicht in Backticks.
- `npm run format:check` meldet lokal die unversionierte Datei „OBS-Test“ im Ordner
  `Beispiele/` (Paket E6) – das ist kein Fehler der eigenen Änderung. Sie nicht in Backticks
  nennen: `check:refs` fände sie lokal, in der CI aber nicht.
- Kleine Werkzeuge öffnen ein eigenes Fenster und sind keine Route im Hauptfenster:
  `openRoute(page, '/tool/<id>')` springt zurück zum Start. Im E2E über
  `window.api.openToolWindow('<id>')` öffnen und auf das neue Fenster warten (`openSmall` in
  `e2e/layout.mjs`, Skill `electron-e2e`).
- **Nach jeder Änderung an einem kleinen Werkzeug `npm run pwa:build`.** Er bricht ab, wenn ein
  kleines Werkzeug `api` oder Einstellungen hereinzieht oder eine Datei außerhalb von
  `src/pwa/build/sources.ts` einbindet. `npx vitest run src/pwa` prüft, dass PWA-Liste und
  `SMALL_TOOLS` gleich sind.
- **Es gibt keine Komponententests** (Vitest läuft ohne DOM, Paket E8). Rechnen und Entscheiden
  gehören in reine Module mit Test; Verhalten der Oberfläche prüft ein E2E-Schritt. Ob ein Umbau
  ohne sichtbare Änderung wirklich nichts ändert, zeigt trotzdem ein Wegwerf-Test: HTML per
  `renderToStaticMarkup` vorher und nachher vergleichen (Skill `aufraeumen`).
- `npm run dev` startet nicht neben der installierten Mottulbox (Einzelinstanz, gleicher
  Benutzerordner). Die E2E-Läufe haben eigene Ordner.
- Testausgaben mit Ersatzzeichen (U+FFFD, die Raute mit Fragezeichen) nicht in Code, Kommentare
  oder Doku übernehmen: Sie sehen danach aus wie ein Kodierfehler der Datei. Vor dem Commit mit
  `git grep` nach dem Zeichen suchen (bekannt und gewollt: je eines in `youtube.mjs`,
  `ytRequest.ts` und im Skill `review-checkliste`, alle zur Ausgabe von yt-dlp).

## Übersicht und Reihenfolge

Empfohlen von oben nach unten. Die Etappen sind keine Sperren: Jedes Paket nennt, was es braucht,
alles andere lässt sich vorziehen.

| Etappe | Pakete | Warum an dieser Stelle |
| ------ | ------ | ---------------------- |
| **2 – Muster übertragen** | K6 → K4 · W1 → W2 → W3 → W4 → W5 | Der größte Gewinn in der Bedienung: Gemessen scrollen fünf große Werkzeuge und fünf Rechner |
| **3 – Täglich spürbar** | B2 bis B7, B9 bis B14 · F3 | Kleine Pakete, die man bei jeder Benutzung merkt |
| **4 – Sicherheitsnetz** | S3 · D · F1 · E4 | Aktualisierung, damit Korrekturen ohne neuen Installer ankommen; Rückgängig und Sicherung, damit nichts verloren geht |
| **5 – Mehr Nutzen** | F2, F4, F6 bis F17, V1 bis V5 · AT · MM · VG · G | Funktionen nach Show-Bedarf; die großen Vorhaben nach ihrem Entwurf |
| **Nebenher** | E1 bis E10 · U1 bis U3 · H1 bis H4 · S1, S2, S4 · ST6 | Wenn das Thema ohnehin anfällt oder ein Paket es braucht (S1 vor AT8); ST6 macht den macOS-Lauf der CI wieder verlässlich |
| **Laufend** | Update-PRs, [Abnahmen am Gerät](#abnahmen-am-gerät) | montags bzw. wenn das Gerät da ist |

**Laufend – Update-PRs von Dependabot:** jeden Montag durchsehen und nach grüner CI mergen (7 Tage
Abstand, [SICHERHEIT.md](SICHERHEIT.md#updates-einspielen)). Eine neue Electron-Hauptversion vor
dem Merge an den Breaking Changes prüfen (Skill `abhaengigkeiten`).

## W – Arbeitsfläche für weitere Werkzeuge

Das [Muster 1](#muster-1-arbeitsfläche) für die Werkzeuge, deren Seite gemessen scrollt – in der
Reihenfolge des Gewinns. Je Werkzeug ein Pull Request.

| Paket | Werkzeug | Seite zu hoch um (Schublade zu: 1024 · 1366 · 1920) | Größe | Braucht |
| ----- | -------- | --------------------------------------------------- | ----- | ------- |
| **W1** | Video-Generator | 732 · 490 · 169 px (12 Bilder) | M–L | Skizze |
| **W2** | Stage-Timer | 114 px · passt · passt (8 Abschnitte) | M | Skizze |
| **W3** | Testbildgenerator | 124 · 57 px · passt | S–M | – |
| **W4** | NovaStar-Steuerung | 96 px · passt · passt | S | – |
| **W5** | Mini-Manual | 404 · 196 px · passt (leer) | M | erst ansehen, Skizze |
| **W6** | LED-Wall-Konfigurator auf `Pane` | 46 px · passt · passt | M | nur wenn sich der Baustein bewährt |

Für jedes W-Paket gilt:

1. **Erst messen, mit Inhalt,** bei 1024 × 600, 1366 × 768 und 1920 × 1080, Schublade zu und
   angeheftet – und die Messung als E2E-Schritt festhalten, der am alten Stand scheitert. Wo die
   Seite nicht scrollt, gibt es nichts zu tun.
2. **W1, W2 und W5 beginnen mit einer Skizze** der Felder in den Stufen `breit` und `mittel` (SVG
   in `docs/bilder/`, wie die beiden Bilder des Players) und der Freigabe durch Matthias. Bei W3
   und W4 genügt die Beschreibung hier.
3. **Raster als reines Modul** neben dem Werkzeug, mit Test – wie `video-player/layout.ts`. Die
   Felder stehen in jeder Stufe in derselben Reihenfolge; keine Höhen in Pixeln; kein `sm:` oder
   `lg:` für den Aufbau der Felder (die richten sich nach dem Fenster).
4. **Nur Anordnung und Anzeige.** Zustand, Befehle und Schublade bleiben, wie sie sind; was man
   einmal einstellt und heute in der Arbeitsfläche steht, darf in die Schublade wandern – ohne
   neue Optionen.
5. **Abnahme wie beim Player:** `tool-main` scrollt nicht bei den drei Größen (1366 × 768 auch
   mit angehefteter Schublade); das Wichtige liegt ganz im Fenster; Listen scrollen in sich; bei
   700 × 600 eine Spalte, die scrollt; der Wechsel der Stufe baut nichts neu auf (Marke am
   Element, wie am `<video>` des Players).

### W1 – Video-Generator

**Heute:** `VideoGenerator.tsx` stapelt drei Karten in einer Seite, die als Ganzes scrollt:
Hinzufügen und Storyboard (`Storyboard.tsx`) mit den Hinweisen des Plans, darunter die Vorschau
(`PreviewCard.tsx`), darunter „Aufträge“. Mit zwölf Bildern ist die Seite bei 1366 × 768 um
490 px zu hoch, selbst bei 1920 × 1080 um 169 px. Wer im Storyboard ordnet, sieht die Vorschau
nicht; wer die Vorschau ansieht, sieht das gewählte Element nicht.

**So:** drei Felder.

- **Storyboard:** Kopf mit Anzahl und Gesamtdauer, „Hinzufügen“ (Bilder & Videos, Ordner) und der
  Ansicht; der Inhalt scrollt in sich. Die Hinweise des Plans stehen als Fuß des Felds und
  bleiben damit sichtbar.
- **Vorschau** (die Bühne): Vorschau im Seitenverhältnis der Ausgabe, darunter ihre Bedienung;
  so hoch wie ihr Inhalt (`kappen={false}`).
- **Aufträge:** nur, wenn es welche gibt; höchstens drei Zeilen hoch, scrollt in sich – wie die
  Import-Liste des Players.

Vorschlag für das Raster, in der Skizze festzulegen: `breit` und `mittel` Storyboard links,
rechts Vorschau über Aufträgen (wie Playlist und Bühne im Player); `schmal` Vorschau, Storyboard,
Aufträge untereinander.

**Nicht tun:** nichts an Plan, Rechenlauf und Store; die Schublade (Ausgabe, Vorgaben, Ton,
Auswahl) bleibt. Paket B5 (Leerzustand nicht rot) passt dazu, ist aber ein eigener Pull Request.

**Abnahme:** `e2e/video-generator.mjs` legt schon Medien an – dort oder in einem eigenen Skript:
mit zwölf Elementen scrollt `tool-main` bei keiner der drei Größen; die Vorschau und das gewählte
Element liegen gleichzeitig im Fenster; der Wechsel der Stufe baut die Live-Vorschau nicht neu
auf.

### W2 – Stage-Timer

**Heute:** `StageTimer.tsx` legt zwei Spalten in ein Raster ohne Höhe
(`minmax(0, min(38%, 34rem)) 1fr`, Rand 24 px): links Vorschau, Steuerung und Nachricht an die
Bühne, rechts die Abschnitte; unter 820 px Breite eine Spalte. Die Seite scrollt als Ganzes. Mit
acht Abschnitten ist sie bei 1024 × 600 um 114 px zu hoch (nach B8 gemessen), mit offener
Schublade ebenso – sie schwebt dort. Ab 1366 × 768 passt es, auch angeheftet.

**So:** zwei Felder. **Bühne:** Vorschau, Transport mit der Restzeit, Nachricht an die Bühne; so
hoch wie ihr Inhalt. **Abschnitte:** Kopf mit Anzahl und Gesamtdauer, die Liste scrollt in sich;
der laufende Abschnitt bleibt sichtbar (wie in der Playlist des Players: `scrollIntoView` mit
`container: 'nearest'`, nicht, während die Maus über der Liste arbeitet). `breit` und `mittel`
nebeneinander, die Bühne höchstens 38 % breit wie heute; `schmal` Bühne über Abschnitten. Im
Modus „Uhr“ ein Feld.

**Danach:** E1 für `StageTimer.tsx` (837 Zeilen) und F3 (Schnellstart, bis Uhrzeit, Ablauf
einfügen) – in dieser Reihenfolge, sonst wird zweimal umgebaut.

**Abnahme:** neue Schritte in `e2e/timer.mjs` oder ein eigenes Skript: acht Abschnitte über den
Befehl `setSegments`; bei 1024 × 600 und 1366 × 768 (auch angeheftet) scrollt `tool-main` nicht;
Vorschau, Start/Pause und die ersten vier Abschnitte liegen im Fenster; `goto` auf den letzten
Abschnitt – seine Zeile ist sichtbar.

### W3 – Testbildgenerator

**Heute:** `TestPatterns.tsx` zeigt die Vorschau in voller Spaltenbreite und darunter die Karte
„Export“. Die Seite ist bei 1024 × 600 um 124 px, bei 1366 × 768 um 57 px zu hoch – „Export“
liegt unter dem Rand.

**So:** zwei Felder. **Vorschau** füllt die Höhe und hält das Seitenverhältnis der Ausgabe (Kasten
per Container-Einheiten wie die Vorschau der Bühne in `Stage.tsx`). **Export** als schmales Feld
rechts daneben (`breit`, `mittel`) bzw. darunter (`schmal`).

**Abnahme:** `e2e/testpattern.mjs`: kein Scrollen bei den drei Größen; Breite durch Höhe der
Vorschau entspricht der eingestellten Ausgabe (16 : 9 und 32 : 9 prüfen).

### W4 – NovaStar-Steuerung

**Heute:** `Novastar.tsx` stapelt drei Karten: „Helligkeit“, „Presets / Szenen“ und „Roh-Befehl
(erweitert)“. Bei 1024 × 600 ist die Seite um 96 px zu hoch.

**So:** „Helligkeit“ und „Presets / Szenen“ stehen nebeneinander, sobald der Platz reicht; der
„Roh-Befehl“ ist zugeklappt (selten gebraucht, Regel 2 des Leitbilds) und zeigt aufgeklappt Feld,
Prüfsumme und „Senden“ wie heute. Er bleibt in der Arbeitsfläche – „Senden“ ist eine Aktion und
gehört nicht in die Schublade.

**Abnahme:** `e2e/layout.mjs` (prüft die Leiste der NovaStar-Steuerung): bei 1024 × 600 scrollt
`tool-main` nicht, Helligkeit und Presets liegen im Fenster; der Roh-Befehl lässt sich aufklappen
und senden wie bisher.

### W5 – Mini-Manual

**Heute:** `MiniManual.tsx` zeigt ab 1000 px Breite das Formular des Kapitels und daneben die
Vorschau, die beim Scrollen der Seite oben haften bleibt (`sticky`); darunter stehen beide
untereinander. Schon eine leere Anleitung ist bei 1366 × 768 um 196 px, bei 1024 × 600 um 404 px
zu hoch. Das Formular ist ein Dokument und darf scrollen – die Frage ist, ob die Vorschau dabei
immer sichtbar bleibt.

**Erst ansehen:** mit einer gefüllten Anleitung (Vorlage aus `e2e/mini-manual.mjs`) bei den drei
Größen prüfen, ob die Vorschau beim Bearbeiten eines langen Kapitels im Bild bleibt und ob die
Leiste der Kapitel erreichbar ist. Bleibt sie es, entfällt das Paket.

**So, falls nötig:** zwei Felder – „Kapitel“ (scrollt in sich) und „Vorschau“ (bleibt stehen,
Art der Vorschau im Kopf); `schmal`: Vorschau hinter einem Umschalter im Kopf statt unter dem
Formular.

**Abnahme:** `e2e/mini-manual.mjs`: Beim Scrollen im Kapitel bleibt die Vorschau im Fenster;
`tool-main` scrollt nicht bei 1366 × 768.

### W6 – LED-Wall-Konfigurator auf `Pane`

Der Konfigurator hat sein eigenes Gerüst (`LedWall.tsx`: Kennzahlen, Zeichenfläche, Pläne) und
passt ab 1366 × 768. Bei 1024 × 600 fehlen 46 px, auch mit offener Schublade: Sie schwebt dort
seit B8, das Gerüst bricht nicht mehr um (vorher 1009 px zu hoch). Ob er `WorkArea` und `Pane`
übernimmt, entscheidet sich, wenn sich der Baustein in W1 bis W3 bewährt hat. Bis dahin kein
Auftrag.


## K – Kleine Werkzeuge

Das [Muster 2](#muster-2-kleines-werkzeug) für die Rechner – und was ihnen unabhängig vom Aufbau
fehlt: ein Gedächtnis für die Eingaben. Elf Werkzeuge stehen in `SMALL_TOOLS` (`src/shared/toolWindows.ts`):
Kreisrechner, DMX-Dip-Schalter, Projektionsverhältnis, Audio-Delay & SPL, RTA, Testtongenerator,
Beamer-Lumen, Timecode-Rechner, Stromlast, Kameraobjektiv, Rigging-Last. Jedes öffnet sich im
eigenen kleinen Fenster (Höhe folgt dem Inhalt, schmal bis 320 px) und läuft unverändert in der PWA
(`src/pwa/tools.ts`). Neun davon sind Formulare aus den Bausteinen in `tools/_calc/ui.tsx`; um sie
geht es hier. Gerechnet wird je Rechner in einem geprüften Kern neben der Komponente (`math.ts` mit
Test, beim Kameraobjektiv `optics.ts`, beim Timecode `tc.ts`) – jede Änderung an einer Formel
beginnt dort.

Was bleibt: eine kurze Zeile je Karte, alles Weitere hinter dem ⓘ, Zahlen mit Komma, berechnete
Felder in Akzentfarbe.

| Paket | Inhalt | Größe | Braucht |
| ----- | ------ | ----- | ------- |
| **K6** | Neuer Aufbau der übrigen Rechner, Listen des RTA als Knopfgruppen | M je zwei bis drei Rechner | – |
| **K4** | Rechner merken sich die Eingaben | M | nach K6 (dieselben Rechner) |

Vor jedem Schritt den Skill `rechner-pwa` lesen.

### Befunde

Am Code geprüft am 13. November 2026, die Maße am 14. November; vor jedem Schritt erst nachsehen,
ob die Stelle noch so aussieht. Die Nummern stammen aus dem ersten Plan (1 ist mit K1 erledigt,
13 mit K2, 2, 4, 5, 7, 8, 9 und 14 mit K3, 3, 10, 12, 15 und 16 mit dem Testtongenerator), damit
Verweise darauf gültig bleiben.

| Nr. | Befund | Fundstelle | Paket |
| --- | ------ | ---------- | ----- |
| 6 | Auswahl aus wenigen Möglichkeiten ist mal eine Liste (zwei Tipps, Optionen verdeckt), mal eine Knopfgruppe: im RTA die Listen in den Karten, dazu Umgebungslicht (Beamer-Lumen), Telekonverter (Kameraobjektiv), Seitenverhältnis (Projektionsverhältnis) und Bildrate (Timecode). Die Bausteine `ChoiceField` und `Segmented` gibt es; die Stromlast nutzt sie seit K5 | `RtaCards.tsx`, `ProjectorLumen.tsx`, `CameraLens.tsx`, `ThrowRatio.tsx`, `Timecode.tsx` | K6 |
| 11 | Alle Eingaben sind weg, sobald das Fenster zugeht oder das Handy die PWA aus dem Speicher wirft; es erscheinen wieder die Beispielwerte (der Testtongenerator merkt sich seinen Stand schon) | alle Rechner (`useState`) | K4 |
| 17 | Fünf Rechner sind am Handy höher als der Bildschirm, und die Antwort steht unter den Feldern – bei zweien unter dem Rand (die Stromlast passt seit K5) | Messung im [Leitbild](#muster-2-kleines-werkzeug) | K6 |
| 18 | „Frames (gesamt)“ im Timecode-Rechner rundet Bruchteile still: „1,5“ rechnet mit Frame 2, das Feld behält „1,5“ (gefunden in K3, festgehalten im Test „auf ganze gerundet“). Rot markieren wie andere Werte, mit denen nicht gerechnet wird? | `timecode/tc.ts` (`framesFrom`) | K6 |

### K6 – Neuer Aufbau der übrigen Rechner

Für alle Rechner einheitlich, entschieden am 24. November 2026 (Entscheidung 2): die zweite
Frage zugeklappt wie im Piloten, kein Umschalter. Wie der Pilot an der Stromlast (K5,
`tools/power-load/PowerLoad.tsx`), je Pull Request zwei bis drei Rechner, in der Reihenfolge des
gemessenen Gewinns:

1. **Antwort zuerst:** In der Karte mit einer eigenen Antwort steht sie (`Readout` mit `big` und
   `accent`) als erste Zeile unter Titel und Frage, darunter die Felder, darunter die Nebenwerte.
   Karten aus verknüpften Feldern („Last“) haben keine eigene Antwort und bleiben, wie sie sind.
2. **Wählen mit einem Tipp:** Knopfgruppen statt Listen – in der Stromlast `ChoiceField` für
   Anschluss und Auslastung (je zwei), die Absicherung (vier Werte) in ganzer Breite (`FieldBlock`
   mit `Segmented`). Was die Liste dazusagte, steht hinter dem ⓘ. Ein `ChoiceField` mit zwei
   Knöpfen wie „1∼ 230 V“ passt am Handy nicht neben die Beschriftung und rückt darunter, in
   ganzer Breite; im breiten Fenster bleibt es eine Zeile.
3. **Zweite Frage zugeklappt:** Beide Karten `FoldCard` mit der Antwort als Kurzfassung („–“ ohne
   Ergebnis), die erste `defaultOpen`, die zweite `defaultOpen="nebeneinander"`: ab Werk am Handy
   zu, im breiten Fenster offen; gemerkt wird, was man selbst klappt.

Die Fensterbreiten in `src/shared/toolWindows.ts` bleiben; ob zweispaltige Fenster noch nötig
sind, zeigt der Pilot.

| Rechner | Was sich ändert |
| ------- | --------------- |
| Rigging-Last (+624 px) | „Traverse“ und „Bridle“ als `FoldCard` (Kurzfassung „A 115 kg · B 85 kg“ bzw. „141 kg je Strang · 45°“); Antwort zuerst, die Winkel-Warnung direkt darunter |
| Kameraobjektiv (+414 px) | „Kamera & Objektiv“ zuklappbar („Vollformat · 200 mm“); Telekonverter (vier Werte) als Knopfgruppe, der Sensor bleibt eine Liste; in „Motiv & Bildausschnitt“ die Antwort zuerst |
| Timecode-Rechner (+92 px) | „Dauer zwischen zwei Timecodes“ zuklappbar; Bildrate (zehn Werte) als Knopfgruppe mit Umbruch, wenn die Beschriftungen bei 320 px Breite lesbar bleiben – sonst bleibt die Liste; Befund 18 klären |
| Beamer-Lumen (+84 px) | Umgebungslicht (vier Werte) als Knopfgruppe mit kurzen Namen, die Erklärung der gewählten Stufe darunter („Vortragssaal · Ziel 400 lx“) – wie die Signale ohne eigene Felder im Testtongenerator; „Vorhandener Beamer“ zuklappbar („6.500 lm · ausreichend“); Lumen-Bedarf zuerst |
| Audio-Delay & SPL (+38 px) | „Pegel über Distanz“ zuklappbar („80 dB in 10 m“), Antwort zuerst |
| Projektionsverhältnis | Seitenverhältnis (sechs Werte) als Knopfgruppe mit Umbruch |
| RTA | In den zugeklappten Karten werden Listen mit bis zu vier kurzen Möglichkeiten Knopfgruppen in ganzer Breite (`FieldBlock` mit `Segmented`): Kanal, Kalibrator, Mittelung, Spitzen, Pegelmesser, Skala, Farbe, Spektrogramm, Empfindlichkeit. „Eingang“ bleibt eine Liste. `e2e/rta.mjs` wählt Spektrogramm, Kanal und Mittelung heute per `selectOption` und zieht mit |
| DMX-Dip-Schalter, Kreisrechner | nichts – beide passen und haben eine Karte |

**Abnahme** je Rechner wie beim Pilot: In der PWA bei 393 × 710 ist die Seite im
Auslieferungszustand höchstens 657 px hoch (messen per `getBoundingClientRect`, Skill
`rechner-pwa`), die Antwort einer offenen Karte liegt über ihrem ersten Feld, keine Liste mit bis
zu vier Möglichkeiten mehr; ein Schritt in `e2e/layout.mjs` wie „Stromlast (Pilot Muster 2)“
(zweite Karte breit offen, schmal zu mit Kurzfassung, aufgeklappt gemerkt), zuerst rot gegen den
alten Build; Tests der Rechenkerne unverändert grün, `npm run pwa:build`. Die neuen Maße in den
Skill `rechner-pwa`, die Beschreibung nach `docs/WERKZEUGE.md`.

### K4 – Rechner merken sich die Eingaben

Entschieden am 24. November 2026; nach K6, weil beide dieselben Rechner anfassen. **Heute:**
Befund 11. **So:**

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

### Regeln für alle K-Pakete

- **Kein `api`, keine Einstellungen, kein Toast** in einem kleinen Werkzeug (Skill
  `rechner-pwa`) – der PWA-Build bricht sonst ab. Meldungen als `Alert` in der Seite.
- **Gerechnet wird nur im Rechenkern** (`math.ts` neben der Komponente, mit `math.test.ts`):
  Zahlen hinein, Zahlen oder `null` heraus; die Komponente liest Text und zeigt an. Eine
  Änderung an einer Formel, Grenze oder Ersetzung beginnt mit dem Test.
- **Keine neuen Formeln, Einheiten oder Felder** in den Rechnern.
- **Keinen zweiten Ton-Kern** – Töne nur über `tools/_tone`.
- **`tools/rta/testSignals.ts` nicht mit dem Rauschen des Ton-Kerns zusammenlegen:** andere
  Verteilung, die Tests des RTA hängen an den Zahlen.
- **`Rta.tsx` nicht nebenbei teilen** (E1) und **keine Beschreibungen vorhandener Werkzeuge
  ändern** (B6).
- **Namen der PWA im Code lassen:** „Rechner-PWA“, `out-pwa`, der Cache-Name im Service Worker
  (ein neuer ließe die alten Caches auf den Handys liegen). Geändert werden nur sichtbare Texte.

### Später möglich

Ideen aus der Planung, keine Aufträge:

- Testtongenerator: rosa Rauschen je Oktav- oder Terzband (einzelne Wege prüfen), Sweep mit
  wählbarem Bereich.
- Im RTA ein Knopf „Rauschen“, der rosa Rauschen aus dem Ton-Kern spielt – Generator und
  Analysator auf einem Gerät.
- „Immer im Vordergrund“ für die Fenster der kleinen Werkzeuge.
- Der Punkt „läuft“ an der Kachel des Startbildschirms (`launcher/useToolActivity.ts` kennt
  heute nur, was der main-Prozess selbst weiß).
- LTC-Generator und -Leser (G10) auf dem Ton-Kern.

## B – Bedienung und Design, kleine Pakete

Kleine Pakete, die man täglich merkt. Unabhängig voneinander, soweit nichts anderes dasteht.

| Paket | Inhalt | Größe | Braucht |
| ----- | ------ | ----- | ------- |
| **B2** | Strg+K: Werkzeug wechseln von überall | M | – |
| **B3** | Netzwerk-Scanner: sinnvoller Adapter vorgewählt | S | – |
| **B4** | Stopp-Symbole gefüllt | S | – |
| **B6** | Startbildschirm: Namen und Beschreibungen ganz lesbar | S | – |
| **B7** | App-Einstellungen als Dialog mit Reitern | M | – |
| **B9** | „Über und Diagnose“: Version, Protokoll, Datenordner | M | B7 |
| **B10** | Mini-Manual: Schritt-Texte ganz sichtbar | S | – |
| **B11** | Kundenansicht ohne Aufblitzen des Startbildschirms | S | – |
| **B12** | ATEM: Mischer im Netz suchen | M | – |
| **B13** | Helles Design: Akzent als Schrift lesbar | S | – |
| **B14** | Bibliothek des Players: Zustände auf Deutsch, Knöpfe per Tastatur, „Bibliothek leeren“ nennt die Playlist | S | – |

### B2 – Strg+K: Werkzeug wechseln von überall

**So:** Strg+K (macOS Cmd+K) öffnet in jedem Fenster mit Kopfleiste ein kleines Suchfeld über
der Seite: tippen, Pfeiltasten, Enter öffnet, Esc schließt. Gleiche Suche wie am Startbildschirm
(`matches()` in `launcher/Launcher.tsx`, dafür in ein eigenes Modul gezogen), die Treffer in der
Reihenfolge der Anzeige dort (erst Favoriten-Kategorien, dann die Kategorien von oben nach unten)
– als reine Funktion mit Unit-Test; geöffnet wird auf demselben Weg wie mit einem Klick auf die
Kachel (kleine Werkzeuge im eigenen Fenster). Das Suchfeld des Startbildschirms bleibt, wie es
ist (B1 ist gestrichen). Nicht in der Kundenansicht, nicht in Ausgabefenstern, nicht in den
Fenstern der kleinen Werkzeuge. Ausgewertet im Renderer (`keydown`), nicht im main – die App hat
kein Programm-Menü.

**Vorher prüfen:** Belegt ein Werkzeug Strg+K schon? (`grep -rn "'k'" src/renderer`: die
Kundenansicht nutzt Strg+**Shift**+K.)

**Abnahme:** E2E: im Video-Konverter Strg+K, „timer“, Enter – Route `/tool/stage-timer`; in der
Kundenansicht öffnet sich nichts.

### B3 – Netzwerk-Scanner: sinnvoller Adapter vorgewählt

**Heute:** `NetScan.tsx` wählt den ersten Adapter der Liste vor
(`setIface((cur) => cur || list[0]?.address || '')`). Auf dem Entwicklungsrechner war das
„Ethernet 2 · 169.254.213.138“ – ein Anschluss ohne DHCP – statt des WLANs.

**So:** reine Funktion im Ordner des Werkzeugs: zuerst der zuletzt gewählte Adapter, wenn es
ihn noch gibt (gemerkt per `usePersistentState`), sonst der erste, dessen Adresse nicht mit
`169.254.` beginnt, sonst der erste. Die Auswahl selbst bleibt unverändert.

**Abnahme:** Unit-Test der Funktion (drei Fälle). `e2e/layout.mjs` prüft die Adapter-Liste
schon – dort darf nichts rot werden.

### B4 – Stopp-Symbole gefüllt

**Heute:** Das Stopp-Zeichen ist ein leeres Quadrat und sieht aus wie eine Checkbox – im
Stage-Timer steht es direkt über der echten Checkbox „blinkend“.

**So:** `fill-current` an den drei `Square`-Symbolen: `StageTimer.tsx` („Stopp“) und
`JinglePlayer.tsx` („Stopp (Esc)“ in der Leiste und das kleine am Pad). Sonst nichts.

### B6 – Startbildschirm: Namen und Beschreibungen ganz lesbar

**Heute:** Bei mittlerer Kachelgröße (Vorgabe) werden Namen abgeschnitten
(„LED-Wall-Konfigura…“, „Projektionsverhä…“, „Stromlast & Absi…“), Beschreibungen brechen
mitten im Satz ab. Eine mittlere Kachel hat für die Beschreibung zwei Zeilen zu etwa 26
Zeichen.

**So:**

- `ToolCard.tsx`: Auch bei mittleren und großen Kacheln darf der Name zwei Zeilen haben
  (`line-clamp-2` mit `softHyphenate` wie heute bei den kleinen), mit reservierter Höhe für
  zwei Zeilen, damit alle Kacheln gleich hoch bleiben.
- Beschreibungen (`description` in `tools/<id>/index.ts`) auf höchstens 50 Zeichen kürzen, das
  Wichtigste zuerst. **Begriffe, die dabei wegfallen, wandern in `keywords`** – die Suche liest
  beides.

| Werkzeug | Neue Beschreibung |
| -------- | ----------------- |
| Video-Player | Playlist-Player für LED-Wand und Beamer |
| Jingle-Player | Kurze Audios auf Pads, mit Hotkeys |
| Stage-Timer & Uhr | Sprechzeit-Timer und Uhr für die Bühne |
| Testbildgenerator | Testbilder und Testton für Beamer und LED |
| OSC-Steuerung | Frei belegbares Pult, sendet OSC |
| NovaStar-Steuerung | LED-Prozessor steuern: Helligkeit, Presets |
| ATEM-Steuerung | Blackmagic-Mischer vom Laptop bedienen |
| Netzwerk-Scanner | Geräte im Netz finden: IP, Hersteller, Typ |
| DMX-Dip-Schalter | DMX-Adresse ↔ Dip-Schalter |
| LED-Wall-Konfigurator | Wand planen: Auflösung, Strom, Verkabelung |
| Projektionsverhältnis | Abstand, Bildgröße und Objektiv des Beamers |
| Kameraobjektiv | Bildausschnitt aus Brennweite und Entfernung |
| Beamer-Lumen | Wie viel Lumen die Bildgröße braucht |
| Video-Konverter | Clips fürs Zielsystem: HAP, H.264, ProRes |
| Video-Generator | Bilder und Videos zu einem Video |
| Medien-Info | Eckdaten und Show-Check für Videodateien |
| Manuals-Bibliothek | Handbücher offline durchsuchen |
| YouTube-Downloader | Videos und Audio mit yt-dlp laden |
| Packliste | Material-Checkliste, auch aus der LED-Wall |
| Mini-Manual | Kurz-Anleitung und Fehlersuche als PDF |
| Stromlast & Absicherung | Leistung ↔ Strom, Geräte je Stromkreis |
| Rigging-Last | Auflager- und Bridle-Kräfte an der Traverse |
| Kreisrechner | Durchmesser, Umfang und Fläche |
| Audio-Delay & SPL | Laufzeit und Pegelabfall über die Distanz |
| RTA (Echtzeit-Analysator) | Spektrum und Pegel übers Mikrofon |
| Testtongenerator | Sinus, Rauschen, Sweep, Metronom, Kanaltest |
| Timecode-Rechner | Timecode ↔ Frames ↔ Echtzeit |

**Abnahme:** `e2e/smoke.mjs` („Alle Kacheln gleich hoch“) bleibt grün; neuer Schritt: bei
1366 × 768 und mittlerer Größe ist kein Name abgeschnitten (`scrollWidth` gleich `clientWidth`
bzw. nicht mehr als zwei Zeilen). Unit-Test über die Registry: Jede Beschreibung hat höchstens
50 Zeichen, und die Suche nach „prores“, „hap“, „madmapper“, „ptz“ und „handbuch“ findet weiter
das jeweilige Werkzeug. Die PWA zeigt dieselben Beschreibungen – `npm run pwa:build`.

### B7 – App-Einstellungen als Dialog mit Reitern

**Heute:** `AppMenu.tsx` klappt ein 340 px breites Feld mit acht Bereichen auf (Design,
Akzentfarbe, Anzeige, Projektordner, Firmenprofil, Online-Ablage, ffmpeg, yt-dlp). Bei 768 px
Fensterhöhe läuft es unten aus dem Bild und scrollt in sich.

**So:** Der Knopf öffnet einen Dialog (Muster `FirmenprofilDialog.tsx`: Rolle `dialog`, Esc und
Klick daneben schließen, Fokus bleibt im Dialog) mit `Reiter` aus `reiter.tsx`:
**Darstellung** (Design, Akzentfarbe, Anzeige), **Ordner und Profil** (Projektordner,
Firmenprofil, Online-Ablage), **Programme** (ffmpeg, yt-dlp). Die Inhalte bleiben die
vorhandenen Komponenten. Design, Akzent und Dichte wirken weiter sofort.

**Abnahme:** `e2e/layout.mjs` prüft das App-Menü (13 Akzentfarben, yt-dlp-Bereich) und
`e2e/mini-manual.mjs` das Firmenprofil über das Menü – beide anpassen. Neu: Bei 1024 × 600 liegt
der ganze Dialog im Fenster.

### B9 – „Über und Diagnose“: Version, Protokoll, Datenordner

**Heute:** Die App-Version steht nirgends. Das Protokoll (`avtoolbox-debug.log`) erreicht man
nur über einen Knopf in der Manuals-Bibliothek.

**So:** Vierter Reiter **Über** im Dialog aus B7: Version der App, von Electron, Chromium und
Node, ffmpeg und yt-dlp (beides gibt es schon), Betriebssystem. Knöpfe „Protokoll zeigen“
(`api.getLogPath` und `api.showItemInFolder` gibt es), „Datenordner öffnen“, „Angaben
kopieren“ (alles als Text, für eine Fehlermeldung). Neuer Kanal für die Versionsangaben nach
Skill `ipc-kanal`.

**Abnahme:** E2E: Reiter öffnen, die Version gleicht `package.json`; „Angaben kopieren“ füllt
die Zwischenablage (über die Brücke lesen).

### B10 – Mini-Manual: Schritt-Texte ganz sichtbar

**Heute:** Schritte und Fragen stehen in einzeiligen Feldern (`LiveInput` aus `textarea.tsx`,
verwendet in `BloeckeEditor.tsx` und `FehlersucheEditor.tsx`). Ein Satz, der länger ist als das
Feld, ist abgeschnitten; man sieht ihn nur in der Vorschau.

**So:** `TextArea` bekommt eine Art „wächst mit“: eine Zeile hoch, wächst mit dem Inhalt
(`field-sizing: content`, Chromium kann es), ohne Griff zum Ziehen. Für Schritt-Texte und
Fragen zusätzlich „einzeilig“: Enter übernimmt und fügt keinen Umbruch ein, eingefügte
Umbrüche werden zu Leerzeichen. Nur die Felder für Schritt-Text und Frage umstellen – Namen,
Kurznamen und Ähnliches bleiben `LiveInput`.

**Abnahme:** `e2e/mini-manual.mjs`: einen Schritt mit 120 Zeichen eintragen – das Feld ist
danach höher als eine Zeile, `scrollWidth` gleich `clientWidth`; im gespeicherten Text steht
kein Zeilenumbruch.

### B11 – Kundenansicht ohne Aufblitzen des Startbildschirms

**Heute:** In der Kundenansicht lädt das Hauptfenster erst den Startbildschirm; ein Effekt in
`launcher/Launcher.tsx` liest danach die Einstellung und springt ins Werkzeug. Für einen Moment
ist der Startbildschirm zu sehen und anklickbar.

**So:** `createMainWindow()` in `src/main/index.ts` liest `kioskToolId` aus den Einstellungen
und lädt gleich die Route `/tool/<id>?kiosk=1` (Kennung prüfen wie in `smallToolWindows.ts`:
nur Kleinbuchstaben, Ziffern, Bindestrich). Der Effekt im Launcher bleibt als Netz.

**Abnahme:** E2E mit `launchApp({ settings: { kioskToolId: 'media-info' } })`: Die erste
geladene Adresse des Hauptfensters endet auf `kiosk=1`; „Werkzeug suchen…“ war nie im Dokument
(im main die Navigationen mitschreiben).

### B12 – ATEM: Mischer im Netz suchen

**Heute:** Die Adresse des Mischers tippt man in `AtemControl.tsx` von Hand. Der
Netzwerk-Scanner erkennt ATEMs schon per UDP-Handshake (`probeAtem()` in `netscan/atem.ts`).

**So:** Knopf „Suchen“ neben dem Adressfeld: fragt über einen neuen Kanal alle Adressen der
lokalen /24-Netze ab (je Adapter, in Gruppen, mit dem Zeitlimit von `probeAtem`) und zeigt die
Treffer als Liste; ein Klick trägt die Adresse ein. Kein Treffer: „Kein Mischer gefunden – ist
er per Ethernet angeschlossen?“ Die Adressliste und das Gruppieren als reine Funktion.

**Skills:** `atem-steuerung`, `ipc-kanal`. **Abnahme:** Unit-Test der reinen Funktion (Netz
192.168.1.0/24 ohne die eigene Adresse; Netze größer als /24 werden auf das /24 um die eigene
Adresse begrenzt, wie im Scanner). Am echten Mischer von Hand – der Schein-Mischer der E2E
lauscht nur auf 127.0.0.1.

### B13 – Helles Design: Akzent als Schrift lesbar

**Heute:** Im hellen Design ist der Akzent als Schriftfarbe zu schwach: Gold
(`--primary: 41 96% 44%` in `main.css`) hat auf Weiß einen Kontrast von 2,5 : 1. Betroffen sind
alle Texte mit `text-primary` – Bereichstitel in Versalien, Kennzahlen, das Etikett der Leiste.
Üblich sind 4,5 : 1.

**So:** Eigene Variable für Akzent-**Schrift** im hellen Design, `--primary` bleibt für
Flächen und Rahmen:

- Reine Funktion neben den Akzenten in `accent.ts`: dunkelt eine Farbe (H S L) so weit ab, bis
  ihr Kontrast auf Weiß mindestens 4,5 : 1 ist.
- `cssFor()` setzt daraus `--primary-text` für `:root.light`; im dunklen Design ist
  `--primary-text` gleich `--primary`.
- Eine Regel in `main.css`: Im hellen Design nimmt `.text-primary` die neue Variable. So muss
  keine der vielen Stellen angefasst werden.

**Abnahme:** Unit-Test: Für alle 13 Akzente ist der Kontrast der Schrift-Variante auf Weiß
mindestens 4,5 : 1, und der Farbton bleibt gleich. E2E: im hellen Design hat das Etikett der
Ausgabe-Leiste eine dunklere Farbe als der Knopf „Vollbild starten“. Die PWA hat eigene Farben
(`src/pwa/colors.ts`) – nachsehen, ob sie dieselbe Regel braucht, und `npm run pwa:build`.

### B14 – Bibliothek des Players: Zustände auf Deutsch, Knöpfe per Tastatur, „Bibliothek leeren“ nennt die Playlist

**Heute** (beim Bau von P5 gesehen, 15. November 2026, nicht geändert):

- Die Import-Liste (`video-player/ConvertQueue.tsx`) zeigt den Zustand eines Auftrags roh:
  „queued“, „probing“, „thumbnail“, dazu „45%“. Video-Konverter und Video-Generator sagen
  „Warteschlange“, „Analyse“ (`STATUS_META` in `VideoConverter.tsx`, `STATUS` in
  `video-generator/JobList.tsx`).
- Die Knöpfe an einer Kachel der Bibliothek (zur Playlist, neu einbacken, löschen) erscheinen nur
  beim Darüberfahren (`opacity-0 group-hover:opacity-100` in `video-player/Library.tsx`); mit der
  Tastatur erreicht, bleiben sie unsichtbar.
- „Bibliothek leeren …“ fragt „Gesamte Bibliothek löschen? Die konvertierten Dateien werden
  entfernt.“ Der main leert dabei auch die Playlist (Befehl `clear` nach `libraryClear`), was
  läuft, stoppt – das sagt die Frage nicht.

**So:** deutsche Wörter für jeden Zustand des Imports, Prozent mit Leerzeichen („45 %“); die
Knöpfe der Kachel auch mit dem Tastaturfokus zeigen (`focus-within:opacity-100`, wie die Knöpfe
oben in der Vorschau der Bühne); die Frage nennt die Zahl der Medien und sagt, dass die Playlist
mitgeht und stoppt, was läuft (wie „Playlist leeren …“).

**Abnahme:** Unit-Test der Bezeichnungen (jeder `ConvertStatus` hat ein deutsches Wort).
`e2e/player-layout.mjs`: Tab bis auf den Papierkorb einer Kachel – seine Knopfleiste hat die
Deckkraft 1; die Rückfrage von „Bibliothek leeren …“ (Stub schreibt mit) nennt die Playlist.

## D – Rückgängig

**Heute:** Kein Editor der App kennt Strg+Z – weder die OSC-Fläche noch der Kabelverlauf, das
Mini-Manual, die Packliste, das Storyboard oder die Jingle-Pads (im Renderer kommt „undo“ nicht
vor). Eine gelöschte Kachel oder ein gelöschter Schritt ist weg. Das ist die größte einzelne
Lücke in der Bedienung.

Größe L. Bevor Code entsteht, wird daraus ein eigener Entwurf (Datei „PLAN-RUECKGAENGIG“ in
`docs/`). Wovon er ausgeht:

- **Ein Baustein für alle zustand-Stores**, rein und getestet: Er beobachtet einen Store, merkt
  sich frühere Stände des **Arbeitsstands** (nicht Bedienzustand, nicht die Bindung an eine
  Projektdatei) und kann zurück- und vorgehen. Je Store legt eine Funktion fest, was zum
  Arbeitsstand gehört.
- **Ein Schritt ist, was der Nutzer als eine Handlung erlebt:** Änderungen kurz hintereinander
  (Tippen in ein Feld, Ziehen eines Reglers) zählen als ein Schritt. Höchstens 50 Schritte.
- **Kein Schritt:** Laden einer Projektdatei, „Neu“, Übernahme aus einem anderen Werkzeug und
  der Abgleich mit einem anderen Fenster (`syncAcrossWindows` in `persistStorage.ts`) – sie
  leeren den Verlauf. Der Verlauf gehört dem Fenster und wird nicht gespeichert.
- **„Ungespeichert“ stimmt von selbst:** Der Punkt am Dateinamen kommt aus einem Vergleich des
  Standes mit dem gespeicherten (`projectFile.ts`); wer bis zum gespeicherten Stand zurückgeht,
  hat nichts Ungespeichertes mehr.
- **Tasten:** Strg+Z, Strg+Y und Strg+Shift+Z im Renderer, **nicht in Textfeldern** – dort gilt
  das Rückgängig des Feldes. Dazu zwei Knöpfe in der Leiste des Werkzeugs.
- **Reihenfolge:** OSC-Steuerung zuerst (dort schmerzt Löschen am meisten), dann
  LED-Wall-Konfigurator, Mini-Manual, Packliste, Video-Generator, Jingle-Player – je Werkzeug
  ein Pull Request mit E2E („löschen, Strg+Z, wieder da“).

**Video-Player:** Sein Zustand lebt im main, der Baustein für zustand-Stores deckt ihn nicht ab;
Löschen und Leeren fragen dort nach (P4, P5). Ein „Rückgängig“ ließe sich nachrüsten, die
Rückfrage steht dem nicht im Weg: für die Playlist klein (das Fenster merkt sich die Kennungen vor
dem Leeren und schickt sie per `replace` zurück; dazu braucht `toast` einen Knopf), für die
Bibliothek mittel – heute löscht `deleteMedia` Datei, Miniatur und Datenbank-Zeile sofort; nötig
wäre ein Papierkorb im main (Dateien verschieben, Zeile merken, nach Ablauf oder beim Beenden
endgültig löschen, `conv_key` beim erneuten Import beachten), und die Playlist-Plätze, die
`dropMediaFromPlaylist` entfernt, müssten mit zurück.

Offen und im Entwurf zu klären: Wie fasst man Änderungen aus gepufferten Feldern (`useDraft`,
Übernahme nach 250 ms) zu einem Schritt zusammen? Was passiert mit Fotos des Mini-Manuals, die
ein rückgängig gemachter Schritt wieder braucht? Soll ein Hinweis sagen, was zurückgenommen
wurde („Kachel wiederhergestellt“)?


## F – Mehr Nutzen

Vier ausgearbeitete Pakete, darunter die Wünsche je Werkzeug und die Verzahnung.

| Paket | Inhalt | Größe | Braucht |
| ----- | ------ | ----- | ------- |
| **F1** | Sicherung und Umzug auf einen anderen Rechner | L | eigener Entwurf nötig |
| **F2** | Show-Datei: OSC, Jingle, Timer, Packliste in der `.mottul` | M je Werkzeug | – |
| **F3** | Stage-Timer: Schnellstart, bis Uhrzeit, Ablauf einfügen | S–M | besser nach W2 |
| **F4** | Steuer-Schnittstelle dokumentieren | S | – |

### F1 – Sicherung und Umzug auf einen anderen Rechner

**Wozu:** Der Ersatz-Laptop für die Show soll in einer Minute dieselben Einstellungen,
OSC-Projekte, Jingles, Bausteine und das Firmenprofil haben.

**Größe L, eigener Entwurf nötig.** Richtung: „Sicherung speichern …“ und „Sicherung einlesen …“
im Reiter „Ordner und Profil“ der App-Einstellungen. Eine Datei (ZIP wie die Projektdatei, der
Leser und Schreiber in `zip.ts` ist da) mit `settings.json`, den Ständen der Werkzeuge, den
eigenen Bausteinen und dem Firmenlogo; die Jingle-Dateien wahlweise dazu. Einlesen ersetzt
nach Rückfrage und legt vorher eine Sicherung des jetzigen Stands ab. Zu klären: Pfade, die
auf dem anderen Rechner nicht stimmen (Zielordner, Projektordner), die Player-Bibliothek (groß,
eher nicht), Versionen.

### F2 – Show-Datei: weitere Werkzeuge in der `.mottul`

Die Projektdatei hat heute Abschnitte für LED-Wall und Mini-Manual. Nach Skill `projektdatei`
je Werkzeug ein Pull Request: zuerst **Packliste** (bringt die Ersatzteile ins Mini-Manual), dann
**OSC-Steuerung** (hat heute gar keinen Export – Projekte lassen sich weder weitergeben noch
sichern), **Jingle-Player** (Belegung; die Audiodateien als Anhang wie die Fotos des
Mini-Manuals) und **Stage-Timer** (Abschnitte und Schwellen). Das ist der erste Schritt zum
Show-Profil (V4); „Event öffnen …“ folgt mit MM5.

### F3 – Stage-Timer: Schnellstart, bis Uhrzeit, Ablauf einfügen

Drei unabhängige Pakete:

- **Schnellstart (S):** Im leeren Timer Knöpfe „5 · 10 · 15 · 20 · 30 min“ – ein Klick legt
  einen Abschnitt an und macht ihn startbereit. Heute muss man erst einen Abschnitt anlegen und
  die Zeit eintippen.
- **Bis Uhrzeit (M):** ein Abschnitt, der auf eine Uhrzeit herunterzählt („Beginn 20:00“).
  Zustand und Ablauf leben im main (`stageTimer.ts`); auch die Fernsteuerung und die
  Bühnen-Anzeige müssen ihn kennen (Skill `fernsteuerung-seite`).
- **Ablauf einfügen (S–M):** Zeilen aus Excel einfügen („Titel ⇥ Dauer“, auch „Redner ⇥ Titel ⇥
  Dauer“), Dauer als `mm:ss` oder Minuten. Reiner Leser mit Tests, Vorschau vor dem Übernehmen.

### F4 – Steuer-Schnittstelle dokumentieren

Die Fernsteuerungen nehmen Befehle als `POST api/command` an – das taugt für Companion, Stream
Deck und eigene Skripte, steht aber nirgends. Neuer Abschnitt in `docs/FERNSTEUERUNG.md`: je
Werkzeug Adresse, Befehle mit Feldern und Grenzen (aus den Prüfern: `parseTimerCommand` in
`timerRemoteServer.ts`, `parsePlayerRemoteCommand` in `player/remoteCommand.ts`, die Prüfer von
OSC und Jingle), `api/state` zum Lesen, je ein Beispiel mit `curl`. Hinweis: ohne
`Origin`-Kopfzeile schicken (Herkunftsprüfung). Ein Test hält die Liste der Befehle in der
Doku und im Code gleich.

### Wünsche je Werkzeug

Funktionen nach Show-Bedarf. Noch keine Aufträge: Wer einen Punkt umsetzt, arbeitet ihn zuerst als
Paket aus (Heute, So, Abnahme) und lässt es freigeben.

| Punkt | Werkzeug | Inhalt |
| ----- | -------- | ------ |
| **F6** | OSC-Steuerung | MadMapper-Vorlagen (Surfaces, Medien, Cues) – bisher gibt es nur Beispiel-Kacheln |
| **F7** | OSC-Steuerung | „Restzeit aus OSC-Position“: Anzeige-Modus, der aus der eingehenden MadMapper-Position (0–1) und einer eingetragenen Clip-Dauer die Restzeit als mm:ss errechnet – MadMapper liefert nur die Position. Die Restzeit des eigenen Video-Players kann die Anzeige schon |
| **F8** | OSC-Steuerung | OSC-Trigger aus anderen Werkzeugen: Jingle-Player, Stage-Timer und Video-Player senden OSC |
| **F9** | OSC-Steuerung | Weitere Bedienelemente: Auto-Center-Fader/Wippe (federt in die Mitte zurück – Jog, PTZ, Speed), Tap-Tempo/BPM, Set-Wechsel-Knopf, Farbregler wahlweise vertikal |
| **F10** | NovaStar-Steuerung | Testbild; Ist-Zustand vom Gerät lesen (heute zeigt die Oberfläche den zuletzt gesendeten Stand); weitere Modelle (VX-Serie, MCTRL) |
| **F11** | Video-Player | Logo-Overlay (PNG mit Alpha; Größe, Position, Deckkraft – als Ebene, nicht eingebacken) |
| **F12** | Video-Player | Playlist beim Start von selbst laden und abspielen, Loop und Zufall über einen Neustart merken – heute heißt es nach dem Einschalten „Playlist antippen“ |
| **F13** | Video-Konverter | ProRes auf der GPU auch unter Windows/Linux (ffmpegs neuer `prores_ks_vulkan`) prüfen; ProRes 4444 mit Alpha über VideoToolbox freigeben, sobald auf einem Mac bestätigt (heute geht Transparenz bewusst über die CPU) |
| **F14** | Stage-Timer | Steuerung per OSC (Start, Pause, ±1 min aus Companion oder Stream Deck) – heute nur über die HTTP-Fernsteuerung, siehe F4 |
| **F15** | Testbildgenerator | AV-Sync auch als Video mit Ton exportieren (für Medienserver und Player ohne Mottulbox) |
| **F16** | Jingle-Player | Ducking, MIDI-Pads |
| **F17** | Manuals-Bibliothek | OCR für gescannte PDFs; Stecker-/Kabel-Kompendium mit Pin-Belegungen, Steckertypen und technischen Daten |

### Verzahnung

Was heute zwischen den Werkzeugen übergeben wird, steht in
[WERKZEUGE.md](WERKZEUGE.md#übergaben-zwischen-werkzeugen). Geplant, ebenfalls erst auszuarbeiten:

| Punkt | Inhalt |
| ----- | ------ |
| **V1** | **Übergabe-Speicher verallgemeinern.** Heute gibt es nur einen NovaStar-IP-Slot; deshalb setzt „IP in der OSC-Steuerung verwenden“ nur die NovaStar-IP, nicht das OSC-Ziel. Ein Slot „Wert + Zielwerkzeug“ ist die Grundlage für alles Weitere – auch für „In der ATEM-Steuerung verwenden“ im Netzwerk-Scanner (bis dahin sucht B12 den Mischer selbst) |
| **V2** | **LED-Wall → Stromlast und Rigging:** Gewicht und Stromaufnahme sind schon berechnet |
| **V3** | **Packliste aus mehr Quellen:** Rigging (Anschlagmittel je Bridle), Stromlast (Kabel und Verteiler je Kreis), ATEM (Mischer, Kabel, Tally) |
| **V4** | **Show-Profil:** Wandauflösung, Geräte-IPs, NovaStar- und OSC-Ziele und Packliste werkzeugübergreifend speichern und als „Event“ laden. Grundlage ist die Projektdatei `.mottul` (ein Abschnitt je Werkzeug, heute LED-Wall und Anleitung). Der Weg: F2 (weitere Abschnitte), dann MM5 („Event öffnen …“) |
| **V5** | **ATEM:** Standbild aus Testbild und Video-Generator per `uploadStill` in den Media-Pool; das Kapitel Bedienfeld des Mini-Manuals übernimmt Seiten und Makro-Namen; später ein Kachel-Ziel „ATEM“ in der OSC-Steuerung, damit Companion und Stream Deck über OSC mitschalten und SuperSource-Layouts abrufen |

## Große Vorhaben mit eigenem Entwurf

Vier Vorhaben sind zu groß für ein Paket. Ihr Entwurf – Aufbau, Messwerte, Festlegungen,
Stolpersteine – steht je in einem eigenen Dokument; hier steht, was davon offen ist. Vor jeder
Phase den Entwurf und den genannten Skill lesen.

### AT – ATEM-Steuerung

Entwurf: [PLAN-ATEM.md](PLAN-ATEM.md), Skill `atem-steuerung`. **Gebaut:** Dienst, Simulator
(Probebetrieb), Verbinden und die Seiten Mischen, Keyer, Makros, Medien und AUX als Pult (Phasen 1
und 2); die Probe ohne Mischer (Installer auf drei Systemen, Schein-Mischer im E2E). Die Seite
„Mischen“ lief am ATEM Mini Extreme. Offen:

| Paket | Inhalt | Fertig, wenn | Braucht |
| ----- | ------ | ------------ | ------- |
| **AT0** | Rest der Probe am Gerät: Verbinden aus dem Installer unter Windows und macOS; Messungen zur Animation (Länge einer Makro-Pause bei 25p und 50p, wirken mehrere Box-Befehle im selben Bild, wie viele Schritte fasst ein Makro, Dauer des Hochladens, direkte Befehle je Bild); USB-Ausgang des Extreme als Kamera im Fenster samt Bus und Verzögerung | der Installer verbindet sich unter Windows und macOS (sonst Entscheidung: `disableMultithreaded`, Abhängigkeit ersetzen oder eigener, kleiner Protokoll-Client); der Weg der Animation steht fest | Mischer |
| **AT3** | SuperSource: Seite mit Boxen, Quellen, Beschnitt, Art und Layouts, Abschnitt in der Projektdatei | Layout anlegen, abrufen, in anderem Projekt laden; Abnahme am Mischer | – |
| **AT4** | Animation: Schritte je Bild, Kurven, Makro und direktes Senden, Abbruch | ein Wechsel läuft bei 25p und 50p ohne Sprung und endet exakt im Ziel, belegt an einer Aufnahme | AT0, AT3, Entscheidung 9 |
| **AT5** | Multiview: Kamera-Gerät wählen, USB-Ausgang umschalten, Bild mit Raster, Tally, Klick schaltet, eigenes Fenster, Ansicht ohne Bild | das Bild steht im Werkzeug, die Fenster treffen bei jeder Aufteilung; Abnahme am Mischer | AT0 – hängt sonst nur an der Seite „Mischen“ und lässt sich vorziehen |
| **AT6** | Ton: Master und Eingänge, Pegel, Stream und Aufzeichnung | beide Ton-Welten (klassisch, Fairlight) laufen, mindestens im Simulator | – |
| **AT7** | Eigene Seiten auf dem Raster der OSC-Steuerung, Abschnitt in der Projektdatei | Seite anlegen, speichern, in anderem Projekt laden | – |
| **AT8** | Handy: Steuerseite, Fernsteuer-App | das Tablet schaltet, ohne PIN geht nichts | S1 |
| **AT9** | Pult für große Mischer und Finger: Bänke (heute brechen die Reihen um), größere Reiter für Touch | – | bei Bedarf |

- **Die Abnahmen am Mischer** für das Gebaute stehen unter
  [Abnahmen am Gerät](#abnahmen-am-gerät); Rückmeldungen daraus gehören in einen neuen Branch ab
  `main`.
- **Bedienung besprechen, nicht eigenmächtig umbauen** (Wunsch von Matthias, 1. November 2026):
  erst den Entwurf zeigen, bauen nach Zustimmung.
- **Später:** Animation auch für DVE-Keyer (für Mischer ohne SuperSource; dort gibt es zudem die
  eingebauten Fly-Keys), Fensterbelegung des Multiview ändern, HyperDeck, mehrere Mischer
  gleichzeitig, Kamerasteuerung, automatisches Umschalten nach Tonpegel.

### MM – Mini-Manual

Entwurf: [PLAN-MINI-MANUAL.md](PLAN-MINI-MANUAL.md), Skills `projektdatei`, `kabelverlauf`,
`anleitung-inhalte`. **Gebaut:** Projektordner und Projektdatei, das Werkzeug mit Handbuch,
Kurzkarte und Handy-Fassung, Online-Ablage, mehrere Wände, Kabelverlauf mit Prozessor, Strom und
Glasfaser, Tastenfeld-Editor und die Übernahme aus Jingle-Player, OSC-Steuerung und Video-Player
(Phasen 0 bis 2b und der größte Teil von Phase 3). Offen:

| Paket | Inhalt | Fertig, wenn | Braucht |
| ----- | ------ | ------------ | ------- |
| **MM3** | Importe für Bedienfelder, je Format ein Pull Request: OBS-Szenensammlung (am einfachsten – eine Beispieldatei liegt im Ordner `Beispiele/`), Companion, Stream-Deck-Profil. Mit dem ersten Import der Skill „fremdformat-import“ (anonymisierte Beispieldateien als Fixtures, Größen- und ZIP-Grenzen, tolerant lesen, nichts ausführen, Zugangsdaten verwerfen) | Bedienfeld- und Szenenseiten ohne Abtippen; je Format ein Test mit Beispieldatei | Beispieldateien (Entscheidung 12) |
| **MM4** | Weitere Quellen: MadMapper live über OSCQuery (erst testen, ob Namen von Timelines und Szenen im Baum stehen), MadMapper-Datei nur nach Prüfung echter Dateien, NovaLCT nur bei Bedarf, OBS live, Resolume als Ausblick | Cue- und Szenenlisten automatisch | Beispieldateien, MadMapper zum Testen |
| **MM5** | Team und Gesamtprojekt: Bausteinordner für Kollegen (geteilter Ordner, eine Datei je Baustein), Etiketten für Kabel und Geräte, „Event öffnen …“ am Startbildschirm (listet die Abschnitte einer Datei und bindet die gewählten Werkzeuge – eine Aktion, kein Zustand), Dateizuordnung `.mottul` (braucht `perMachine: true` im Installer) | ein Projekt für Planung, Material und Übergabe | F2 |
| **MM6** | Kleinigkeiten, je für sich: Foto-Speicher aufräumen (heute wächst er nur – etwa Fotos löschen, die seit 180 Tagen weder eingefügt noch geöffnet wurden und in keinem Arbeitsstand stehen); Logo als SVG (muss vorher bereinigt werden); eingebettete Schrift im PDF (heute Systemschriften, je Betriebssystem anders – im Probedruck prüfen); Drehregler und Touchleisten im Tastenfeld-Editor (stehen vorerst in der Notiz); Vorschaubilder der Clips bei der Übernahme aus dem Video-Player | – | – |

- **Laufend:** weitere Fehlerfälle aus der Praxis in die Bibliothek (Skill `anleitung-inhalte`).
- **Im Betrieb nachsehen** (halten nichts auf): Redundanz-Paare 5 → 6 und 7 → 8 am Tessera S8;
  Empfangskarte und Prozessor des rX3ioBF – beides unter
  [Abnahmen am Gerät](#abnahmen-am-gerät).
- **Die Oberfläche** (Formular und Vorschau) ist Paket W5.

### VG – Video-Generator

Entwurf: [PLAN-VIDEO-GENERATOR.md](PLAN-VIDEO-GENERATOR.md) mit den geprüften ffmpeg-Befehlen,
Messwerten und Stolpersteinen; Skills `ffmpeg-labor`, `konvertierungs-kern`. **Gebaut:** Phasen 0
bis 2 – Storyboard, Übergänge, Ken Burns, nahtlose Schleife, Musik, Live-Vorschau und „Vorschau
rechnen“. Offen:

| Paket | Inhalt | Größe | Braucht |
| ----- | ------ | ----- | ------- |
| **VG3** | Nach Bedarf, je für sich: Titel- und Texttafeln (im Renderer gezeichnet → PNG → Standbild-Element, wie der Testbild-Export), eingebackenes Logo (`overlay`, PNG mit Alpha), Farbkorrektur/LUT (`lut3d`), benannte Projekt-Vorlagen, Transparenz (HAP Alpha, ProRes 4444) | je M | – |
| **VG4** | Zwei offene Messungen: die 4:4:4-Zwischenstufe für ProRes- und HAP-Ziele (gemessen ist nur `yuv420p`) und der Neustart des Players an der Naht einer nahtlosen Schleife | S–M | erst messen |

- **Später:** Schnitt auf den Takt der Musik, „ein Video je Ordner“.
- **Die Oberfläche** (Storyboard und Vorschau gleichzeitig sichtbar) ist Paket W1.

### ST – Stream fürs Heimnetz (Heimkino-Box)

Entwurf: „Live-Bild von der Mottulbox auf die Heimkino-Box“ – er liegt im Heimkino-Projekt
(PLAN-STREAM.md im Ordner project_MI), weil er Sender und Empfänger umfasst; die Stufen dort
gelten. Skills `ffmpeg-labor` (Messungen zu Bild- und Ton-Zeit), `electron-e2e` (`stream.mjs`).
**Gebaut:** Stufe 1 (Stream vom Stage-Timer, #243), die Hänger daraus behoben (#245), Stufe 2
(Video-Player mit Ton, Erfassung mit NDI geteilt, #246), Ton und Bild auch am Mac zusammen (#248:
der Sender misst laufend, wie viel später das Bild in den Strom kommt – Phase der Anzeige im
Spiegel, Weg zum paint, Raster von ffmpeg – und legt den Ton so viel später), auch unter Last
(#249: zu früh gemeldete Renderzeiten werden nicht mehr zum Anker des Tons, ein neuer Weg rückt
den Ton nur um die Änderung, vom Spiegel gelten nur Sprünge, die Bilder gehen über TCP statt
stdin), NDI und Stream in voller Größe auch auf kleinem Bildschirm (#251: Electron begrenzte das
unsichtbare Fenster auf die Arbeitsfläche, 1920 × 1080 kam als 1920 × 1032), und der Stream
zählt im Protokoll, wie oft der main stockt (#253: „main-Prozess stockte“ – „Bild spät an
ffmpeg“ sah das nicht). Offen für die Mottulbox:

| Paket | Inhalt | Größe | Braucht |
| ----- | ------ | ----- | ------- |
| **ST4** | Ankündigen per mDNS (Dienst _mottulbox._tcp, TXT: Name, Pfad /live.ts, Werkzeug), Feld „Name“ im Bereich „Stream fürs Heimnetz“; abmelden beim Stoppen und Beenden | M | Stufe 3 im Heimkino-Projekt (Empfang mit Adresse von Hand) |
| **ST5** | Doku für Anwender (Seite oder Abschnitt zum Stream, Eintrag im README) | S | ST4 |
| **ST6** | Entwurf: [PLAN-BILDZEIT.md](PLAN-BILDZEIT.md) (Messung abgeschlossen in #250, Empfehlung: der Spiegel zeichnet Video und Kennung selbst). **Entschieden wird nach der Abnahme am Mac** (Matthias, 22.11.2026): Stockt der main dort so wie auf dem macOS-Runner? Das zeigt seit #253 die Protokollzeile „main-Prozess stockte“ ([Abnahmen am Gerät](#abnahmen-am-gerät)). Bilder mit Zeitstempeln aus dem Spiegel statt aus dem main. Heute stempelt ffmpeg ein Bild beim Lesen; stockt der main-Prozess, kommt das paint zu spät, und das Bild liegt so viel zu spät im Strom (macOS-Runner, #249: paint bis 200 ms nach der Anzeige im Spiegel, Blitz −92 ms; der Ton ist davon frei, er bekommt seine Zeit im Spiegel). Bauen: ffmpeg zählt die Bilder (`setpts` wie `asetpts` beim Ton), der Sender legt jedes Bild nach seiner Anzeigezeit in den Takt und füllt Lücken; Hänger, Neustart und Standbild wie heute. Bis dahin ist der macOS-Lauf der CI im Schritt „Ton lippensynchron“ wackelig. Abnahme: macOS-Job mehrmals neu gestartet grün, Laufnummern im PR | L | Abnahme am Mac |

- **Offene Frage aus dem Entwurf:** nur Video-Player und Stage-Timer – oder später auch
  Testbildgenerator und die Vorschau des Video-Generators?

## G – Neue Werkzeuge

Steckbriefe, keine Aufträge. Jedes Werkzeug bekommt vor der Umsetzung einen eigenen Entwurf
(`docs/PLAN-<NAME>.md`) und folgt dem Skill `neues-werkzeug`. Geordnet nach Nutzen je Aufwand.
Neue Werkzeuge entstehen gleich nach dem [Leitbild](#leitbild-zwei-muster): kleine nach Muster 2
und auch in der PWA, große mit mehreren Bereichen nach Muster 1.

| Nr. | Werkzeug | Wozu | Baut auf | Größe |
| --- | -------- | ---- | -------- | ----- |
| **G1** | **Betrachtungsabstand und Schriftgröße** | Ab welchem Abstand sieht man die Pixel, wie groß muss Schrift auf Wand oder Leinwand sein | Rechner-Bausteine, Daten der LED-Module; auch in der PWA | S–M |
| **G2** | **IP- und Subnetz-Rechner** | Netz, Maske, Bereich für Dante, NDI, AV-over-IP | Rechner-Bausteine; passt zum Netzwerk-Scanner | S–M |
| **G3** | **Show-Check für den Rechner** | Ampel vor der Show: Netzteil, Energieplan, Benachrichtigungen, Monitore und Skalierung, freier Speicher, Audiogeräte, GPU-Encoder | Ampel-Muster der Medien-Info, Encoder-Erkennung | M |
| **G4** | **Cue-Liste** | Ein „Go“ löst nacheinander aus: Clip im Player, Jingle, OSC-Befehl, ATEM-Makro, Timer-Start – macht aus der Werkzeugkiste eine Show-Steuerung | Befehle aller Werkzeuge im main; eigener Abschnitt in der `.mottul` | L |
| **G5** | **Teleprompter** | Lauftext auf dem Referentenmonitor | Ausgabefenster und Fernsteuerung des Stage-Timers | M |
| **G6** | **Art-Net/sACN-Tester** | DMX übers Netz senden, Geräte finden | UDP wie OSC; DMX-Dip-Schalter | M–L |
| **G7** | **Bauchbinden** | Name und Titel einblenden – per NDI mit Transparenz oder als Key für den ATEM | NDI-Sender, ATEM-Steuerung | L |
| **G8** | **PTZ-Steuerung** | Kameras per VISCA over IP: Presets, Schwenk, Zoom | Netzwerk-Scanner erkennt PTZ-Kameras schon | L |
| **G9** | **Patchliste und Stageplot** | Kanalliste und Bühnenplan als PDF | Druck-Bausteine, Projektdatei | L |
| **G10** | **LTC-Generator und -Leser** | Timecode als Ton ausgeben und mitlesen | Testton, Timecode-Rechner | M–L |
| **G11** | **Weitere Rechner** | Spannungsabfall und Kabelquerschnitt (an die Stromlast angedockt), Edge-Blend (Beamer-Softedge), Video-Datenrate und Dateigröße, Gel-/Farbfilter (Lee ↔ Rosco ↔ RGB), Funkfrequenz-Planer, Sonnenstand und Dämmerung für Open-Air | Rechner-Bausteine; auch in der PWA | je S–M |
| **G12** | **DMX-Universum-Planer** | Automatische Adressvergabe, Kollisions-Check | DMX-Dip-Schalter; zusammen mit G6 | M |
| **G13** | **Manuals am Tablet oder Handy** | Handbücher als eigene App (z. B. Capacitor); Konverter und Testbilder bleiben am Desktop | Manuals-Bibliothek | L, Idee |

## S – Sicherheit und Auslieferung

Was die App heute schützt, steht in [SICHERHEIT.md](SICHERHEIT.md). Offen:

| Paket | Inhalt | Größe | Braucht |
| ----- | ------ | ----- | ------- |
| **S1** | **PIN oder Token für die Fernsteuerungen** (optional): Sie sind ohne Passwort; Befehle werden geprüft, Uploads begrenzt, Websites abgewiesen – wer im selben Netz ist, kann aber steuern. Voraussetzung für die ATEM-Steuerung vom Handy (AT8) | M | – |
| **S2** | **CSP ohne `'unsafe-inline'`** für Skripte im Produktiv-Build; braucht eine eigene Dev-CSP, weil der Vite-Dev-Server eine Inline-Präambel lädt. (`'unsafe-eval'` ist bereits entfernt.) | M | – |
| **S3** | **App-Aktualisierung** (`electron-updater` über GitHub Releases): Electron mit Chromium und alle npm-Pakete kommen heute nur mit einem neuen Installer – selbst aktuell halten sich nur ffmpeg und yt-dlp. Die Installer baut die CI schon und legt sie bei einem Tag `v*` als GitHub Release ab („Installer bauen“); `electron-updater` braucht dort zusätzlich die `latest*.yml` und `.blockmap`-Dateien. Windows warnt ohne Signatur beim Installieren, macOS geht nur mit einem Apple-Entwicklerzertifikat | L | – |
| **S4** | **NDI im Installer:** Die Lizenz erlaubt die Weitergabe mit Auflagen, die die App noch nicht erfüllt – siehe [NDI.md](NDI.md) | M | S3 |

## E – Aufräumen und Qualität

| Paket | Inhalt | Größe | Braucht |
| ----- | ------ | ----- | ------- |
| **E1** | Große Komponenten teilen | M je Datei | – |
| **E2** | `shared/types.ts` nach Bereichen teilen | M | – |
| **E3** | Lint mit Typwissen, E2E-Skripte linten | M | – |
| **E4** | Werkzeug-Stände als Dateien statt Local Storage | L | eigener Entwurf nötig |
| **E5** | ffmpeg mit niedriger Priorität, solange eine Ausgabe läuft | M | erst messen |
| **E6** | Kleinkram: Beispiele-Ordner, Prüfung der Werkzeug-Zahl in der Doku | S | Entscheidungen 7 und 8 |
| **E7** | Tests für Player-Zustand, yt-dlp und Fernsteuer-Parser | M | – |
| **E8** | Komponententests möglich machen | M | – |
| **E9** | Handy-Steuerseiten als echte Dateien | L | eigener Entwurf nötig |
| **E10** | Menü-Baustein in LED-Wall-, Datei- und Handy-Menü | S | – |

### E1 – Große Komponenten teilen

Sechs Dateien tragen zu viel in einer Komponente: `Rta.tsx` (818 Zeilen, 3 Funktionen, 10
Effekte), `VideoConverter.tsx` (1106 Zeilen, 6 Funktionen), `MediaInfo.tsx` (1008),
`led-wall/Settings.tsx` (921), `video-generator/Inspector.tsx` (915), `StageTimer.tsx` (837).
Vorbild ist `VideoPlayer.tsx`, das so von 1.765 auf unter 300 Zeilen kam.

**So:** Skill `aufraeumen` (Helfer `teilen.mjs`, Pixelvergleich `pixel.mjs`): je Datei ein Pull
Request, **ohne sichtbare Änderung** – das E2E des Werkzeugs und der Pixelvergleich vor und
nach dem Umbau sind die Abnahme. `StageTimer.tsx` erst nach dem Umbau auf die Arbeitsfläche
(Paket W2), `Rta.tsx` erst nach K6 – sonst wird zweimal umgebaut.

### E2 – `shared/types.ts` nach Bereichen teilen

1985 Zeilen, 199 Exporte. Je Bereich eine Datei (Player, Timer, Konvertierung, Video-Generator,
OSC, ATEM, Netzwerk, Einstellungen …) in einem neuen Ordner unter `src/shared/`; `types.ts`
bleibt als Sammel-Export, damit kein Import brechen muss. `AppSettings` und `DEFAULT_SETTINGS`
kommen zuletzt. Skill `aufraeumen` (`move.mjs` rechnet Importe neu). Abnahme: Typecheck und
Tests unverändert grün; die gebaute `index.js` des main-Prozesses (unter out/main) ist vor und
nach dem Umbau gleich bis auf Namen.

### E3 – Lint mit Typwissen, E2E-Skripte linten

**Heute:** `eslint.config.mjs` lintet bewusst ohne Typen (schnell). Damit fehlt
`no-floating-promises` – gerade bei IPC nützlich, wo ein vergessenes `await` oder `void` einen
Fehler verschluckt. `e2e/` (rund 9.000 Zeilen) und `scripts/` sind vom Lint ausgenommen.

**So:** Zuerst messen: Laufzeit und Zahl der Funde mit `no-floating-promises` und
`no-misused-promises` für `src/`. Bleibt der Lauf unter etwa 30 Sekunden, die beiden Regeln als
Fehler aufnehmen und die Funde beheben (kein pauschales Abschalten). `e2e/` und `scripts/` mit
den Grundregeln für JavaScript linten (ungenutzte Variablen, nicht definierte Namen).

### E4 – Werkzeug-Stände als Dateien statt Local Storage

**Heute:** OSC-Projekte, Packlisten, Jingle-Belegung, Anleitungen und Planungen ohne Datei
liegen in Chromiums `Local Storage/` im Benutzerordner. Das ist der einzige Speicherort ohne
Wiederherstellung – `settings.json` und `library.db` werden bei einem Defekt gesichert und neu
angelegt, dieser nicht – und er ist für alle Werkzeuge zusammen begrenzt.

**Größe L, eigener Entwurf nötig.** Richtung: je Store eine Datei im Benutzerordner, geschrieben
vom main (atomar wie `settings.json`, mit Sicherung des vorigen Stands), der Renderer spricht
über einen Kanal statt über `localStorage`; Umzug der vorhandenen Stände beim ersten Start. Zu
klären: Abgleich zwischen Fenstern (heute über das `storage`-Ereignis), die Rechner-PWA (hat
keinen main), Tests. Etwas Druck nimmt schon heraus, dass ein gescheitertes Speichern seit
November 2026 gemeldet wird und der Stand bis zum Schließen erhalten bleibt
(`setStorageErrorHandler` in `persistStorage.ts`); F1 nimmt weiteren.

### E5 – ffmpeg mit niedriger Priorität, solange eine Ausgabe läuft

**Idee:** Ein Import oder eine Konvertierung während der Show konkurriert mit der Wiedergabe um
die Rechenzeit. ffmpeg könnte mit niedrigerer Priorität laufen, solange eine Ausgabe oder NDI
aktiv ist (`os.setPriority` auf den Prozess in `runFfmpeg.ts`).

**Erst messen** (Skill `ffmpeg-labor`): Ruckelt die Wiedergabe heute überhaupt, wenn nebenher
vier Importe laufen – und wird es mit niedriger Priorität besser? Ohne messbaren Gewinn
entfällt das Paket. Mit Gewinn: der Schalter „Ausgabe läuft“ kommt als Rückruf in den Läufer,
nicht per Import aus `beenden/laufend.ts` (Kreis in den Importen).

### E6 – Kleinkram

- **Ordner `Beispiele/`** (liegt unversioniert im Projekt, `npm run format:check` scheitert
  lokal daran): in `.gitignore` und `.prettierignore` eintragen – oder einchecken und
  formatieren (Entscheidung 7).
- **Zahl der Werkzeuge:** Seit dem Testtongenerator (13. November 2026) nennen `README.md` und
  `docs/WERKZEUGE.md` die richtige Zahl (27). Offen: `scripts/check-doc-refs.mjs` um eine
  Prüfung ergänzen – die Zahl vor „Werkzeuge“ in beiden Dateien gleicht der Zahl der Einträge
  in `tools/registry.ts`, sonst läuft sie beim nächsten Werkzeug wieder auseinander.
- **Liegengebliebener Worktree** `.claude/worktrees/wonderful-taussig-0eac94` (1,8 GB, Branch
  `electron-45-pruefung`, Stand ist in main): nur auf ausdrücklichen Wunsch entfernen
  (Entscheidung 8). Ebenso liegt seit #243 der Worktree von Stufe 1 des Streams unter
  .claude/worktrees/stream-stufe1 (ohne Branch, Stand ist in main).
- **Startbildschirm, Video-Player:** Die Kachel zeigt „Ausgabe“ beim Ausgabefenster und seit
  Stufe 2 des Streams auch beim Stream, aber nicht bei NDI (der Stage-Timer schon). Wie dort
  `ndiActive` in den Player-Zustand (`playerState.ts`, `useToolActivity.ts`). Gefunden am
  21. November 2026.

### E7 – Tests für Player-Zustand, yt-dlp und Fernsteuer-Parser

Drei Stellen mit Lücken: `playerState` hat seit P6 einen Test für die Plätze in der Playlist, seit
P7 auch für den gewürfelten Platz bei Zufall, seit P8 für ✕ am laufenden Eintrag
(`playerState.test.ts`, Bibliothek und Einstellungen per `vi.mock`, Zufall per
`vi.spyOn(Math, 'random')`) – darauf aufbauen für die
Wiedergabe (`next`, `prev`, `ended` mit Loop und Zufall), `replace` und die Einstellungs-Befehle;
dazu die yt-dlp-Argumente und -Ausgabezeilen sowie die Parser der Fernsteuerungen (Body, OSC- und
Jingle-Befehle, Upload). Je Stelle ein Pull Request, ohne Änderung am Verhalten.

### E8 – Komponententests möglich machen

Vitest sammelt Dateien mit der Endung „.test.tsx“ schon ein, sie laufen aber ohne DOM. jsdom und
@testing-library ergänzen (Skill `abhaengigkeiten`: Pakete mit 7 Tagen Abstand), ein erster Test
für einen Baustein aus `tools/_calc/ui.tsx` als Vorbild – naheliegend `NumField` (rot bei
Fehleingabe, `invalid`, `signed` und `digits` → `inputMode`) und `Readout` mit `tone`, die seit
K2 und K3 nur E2E-Schritte (`aria-invalid` und `inputmode` in einzelnen Rechnern) und ein
Wegwerf-Vergleich des HTML prüfen. Danach lassen sich Bausteine wie `FoldCard` und `Segmented` ohne E2E prüfen.

### E9 – Handy-Steuerseiten als echte Dateien

Die Steuerseiten der Fernsteuerungen sind rund 1.200 Zeilen HTML, CSS und JavaScript in
Template-Strings – ungelintet und ohne Typen. Ziel: echte Build-Artefakte bzw. `?raw`-Importe, die
Lint und Prettier sehen. Größe L, eigener Entwurf nötig (Skill `fernsteuerung-seite`: alte
TV-Browser, relative API-Pfade, Einbindung in die Fernsteuer-App).

### E10 – Menü-Baustein in LED-Wall-, Datei- und Handy-Menü

`WallMenu.tsx` und `ProjectFileMenu.tsx` bauen je ein eigenes Aufklappmenü, das Menü „Handy“ des
Mini-Manuals (`mini-manual/ui/HandyMenu.tsx`) leiht sich `useMenu` und `MenuItem` aus dem
Datei-Menü. Seit P4 gibt es den Baustein (`components/ui/menu.tsx`: `Menu`, `MenuItem` mit
`checked`, `shortcut` und `title`, `MenuSeparator`, `MenuLabel`): alle drei darauf umstellen,
`useMenu` und das alte `MenuItem` entfallen – ohne sichtbare Änderung bis auf die Tastatur (der
Baustein setzt den Fokus in die Liste, ↑/↓ wandern). Vorbild für einen Knopf mit Text und Pfeil:
„Importieren“ in `video-player/Library.tsx` (seit P5; dort `variant="secondary"`, in der Leiste
bleibt `outline`). `e2e/projektdatei.mjs`, `e2e/kabelverlauf.mjs` und `e2e/mini-manual.mjs`
bleiben grün.

## U – Upgrades

Große Umstiege sind eigene Vorhaben und in `.github/dependabot.yml` als Hauptversion ausgenommen
(Skill `abhaengigkeiten`).

| Paket | Inhalt |
| ----- | ------ |
| **U1** | **React 18 → 19** – mechanisch: 160× globales `JSX.Element` → `React.JSX.Element` |
| **U2** | **Tailwind 3 → 4** – eigene Tokens und die `light:`-Variante auf `@theme`/`@custom-variant` umstellen; postcss und autoprefixer entfallen |
| **U3** | **lucide-react 0.577 → 1.x** – Icon-Umbenennungen prüfen |

**Beobachten:** Vite 8 (electron-vite 6 kann es schon; offen sind @vitejs/plugin-react und
vitest), TypeScript 7 („tsgo“).

## H – Skills und Einstellungen für die Arbeit mit Claude

| Paket | Inhalt | Größe | Braucht |
| ----- | ------ | ----- | ------- |
| **H1** | Veraltete Skill-Beschreibungen | S | – |
| **H2** | Lange Skills teilen | M | – |
| **H3** | Fehlende Skills (`rechner-pwa` gibt es seit 13.11.) | S je Skill | – |
| **H4** | Versionierte Claude-Einstellungen, Prettier-Hook | S | – |

### H1 – Veraltete Skill-Beschreibungen

Die Beschreibung im Kopf entscheidet, ob ein Skill greift. Drei sind überholt:

- `neues-werkzeug`: nennt „den geplanten Video-Generator“ – es gibt ihn. Neu: „… (großes
  Werkzeug oder Rechner im eigenen Fenster).“
- `konvertierungs-kern`: „später Video-Generator“ – er nutzt den Kern längst. Neu: „(Video-
  Konverter, Player-Import, Video-Generator, Testbild-Export)“.
- `projektdatei`: „geplant Anleitung und Packliste“ – die Anleitung hat ihren Abschnitt. Neu:
  „(LED-Wall und Mini-Manual haben es, geplant Packliste)“.

### H2 – Lange Skills teilen

`review-checkliste` (rund 370 Zeilen), `electron-e2e` (rund 330) und Schritt 4 von
`neues-werkzeug` laden bei jedem Aufruf ganz. Je Skill: die `SKILL.md` auf Ablauf und
Inhaltsverzeichnis kürzen, die Sammlungen in Nachschlage-Dateien im selben Ordner legen, die
nur bei Bedarf gelesen werden (bei `review-checkliste` je Thema eine, bei `neues-werkzeug`
Drucken, Zeichnen auf Canvas, Rechner). Abnahme: `npm run check:refs`, und jede Lehre steht
noch genau einmal da.

### H3 – Fehlende Skills

Je Skill ein kleiner Pull Request, am besten dann, wenn das Thema das nächste Mal anfällt:

- **`oberflaeche`** – Änderungen an bestehenden Werkzeugen: die sieben Regeln und die beiden
  Muster aus dem [Leitbild](#leitbild-zwei-muster), dazu Tokens, `Alert` und `STATUS`, `Select`,
  Kontrast im hellen Design, Leerzustände. Am besten mit dem ersten W-Paket.
- **„fremdformat-import“** – Importer für fremde Dateien, mit dem ersten Import des Mini-Manuals
  (MM3).
- **`ausgabe-ndi`** – Ausgabefenster und NDI-Sender: Starten und Stoppen mit Zähler, was ein
  Fenster im Hintergrund nicht bekommt, Wachhalten.
- **`fehlersuche-log`** – das Protokoll lesen: wo es liegt, welche Zeilen was bedeuten,
  typische Muster in der gepackten App.

### H4 – Versionierte Claude-Einstellungen, Prettier-Hook

**Heute:** Es gibt nur eine unversionierte Datei „settings.local“ im Ordner `.claude` mit
Einmal-Freigaben voller alter Pfade. Jede neue Sitzung fragt für die Standardbefehle wieder
nach.

**So** (mit dem Skill `update-config`, der das Format kennt): eine versionierte Datei
„settings“ im Ordner `.claude` mit Freigaben für die Befehle aus `CLAUDE.md` (Lint, Typecheck,
Tests, `check:*`, Prettier auf einzelne Dateien, `node e2e/run.mjs`, Git lesend, `gh pr` und
`gh run`) und einem Hook, der nach jeder Bearbeitung Prettier auf die geänderte Datei laufen
lässt (nur `ts`, `tsx`, `mjs`, `json`, `css` – Markdown ist ausgenommen). Die lokalen
Einmal-Freigaben aufräumen.

## Abnahmen am Gerät

Was kein Test kann und nur Matthias mit dem Gerät prüfen kann. Ergebnisse gehören in
`docs/WERKZEUGE.md` und in den genannten Skill – auch, was nicht geht. Fehler daraus werden ein
neues Paket in diesem Plan.

**Video-Player** (nach P1 bis P3, wieder nach P4 und P5): ein echtes Video mit Ton abspielen, die
Ausgabe auf einem zweiten Monitor öffnen, im laufenden Betrieb umsortieren – am Griff ziehen,
auch den laufenden Eintrag, und mit den Pfeil-Knöpfen per Tastatur – und zwischen gespeicherten
Playlists wechseln: ohne Ruckeln und ohne Idle-Bild dazwischen. Das E2E prüft das nur an der
Vorschau im Fenster (dasselbe Medium läuft weiter, wird nicht neu gestartet), nicht an der
Ausgabe auf dem Monitor. Seit P5 dazu: echte Dateien und einen Ordner aus Explorer bzw. Finder
auf die Bibliothek ziehen – auch auf den Kopf und die Suche –, der gestrichelte Rahmen kommt und
geht ohne Flackern, beim Verlassen und nach dem Loslassen ist er weg, der Import startet. Das E2E
stellt nur die Ereignisse nach (Playwright kann keine Dateien des Systems ziehen).

**Testtongenerator und RTA am Handy** (Skill `rechner-pwa`) – mit der veröffentlichten PWA oder
`npm run pwa:preview` im LAN (dort ohne HTTPS: kein Wachhalten, kein Offline):

- **iPhone, als App installiert:** Der Testton startet nach einem Tipp; hörbar auch bei
  umgelegtem Stummschalter (ab iOS 17); der Bildschirm bleibt an (in der installierten App ab iOS
  18.4); App wechseln und zurück – der Knopf zeigt „Ton starten“, ein Hinweis sagt warum; danach
  misst der RTA wieder (das Mikrofon geht).
- **Android (Chrome):** dasselbe; dazu, ob das Metronom bei gesperrtem Bildschirm sauber läuft
  oder anhält – beides ist in Ordnung, solange die Anzeige stimmt.
- **Beide:** Metronom mit „Tippen“; Knopfgruppen ohne Querscrollen; der Testtongenerator passt
  ohne Scrollen; im RTA Karten auf- und zuklappen – der Zustand bleibt gemerkt. ⓘ antippen –
  Blase da; daneben tippen – weg; scrollen – sie läuft mit.
- **Seit K3:** Timecode nur mit Ziffern eintippen – die drei Timecode-Felder öffnen die
  Zifferntastatur (`digits`, `inputMode="numeric"`), „1020312“ ergibt 01:02:03:12. Zeigt sie am
  iPhone und unter Android wirklich nur Ziffern, und geht das Tippen ohne Doppelpunkt flüssig?
  −5 °C im Audio-Delay: „Temperatur“ hat `signed` (die volle Tastatur, `inputMode="text"` statt
  `decimal`, weil die Dezimaltastatur des iPhones kein Minus hat). Ist das Minus am iPhone ohne
  Suchen zu erreichen, und taugt die Tastatur auch unter Android? Wenn nicht, bekommt `NumField`
  statt der vollen Tastatur einen Knopf „±“ am Feld (neues Paket).
- **Seit K5, Stromlast (Pilot, Vorbild für K6):** Am Handy ist ab Werk nur „Last“ offen,
  „Geräte pro Stromkreis“ zeigt zugeklappt „7 Geräte je Kreis“ – passt die Seite ohne Scrollen?
  Aufklappen und in „Leistung je Gerät“ tippen: Bleibt die Antwort „Max. Geräte“ über der
  Tastatur sichtbar? Anschluss, Absicherung und Auslastung per Knopf, App schließen und wieder
  öffnen – die aufgeklappte Karte ist noch offen. Am Rechner im breiten Fenster: beide Karten
  offen nebeneinander.
- **Am Rechner:** das Ausgabegerät des Testtons im Betrieb wechseln.

**ATEM-Steuerung am Mischer** (Skill `atem-steuerung`, Messwerte im Entwurf):

1. **Am ATEM Mini Extreme mit Quellen und Monitor:** Übergänge, Hebel und Fade to Black im Bild.
   Der Hebel lief mit dem Stand nach dem 1. November 2026 nur am Schein-Mischer und im
   Probebetrieb (drei Fehler behoben: Einrasten am Ende, Hängen an einer Textauswahl, Dauer bei
   50p).
2. **Null am Ende des Hebels:** Gesendet wird 10000 und danach 0, wie ältere Hardware-Steuerungen
   (aus der Erinnerung an die Arduino-Bibliothek von SKAARHOJ). Im Grobtest fiel nichts auf; ob die
   Null nötig ist, wurde aber nicht gemessen.
3. **Am ATEM Mini:** Verbinden, Quellen und Stile wie am Gerät, Reiter nur für das, was er kann.
4. **Keyer, Makros, Medien, AUX am Extreme:** Key und DSK hart und mit Übergang, DSK-Auto mit
   Dauer, Fill und Cut; Makros mit Pause; Standbilder im Media-Player. Zeigt die Liste bei den
   AUX-Bussen nur, was der jeweilige Bus annimmt? Die Bibliothek nennt vier AUX-Bits; welches zu
   welchem Bus gehört, ist nicht belegt. Ist einer der Busse der USB-Ausgang, gilt die Vorsicht
   aus dem Entwurf („Multiview im Werkzeug“).
5. **Zählung der Dauer:** Gemessen ist nur der Mix bei 1080p50 (Dauer 50 = 1981 ms). FTB, DSK,
   Dip, Wipe und DVE sowie 59,94p und 60p sind daraus übertragen. Zeigt eines davon die falschen
   Sekunden, gehört das in `bilderJeSchritt`.
6. **Das Pult** (seit 2. November 2026): Keyer-Streifen mit „Auf Sendung“, „Mit Übergang“ und
   DSK-„Auto“, die Reihenfolge der kleinen Quellen, die Spalte „Übergang“ auf jeder Seite.

**Mini-Manual und LED-Wall:** die Handy-Fassung (HTML-Datei) auf iPhone und Android öffnen, auch
als Anhang in WhatsApp; die Kabelpläne ausdrucken – ist die gelbe Kette lesbar? Im Betrieb
nachsehen: Gehen am Tessera S8 auch die Redundanz-Paare 5 → 6 und 7 → 8 (das Handbuch nennt nur
1 → 2 und 3 → 4)? Welche Empfangskarte und welcher Prozessor gehören zum rX3ioBF (die Tabelle
rechnet bis dahin mit der Grenze des UHD Jr)? Zeigt die Anzeige am 496-2,0 wirklich blau für die
Main- und leicht violett für die Backup-Leitung?

**Video-Konverter:** GPU-Encoder auf echter Hardware gegenprüfen (NVENC, Quick Sync, AMF,
VideoToolbox samt ProRes) – ohne GPU im Testrechner sind nur Erkennung, Argumente und der
Rückfall auf die CPU geprüft. ProRes 4444 mit Alpha über VideoToolbox auf einem Mac (F13).

**Stream fürs Heimnetz** (Stage-Timer, seit dem 21. November 2026 ohne die gemeldeten Hänger):
am Rechner, an dem die Hänger auftraten (mit Bildschirm-Skalierung), den Stream eine
Viertelstunde in VLC am Handy und am PC ansehen, dabei Timer und Uhr-Modus – stockt er noch,
springt die Anzeige? Das E2E stellt die Hänger nur mit einer Warteschleife im main-Prozess und
die Skalierung mit `--force-device-scale-factor` nach. Offen seit Stufe 1: Empfang auf der
TV-Box über WLAN, NVENC und AMF, macOS. **Seit Stufe 2 (Video-Player mit Ton):** ein Video mit
Sprache in VLC am Fernseher oder Handy – passt der Ton zu den Lippen (das E2E misst seit #248
unter Windows und macOS meist −7 … 0 ms an Blitz und Piep, nach einem Hänger in einzelnen Läufen
bis −36 ms, aber nur bis ffmpeg, ohne Decoder und Lautsprecher des Empfängers; auf dem
Linux-Runner liegen Blitze nach einem Hänger ein Bild daneben, bis der Sender nach 2–3 s
nachzieht)? Am Mac dazu die Protokollzeile „Weg des Bildes“
notieren (der Sender legt den Ton um so viel später; in der CI auf dem macOS-Runner 50 ms, unter
Windows −11) und unter Last nachsehen, ob „Renderzeit zu früh“ oder „Ton nachgeführt“ im
Protokoll steht. **Vor der Entscheidung über ST6, am Mac:** den Stream des Video-Players eine
Viertelstunde in VLC am Fernseher ansehen und dabei normal arbeiten – ein Video konvertieren,
die Playlist umsortieren, die Ausgabe öffnen; notieren, ob das Bild in VLC kurz hakt. Danach im
Protokoll (am Mac `~/Library/Application Support/Mottulbox/avtoolbox-debug.log`) nach
„main-Prozess stockte“ suchen – seit #253 höchstens alle 5 s eine Zeile mit Anzahl und längster
Dauer, gezählt ab 50 ms. Fehlt die Zeile oder steht sie nur selten da, ist ST6 nicht dringend;
steht sie öfter, mit 100 ms und mehr, ST6 bauen. NDI und
Stream gleichzeitig mit echten Empfängern (NDI Studio Monitor und VLC); NDI ein- und ausschalten,
während VLC zuschaut – fängt sich das Bild nach dem kurzen Neustart von ffmpeg? Eine breite Wand
(z. B. 3840 × 1080) mit NDI „Wand 1:1“: steht sie im Stream eingepasst mit schwarzem Rand?

## Entscheidungen

Offen. In Klammern steht jeweils der Vorschlag; er gilt erst, wenn du ihn bestätigst. Entschiedene
behalten ihre Nummer, damit Verweise darauf stimmen:

1. **Reihenfolge:** die Etappen wie in der [Übersicht](#übersicht-und-reihenfolge) – erst die
   Vorbilder fertig, dann die Muster übertragen? (Ja.)
2. **Neuer Aufbau der Rechner** (K6) – entschieden am 24. November 2026, siehe unten.
3. **Rechner merken sich die Eingaben** (K4) – entschieden am 24. November 2026, siehe unten.
4. **Heißt die Kategorie weiter „Rechner“?** (Ja.) Mit RTA und Testtongenerator wäre „Rechner &
   Messen“ treffender – das ändert eine Beschriftung in `tools/types.ts` und die Überschriften in
   Doku und README.
5. **Arbeitsfläche für weitere Werkzeuge** – entschieden am 24. November 2026: W1
   (Video-Generator) zuerst, siehe unten. Für W2 bis W5 gilt die Reihenfolge der Tabelle unter
   [W](#w--arbeitsfläche-für-weitere-werkzeuge) als Vorschlag.
6. **Verbundene Geräte wach halten?** Eine offene Verbindung zu ATEM, NovaStar oder OSC hält den
   Rechner heute nicht wach und steht auch nicht in „Wirklich beenden?“. Wenn ja: ein Feld mehr
   in `LaufendStand` (`services/beenden/`), dann fragt das Beenden danach und der Rechner bleibt
   wach. (Offen.)
7. **Ordner `Beispiele/`:** ignorieren oder einchecken (E6)? (Ignorieren; die OBS-Datei darin
   kommt anonymisiert als Test-Fixture ins Repo, sobald MM3 den OBS-Import baut.)
8. **Worktree `wonderful-taussig-0eac94`** (1,8 GB, Branch `electron-45-pruefung`, Stand ist in
   main) löschen? (Offen – nur auf ausdrücklichen Wunsch.)
9. **ATEM: Darf die Animation einen Makro-Platz belegen?** (Ja, ein freier von hinten.)
10. **ATEM: wofür zuerst** – für den Laptop neben dem Mischer oder als Bedienung vom Tablet? Beim
    Tablet rücken S1 (PIN) und AT8 nach vorn. (Laptop.)
11. **ATEM: Sperre** – genügt ein Schalter, oder soll Entsperren eine eigene Bestätigung
    verlangen? (Ein Schalter.)
12. **Mini-Manual: Beispieldateien** für die Importe – exportiertes Stream-Deck-Profil (am besten
    je Gerät), Companion-Export, ein MadMapper-6-Projekt und ein Abzug seines OSCQuery-Baums,
    NovaLCT-Dateien. Eine OBS-Szenensammlung liegt vor. (Matthias sammelt; ohne Datei kein
    Import.)
13. **Welche neuen Werkzeuge** aus Teil G überhaupt – und welches zuerst? (Offen.)

Entschieden – damit nichts neu gefragt wird:

- **Neuer Aufbau für alle Rechner** (24. November 2026, nach dem Pilot an der Stromlast: „PWA
  Apps gefallen mir so. Mit Umschalter fände ich aber auch nicht schlecht. … Definitiv aber alle
  einheitlich“, dann „Ja, zugeklappt“): Antwort zuerst, Knopfgruppen statt Listen und die zweite
  Frage als zugeklappte Karte wie im Piloten – in allen Rechnern gleich (K6). Kein Umschalter: Mit
  der Karte stehen im breiten Fenster beide Fragen nebeneinander, ein Umschalter zeigt immer nur
  eine. Er bleibt, wo sich die Möglichkeiten ausschließen (im Testtongenerator spielt immer nur
  ein Signal).
- **Rechner merken sich die Eingaben** (24. November 2026, „Rechner sollen sich die Eingaben
  merken“): K4 wie beschrieben, mit „Zurücksetzen“, nach K6.
- **Arbeitsfläche: zuerst der Video-Generator** (24. November 2026, „Video-Generator als
  Nächstes skizzieren“): W1 beginnt mit Messung und Skizze.
- **DMX-Dip-Schalter: Adresse = Summe der eingeschalteten Werte** (16. November 2026, Rückmeldung
  von Matthias: Adresse 1 ist an den Geräten Schalter 1 an). Vorher rechnete der Rechner Summe + 1
  (alle aus = Adresse 1). Mit neun Schaltern reicht es bis 511; Adresse 512 braucht einen zehnten
  Schalter (Wert 512), den nur manche Geräte dafür nutzen – das sagt das ⓘ. Einen zehnten
  Schalter bekommt der Rechner nicht (17. November 2026, „Nein, so lassen“). Umgesetzt mit K3.

- **Stromlast am Drehstrom: „Geräte pro Stromkreis“ zählt je Außenleiter** (16. November 2026,
  „Ja, je Außenleiter“): Einphasige Geräte hängen je an einem Leiter (U ÷ √3), die Absicherung
  gilt je Leiter – Max. Geräte = 3 × ⌊Absicherung × Auslastung ÷ Strom je Gerät am Leiter⌋.
  „Strom je Gerät“ und „Summe Strom“ meinen den Strom am Außenleiter, das ⓘ der Karte sagt es.
  Für Drehstromgeräte sind es höchstens zwei zu wenig, nie zu viele; eine Wahl der Geräteart
  (ein neues Feld) gibt es nicht. Vorher zählte der Rechner, als ließe sich die Leistung
  beliebig auf die Leiter teilen – für einphasige Geräte bis zu zwei zu viel (500 W an 32 A: 44
  statt 42). Umgesetzt in K7.

- **Video-Player ohne Zufall: nach ✕ am letzten, laufenden Eintrag geht es mit „Danach“ weiter**
  (15. November 2026, „Ja, ‚Danach‘“): wie bei ⏭, nicht mehr mit dem Eintrag davor – mit Loop
  „Alle“ startet der erste Eintrag, mit Loop „Aus“ hält der Player an (nichts mehr gewählt, die
  Ausgabe zeigt das Idle-Bild). Mit Loop „Eines“ bleibt es beim Eintrag davor. Ebenso, wenn das
  laufende Medium aus der Bibliothek gelöscht wird. Umgesetzt in P9.
- **Video-Player bei Zufall: nach ✕ am laufenden Eintrag startet „Danach“** (15. November 2026,
  „Ja, ‚Danach‘“): wie bei ⏭, nicht der Eintrag, der an seinen Platz rückt – die Bühne hat es
  angekündigt, die Ausgabe hat es schon vorgeladen. Ebenso, wenn das laufende Medium aus der
  Bibliothek gelöscht wird. Umgesetzt in P8.
- **Die beiden Muster übertragen** (14. November 2026): Der Aufbau von Testtongenerator und RTA
  und der neue Video-Player haben die Bedienung deutlich verbessert; sie sollen auf andere
  Werkzeuge angewendet werden. Wie weit, entscheiden die Punkte 2 und 5 (seit 24. November: alle
  Rechner, als Erstes die Arbeitsfläche des Video-Generators).
- **Video-Player** (13. November 2026, „passt alles so“): Übergang und Bild-Standzeit in die
  Schublade (am Handy bleiben sie auf der Steuerseite); Löschen mit Rückfrage statt
  „Rückgängig“; Reihenfolge der Felder Bibliothek · Playlist · Bühne; stumm ab Werk bleibt, die
  Bühne zeigt es; die Ansicht der Bibliothek wandert ins Menü „⋯“.
- **Testtongenerator** (13. November 2026): Der Testbildgenerator behält seinen Ton (beide nutzen
  denselben Kern), „Gegenphase“ ist die fünfte Kanalwahl.
- **ATEM-Steuerung** (31. Oktober bis 2. November 2026): eigenes Werkzeug; Steuerung nur über
  das Netzwerk, USB verworfen; Aufbau als Pult mit der Spalte „Übergang“ auf jeder Seite; feste
  Bedeutungen (massiv löst aus, Rot auf Sendung, Grün Vorschau, Gelb wirkt beim Übergang); Fade
  to Black behält den zweiten Klick; Schublade anfangs zu. Einzelheiten im Entwurf.
- **Mini-Manual und Projektdatei** (Oktober 2026): die Festlegungen 1 bis 34 im Entwurf.
- **Video-Generator** (7. Oktober 2026): Name, Hauptzweck Diashow und Sponsor-Loop, Musik, kein
  Schnitt-Editor – „Festlegungen“ im Entwurf.

## Nicht tun, nicht geplant

Regeln, die über die einzelnen Pakete hinaus gelten:

- **Keinen Zustand verlagern:** Was im main lebt (Wiedergabe, Timer, ATEM-Verbindung), bleibt
  dort; Fenster spiegeln. Ein Knopf zeigt, was das Gerät meldet, nie, was gedrückt wurde.
- **Keine neue Farbe und keine neue Bedeutung:** Rot bleibt „live“, Bernstein der laufende
  Auftrag, Gelb in der ATEM-Steuerung „wirkt beim Übergang“. Farben nur über die Tokens.
- **Kein app-weites „aktives Projekt“** und keine Export-„Mappen“: Jedes Werkzeug liest und
  schreibt nur seinen Abschnitt der Projektdatei.
- **Kein Verlauf von selbst:** Der Kabelverlauf der LED-Wall wird von Hand angegeben – kein
  Einspeisepunkt, keine gerechnete Zuleitung.
- **Nichts ins Repo, was nicht öffentlich sein darf:** Firmenlogo, Kontakte, Handbücher der
  Hersteller, Kundendateien. Beispieldateien nur anonymisiert.
- **Die PWA bleibt bei den kleinen Werkzeugen:** kein `api`, keine Einstellungen, kein Toast –
  und kein großes Werkzeug als PWA.

Bewusst nicht geplant:

- **Startbildschirm: Enter im Suchfeld öffnet den ersten Treffer** (früher B1; 24. November
  2026, „B1 nein (find ich nicht so sinnvoll)“). Strg+K (B2) bleibt als Vorschlag und bringt die
  Reihenfolge der Treffer selbst mit.
- **Video-Generator:** Schnitt-Editor (Clips teilen, mehrere Ausschnitte je Clip, Schnittmarken,
  mehrere Spuren) – dafür gibt es Schnittprogramme.
- **Mini-Manual:** DOCX-Export, englische Ausgabe, „Sie“-Form; Rich-Text- oder WYSIWYG-Editor;
  Editor in der PWA oder als eigene App; eingebaute Cloud-Synchronisation (ein geteilter Ordner
  reicht); Verschlüsselung von Zugangsdaten in der Datei; Fremdmodule im LED-Wall-Konfigurator
  (vorerst); grafischer Baum-Editor für die Fehlersuche (beschrieben, nicht eingeplant); Import
  von NovaLCT-Empfangskarten-Dateien und Brompton-Projekten.
- **ATEM-Steuerung:** Steuerung über USB (neu bewerten nur, wenn Windows dort von selbst WinUSB
  nimmt und ein Einsatz ohne Netzwerkkabel wirklich gebraucht wird); Multiview aufs Handy.
- **Video-Player:** Änderungen an der Steuerseite fürs Handy im Zuge von P5.

## Erledigt – nicht neu planen

Damit nichts doppelt geplant wird. Was die App kann, steht in [WERKZEUGE.md](WERKZEUGE.md), wie
sie gebaut ist, in [ENTWICKLUNG.md](ENTWICKLUNG.md), die Einzelheiten im Git-Log.

- **November 2026:** Show-Härtung (kein Standardmenü von Electron, Zoom fest auf 100 %, kein
  Energiesparen, solange etwas läuft, eine Mottulbox je Benutzerordner, Fernsteuerungen weisen
  fremde Websites ab); drei kleine Fehler aus der Durchsicht (Medien ausliefern, Umlaute in
  Befehlen vom Handy, gescheitertes Speichern der Werkzeug-Stände); Video-Player ohne Scrollen
  (Teil P, abgeschlossen am 15. November) mit der Bühne (P1 bis P3) und der Playlist (P4, mit dem
  Menü-Baustein für „⋯“; P6: der laufende Eintrag bleibt auch bei doppelten Medien an seinem
  Platz; P7: bei Zufall bleibt „Danach“ beim Umsortieren derselbe Eintrag; P8: bei Zufall startet
  nach ✕ am laufenden Eintrag „Danach“; P9: ohne Zufall auch am Ende der Liste – mit Loop „Alle“
  der erste Eintrag, mit Loop „Aus“ hält der Player an) und der Bibliothek (P5: „Importieren“ und
  „⋯“ im Kopf, Suche, Kacheln nach Platz, Import-Liste unten, Löschen fragt);
  Testtongenerator; neuer Aufbau von Testtongenerator und RTA; Rechenkerne mit Tests für sieben
  Rechner (K1: je Rechner `math.ts`, ohne sichtbare Änderung); die Stromlast zählt „Geräte pro
  Stromkreis“ am Drehstrom je Außenleiter (K7); Bausteine für die Rechner (K2: `NumField` umrandet
  Fehleingaben rot, `invalid`, `signed`, `parse`; `Readout` mit `tone`; eine Lese-Funktion
  `parseDecimal`); Eingaben und Meldungen der Rechner angeglichen (K3: ein Feld, mit dem nicht
  gerechnet wird, ist rot, nichts wird still ersetzt – die Rechenkerne melden `invalid`, auch das
  Kameraobjektiv mit `lensView`; Gain ≤ 0, cos φ außerhalb von 0 bis 1 und ein negatives
  Eigengewicht ergeben kein Ergebnis, Vorgaben stehen als Platzhalter im leeren Feld; Timecode aus
  reinen Ziffern, Temperatur mit Minus, Bewertung und Winkel-Warnungen in den Statusstufen,
  DMX-Schalter mit `aria-pressed`, ein Ergebnis „Adresse“ weniger, „Werkzeuge“ statt „Rechner“ in
  der PWA, `trimNum` ohne Exponent); der DMX-Dip-Schalter zählt wie die Geräte (Adresse = Summe
  der Schalter, Schalter 1 an = Adresse 1); die Schublade schwebt in Fenstern unter 1100 px
  Breite, auch wenn sie angeheftet ist – die Nadel ist dort ausgegraut, ein Klick in die
  Arbeitsfläche schließt die schwebende und übernimmt vorher ein angefangenes Feld (B8). Erstes
  Release `v0.1.0` am 24. November mit den vier Installern, dazu der Skill `release` (F5).
  Video-Generator: Ein leeres Projekt zeigt unter der Ablagefläche keinen roten Hinweis mehr,
  „Video erzeugen“ bleibt trotzdem gesperrt (B5, 24. November).
  Neuer Aufbau am Pilot Stromlast (K5, 24. November): Antwort „Max. Geräte“ über den Feldern,
  Anschluss, Absicherung und Auslastung als Knopfgruppen statt Listen, beide Karten zuklappbar
  mit der Antwort als Kurzfassung, die zweite ab Werk nur nebeneinander offen
  (`FoldCard` mit `defaultOpen="nebeneinander"`, `CalcPage` misst seine Spalten) – am Handy
  508 statt 929 px.
- **Show-Härtung davor:** Fehlergrenzen je Werkzeug, globale Fehler-Handler, Hinweise in der App
  statt stiller Fehler, Wiederherstellung von `settings.json` und der Player-Bibliothek,
  versionierte Stores.
- **Speichern:** eine Persistenz-Regel mit vier Orten (Einstellungen, Werkzeug-Store,
  Bedien-Kleinigkeiten, Projektdatei), keine eigenen localStorage-Parser; kein Datenverlust
  zwischen Fenstern (Teiländerungen feldweise zusammengeführt, atomar geschrieben, Abgleich der
  Werkzeug-Stände).
- **Technik:** Electron 40 → 45, better-sqlite3 13 (N-API, kein Rebuild je Electron-Version),
  pdfjs-dist 6, react-router 7; Dependabot mit 7 Tagen Abstand, Electron-Binary gegen Prüfsumme;
  ffmpeg hält sich beim Entwickeln und in der fertigen App aktuell; CI auf Linux, Windows und
  macOS mit Unit-Tests, Build und allen E2E-Skripten.
- **Sicherheit:** Fenster-Wächter für alle Fenster, Berechtigungen nach Allowlist,
  Fernsteuer-Befehle feldweise geprüft, Uploads begrenzt, CSP ohne `unsafe-eval`, yt-dlp nur mit
  http(s)-Adressen.
- **Konvertierung:** ein Kern für Video-Konverter, Player-Import, Video-Generator und
  Testbild-Export; eigene Player-Spur in der Warteschlange; GPU-Encoder nach Probelauf mit
  Rückfall auf die CPU; Lautheit in zwei Durchgängen.
- **Fernsteuerung:** Fernsteuer-App mit gemeinsamer Startseite (Port 8090), Stage-Timer am
  Handy, Bühnen-Anzeige im Browser, Start und Stopp über `registerRemoteControl()`.
- **Oberfläche:** gleiche Kopfleiste, Ausgabe-Leiste und Schublade in allen großen Werkzeugen;
  die kleinen Werkzeuge im eigenen Fenster und als PWA; Statusfarben als Tokens, eine Hinweisbox
  (`Alert`), eine Status-Tabelle; Startbildschirm mit Favoriten, Kachelgröße und Ausgabe-Status.
- **Aufgeräumt:** `main/services` nach Bereichen, Fensterlogik aus `main/index.ts`, der
  IPC-Vertrag als einzige Quelle, `VideoPlayer.tsx` von 1.765 auf unter 300 Zeilen,
  `OscControl.tsx` von 3.276 auf 387.
- **Große Vorhaben:** Video-Generator Phasen 0 bis 2; Mini-Manual mit Projektdatei, mehreren
  Wänden, Kabelverlauf, Handy-Fassung und Tastenfeld-Editor; ATEM-Steuerung mit den Seiten
  Mischen, Keyer, Makros, Medien und AUX.
