# Plan: Befunde der Durchsicht vom November 2026

Am 10. November 2026 wurde die ganze App durchgesehen – Code, Design, Bedienung, Nutzen, neue
Werkzeuge, Skills. Vier Show-Risiken sind seitdem behoben (kein Standardmenü von Electron, kein
Energiesparen, solange etwas läuft, Einzelinstanz, Fernsteuerung weist Websites ab), dazu drei
kleine Fehler im Code (Medien ausliefern, Umlaute in Befehlen vom Handy, gescheitertes
Speichern der Werkzeug-Stände). Dieses
Dokument hält **alle übrigen Punkte** als Pakete fest, die sich einzeln in Auftrag geben und
umsetzen lassen – auch von einem anderen Modell, das die Durchsicht nicht kennt.

Die Punkte sind Vorschläge. Was umgesetzt wird und in welcher Reihenfolge, entscheidet
Matthias; die [Entscheidungen](#entscheidungen-die-bei-dir-liegen) am Ende sind noch offen.

- [So wird ein Paket umgesetzt](#so-wird-ein-paket-umgesetzt)
- [Übersicht und Reihenfolge](#übersicht-und-reihenfolge)
- [B – Bedienung und Design, kleine Pakete](#b--bedienung-und-design-kleine-pakete)
- [C – Video-Player und Arbeitsfläche](#c--video-player-und-arbeitsfläche)
- [D – Rückgängig](#d--rückgängig)
- [E – Aufräumen und Qualität](#e--aufräumen-und-qualität)
- [F – Mehr Nutzen](#f--mehr-nutzen)
- [G – Neue Werkzeuge](#g--neue-werkzeuge)
- [H – Skills und Einstellungen für die Arbeit mit Claude](#h--skills-und-einstellungen-für-die-arbeit-mit-claude)
- [Entscheidungen, die bei dir liegen](#entscheidungen-die-bei-dir-liegen)

## So wird ein Paket umgesetzt

Ein Auftrag lautet: **„Setze Paket B3 aus docs/PLAN-DURCHSICHT.md um.“** Mehr braucht es nicht –
alles Weitere steht hier und in den genannten Dateien.

1. **Frisch anfangen:** `git switch main`, `git pull --ff-only`, gemergte lokale Branches
   löschen, neuen Branch anlegen (Name wie das Paket, z. B. `scanner-adapter`). Nach einem
   Dependabot-Merge zuerst `npm ci` und `npm run electron:bin`.
2. **Lesen:** `CLAUDE.md`, dann die im Paket genannten Skills (`.claude/skills/<name>/SKILL.md`)
   und Dateien. Die Stellen im Paket stammen vom November 2026 – **erst am Code prüfen, ob der
   Befund noch stimmt.** Stimmt er nicht mehr, das Paket hier streichen und es sagen.
3. **Nachstellen, bevor etwas geändert wird:** einen Test schreiben, der am heutigen Stand
   scheitert – Unit-Test (`npx vitest run <datei>`) oder E2E-Schritt (`node e2e/<name>.mjs`
   gegen den gebauten alten Stand). Ein Test, der schon vorher grün ist, prüft nichts.
4. **Umsetzen:** nur dieses Paket. Fällt dabei etwas anderes auf, hier als neuen Punkt
   eintragen, nicht mit erledigen.
5. **Prüfen:** Skill `abschluss-check` (Format, `check:refs`, `check:files`, Lint, Typen, Tests,
   bei Änderungen an der Oberfläche `npm run e2e`), dazu der Skill `review-checkliste`.
6. **Nachziehen:** `docs/WERKZEUGE.md` (was die App jetzt kann), bei Bedarf weitere Doku, die
   Skills in `.claude/skills/` (jede Änderung zieht sie nach: neue Lehren, neue E2E-Skripte) –
   und **das Paket aus diesem Dokument streichen** (Zeile in der Übersicht und den Abschnitt).
   Ist ein Teil leer, auch seine Überschrift.
7. **Abliefern:** ein Commit, Push, Pull Request (Freigabe vom 8. Oktober 2026). Gemergt wird
   von Matthias.

Regeln, die für jedes Paket gelten:

- **Ein Paket, ein Pull Request.** Ausnahme: die mit „zusammen“ gekennzeichneten.
- **Nichts erfinden, was das Paket nicht verlangt** – keine neuen Optionen, keine Umbauten
  „bei der Gelegenheit“.
- **Offene Frage im Paket?** Erst fragen, dann bauen. Die Vorgabe in Klammern gilt nur, wenn
  Matthias sie bestätigt hat.
- Größen: **S** bis etwa zwei Stunden, **M** ein halber bis ganzer Tag, **L** mehrere Tage und
  ein eigener Plan (`docs/PLAN-<THEMA>.md`), bevor Code entsteht.

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
- Kleine Werkzeuge (Rechner) öffnen ein eigenes Fenster; `openRoute(page, '/tool/<id>')` springt
  im Hauptfenster zurück zum Start (Skill `electron-e2e`).
- `npm run dev` startet nicht neben der installierten Mottulbox (Einzelinstanz, gleicher
  Benutzerordner). Die E2E-Läufe haben eigene Ordner.
- Testausgaben mit Ersatzzeichen (U+FFFD, die Raute mit Fragezeichen) nicht in Code, Kommentare
  oder Doku übernehmen: Sie sehen danach aus wie ein Kodierfehler der Datei. Vor dem Commit mit
  `git grep` nach dem Zeichen suchen (bekannt und gewollt: je eines in `youtube.mjs`,
  `ytRequest.ts` und im Skill `review-checkliste`, alle zur Ausgabe von yt-dlp).

## Übersicht und Reihenfolge

Empfohlen von oben nach unten: erst der Player, dann die kleinen Punkte, die man täglich merkt.

| Paket | Inhalt | Größe | Braucht |
| ----- | ------ | ----- | ------- |
| **C** | Video-Player: Bühne, Playlist, Bibliothek (P3–P6; P1 und P2 erledigt) | M je Schritt | eigener Plan liegt vor |
| **B1** | Suche: Enter öffnet den ersten Treffer | S | – |
| **B2** | Strg+K: Werkzeug wechseln von überall | M | B1 |
| **B3** | Netzwerk-Scanner: sinnvoller Adapter vorgewählt | S | – |
| **B4** | Stopp-Symbole gefüllt | S | – |
| **B5** | Video-Generator: Leerzustand nicht rot | S | – |
| **B6** | Startbildschirm: Namen und Beschreibungen ganz lesbar | S | – |
| **B7** | App-Einstellungen als Dialog mit Reitern | M | – |
| **B8** | Schublade schwebt in schmalen Fenstern | S | – |
| **B9** | „Über und Diagnose“: Version, Protokoll, Datenordner | M | B7 |
| **B10** | Mini-Manual: Schritt-Texte ganz sichtbar | S | – |
| **B11** | Kundenansicht ohne Aufblitzen des Startbildschirms | S | – |
| **B12** | ATEM: Mischer im Netz suchen | M | – |
| **B13** | Helles Design: Akzent als Schrift lesbar | S | – |
| **D** | Rückgängig in den Editoren | L | eigener Plan nötig |
| **E1** | Große Komponenten teilen | M je Datei | – |
| **E2** | `shared/types.ts` nach Bereichen teilen | M | – |
| **E3** | Lint mit Typwissen, E2E-Skripte linten | M | – |
| **E4** | Werkzeug-Stände als Dateien statt Local Storage | L | eigener Plan nötig |
| **E5** | ffmpeg mit niedriger Priorität, solange eine Ausgabe läuft | M | erst messen |
| **E6** | Kleinkram: Beispiele-Ordner, Zahl der Werkzeuge in der Doku | S | Entscheidung |
| **F1** | Sicherung und Umzug auf einen anderen Rechner | L | eigener Plan nötig |
| **F2** | Show-Datei: OSC, Jingle, Timer, Packliste in der `.mottul` | M je Werkzeug | – |
| **F3** | Stage-Timer: Schnellstart, bis Uhrzeit, Ablauf einfügen | S–M | – |
| **F4** | Steuer-Schnittstelle dokumentieren | S | – |
| **F5** | Erstes Release | S | – |
| **G** | Neue Werkzeuge (Steckbriefe) | je L | je eigener Plan |
| **H1** | Veraltete Skill-Beschreibungen | S | – |
| **H2** | Lange Skills teilen | M | – |
| **H3** | Fehlende Skills | S je Skill | – |
| **H4** | Versionierte Claude-Einstellungen, Prettier-Hook | S | – |

## B – Bedienung und Design, kleine Pakete

### B1 – Suche: Enter öffnet den ersten Treffer

**Heute:** Das Suchfeld am Startbildschirm (`launcher/Launcher.tsx`) filtert nur. Wer „tim“
tippt und Enter drückt, öffnet nichts.

**So:** `onKeyDown` am Feld: Enter öffnet den ersten sichtbaren Treffer – in der Reihenfolge der
Anzeige (erst Favoriten-Kategorien, dann die Kategorien von oben nach unten), auf demselben Weg
wie ein Klick auf die Kachel (kleine Werkzeuge im eigenen Fenster). Ohne Suchtext passiert
nichts. Die Reihenfolge als reine Funktion neben `matches()`.

**Abnahme:** Schritt in `e2e/smoke.mjs`: „medien-info“ tippen, Enter – die Route ist
`/tool/media-info`. Unit-Test für die Reihenfolge.

### B2 – Strg+K: Werkzeug wechseln von überall

**So:** Strg+K (macOS Cmd+K) öffnet in jedem Fenster mit Kopfleiste ein kleines Suchfeld über
der Seite: tippen, Pfeiltasten, Enter öffnet, Esc schließt. Gleiche Suche und Reihenfolge wie
B1. Nicht in der Kundenansicht, nicht in Ausgabefenstern, nicht in den Fenstern der kleinen
Werkzeuge. Ausgewertet im Renderer (`keydown`), nicht im main – die App hat kein Programm-Menü.

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

### B5 – Video-Generator: Leerzustand nicht rot

**Heute:** Ein leeres Projekt zeigt unter der Ablagefläche rot „Noch keine Bilder oder Videos.“
– der Hinweis `empty` aus `videoGenPlan.ts` hat die Stufe `error`, damit „Video erzeugen“
gesperrt bleibt.

**So:** In `VideoGenerator.tsx` den Hinweis `empty` aus der **angezeigten** Liste nehmen; für
die Sperre des Knopfs zählt er weiter. Die Ablagefläche sagt schon, was zu tun ist.

**Abnahme:** `e2e/video-generator.mjs`: im frischen Projekt gibt es keinen roten Hinweis, der
Knopf „Video erzeugen“ ist gesperrt.

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

### B8 – Schublade schwebt in schmalen Fenstern

**Heute:** Die Schublade ist ab Werk in jedem Werkzeug offen und angeheftet (`ToolShell.tsx`,
360 px). In einem 1024 px breiten Fenster bleiben der Arbeitsfläche 664 px.

**So:** Ist das Werkzeugfenster schmaler als 1100 px, verhält sich die Schublade wie gelöst
(schwebt über der Arbeitsfläche), auch wenn „angeheftet“ gemerkt ist – der gemerkte Wert bleibt
unangetastet und gilt wieder, sobald das Fenster breiter ist. Schwebt sie, schließt ein Klick
in die Arbeitsfläche sie. Die Nadel ist in schmalen Fenstern ausgegraut, mit Hinweis.

**Abnahme:** `e2e/layout.mjs` (Schublade anheften, lösen, schließen) erweitern: bei 1024 px
Breite `data-pinned="false"`, bei 1366 px wieder `true`, ohne dass jemand die Nadel angefasst
hat; ein Klick daneben schließt nur die schwebende.

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

## C – Video-Player und Arbeitsfläche

Das wichtigste Vorhaben, ausgearbeitet in [PLAN-ARBEITSFLAECHE.md](PLAN-ARBEITSFLAECHE.md):
gemessener Anlass, Entwurf mit Zeichnungen, Platzregeln, sechs Schritte P1 bis P6 mit Abnahme.
**P1 und P2 sind erledigt** (13. November 2026): Die drei Felder stehen, die Seite scrollt nicht
mehr. Ein Auftrag lautet dort „Setze Schritt P3 aus docs/PLAN-ARBEITSFLAECHE.md um“. Vor P3 die
[offenen Fragen](PLAN-ARBEITSFLAECHE.md#offene-fragen) klären.

## D – Rückgängig

**Heute:** Kein Editor der App kennt Strg+Z – weder die OSC-Fläche noch der Kabelverlauf, das
Mini-Manual, die Packliste, das Storyboard oder die Jingle-Pads (im Renderer kommt „undo“ nicht
vor). Eine gelöschte Kachel oder ein gelöschter Schritt ist weg. Das ist die größte einzelne
Lücke in der Bedienung.

Bevor Code entsteht, wird daraus ein eigener Plan (Datei „PLAN-RUECKGAENGIG“ in `docs/`). Der
Entwurf, von dem er ausgeht:

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

Offen und im Plan zu klären: Wie fasst man Änderungen aus gepufferten Feldern (`useDraft`,
Übernahme nach 250 ms) zu einem Schritt zusammen? Was passiert mit Fotos des Mini-Manuals, die
ein rückgängig gemachter Schritt wieder braucht? Soll ein Hinweis sagen, was zurückgenommen
wurde („Kachel wiederhergestellt“)?

## E – Aufräumen und Qualität

### E1 – Große Komponenten teilen

Sechs Dateien tragen zu viel in einer Komponente: `Rta.tsx` (811 Zeilen, 3 Funktionen, 10
Effekte), `VideoConverter.tsx` (1106 Zeilen, 6 Funktionen), `MediaInfo.tsx` (1008),
`led-wall/Settings.tsx` (921), `video-generator/Inspector.tsx` (915), `StageTimer.tsx` (837).
Vorbild ist `VideoPlayer.tsx`, das so von 1.765 auf unter 300 Zeilen kam.

**So:** Skill `aufraeumen` (Helfer `teilen.mjs`, Pixelvergleich `pixel.mjs`): je Datei ein Pull
Request, **ohne sichtbare Änderung** – das E2E des Werkzeugs und der Pixelvergleich vor und
nach dem Umbau sind die Abnahme. `StageTimer.tsx` erst nach dem Umbau auf die Arbeitsfläche
(Teil C), sonst wird zweimal umgebaut.

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

**Größe L, eigener Plan nötig.** Richtung: je Store eine Datei im Benutzerordner, geschrieben
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
  formatieren. Entscheidung bei Matthias.
- **Zahl der Werkzeuge:** `README.md` und `docs/WERKZEUGE.md` nennen 23, die Registry hat 26.
  Zahlen berichtigen und `scripts/check-doc-refs.mjs` um eine Prüfung ergänzen: Die Zahl vor
  „Werkzeuge“ in beiden Dateien gleicht der Zahl der Einträge in `tools/registry.ts`.
- **Liegengebliebener Worktree** `.claude/worktrees/wonderful-taussig-0eac94` (1,8 GB, Branch
  `electron-45-pruefung`, Stand ist in main): nur auf ausdrücklichen Wunsch entfernen.

## F – Mehr Nutzen

### F1 – Sicherung und Umzug auf einen anderen Rechner

**Wozu:** Der Ersatz-Laptop für die Show soll in einer Minute dieselben Einstellungen,
OSC-Projekte, Jingles, Bausteine und das Firmenprofil haben.

**Größe L, eigener Plan nötig.** Richtung: „Sicherung speichern …“ und „Sicherung einlesen …“
im Reiter „Ordner und Profil“ der App-Einstellungen. Eine Datei (ZIP wie die Projektdatei, der
Leser und Schreiber in `zip.ts` ist da) mit `settings.json`, den Ständen der Werkzeuge, den
eigenen Bausteinen und dem Firmenlogo; die Jingle-Dateien wahlweise dazu. Einlesen ersetzt
nach Rückfrage und legt vorher eine Sicherung des jetzigen Stands ab. Zu klären: Pfade, die
auf dem anderen Rechner nicht stimmen (Zielordner, Projektordner), die Player-Bibliothek (groß,
eher nicht), Versionen.

### F2 – Show-Datei: weitere Werkzeuge in der `.mottul`

Die Projektdatei hat heute Abschnitte für LED-Wall und Mini-Manual. Nach Skill `projektdatei`
je Werkzeug ein Pull Request: zuerst **Packliste** (in der Roadmap schon geplant), dann
**OSC-Steuerung** (hat heute gar keinen Export – Projekte lassen sich weder weitergeben noch
sichern), **Jingle-Player** (Belegung; die Audiodateien als Anhang wie die Fotos des
Mini-Manuals) und **Stage-Timer** (Abschnitte und Schwellen). Deckt sich mit „Show-Profil“ in
`docs/ROADMAP.md`.

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

### F5 – Erstes Release

Es gibt noch keinen Tag `v*`; der Ablauf „Installer bauen“ steht bereit und hängt bei einem
Tag die vier Installer an ein GitHub Release. Ablauf in `docs/ENTWICKLUNG.md` („Release
veröffentlichen“): Version in `package.json` per Pull Request erhöhen, nach dem Merge taggen.
Anlass genug: Ohne Release erreichen die Sicherheits-Korrekturen aus Electron 45.2.1 und die
vier Show-Punkte niemanden außerhalb der Entwicklung. Dazu der Skill aus H3.

## G – Neue Werkzeuge

Steckbriefe, keine Aufträge. Jedes Werkzeug bekommt vor der Umsetzung einen eigenen Plan
(`docs/PLAN-<NAME>.md`) und folgt dem Skill `neues-werkzeug`. Geordnet nach Nutzen je Aufwand.

| Werkzeug | Wozu | Baut auf | Größe |
| -------- | ---- | -------- | ----- |
| **Betrachtungsabstand und Schriftgröße** | Ab welchem Abstand sieht man die Pixel, wie groß muss Schrift auf Wand oder Leinwand sein | Rechner-Bausteine, Daten der LED-Module; auch in der PWA | S–M |
| **IP- und Subnetz-Rechner** (Roadmap) | Netz, Maske, Bereich für Dante, NDI, AV-over-IP | Rechner-Bausteine; passt zum Netzwerk-Scanner | S–M |
| **Show-Check für den Rechner** | Ampel vor der Show: Netzteil, Energieplan, Benachrichtigungen, Monitore und Skalierung, freier Speicher, Audiogeräte, GPU-Encoder | Ampel-Muster der Medien-Info, Encoder-Erkennung | M |
| **Cue-Liste** | Ein „Go“ löst nacheinander aus: Clip im Player, Jingle, OSC-Befehl, ATEM-Makro, Timer-Start – macht aus der Werkzeugkiste eine Show-Steuerung | Befehle aller Werkzeuge im main; eigener Abschnitt in der `.mottul` | L |
| **Teleprompter** (Roadmap) | Lauftext auf dem Referentenmonitor | Ausgabefenster und Fernsteuerung des Stage-Timers | M |
| **Art-Net/sACN-Tester** (Roadmap) | DMX übers Netz senden, Geräte finden | UDP wie OSC; DMX-Dip-Schalter | M–L |
| **Bauchbinden** | Name und Titel einblenden – per NDI mit Transparenz oder als Key für den ATEM | NDI-Sender, ATEM-Steuerung | L |
| **PTZ-Steuerung** | Kameras per VISCA over IP: Presets, Schwenk, Zoom | Netzwerk-Scanner erkennt PTZ-Kameras schon | L |
| **Patchliste und Stageplot** | Kanalliste und Bühnenplan als PDF | Druck-Bausteine, Projektdatei | L |
| **LTC-Generator und -Leser** | Timecode als Ton ausgeben und mitlesen | Testton, Timecode-Rechner | M–L |

## H – Skills und Einstellungen für die Arbeit mit Claude

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

- **`release`** – Version erhöhen, Tag, Ablauf „Installer bauen“, Text des Release, was danach
  zu prüfen ist (mit F5).
- **`rechner-pwa`** – was ein Rechner nicht darf (`api`, Einstellungen), Tailwind-Quellen in
  `src/pwa/build/sources.ts`, Service Worker und Versionen, Veröffentlichen.
- **`oberflaeche`** – Änderungen an bestehenden Werkzeugen: Tokens, `Alert` und `STATUS`,
  `Select`, Kontrast im hellen Design, Leerzustände, die Arbeitsfläche aus Teil C.
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

## Entscheidungen, die bei dir liegen

1. **Reihenfolge:** erst der Player (C), dann die kleinen Pakete aus B wie empfohlen – oder
   zuerst etwas anderes?
2. **Verbundene Geräte wach halten?** Eine offene Verbindung zu ATEM, NovaStar oder OSC hält
   den Rechner heute nicht wach (sie steht auch nicht in „Wirklich beenden?“). Wenn ja: ein
   Feld mehr in `LaufendStand` (`services/beenden/`), dann fragt das Beenden danach und der
   Rechner bleibt wach.
3. **Ordner `Beispiele/`:** ignorieren oder einchecken (E6)?
4. **Worktree `wonderful-taussig-0eac94`** (1,8 GB) löschen?
5. **Player:** die fünf [offenen Fragen](PLAN-ARBEITSFLAECHE.md#offene-fragen) im Plan der
   Arbeitsfläche.
6. **Welche neuen Werkzeuge** aus Teil G überhaupt – und welches zuerst?
