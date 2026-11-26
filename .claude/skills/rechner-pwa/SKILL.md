---
name: rechner-pwa
description: Kleine Werkzeuge der Mottulbox für die Handy-PWA bauen oder ändern (Rechner, RTA, Testtongenerator) – was dort nicht geht (api, Einstellungen, Toasts), Tailwind-Quellen, Service Worker, Ton und Mikrofon am Handy, Tastaturen der Felder, Prüfen im Handyformat und am Gerät. Verwenden, bevor ein kleines Werkzeug, src/pwa/ oder tools/_calc, tools/_tone angefasst wird.
---

# Rechner-PWA – kleine Werkzeuge am Handy

Jedes kleine Werkzeug (`SMALL_TOOLS` in `src/shared/toolWindows.ts`) läuft zweimal: im eigenen
kleinen Fenster der App und als Web-App fürs Handy (`src/pwa/`, veröffentlicht unter
https://mottul.github.io/project_mega/). Derselbe Code – was in der PWA fehlt, darf das Werkzeug
nicht brauchen. Aufbau und Veröffentlichen: `docs/ENTWICKLUNG.md`, Abschnitt „Rechner-PWA“.
Wie ein kleines Werkzeug aufgebaut ist (Vorbild Testtongenerator und RTA), was je Werkzeug bei
393 × 710 gemessen wurde und welche Pakete offen sind: Gesamtplan `docs/PLAN.md`, „Muster 2“ im
Leitbild und Teil K.

## Was ein kleines Werkzeug nicht darf

- **Kein `api`, keine Einstellungen** (`lib/api`, `lib/settings`, `electron`): Der PWA-Build bricht
  ab (`src/pwa/build/plugin.ts`). Gemerktes in einen eigenen zustand-Store (`debouncedStorage`,
  `version`, `syncAcrossWindows`; Muster `tools/tone-generator/store.ts`) – den Stand beim Laden
  prüfen wie fremde Eingabe.
- **Keine Toasts:** Die PWA zeigt keine. Meldungen als `Alert` in der Seite.
- **Was die App von außen einhängt, bleibt in der PWA still:** „läuft“ (`useAktivMelden`, Melder
  aus `main.tsx`) und gescheitertes Speichern (`setStorageErrorHandler`). Neues dieser Art
  genauso bauen: Melder setzen, nicht importieren.
- **Tailwind-Klassen nur aus `src/pwa/build/sources.ts`:** Bindet das Werkzeug einen neuen Ordner
  ein (wie `tools/_tone`), dort eintragen – der Build meldet sonst die Datei. Grund: Jede
  Klasse irgendwo in der App ergäbe sonst eine neue PWA-Version.
- Neues Werkzeug: in `SMALL_TOOLS`, `tools/registry.ts` **und** `src/pwa/tools.ts`
  (`src/pwa/tools.test.ts` vergleicht); Beschreibung im Manifest (`src/pwa/build/plugin.ts`)
  und in `src/pwa/index.html` nachziehen. Jede Änderung, die die PWA erreicht, meldet sich am
  Handy als „Neue Version bereit“.

## Rechnen

- **Rechenkern je Rechner:** `math.ts` neben der Komponente, mit `math.test.ts` (Vorbild
  `tools/rigging/math.ts`; beim Kameraobjektiv `optics.ts` mit `lensView`, beim Timecode `tc.ts`
  mit `framesFrom`). Zahlen hinein, Zahlen oder `null` heraus – auch Entscheidungen (Warnstufe
  des Bridle, „reicht der Beamer“, Last außerhalb der Spannweite) und **welche Eingaben nicht
  rechenbar sind:** Jedes Ergebnis trägt `invalid`, die Eingaben mit lesbarem, aber unbrauchbarem
  Wert (negativ, nicht über 0, cos φ außerhalb von 0 bis 1, Lastposition hinter B, eine
  gebrochene Framezahl). Die
  Komponente liest nur Text (`parseNum`), reicht `invalid` an die Felder weiter
  (`invalid={r.invalid.includes('gain')}`) und zeigt an (`fmt`, `trimNum`); die Anzeige-Rundung
  bleibt dort. So prüft Vitest ohne DOM, was am Handy steht.
- **Fehleingaben sind nie stumm, nichts wird still ersetzt:** Was `parseNum` nicht liest,
  umrandet `NumField` selbst rot (`aria-invalid`) – `parseNum` reicht nur `parseDecimal` weiter,
  eine Lese-Funktion für alle Felder; was der Kern in `invalid` nennt, ebenso. Was davon abhängt,
  ist `null` („–“), nie mit einem Ersatzwert gerechnet. Leer ist nie rot. Eine eigene
  Schreibweise liest das Feld per `parse` (Timecode: `parseTc`). Berechnete Felder bekommen
  `trimNum` (auch ab 10²¹ ohne Exponent), nie `fmt` (Tausenderpunkte liest `parseNum` nicht).
- **Felder mit Vorgabe** (leer rechnet der Kern mit einem festen Wert: Gain 1, cos φ 1, 20 °C,
  Eigengewicht 0): die Vorgabe als Konstante im Kern (`DEFAULT_GAIN` …), im Feld als
  `placeholder={trimNum(DEFAULT_GAIN)}`, gelesen mit `parseOptional` – leer `null` (Vorgabe),
  unlesbar `NaN` (kein Ergebnis, `invalid`). Mit `parseNum` rechnete ein Tippfehler still mit
  der Vorgabe.
- Eine Änderung an Formel, Grenze oder Ersetzung beginnt mit dem Test: den Test, der das alte
  Verhalten festhält, zuerst umschreiben und rot sehen, dann rechnen (so K7, K3 und K6 – Gain ≤ 0
  rechnete still mit 1, cos φ wurde auf 0,01 bis 1 begrenzt, ein negatives Eigengewicht senkte
  die Kräfte, „1,5“ Frames rechneten still mit Frame 2). Ob still ersetzt oder rot wird,
  entscheidet Matthias (Befund 18: „Ja, rot markieren“) – erst fragen, dann bauen.
- Neben den Vorgabewerten eine Eigenschaft prüfen, die immer gelten muss – in einer Schleife über
  viele Eingaben (Stromlast: kein Leiter über Absicherung × Auslastung, ein Gerät mehr je Leiter
  passte nicht).
- **Stromlast am Drehstrom:** „Geräte pro Stromkreis“ zählt je Außenleiter (U ÷ √3; Max. Geräte
  = 3 × Geräte je Leiter); „Strom je Gerät“ und „Summe Strom“ sind der Strom auf einem Leiter.
  Die Karte „Last“ rechnet weiter mit √3 · U · I · cos φ.

## Bedienen mit dem Finger

- Bausteine aus `tools/_calc/ui` – sie sind fürs Handy gebaut: `ChoiceField`/`Segmented` (bei
  grobem Zeiger höher; `wrap` füllt die Reihen gleichmäßig), `QuickPick` (`fill`: eine Reihe wie
  eine Knopfgruppe), `RunButton big` für die Hauptaktion, `RangeField`. Auswahl bis vier kurze
  Möglichkeiten als Knopfgruppe, nicht als Liste. Eine Bewertung als `Readout` mit `tone`
  (Symbol und Farbe aus `STATUS` wie überall in der App, kein ✓ oder ✗ im Text: Beamer-Lumen),
  eine Warnung als `Alert` mit `title` und `icon={STATUS.warning.icon}` (Rigging: „Flacher
  Winkel“, „So nicht anschlagen“), nie ⚠ im Text. Hervorgehoben (`accent`) ist je Karte nur die
  Antwort auf ihre Frage, `big` nur zusammen mit `accent`; verknüpfte Felder sind selbst die
  Antwort (dann kein `accent` an einem `Readout` darunter).
- **Bedienfelder in ganzer Breite** (Knopfgruppen, Schieber, Zahl mit −/+): `FieldBlock` –
  Beschriftung darüber, Wert rechts daneben. Neben einer Beschriftung links (`FieldRow`, 10rem)
  bleiben am Handy kaum 150 px: Gruppen stehen einspaltig, Knöpfe ragen heraus.
- **Selten Gebrauchtes zuklappen** (`FoldCard`, Kurzfassung im Kopf, Zustand gemerkt): Der RTA
  zeigt zuerst nur Messen, Pegel und Spektrum – alles offen erschlug am Handy. In seinen Karten
  sind die Einstellungen seit K6 Knopfgruppen in ganzer Breite (`ChoiceBlock` in
  `rta/RtaCards.tsx`: `FieldBlock` mit `Segmented`, ab drei Möglichkeiten `wrap={4.75}` – bei
  393 px eine Reihe, bei 320 px brechen vier in zwei um); nur „Eingang“ bleibt eine Liste, weil
  es beliebig viele Geräte mit langen Namen gibt.
- **Rechner mit zwei Fragen** (Pilot Stromlast, K5 – Vorbild `tools/power-load/PowerLoad.tsx`):
  beide Karten `FoldCard`, `summary` = die Antwort der Karte („7 Geräte je Kreis“, „–“ ohne
  Ergebnis; ändert eine Wahl ihre Bedeutung, sagt die Kurzfassung es: „3∼ · 11.085 W · 16 A“).
  Die erste `defaultOpen`, die zweite `defaultOpen="nebeneinander"`: offen nur, solange die Karten
  nebeneinander stehen – `CalcPage` misst die Spalten seines Rasters (`spaltenZahl`, vor dem
  Zeichnen) statt die Fensterbreite zu schätzen. Gemerkt wird erst, was man selbst klappt
  (`panel:<id>`); bis dahin folgt die Karte den Spalten, auch beim Ziehen am Fenster. In der Karte
  steht die Antwort (`Readout` mit `big` und `accent`) als erste Zeile, darunter die Felder,
  darunter die Nebenwerte – wer am Handy tippt, sieht sie über der Tastatur. Am Handy (393 × 710)
  ist die Stromlast so ab Werk 508 px hoch statt 929; beide Karten offen 982. Seit K6 ebenso
  Rigging 631 statt 1281 (offen 1315), Kameraobjektiv 610 statt 1071 (offen 1064), Timecode
  569 statt 749 (offen 927), Beamer-Lumen 558 statt 741 (offen 758) und Audio-Delay 476 statt
  695 (offen 718). Das Projektionsverhältnis bekam nur die Knopfgruppe (Seitenverhältnis, sechs
  Werte, `wrap={4}`: bei 393 und 320 px zwei Reihen zu je drei) und ist damit 631 statt 556 hoch.
  - **Stufen mit Erklärung** (Umgebungslicht im Beamer-Lumen): kurze Namen auf den Knöpfen
    („Gedimmt“), die Erklärung der gewählten Stufe als Zeile darunter („Vortragssaal · Ziel
    400 lx“) – wie die Signale ohne eigene Felder im Testtongenerator. Name und Erklärung stehen
    getrennt in den Daten des Kerns (`name`, `where`), nicht aus einer Beschriftung geschnitten.
  - **Ist die erste Karte nur Einstellung** (Kameraobjektiv: „Kamera & Objektiv“), ist sie die
    zugeklappte: `defaultOpen="nebeneinander"` an ihr, die Frage dahinter `defaultOpen`; die
    Kurzfassung nennt dann die Einstellung („Vollformat · 200 mm · 2×“), nicht eine Antwort.
  - **Titel und Kurzfassung passen am Handy oft nicht in eine Zeile** („Traverse auf zwei
    Punkten“ mit „A 115 kg · B 85 kg“): `FoldCard` rückt die Kurzfassung dann unter den Titel –
    abgeschnitten („7 Geräte je Kr…“, die Stromlast bei 320 px) sagte sie die Antwort nicht mehr.
    Jeder solche Kopf kostet 11 px Höhe; bei 393 und 320 px ansehen.
  - **Eine große Zeichnung** (Bildausschnitt des Kameraobjektivs) ist am Handy kleiner
    (`h-44 sm:h-64`): Mit voller Höhe war die Seite 726 px hoch, 69 zu viel.
  - **Viele Möglichkeiten als Knopfgruppe** (Bildrate, zehn): `Segmented` mit `wrap={4.5}` –
    bei 393 px drei Reihen, bei 320 px vier, alle Beschriftungen lesbar. Kurz und aus den Daten
    gebildet („29,97 DF“ aus `exact` und `drop`), was die Liste dazusagte, hinter dem ⓘ.
- Ein `ChoiceField` mit zwei Knöpfen wie „1∼ 230 V“ oder „80 % Dauer“ passt am Handy nicht neben
  die Beschriftung (10rem): Es rückt darunter, in ganzer Breite – wie ein `FieldBlock`. Im
  breiten Fenster bleibt es eine Zeile.
- Höhe prüfen, nicht schätzen: Handy im Browser ≈ 393 × 710 (Kopf- und Fußleiste des Browsers
  abgezogen), Inhalt per `getBoundingClientRect` messen (Testtongenerator: passt ohne Scrollen).
- **Tastaturen:** `inputMode="decimal"` hat am iPhone kein Minus (WebKit-Fehler 193825) – Felder
  mit negativen Werten bekommen `signed` (`NumField` öffnet dann die volle Tastatur,
  `inputMode="text"`; Audio-Delay: Temperatur). Eingaben nur aus Ziffern bekommen `digits`
  (`inputMode="numeric"`, ohne Komma und Doppelpunkt) – die Timecode-Felder, `parseTc` liest
  reine Ziffern paarweise von rechts („1020312“ = 01:02:03:12). Ob beide Tastaturen am iPhone und
  unter Android taugen, ist eine offene Abnahme am Gerät im Gesamtplan (Ausweg für das Minus
  wäre ein Knopf „±“). Felder sind auf Touch-Geräten 16 px groß (`pwa.css`), sonst zoomt iOS
  hinein.
- **Rot muss beim Tippen sichtbar sein:** Wer tippt, hat das Feld im Fokus, und der Fokusring in
  der Akzentfarbe verdeckte einen roten Rahmen – `NumField` färbt bei einer Fehleingabe auch den
  Ring rot.
- **ⓘ:** schließt beim Tippen daneben (auf dem Handy kommt dabei oft kein `blur`), hat eine
  unsichtbar größere Tippfläche; Darüberfahren zählt nur mit der Maus. Ändert eine Wahl, was ein
  Ergebnis bedeutet, sagt es das ⓘ der Karte nur bei dieser Wahl (Stromlast dreiphasig) – keine
  Zeile mehr in der Karte. Die Blase klappt nicht nach oben: Einen langen Text am Handy prüfen.
- Was sich beim Umschalten ändert, nach unten: Was man im Betrieb greift, steht oben immer an
  derselben Stelle (Testtongenerator: Start, Pegel, Kanäle oben, die Felder des Signals unten).

## Ton und Mikrofon am Handy

- **Ton nur aus einer Bedienung:** Den `AudioContext` im Klick selbst erzeugen und `resume()`
  aufrufen, vor dem ersten `await` – danach gilt der Tipp nicht mehr. Nie von selbst starten.
  Nur über den Kern in `tools/_tone` (`useToneEngine`).
- **iPhone-Stummschalter:** Web Audio schweigt dort, außer die Seite meldet Wiedergabe
  (`navigator.audioSession.type = 'playback'`, ab iOS 17, nur Safari). Danach zurück auf
  `'auto'`, sonst bekommt der RTA kein Mikrofon. Erledigt der Kern.
- **App gewechselt, gesperrt, Anruf:** iOS hält den Kontext an. Nie still „läuft“ zeigen – der
  Kern meldet `onEnded`, das Werkzeug zeigt einen Hinweis und den Startknopf.
- **`error` am Kontext:** Gleich nach dem Start heißt er „kein Ausgabegerät“ (Chromium rechnet
  dann auf einem Ersatzgerät; der Kern wirft ihn wieder an und meldet `onWarning`), im Betrieb
  „Gerät weg“ (`onEnded`, Ton aus). Erledigt der Kern (`deviceError`).
- **Bildschirm wach:** `useWakeLock(läuft)` (nur HTTPS; im installierten iPhone-Webapp erst ab
  iOS 18.4 zuverlässig).
- **Mikrofon** nur über HTTPS; ohne HTTPS (PWA im LAN per `pwa:preview`) gibt es weder
  `navigator.mediaDevices` noch Service Worker – Code muss das aushalten (`?.`).
- Ausgabegerät wählen (`setSinkId`) geht am Handy nicht: Zeile ausblenden
  (`canChooseOutputDevice()` und Geräte mit Namen).

## Prüfen

1. `npm run pwa:build` (Wächter, Quellen) und `npx vitest run src/pwa src/renderer/src/tools`.
2. **Handyformat im eingebauten Browser:** `npm run pwa:build`, dann `npm run pwa:preview`
   (Port 5181) im Hintergrund, im Browser-Bereich öffnen, `resize_window` mit `preset: 'mobile'`
   (375 × 812; zum Messen wie im Gesamtplan 393 × 710 setzen) und neu laden; Ton per Analysator
   messen wie im E2E (Skill `electron-e2e`, `toneTap.mjs` als Vorlage). Danach
   `preset: 'desktop'`.
   - **Alte Fassung im Browser-Bereich:** Er behält den Service Worker früherer Prüfungen und
     zeigt still den alten Stand (K7: die Stromlast zählte dort noch 44 statt 42 Geräte). Die
     geladenen Dateien (`performance.getEntriesByType('resource')`) mit den Namen aus dem
     frischen Build vergleichen; weichen sie ab, Worker abmelden, Caches leeren, neu laden.
   - **Vorschau beenden:** Unter Windows überlebt `vite preview` das Stoppen der
     Hintergrund-Aufgabe. Danach Port 5181 prüfen und den Prozess beenden – sonst weicht die
     nächste Vorschau still auf 5182 aus, und unter 5181 antwortet weiter die alte.
   - **`localhost` abgewiesen** (K3): `preview_start` und `navigate` auf `http://localhost:5181`
     scheiterten, `http://127.0.0.1:5181` ging – ein eigener Ursprung mit eigenem Service Worker
     und eigenen gemerkten Werten (Favoriten danach wieder entfernen).
   - **Versteckter Browser-Bereich:** Screenshots zeigten dort teils den Stand vor der letzten
     Eingabe. Werte und `aria-invalid` per JavaScript lesen, für ein Bild kurz warten und neu
     aufnehmen. Eingaben per JavaScript brauchen den nativen `value`-Setter und ein
     `input`-Ereignis, sonst merkt React nichts.
   - **Auslieferungszustand messen:** Aufgeklappte Karten merkt sich der Browser-Bereich
     (`localStorage`, Schlüssel `panel:<id>`, z. B. `panel:power-load:geraete`) – vor der Messung
     entfernen und neu laden. Die Breite 393 schaltet dort auch den groben Zeiger ein
     (`pointer: coarse`): Knopfgruppen sind dann höher als im Fenster der App.
   - **Ansehen ohne Build:** `npm run pwa:dev` (Port 5180) registriert keinen Service Worker und
     zeigt Änderungen sofort – gut, um einen Baustein, den noch kein Rechner nutzt, vorübergehend
     in einen einzusetzen und anzusehen (K2: `tone` an der Bewertung im Beamer-Lumen; danach
     zurücknehmen). Abnahme bleibt der gebaute Stand.
3. In der App: `e2e/layout.mjs` (kleines Fenster, 320 px ohne Querscrollen, ab Werk kein Feld als
   Fehleingabe markiert; lesbar, aber nicht rechenbar – Gain 0, Eigengewicht −10 – ist rot und
   ergibt „–“; Tastaturen von Timecode und Temperatur; Schalter des DMX-Dip-Schalters; Stromlast
   als Vorbild für den neuen Aufbau: bei 880 px beide Karten offen nebeneinander, bei 393 px die
   zweite zu mit Kurzfassung, aufgeklappt nach Schließen und Öffnen noch offen, Antwort über dem
   ersten Feld, keine `select`; ebenso je ein Schritt für die Rechner aus K6) und das E2E des
   Werkzeugs. Ein Ergebnis liest dort `readout(fenster, 'Lumen-Bedarf')`, den Kopf einer
   zuklappbaren Karte `kartenKopf(fenster, 'Titel')` (der Name endet mit der Kurzfassung), einen
   Knopf einer Knopfgruppe `knopf(fenster, 'Gruppe', 'Knopf')`; dazu `antwortZuerst`,
   `keineKurzeListe` und `mitBreite` (Breite setzen, schließen, wieder öffnen). Ein schmales
   Fenster (Timecode, 520 px) zieht der Schritt für „breit offen“ live auf 880 px – die Karte
   folgt den Spalten. Wer die Breite eines Fensters verstellt, stellt sie vor dem Schließen
   zurück – sie bleibt gemerkt, und der Schritt „alle kleinen Werkzeuge“ erwartet die
   zweispaltigen Rechner in voller Breite. Ein Feld in einer Karte, die im 520-px-Fenster ab
   Werk zu ist („Timecode A“), findet ein Schritt nicht: ein Feld der offenen Karte nehmen oder
   die Karte aufklappen – sie bleibt dann für spätere Schritte offen.
   - **Baustein ändert sein Aussehen nach dem Inhalt** (`NumField` rot): alle kleinen Werkzeuge
     im Auslieferungszustand vorher und nachher als HTML vergleichen (Skill `aufraeumen`). In K2
     fand das die Timecode-Felder – sie führen hh:mm:ss:ff in einem `NumField` und wären ab Werk
     rot gewesen (Abhilfe `parse`).
4. **Am Gerät** (kann kein Test): iPhone als installierte App (Stummschalter, App wechseln und
   zurück, Bildschirm bleibt an, danach misst der RTA noch), Android (Chrome), Tastaturen der
   Felder, ⓘ antippen und daneben tippen. Ergebnis in die Doku, nicht nur „sollte gehen“.
