# Plan: Testtongenerator als kleines Werkzeug – und die kleinen Werkzeuge angleichen

Wunsch vom 13. November 2026: ein **Testtongenerator** als kleines Werkzeug – eigenes kleines
Fenster in der App und in der Handy-PWA –, mit Metronom und den üblichen Testsignalen. Bei der
Gelegenheit sollen die **kleinen Werkzeuge einheitlicher und leichter zu bedienen** werden; was
doppelt oder überflüssig ist, fliegt raus.

Der Plan ist so geschrieben, dass ein Modell ohne diese Sitzung ihn umsetzen kann: Fundstellen,
Entwurf, Schritte mit Abnahme, und was nicht zu tun ist. Ein Auftrag lautet **„Setze Schritt T1
aus docs/PLAN-TESTTON.md um.“** Ablauf, Regeln und Stolpersteine stehen in
[PLAN-DURCHSICHT.md](PLAN-DURCHSICHT.md#so-wird-ein-paket-umgesetzt) und gelten hier genauso:
frischer Branch ab `main`, erst nachstellen, ein Schritt = ein Pull Request, Doku und Skills
nachziehen, den Schritt hier streichen.

Alles hier ist Vorschlag. Was gebaut wird, entscheidet Matthias; die
[Entscheidungen](#entscheidungen-die-bei-dir-liegen) am Ende sind offen.

- [Ausgangslage](#ausgangslage) – [Testton](#den-testton-gibt-es-schon--im-testbildgenerator),
  [kleine Werkzeuge](#die-kleinen-werkzeuge-heute), [Befunde](#befunde)
- [Ziele](#ziele)
- [Der Testtongenerator](#der-testtongenerator) – [Signale](#signale),
  [Aufbau](#aufbau-der-seite), [Verhalten](#verhalten), [Metronom](#metronom),
  [am Handy](#am-handy)
- [Bausteine](#bausteine)
- [Umsetzung in Schritten](#umsetzung-in-schritten)
- [Abnahme am Gerät](#abnahme-am-gerät)
- [Doku und Skills](#doku-und-skills)
- [Entscheidungen, die bei dir liegen](#entscheidungen-die-bei-dir-liegen)
- [Nicht tun](#nicht-tun)
- [Später möglich](#später-möglich)

## Ausgangslage

Am 13. November 2026 am Code geprüft (Stand `main` nach Pull Request 221). Vor jedem Schritt
gilt trotzdem: erst nachsehen, ob die Stelle noch so aussieht.

### Den Testton gibt es schon – im Testbildgenerator

Der Testbildgenerator hat einen Testton (Schalter „Ton“ in der Ausgabe-Leiste, Bereich
„Testton“ in der Schublade) mit acht Signalen: Sinus, Sweep, rosa und weißes Rauschen, Metronom,
Kanal-Kennung, Polaritätspuls und AV-Sync. Der Kern ist getrennt von der Oberfläche und wird
wiederverwendet – **es entsteht kein zweiter Kern.** Die ersten drei Dateien liegen im Ordner
`src/renderer/src/tools/test-patterns/tone/`:

| Datei | Inhalt |
| ----- | ------ |
| `engine.ts` | `ToneEngine` (WebAudio): eine Stimme mit Kanalverteilung, am Ende der Kette Pegel und Ein-/Ausblenden (Start 0,5 s, Signalwechsel und Stopp 50 ms). Klicks, Pulse, Sweeps und Pausen plant ein Takt alle 100 ms um 0,4 s voraus |
| `plan.ts` | rein und getestet: `normalizeTone` (Pegel −60 bis −6 dBFS), Zeitpläne, Rauschen, Polaritätspuls, Auswahllisten |
| `TestTone.tsx` | Bindung ans Testbild: `useTestTone` (liest und schreibt `patternTone` in `settings.json`), `ToneToggle`, `ToneSection`, die Erklärtexte `SIGNAL_HINTS` |
| `src/shared/types.ts` | `ToneSignal`, `ToneChannels`, `PatternToneSettings`, `DEFAULT_PATTERN_TONE` |
| `e2e/testton.mjs` | misst den Ton vor dem Ausgang: Pegel, Frequenz, Pausen der Kennung, AV-Sync |

Warum sich das so noch nicht in ein kleines Werkzeug setzen lässt:

1. Der Ordner liegt außerhalb der Quellen der PWA (`src/pwa/build/sources.ts`) – der PWA-Build
   bricht ab, sobald ein kleines Werkzeug ihn einbindet (`src/pwa/build/plugin.ts`).
2. `plan.ts` holt `DEFAULT_PATTERN_TONE` aus `@shared/types`. Aus dieser Datei (knapp 2.000
   Zeilen mit allen Vorgaben der App) bindet die PWA bisher keinen einzigen Wert ein.
3. `TestTone.tsx` braucht `lib/settings`, den Toaster der App (`lib/toast.ts` – die PWA zeigt
   keine Toasts) und `useAktivMelden` (`lib/aktivMelden.ts` importiert `lib/api`). `api` und
   Einstellungen sind in der PWA verboten.

### Die kleinen Werkzeuge heute

Zehn Werkzeuge stehen in `SMALL_TOOLS` (`src/shared/toolWindows.ts`): Kreisrechner,
DMX-Dip-Schalter, Projektionsverhältnis, Audio-Delay & SPL, RTA, Beamer-Lumen, Timecode-Rechner,
Stromlast, Kameraobjektiv, Rigging-Last. Jedes öffnet sich im eigenen kleinen Fenster (Höhe
folgt dem Inhalt, schmal bis 320 px) und läuft unverändert in der PWA (`src/pwa/tools.ts`).
Neun davon sind Formulare aus den Bausteinen in `tools/_calc/ui.tsx` (`CalcPage`, `SectionCard`,
`NumField`, `SelectField`, `Readout`, `ReadoutGrid`, `useLinkedFields`); der RTA hat zusätzlich
einen eigenen Kopf mit Start, Anzeige und Umschaltern.

Das Grundmuster ist gut und bleibt: eine kurze Zeile je Karte, alles Weitere hinter dem ⓘ,
Zahlen mit Komma, berechnete Felder in Akzentfarbe.

### Befunde

| Nr. | Befund | Fundstelle | Schritt |
| --- | ------ | ---------- | ------- |
| 1 | Sieben Rechner rechnen mitten in der Komponente, ohne einen einzigen Test – darunter Rigging-Last und Stromlast, wo ein Rechenfehler am meisten schadet. Nur Kameraobjektiv (`optics.ts`), Timecode (`tc.ts`) und RTA haben einen geprüften Kern | `CircleCalc.tsx`, `DmxAddress.tsx`, `ThrowRatio.tsx`, `AudioDelay.tsx`, `ProjectorLumen.tsx`, `PowerLoad.tsx`, `Rigging.tsx` | K1 |
| 2 | Ungültige Eingaben bleiben stumm: Das Feld sieht aus wie immer, das Ergebnis zeigt „–“. Zwei Werte werden sogar heimlich ersetzt – Leinwand-Gain ≤ 0 rechnet mit 1, cos φ über 1 mit 1 | `NumField` in `tools/_calc/ui.tsx`; `ProjectorLumen.tsx`, `PowerLoad.tsx` | K2, K3 |
| 3 | Jeder Rechner baut seine Zeilen aus `NumField` und `SelectField`; für alles andere (Schieber, Knopfgruppe, Textfeld) gibt es keine Zeile – der Timecode steckt deshalb in einem Zahlenfeld | `tools/_calc/ui.tsx` (`RowLabel`, `rowClass`, `fieldBox` sind privat) | K2 |
| 4 | Timecode am Handy: Das Feld öffnet die Dezimaltastatur (Ziffern und Komma), die keinen Doppelpunkt hat. Tippen lässt sich „1,02,03,12“ (Komma wird als Trenner gelesen) – darauf kommt niemand; reine Ziffern „01020312“ lehnt `parseTc` ab | `Timecode.tsx`, `tc.ts` | K3 |
| 5 | Temperatur unter 0 °C lässt sich am iPhone nicht eintippen: Die Dezimaltastatur hat dort kein Minus (WebKit-Fehler 193825; am Gerät zu prüfen) | `AudioDelay.tsx`, `NumField` (`inputMode="decimal"`) | K2, K3 |
| 6 | Auswahl aus zwei bis vier Möglichkeiten ist mal eine Liste (zwei Tipps, Optionen verdeckt), mal eine Knopfgruppe (ein Tipp, alles sichtbar): Stromlast „Anschluss“ und „Auslastung“ sowie neun Listen im RTA gegenüber `Segmented` im Kopf des RTA | `PowerLoad.tsx`, `RtaCards.tsx`, `Rta.tsx` | K2, K3 |
| 7 | Dasselbe Ergebnis steht doppelt: Der DMX-Dip-Schalter zeigt die Adresse im Feld und gleich darunter noch einmal groß | `DmxAddress.tsx` | K3 |
| 8 | Status steht als Zeichen im Text statt über die Statusstufen der App: „ausreichend ✓ / zu dunkel ✗“, Warnungen mit „⚠“ | `ProjectorLumen.tsx`, `Rigging.tsx`; Vorgabe `components/ui/status.ts` | K2, K3 |
| 9 | Die Schalter des DMX-Dip-Schalters sagen Vorlesewerkzeugen nicht, ob sie an sind (nur `title`) | `DmxAddress.tsx` | K3 |
| 10 | Das ⓘ am Handy: Es ist 16 px klein; die Blase schließt nur, wenn der Knopf den Fokus verliert – auf iOS kommt dieses Ereignis beim Tippen daneben oft nicht (nachgelesen, am Gerät zu prüfen), sie bleibt dann offen, bis man dasselbe ⓘ noch einmal trifft. Ihre Lage wird einmal berechnet; beim Scrollen bleibt sie stehen | `components/ui/info-tip.tsx` | K2 |
| 11 | Alle Eingaben sind weg, sobald das Fenster zugeht oder das Handy die PWA aus dem Speicher wirft; es erscheinen wieder die Beispielwerte | alle Rechner (`useState`) | K4 |
| 12 | „Messen/Stopp“ des RTA ist ein eigener Knopf mit leerem Quadrat; der Testton bräuchte denselben noch einmal. Das Wachhalten des Bildschirms steht mitten in `Rta.tsx` | `Rta.tsx` | K2, K3 |
| 13 | Totes und Doppeltes: `NumField` hat eine Eigenschaft `readOnly`, die niemand nutzt; `parseNum` und `parseDecimal` (`components/ui/decimal-field.tsx`) tun dasselbe; der Skill `neues-werkzeug` nennt einen Baustein `CalcAlert`, den es nicht gibt | `tools/_calc/ui.tsx`, Skill | K2 |
| 14 | Die PWA nennt alles „Rechner“ („Weitere Rechner“, „Alle Rechner“), obwohl der RTA keiner ist; ihre Beschreibung im Manifest zählt ihn nicht auf | `src/pwa/App.tsx`, `src/pwa/build/plugin.ts`, `src/pwa/index.html` | K3, T3 |
| 15 | Ton-Kern: Jede Änderung am Metronom (Tempo, Takt, Betonung) baut die Stimme neu auf und beginnt wieder bei der Eins – mit Knöpfen für „schneller/langsamer“ stottert das | `sameVoice()` in `engine.ts` | T2 |
| 16 | Ton-Kern, aus dem Code gelesen, nicht gemessen: Kommt der Planungstakt verspätet (verdecktes Fenster, hängende Seite), starten alle verpassten Polaritätspulse im selben Augenblick – nach 2 s vier Pulse übereinander, das sind +12 dB am Pegel-Deckel vorbei | `tick()` in `engine.ts` (`oneShot` ohne Prüfung auf Vergangenheit) | T2 |

Nicht Teil dieses Plans, weil schon woanders geplant: kürzere Beschreibungen aller Werkzeuge
(Paket B6 der Durchsicht), `Rta.tsx` teilen (E1), gefüllte Stopp-Symbole in Stage-Timer und
Jingle-Player (B4), die Zahl der Werkzeuge in der Doku (E6).

## Ziele

1. **Ein Testtongenerator**, der im kleinen Fenster und am Handy gleich aussieht und denselben
   Kern nutzt wie der Testbildgenerator. Neue Signale entstehen künftig an einer Stelle.
2. **Sicher wie bisher:** Pegel gedeckelt bei −6 dBFS, Start eingeblendet, nie ein Ton, den
   niemand sieht (läuft etwas, zeigt es das Fenster, und die Rückfrage beim Beenden nennt es).
3. **Die kleinen Werkzeuge bedienen sich gleich:** eine Art Zeile, eine Regel für Auswahl, ein
   Knopf für Start und Stopp, falsche Eingaben sieht man, am Handy passen Tastatur, ⓘ und
   Tippflächen.
4. **Weniger statt mehr:** nichts doppelt (Ergebnis, Funktion, Kern), kein Baustein ohne
   Nutzer, Rechnen getrennt vom Anzeigen und getestet.

## Der Testtongenerator

| Eigenschaft | Wert |
| ----------- | ---- |
| Kennung | `tone-generator` |
| Name | Testtongenerator (wie „Testbildgenerator“) |
| Beschreibung | „Sinus, Rauschen, Sweep und Metronom“ (35 Zeichen, passt zu B6) |
| Symbol | `AudioWaveform` (lucide-react; `AudioLines` hat schon das Audio-Delay) |
| Kategorie | `calc`, in Registry und PWA-Liste direkt nach dem RTA |
| Fenster | eine Spalte (`ONE_COLUMN`), läuft im Hintergrund ungedrosselt |
| Suchwörter | testton, ton, tone, signalgenerator, sinus, sine, pegelton, 1 khz, rosa rauschen, pink noise, weißes rauschen, white noise, sweep, gleitsinus, metronom, klick, click, bpm, tempo, tap, kanal, links, rechts, polarität, phase, gegenphase, glits, einmessen, pa, lautsprecher |

### Signale

Sieben der acht Signale des Kerns. **AV-Sync bleibt im Testbildgenerator** – es braucht den
Blitz auf dem Ausgang.

| Signal (Knopf) | Einstellung | Wofür |
| -------------- | ----------- | ----- |
| Sinus | Frequenz 20 Hz bis 20 kHz: Feld, Schieber (logarithmisch), Schnellwahl 50 Hz, 100 Hz, 440 Hz, 1 kHz, 10 kHz | Bezugston (1 kHz bei −18 dBFS), Wege und Pegel prüfen, Klappern und Resonanzen von Hand abfahren |
| Sweep | Dauer je Durchlauf 1 bis 60 s; 20 Hz → 20 kHz logarithmisch, 0,5 s Pause | Lücken, Klirren und Resonanzen über den ganzen Bereich |
| Rosa (Rauschen) | – | Einmessen mit dem RTA, Lautsprecher vergleichen |
| Weiß (Rauschen) | – | Messungen mit FFT, Hochtöner |
| Metronom | Tempo 30 bis 300 BPM, Schläge je Takt 1 bis 12, Eins betonen – siehe [Metronom](#metronom) | Tempo vorgeben, Proben, Klick |
| Kennung | – (1 kHz; links setzt der Ton einmal aus, rechts zweimal je 4 s) | vertauschte Kanäle |
| Polarität | – (positiver Puls alle 0,5 s) | Polaritätsprüfer |

Für alle außer der Kennung wählbar – **Kanäle:** Beide, Links, Rechts, Wechsel (sekündlich)
und neu **Gegenphase** (beide Kanäle, rechts mit gedrehter Polarität). Steht man mittig vor
einem richtig verkabelten Paar, klingt Gegenphase dünn und ortlos, der Bass fehlt. Klingt es so
schon bei „Beide“, ist ein Lautsprecher verpolt.

### Aufbau der Seite

Bausteine wie die übrigen kleinen Werkzeuge (`CalcPage` mit `head`, darunter zwei
`SectionCard`s). Bei 520 px Fensterbreite:

```text
┌ Testtongenerator ─────────────────────────────────┐
│ ┌───────────────────────────────────────────────┐ │
│ │ [▶ Ton starten]    Sinus 1 kHz · −18 dBFS     │ │  Kopf: Start/Stopp und was gespielt wird
│ └───────────────────────────────────────────────┘ │
│ ┌ SIGNAL ⓘ ─────────────────────────────────────┐ │  ⓘ erklärt das gewählte Signal
│ │ [ Sinus ][ Sweep ][ Rosa  ][ Weiß ]           │ │  ein Tipp wechselt, auch im Betrieb
│ │ [Metronom][Kennung][Polarität]                │ │
│ │ Frequenz       [ 1000              Hz ]       │ │
│ │                ○──────────●────────────○      │ │  20 Hz … 20 kHz, logarithmisch
│ │                [50 Hz][100 Hz][440 Hz]…       │ │  Schnellwahl
│ └───────────────────────────────────────────────┘ │
│ ┌ AUSGABE ⓘ ────────────────────────────────────┐ │
│ │ Pegel          ○────────●──────○   −18 dBFS   │ │
│ │                [−20][−18][−12]                │ │
│ │ Kanäle         [Beide][Links][Rechts]         │ │
│ │                [Wechsel][Gegenphase]          │ │
│ │ Ausgabegerät   [ Standardgerät            ▾ ] │ │  nur, wo es etwas zu wählen gibt
│ └───────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────┘
```

Mit „Metronom“ steht in der Karte „Signal“ statt der Frequenz:

```text
│ │ Tempo          [−][ 120 ][+] BPM   [Tippen]   │ │
│ │ Schläge        [−][  4  ][+]   ☑ Eins betonen │ │
│ │                ●   ○   ○   ○                  │ │  läuft mit dem Ton, die Eins größer
```

Sweep zeigt nur „Dauer“ (Sekunden), die übrigen Signale keine weitere Zeile. Unter 330 px
rücken die Beschriftungen wie überall über die Felder; Knopfgruppen brechen um.

### Verhalten

- **Start und Stopp:** „Ton starten“ (Akzent, Play-Symbol) wird zu „Stopp“ (rote Fläche,
  gefülltes Quadrat – Rot heißt in der App „live“). Daneben steht, was gespielt wird
  (`toneSummary()` aus dem Kern). Die **Leertaste** schaltet um – nicht in Textfeldern, nicht
  auf einem Knopf oder einer Liste (rein geprüft, Muster `tools/atem-control/tastatur.ts`).
- **Alles wirkt sofort, auch im Betrieb:** Ein anderes Signal oder andere Kanäle werden in
  50 ms übergeblendet, Frequenz und Pegel gleiten, das Tempo ändert sich ohne neuen Takt.
- **Pegel:** Spitzenpegel in dBFS, −60 bis −6 in halben dB, Vorgabe −18. Schnellwahl −20
  (SMPTE RP 155), −18 (EBU R 68), −12. Im ⓘ der Karte: Bei Sinus liegt der Effektivwert 3 dB
  unter dem Pegel, bei Rauschen 12 dB; gedeckelt und eingeblendet zum Schutz von Ohren und
  Hochtönern.
- **Verlassen heißt aus:** Fenster zu oder zurück zur Liste in der PWA beendet den Ton.
- **Bricht der Ton ab** (Gerät weg, iOS nimmt der Seite den Ton), springt der Knopf zurück
  auf „Ton starten“ und ein Hinweis (`Alert`) sagt es – nie „läuft“ ohne Ton.
- **Ausgabegerät:** Liste nur, wenn der Browser die Wahl kann (`setSinkId` am `AudioContext`)
  und mindestens ein Gerät mit Namen meldet – so in der App und in Chrome am Rechner; wo nicht,
  fehlt die Zeile. Fällt das gewählte Gerät weg, läuft der Ton auf dem Standardgerät weiter,
  mit Hinweis (so macht es der Kern schon).
- **Meldungen** stehen als `Alert` in der Seite, nie als Toast.

### Metronom

- **Tempo:** Zahlenfeld (übernimmt bei Enter oder Verlassen, `NumberField`) mit „−“ und „+“ für
  einen Schlag je Minute und **„Tippen“**: aus den letzten bis zu fünf Tipps der Mittelwert der
  Abstände; eine Pause über 2 s beginnt neu. Rein gerechnet und getestet.
- **Takt:** Schläge je Takt mit „−“ und „+“, „Eins betonen“ (höherer Klick; bei einem Schlag
  je Takt ausgegraut).
- **Tempo, Takt und Betonung ändern sich im Betrieb ohne Neustart:** Der nächste Schlag folgt
  im neuen Abstand auf den letzten. Schläge, die schon eingeplant sind (bis 0,4 s voraus),
  kommen noch im alten Abstand.
- **Schlag-Anzeige:** ein Punkt je Schlag, der laufende leuchtet, die Eins ist größer. Sie
  liest den Stand aus der Uhr des Kerns (abzüglich der Ausgabelatenz), nicht aus einem eigenen
  Timer – sonst liefe sie dem Ton davon.

### Am Handy

Nachgelesen am 13. November 2026 (MDN, WebKit-Fehlerberichte, Chrome-Entwicklerblog), nicht am
Gerät geprüft – deshalb die [Abnahme am Gerät](#abnahme-am-gerät).

- Der Ton kommt aus dem, was das Handy gerade als Ausgang nutzt (Lautsprecher, Kopfhörer oder
  USB-Adapter, Bluetooth). Eine Gerätewahl gibt es dort in der Regel nicht – die Zeile fehlt
  dann.
- **iPhone-Stummschalter:** Ton aus Web Audio gilt in Safari als Nebengeräusch und schweigt
  bei umgelegtem Stummschalter. Ab iOS 17 hebt `navigator.audioSession.type = 'playback'` das
  auf. Die API gibt es nur in Safari – also prüfen, ob sie da ist, beim Start setzen und beim
  Stopp auf `'auto'` zurück (der RTA braucht danach wieder das Mikrofon).
- **Hintergrund:** iOS hält den Ton an, sobald die App in den Hintergrund geht oder der
  Bildschirm sperrt. Das lässt sich nicht verhindern, nur anzeigen (siehe „Bricht der Ton ab“).
  Solange der Ton läuft, bleibt der Bildschirm an (wie beim RTA).
- Ein Ton startet im Browser nur nach einer Bedienung. Start per Knopf oder Leertaste erfüllt
  das; nichts darf den Ton von selbst starten.

### Speichern, Fenster, „Was läuft“

- **Speichern:** eigener zustand-Store wie beim RTA (`tools/rta/store.ts` ist das Muster):
  Name `tone-generator`, `debouncedStorage()`, `version: 1`, `syncAcrossWindows`. Gemerkt
  werden Signal, Frequenz, Pegel, Kanäle, Sweep-Dauer, Tempo, Takt, Betonung und Ausgabegerät
  – als `PatternToneSettings`. **Der gemerkte Stand ist fremde Eingabe:** beim Laden durch
  `normalizeTone` (sonst hebelt ein kaputter Eintrag den Pegel-Deckel aus); ein gemerktes
  `avsync` wird zu `sine`. Keine Verbindung zu `patternTone` des Testbilds – zwei Werkzeuge,
  zwei Stände.
- **Fenster:** Eintrag in `SMALL_TOOLS` mit dem Kennzeichen für „läuft im Hintergrund weiter“.
  Heute heißt es `measures` und gilt nur für den RTA; es wird zu `background` (misst oder
  spielt), `measuresInBackground()` zu `runsInBackground()`.
- **„Was läuft“:** `useAktivMelden('testton', spielt)`. Die Kennung gibt es schon
  (`RENDERER_AKTIV` in `main/services/beenden/laufendText.ts`, je Fenster gezählt) – die
  Rückfrage beim Beenden nennt „Testton läuft“, und der Rechner bleibt wach. Dafür muss der
  Hook ohne `api` auskommen (Schritt T1).

## Bausteine

Was neu ist oder sich ändert, und wer es nutzt. Namen der neuen Bausteine sind Vorschläge.

| Baustein | Wo | Was | Nutzer |
| -------- | -- | --- | ------ |
| `FieldRow` | `tools/_calc/ui.tsx` | die Zeile der Rechner als eigener Baustein: Beschriftung mit ⓘ links, beliebiges Bedienelement rechts, Umbruch wie heute. `NumField` und `SelectField` bauen darauf | alle |
| `ChoiceField` | `tools/_calc/ui.tsx` | `FieldRow` mit Knopfgruppe (`Segmented`). Passt sie nicht neben die Beschriftung, rückt sie darunter | Stromlast, RTA, Testton |
| `Segmented` mit `wrap` | `components/ui/segmented.tsx` | bricht in gleich breiten Spalten um statt überzulaufen | Testton (Signal, Kanäle) |
| `RangeField` | `tools/_calc/ui.tsx` | `FieldRow` mit Schieber und Wert als Text daneben | Testton |
| `QuickPick` | `tools/_calc/ui.tsx` | Schnellwahl: kleine Knöpfe, die einen Wert setzen; der passende ist gedrückt (`aria-pressed`) | Testton |
| `RunButton` | `tools/_calc/ui.tsx` | Start/Stopp für Werkzeuge, die laufen: Start in Akzent mit Symbol, läuft = rote Fläche „Stopp“ mit gefülltem Quadrat, „Startet…“ gesperrt | RTA, Testton |
| `NumField` | `tools/_calc/ui.tsx` | zeigt ungültige Eingaben (roter Rahmen, `aria-invalid`), `signed` für Felder mit Minus, ohne `readOnly` | alle |
| `Readout` mit `tone` | `tools/_calc/ui.tsx` | Ergebnis als Statusaussage: Farbe und Symbol aus `STATUS` | Beamer-Lumen |
| `useWakeLock` | `lib/` | Bildschirm wach, solange etwas läuft (heute in `Rta.tsx`) | RTA, Testton |
| `InfoTip` | `components/ui/info-tip.tsx` | schließt beim Tippen daneben und beim Scrollen, größere Tippfläche | ganze App |
| Ton-Kern | `tools/_tone/` | Engine, Plan, gemeinsamer Hook – aus dem Testbild herausgezogen | Testbild, Testton |
| `useAktivMelden` | `lib/aktivMelden.ts` | ohne `api`: Der Melder wird von außen gesetzt | Testbild, Jingle, Testton |

Regel für Auswahl, die danach überall gilt: **bis vier kurze Möglichkeiten eine Knopfgruppe,
sonst eine Liste.** Ausnahme mit Umbruch nur dort, wo man im Betrieb oft umschaltet (Signal und
Kanäle des Testtons).

## Umsetzung in Schritten

Größen wie in der Durchsicht: **S** bis etwa zwei Stunden, **M** ein halber bis ganzer Tag.

| Schritt | Inhalt | Größe | Braucht |
| ------- | ------ | ----- | ------- |
| **T1** | Ton-Kern umziehen, läuft ohne Electron – ohne sichtbare Änderung | M | – |
| **K2** | Bausteine: Zeile, Knopfgruppe, Schieber, Schnellwahl, Start/Stopp, ⓘ am Handy | M | – |
| **T2** | Ton-Kern erweitern: Metronom ohne Neustart, Schlag-Anzeige, Abbruch, Gegenphase | M | T1 |
| **T3** | Das Werkzeug: Seite, Store, Fenster, PWA, E2E, Doku | M | K2, T2 |
| **K1** | Rechenkerne der sieben Rechner mit Tests – ohne sichtbare Änderung | M | – |
| **K3** | Die Rechner angleichen | M | K2, besser nach K1 |
| **K4** | Rechner merken sich die Eingaben | M | K3, Entscheidung 3 |

Empfohlene Reihenfolge wie in der Tabelle: erst der Testton (T1, K2, T2, T3), dann die Rechner.
T1 und K2 hängen nicht voneinander ab.

Stolpersteine zusätzlich zu denen der Durchsicht:

- **Nach jedem Schritt `npm run pwa:build`.** Er bricht ab, wenn ein kleines Werkzeug `api`
  oder Einstellungen hereinzieht oder eine Datei außerhalb von `src/pwa/build/sources.ts`
  einbindet. `npx vitest run src/pwa` prüft, dass PWA-Liste und `SMALL_TOOLS` gleich sind.
- **Es gibt keine Komponententests** (Vitest läuft ohne DOM, keine Datei endet auf
  „.test.tsx“). Rechnen und Entscheiden gehören in reine Module mit Test; Verhalten der
  Oberfläche prüft ein E2E-Schritt.
- **Ton wird gemessen, nicht gehört** (Skill `electron-e2e`, „Ton messen statt hören“): vor
  dem Start `AudioNode.prototype.connect` umlenken, Messwerte mit `waitFor` abwarten statt
  einmal lesen, ohne laufende Audioausgabe überspringen (`Skip`).
- **Kleine Werkzeuge sind keine Route im Hauptfenster:** im E2E über
  `window.api.openToolWindow('<id>')` öffnen und auf das neue Fenster warten (`openSmall` in
  `e2e/layout.mjs`, `openRta` in `e2e/rta.mjs`).
- **Geplante Dateien** stehen hier in Textblöcken – in Backticks fände `npm run check:refs`
  sie nicht. Umgekehrt nennt die Ausgangslage Dateien, die T1 verschiebt: Meldet
  `check:refs` danach dieses Dokument, die Stelle anpassen oder mit dem Schritt streichen.

### T1 – Ton-Kern umziehen, läuft ohne Electron

**Heute:** siehe [oben](#den-testton-gibt-es-schon--im-testbildgenerator), die drei Gründe.

**So** – der Testbildgenerator verhält sich danach genau wie vorher:

```text
src/shared/testton.ts                           Typen und Vorgabe des Testtons
src/renderer/src/tools/_tone/engine.ts          verschoben aus test-patterns/tone/
src/renderer/src/tools/_tone/plan.ts            verschoben; dazu die Erklärtexte je Signal
src/renderer/src/tools/_tone/plan.test.ts       verschoben
src/renderer/src/tools/_tone/useToneEngine.ts   Engine starten, nachführen, stoppen; Geräteliste
```

1. `ToneSignal`, `ToneChannels`, `PatternToneSettings` und `DEFAULT_PATTERN_TONE` ziehen aus
   `src/shared/types.ts` in die neue Datei unter `src/shared/`. `types.ts` exportiert sie
   weiter – kein anderer Import ändert sich. Die Namen bleiben, auch `patternTone` in
   `settings.json`.
2. `engine.ts`, `plan.ts` und der Test ziehen nach `tools/_tone/` – mit
   `.claude/skills/aufraeumen/move.mjs` (rechnet die Importe neu, nimmt den Test mit; erst ohne
   `--apply`). `plan.ts` holt die Vorgabe danach aus der neuen shared-Datei. Der Kommentar in
   `patterns.ts`, der auf die Engine zeigt, zieht mit.
3. `SIGNAL_HINTS` zieht aus `TestTone.tsx` nach `plan.ts` – beide Oberflächen zeigen dieselben
   Texte.
4. Neuer Hook im Kern: Was `useTestTone` heute rund um die Engine tut (anlegen, bei geänderten
   Einstellungen nachführen, beim Verlassen stoppen, Liste der Ausgabegeräte samt
   `devicechange`, `useAktivMelden`), kommt dorthin. Er bekommt die Einstellungen und meldet
   Warnung und Fehler über Rückrufe – ohne Toast, ohne Einstellungen. `useTestTone` in
   `TestTone.tsx` bleibt und bindet nur noch `settings.json`, die Zwischenstände beim Ziehen
   und die Toasts daran.
5. `lib/aktivMelden.ts` importiert `api` nicht mehr. Stattdessen setzt die App den Melder
   einmal von außen – Muster `setStorageErrorHandler` in `lib/persistStorage.ts`, gesetzt in
   `src/renderer/src/main.tsx` vor dem ersten Rendern. Ohne Melder (PWA) bleibt der Hook still.
6. `tools/_tone` kommt in `pwaSources()` (`src/pwa/build/sources.ts`), der Test
   `src/pwa/build/sources.test.ts` zieht mit.

**Abnahme:** `npm run typecheck`, `npm run typecheck:test`,
`npx vitest run src/renderer/src/tools src/pwa src/shared`, `npm run e2e -- testton testpattern
shutdown` unverändert grün (dieselben Schritte, keine angepasst). Unit-Test für den Melder:
gesetzt bekommt er Kennung und Zustand, ungesetzt wirft nichts. In `tools/_tone` und
`lib/aktivMelden.ts` steht kein Import von `api` oder den Einstellungen mehr.
`npm run check:refs`.

### K2 – Bausteine

Nur Bausteine und ihre heutigen Nutzer; das Aussehen der Rechner ändert sich nicht, außer wo es
unten steht. Alles in `tools/_calc/ui.tsx`, sofern nicht anders genannt.

```text
src/renderer/src/lib/useWakeLock.ts   aus Rta.tsx herausgezogen
```

1. **`FieldRow`** aus `RowLabel`, `rowClass` und `fieldBox`; `NumField` und `SelectField`
   nutzen ihn. Das ⓘ bleibt neben dem `<label>`, nicht darin (Kommentar an `RowLabel`).
2. **`ChoiceField`** und **`Segmented` mit `wrap`** (`components/ui/segmented.tsx`): Vorgabe
   bleibt die eine Zeile; mit `wrap` gleich breite Spalten, die umbrechen. Ein Knopf bleibt ein
   `button` mit `aria-pressed`.
3. **`RangeField`**: `<input type="range">` mit dem Akzent wie die `Checkbox`
   (`accent-[hsl(var(--primary))]`), `aria-label`, rechts der Wert als Text mit festen Ziffern.
4. **`QuickPick`**: `Button size="sm"`, gewählt `secondary`, sonst `outline` (so macht es
   `TestTone.tsx` heute für die Frequenzen), bricht um.
5. **`RunButton`**. Der RTA nutzt ihn sofort – „Messen“, „Startet…“, „Stopp“ behalten ihre
   Namen, das Quadrat wird gefüllt (`fill-current`, wie Paket B4 der Durchsicht).
6. **`NumField`:** `readOnly` entfällt. Ein nicht leeres Feld, das `parseNum` nicht lesen
   kann, ist rot umrandet (`border-danger`) und trägt `aria-invalid`; zusätzlich `invalid` für
   Werte, die lesbar, aber nicht rechenbar sind. `signed` öffnet am Handy eine Tastatur mit
   Minus (`inputMode="text"` statt `decimal`; taugt das am Gerät nicht, stattdessen ein Knopf
   „±“ am Feld). `parseNum` reicht nur noch `parseDecimal` weiter
   (`components/ui/decimal-field.tsx`) – eine Lese-Funktion statt zwei.
7. **`Readout` mit `tone`** (`success`, `warning`, `danger`): Wert in der Statusfarbe, davor
   das Symbol aus `STATUS` (`components/ui/status.ts`).
8. **`useWakeLock(aktiv)`** nach `lib/`; `Rta.tsx` nutzt ihn (gleiches Verhalten: nur bei
   sichtbarer Seite, nach dem Zurückkommen neu anfordern).
9. **`InfoTip`** (`components/ui/info-tip.tsx`): Solange die Blase offen ist, schließen ein
   Tippen oder Klick außerhalb, Scrollen (auch eines Bereichs darüber) und eine neue
   Fenstergröße sie. Bei grobem Zeiger (`@media (pointer: coarse)`) ist die Tippfläche
   mindestens 32 px groß – unsichtbar vergrößert, das Zeichen bleibt 16 px. Am Rechner ändert
   sich nichts: Hover zeigt, Klick hält offen.
10. Im Skill `neues-werkzeug`: `CalcAlert` durch `Alert` ersetzen, die neuen Bausteine und die
    Regel für Auswahl nennen.

**Abnahme:** `npm run e2e -- layout rta` grün; in `e2e/layout.mjs` (prüft das ⓘ schon) neu:
im Fenster eines kleinen Werkzeugs bei 320 px Breite ⓘ anklicken – Blase da; daneben klicken –
weg; wieder öffnen, scrollen – weg. `e2e/rta.mjs`: „Stopp“ hat ein gefülltes Quadrat.
`npm run pwa:build`.

### T2 – Ton-Kern erweitern

Alles im Kern (`tools/_tone/`), sichtbar auch im Testbildgenerator. **Erst nachstellen**, wo
ein Befund dahintersteht (15 und 16).

1. **Metronom fortlaufend planen (Befund 15):** `bpm`, `beatsPerBar` und `accent` gehören
   nicht mehr zu `sameVoice()`; die Stimme merkt sich den nächsten Schlag (Zeit ab `t0` und
   laufende Nummer), der Takt plant von dort bis zum Planungshorizont und nimmt Tempo, Takt und
   Betonung aus den Einstellungen von jetzt. Ändert sich das Tempo, rückt der noch nicht
   eingeplante Schlag auf „letzter eingeplanter + neuer Abstand“, nie in die Vergangenheit. Als
   reine Funktionen in `plan.ts` (lösen `metronomeBeats()` ab), mit Tests: keine Lücke und kein
   doppelter Schlag an der Fenstergrenze; 120 → 60 BPM nach dem Schlag bei 0,5 s gibt den
   nächsten bei 1,5 s; ein Schlag, der in der Vergangenheit läge, kommt „jetzt“.
2. **Schlag-Anzeige:** Die Engine gibt Auskunft, welcher Schlag gerade klingt (Schlag im Takt,
   laufende Nummer) – aus den zuletzt eingeplanten Schlägen und `currentTime` abzüglich der
   Ausgabelatenz (den Ausdruck gibt es in `wallToContext()`). Ohne Metronom `null`.
3. **Abbruch melden:** Meldet der `AudioContext` nach dem Start einen anderen Zustand als
   `running` (und die Engine hat nicht selbst gestoppt), räumt sie auf und ruft einen Rückruf.
   Der Hook aus T1 setzt „spielt“ zurück; das Testbild zeigt einen Toast, der Schalter „Ton“
   geht aus.
4. **Verpasstes nicht nachholen (Befund 16):** Einzelereignisse, deren Zeit beim Planen schon
   vorbei ist, werden verworfen. Nachstellen im E2E: Polaritätspuls läuft, die Seite 1,5 s
   blockieren (Schleife in `page.evaluate`), danach liegt keine Spitze über dem eingestellten
   Pegel. Dazu prüfen und nur bei Befund beheben: Fenster minimieren, 20 s Polaritätspuls und
   Metronom bei 40 BPM aufnehmen – kommen die Schläge unregelmäßig, plant der Takt im
   verdeckten Fenster weiter voraus (1,5 s statt 0,4 s, `document.hidden`).
5. **iPhone-Stummschalter:** beim Start `navigator.audioSession.type = 'playback'`, beim Stopp
   `'auto'` – nur, wenn es die Eigenschaft gibt, in `try`/`catch`.
6. **Gegenphase** (Entscheidung 2): neuer Wert in `ToneChannels` und `CHANNEL_OPTIONS`, rechter
   Kanal mit Verstärkung −1. Die Kennung nutzt weiter beide Kanäle gleichphasig.
7. **Schnellwahl:** `FREQ_PRESETS` wird zu 50, 100, 440, 1.000, 10.000 Hz (auch in der
   Schublade des Testbilds, dort bricht die Reihe um); neu die Pegel −20, −18, −12.

**Abnahme:** `npx vitest run src/renderer/src/tools/_tone`; `e2e/testton.mjs` mit neuen
Schritten: Metronom läuft, das Tempo zehnmal im Abstand von 0,3 s zwischen 120 und 200 BPM
wechseln – kein Abstand zwischen zwei Klicks ist kürzer als 0,2 s (heute setzt jeder Wechsel
sofort einen neuen Klick); Gegenphase – am Summenpunkt (links plus rechts) Stille, je Kanal
der Pegel; blockierte Seite wie oben.
`docs/WERKZEUGE.md` (Testbildgenerator, Testton) nennt Gegenphase, die fünf Frequenzen und den
Tempowechsel ohne Neustart.

### T3 – Das Werkzeug

```text
src/renderer/src/tools/tone-generator/index.ts             ToolModule
src/renderer/src/tools/tone-generator/ToneGenerator.tsx    Seite: Kopf, Karten „Signal“ und „Ausgabe“
src/renderer/src/tools/tone-generator/store.ts             gemerkter Stand
src/renderer/src/tools/tone-generator/store.test.ts
src/renderer/src/tools/tone-generator/bedienung.ts         rein: Tippen, Schieber ↔ Hz, Leertaste
src/renderer/src/tools/tone-generator/bedienung.test.ts
e2e/tone-generator.mjs
e2e/toneTap.mjs                                            Analysator vor dem Ausgang, aus testton.mjs
```

1. **Werkzeug anlegen** nach Skill `neues-werkzeug`: `ToolModule` laut
   [Steckbrief](#der-testtongenerator), Eintrag in `tools/registry.ts` und `src/pwa/tools.ts`
   (beide nach dem RTA), in `SMALL_TOOLS` mit `ONE_COLUMN`.
2. **Kennzeichen umbenennen:** `measures` → `background`, `measuresInBackground()` →
   `runsInBackground()` in `src/shared/toolWindows.ts`, `src/shared/toolWindows.test.ts`,
   `main/services/windows/smallToolWindows.ts`, Kommentar in `appWindows.ts`, Skill
   `neues-werkzeug`. RTA und Testton tragen es.
3. **Store** wie unter [Speichern](#speichern-fenster-was-läuft). Test: Unsinn im gemerkten
   Stand (Pegel 0, Signal „laser“, `avsync`) ergibt sichere Werte.
4. **Seite** nach [Aufbau](#aufbau-der-seite) und [Verhalten](#verhalten) aus den Bausteinen
   von K2 und dem Hook aus T1. Felder, die an den Store gebunden sind (Frequenz, Dauer, Tempo,
   Schläge), sind `NumberField` in einem `FieldRow` – sie übernehmen bei Enter oder Verlassen.
   Ein an den Store gebundenes `NumField` höbe beim Tippen von „90“ schon die „9“ auf 30 an.
   Jedes Bedienelement hat einen Namen für Vorlesewerkzeuge und Tests („Frequenz in
   Hz“, „Pegel in dBFS“, „Tempo in BPM“, „Schläge je Takt“). Keine Datei über etwa 300 Zeilen
   – die Zeilen je Signal als eigene kleine Komponenten.
5. **Reine Helfer mit Test:** Tempo aus Tipps (vier Tipps im Abstand 500 ms ergeben 120; ein
   Tipp ergibt nichts; nach 2 s Pause zählt neu; Ergebnis zwischen 30 und 300), Schieber ↔
   Frequenz (0 ↔ 20 Hz, Ende ↔ 20 kHz, hin und zurück gleich), Leertaste (ja auf der Seite,
   nein in Feld, Liste, Knopf).
6. **PWA:** sichtbare Texte nennen den Testton (Beschreibung im Manifest in
   `src/pwa/build/plugin.ts` und in `src/pwa/index.html`: auch RTA und Testtongenerator).
   `useWakeLock`, solange der Ton läuft.
7. **E2E** (neues Skript, in `e2e/run.mjs` eintragen; der Analysator zieht aus `testton.mjs`
   in eine gemeinsame Datei, beide Skripte nutzen sie). Schritte:
   - Fenster öffnet sich klein, Kopfleiste „Testtongenerator“; die Kennung steht in `SMALL` in
     `e2e/layout.mjs` (Höhe folgt dem Inhalt, 320 px ohne Querscrollen, Kompaktmodus).
   - „Ton starten“: eingeblendet, dann 1 kHz bei −18 dBFS auf beiden Kanälen; der Knopf heißt
     „Stopp“.
   - Jedes der sieben Signale klingt und bleibt unter dem Pegel; „AV-Sync“ gibt es nicht.
   - Kanäle: „Links“ – rechts still; „Gegenphase“ – Summe still.
   - Pegel-Schieber ganz nach rechts: Spitze bei −6 dBFS, nicht darüber.
   - Metronom 120 BPM: sechs Klicks (± einer) in 3 s; „+“ zwanzigmal im Betrieb – kein
     Abstand kürzer als 0,2 s; viermal „Tippen“ im Abstand 500 ms – das Feld zeigt 117 bis 123.
   - Leertaste startet und stoppt; in einem Zahlenfeld getippt tut sie nichts.
   - Fenster minimiert: Das Metronom läuft 5 s mit richtiger Schlagzahl weiter.
   - Läuft der Ton, nennt die Rückfrage beim Beenden „Testton läuft“ (Dialog ersetzen wie in
     `e2e/shutdown.mjs`, mit „Abbrechen“ antworten); Fenster schließen beendet den Ton.
   - Fenster schließen und wieder öffnen: Signal und Pegel stehen wie verlassen.
8. **Doku und Skills** laut [unten](#doku-und-skills).

**Abnahme:** Skill `abschluss-check` ganz, `npm run pwa:build`, `npm run e2e -- tone-generator
layout testton rta shutdown` (der RTA wegen des umbenannten Kennzeichens), dann die
[Abnahme am Gerät](#abnahme-am-gerät).

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
- Nicht für RTA und Testton – die haben ihren Store.

**Abnahme:** Unit-Test der Prüfung (Unsinn, fehlende und fremde Felder). E2E in
`e2e/layout.mjs`: Kreisrechner, Durchmesser 3 tippen, Fenster schließen, wieder öffnen – 3
steht da; „Zurücksetzen“ – 1 steht da, der Knopf ist weg. `npm run pwa:build`.

## Abnahme am Gerät

Was kein Test kann. Nach T3 (und K2, K3) am echten Handy mit der PWA aus `npm run pwa:preview`
oder nach dem Merge von der veröffentlichten Seite:

- **iPhone, als App installiert:** Ton startet nach einem Tipp; hörbar auch bei umgelegtem
  Stummschalter (ab iOS 17); der Bildschirm bleibt an; App wechseln und zurück – der Knopf
  zeigt „Ton starten“, ein Hinweis sagt warum; danach misst der RTA wieder (Mikrofon geht).
- **Android (Chrome):** dasselbe; dazu, ob das Metronom bei gesperrtem Bildschirm sauber läuft
  oder anhält – beides ist in Ordnung, solange die Anzeige stimmt.
- **Beide:** ⓘ antippen, daneben tippen, scrollen – die Blase ist weg; Timecode nur mit Ziffern
  eintippen; −5 °C im Audio-Delay; Knopfgruppen bei schmalem Bildschirm ohne Querscrollen.
- **Rechner:** Ausgabegerät im Betrieb wechseln; Fenster des Testtons hinter anderen Fenstern –
  das Metronom läuft gleichmäßig; App beenden, während der Ton läuft – die Rückfrage nennt ihn.

## Doku und Skills

Mit dem jeweiligen Schritt, nicht am Ende gesammelt:

- `docs/WERKZEUGE.md`: neuer Abschnitt „Testtongenerator“ unter „Rechner“ (nach dem RTA);
  Listen der kleinen Werkzeuge (Startbildschirm, „Rechner fürs Handy“: elf statt zehn);
  Inhaltsverzeichnis; beim Testbildgenerator ein Satz, dass es dieselben Signale als eigenes
  Werkzeug gibt. Die Zahl der Werkzeuge stimmt dort schon nicht (E6 der Durchsicht) – auf die
  Zahl der Einträge in `tools/registry.ts` setzen.
- `README.md`: Abschnitt „Rechner“, „Alle zehn Rechner“, Zahl der Werkzeuge.
- `docs/ROADMAP.md`: der Eintrag „Testtongenerator“ unter „Neue Werkzeuge“ schrumpft mit jedem
  Schritt und entfällt mit dem letzten.
- `docs/ENTWICKLUNG.md`: kleine Werkzeuge (Kennzeichen `background`, neue Bausteine),
  Rechner-PWA (`tools/_tone` in den Quellen, Melder für „läuft“).
- `CLAUDE.md`, Architektur: ein Punkt „Testton: ein Kern in `tools/_tone/` für
  Testbildgenerator und Testtongenerator – neue Signale dort, nicht je Werkzeug“; bei den
  kleinen Werkzeugen die Regel für Auswahl.
- Skills: `neues-werkzeug` (Bausteine, Kennzeichen, `useAktivMelden` ohne `api`),
  `electron-e2e` (neues Skript, gemeinsamer Analysator), `review-checkliste` (bestätigte
  Befunde aus T2 mit Messwert). Neu der Skill **`rechner-pwa`** (steht als fehlend in H3 der
  Durchsicht, dort dann streichen): was ein kleines Werkzeug nicht darf, Quellen der PWA,
  Meldungen als `Alert`, Ton und Mikrofon am Handy (Start nur nach Bedienung, Stummschalter,
  Hintergrund), Tastaturen der Felder, Abnahme am Gerät.
- Ist alles umgesetzt: Inhalt nach `docs/WERKZEUGE.md` überführen, diese Datei löschen.

## Entscheidungen, die bei dir liegen

Die Vorgabe in Klammern gilt, wenn du nichts anderes sagst.

1. **Behält der Testbildgenerator seinen Ton?** (Ja – beide nutzen denselben Kern, das Testbild
   bleibt, wie es ist.) Die Alternative: dort nur AV-Sync lassen und für alles Übrige auf das
   neue Werkzeug verweisen; spart eine zweite Oberfläche, nimmt aber den Schalter „Ton“ aus
   der Ausgabe-Leiste.
2. **„Gegenphase“ als fünfte Kanalwahl?** (Ja.)
3. **Sollen sich die Rechner ihre Eingaben merken** (Schritt K4)? (Ja, mit „Zurücksetzen“.)
4. **Heißt die Kategorie weiter „Rechner“?** (Ja.) Mit RTA und Testton wäre „Rechner & Messen“
   treffender – das ändert eine Beschriftung in `tools/types.ts` und die Überschriften in
   Doku und README.
5. **Reihenfolge:** erst der Testton, dann die Rechner – oder umgekehrt?

## Nicht tun

- **Keinen zweiten Ton-Kern** und keine zweite Signal-Liste. Kein AudioWorklet (eine Datei
  mehr, die Service Worker und Inhaltsrichtlinie der PWA kennen müssten).
- **AV-Sync nicht ins kleine Werkzeug.**
- **Bedienung des Testbildgenerators nicht umbauen** – Schalter „Ton“, Schublade und
  `patternTone` bleiben; `PatternToneSettings` wird nicht umbenannt.
- **Kein `api`, keine Einstellungen, kein Toast** in einem kleinen Werkzeug. Die Wahl des
  Ausgabegeräts liegt im Store des Werkzeugs, nicht in `settings.json`.
- **Nichts startet den Ton von selbst** – auch nicht „zuletzt lief er“.
- **Den Pegel-Deckel nicht anheben** und nicht umgehbar machen.
- **Keine weiteren Signale** über die Tabelle hinaus (siehe [Später möglich](#später-möglich)).
- **`tools/rta/testSignals.ts` nicht mit dem Rauschen des Kerns zusammenlegen:** andere
  Verteilung, die Tests des RTA hängen an den Zahlen.
- **`Rta.tsx` nicht teilen** (E1) und **keine Beschreibungen vorhandener Werkzeuge ändern**
  (B6).
- **Namen der PWA im Code lassen:** „Rechner-PWA“, `out-pwa`, der Cache-Name im Service Worker
  (ein neuer ließe die alten Caches auf den Handys liegen). Geändert werden nur sichtbare Texte.
- **Keine neuen Formeln, Einheiten oder Felder** in den Rechnern.

## Später möglich

Ideen aus der Planung, bewusst nicht Teil davon:

- Rosa Rauschen je Oktav- oder Terzband (einzelne Wege prüfen), Sweep mit wählbarem Bereich.
- Im RTA ein Knopf „Rauschen“, der rosa Rauschen aus demselben Kern spielt – Generator und
  Analysator auf einem Gerät.
- „Immer im Vordergrund“ für die Fenster der kleinen Werkzeuge.
- Der Punkt „läuft“ an der Kachel des Startbildschirms (`launcher/useToolActivity.ts` kennt
  heute nur, was der main-Prozess selbst weiß).
- LTC-Generator und -Leser (Teil G der Durchsicht) auf demselben Kern.
