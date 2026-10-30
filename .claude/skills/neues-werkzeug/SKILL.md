---
name: neues-werkzeug
description: Neues Werkzeug (Tool) in Mottulbox anlegen – Ordner, ToolModule, Registrierung, Speichern, Doku. Verwenden, wenn ein neues Werkzeug auf dem Startbildschirm erscheinen soll (z. B. der geplante Video-Generator).
---

# Neues Werkzeug anlegen

Ein Werkzeug ist ein Ordner unter `src/renderer/src/tools/<id>/` plus **eine** Zeile in der
Registry. Vorbild für ein kleines Werkzeug: `tools/timecode/`; für eines mit Speicher und Seitenpanel:
`tools/media-info/` und `tools/hap-converter/`.

1. **id und Kategorie:** id in kebab-case; Kategorie aus `ToolCategoryId` (`playback`, `control`,
   `visual`, `media`, `rigging`, `calc` – Beschriftung in `tools/types.ts`).
2. **`index.ts`** mit `ToolModule`: `id`, `name`, `description`, `icon` (lucide-react), `category`,
   `keywords` (reichlich Synonyme und deutsche/englische Suchwörter), `component` per
   `lazy(() => import('./X').then((m) => ({ default: m.X })))`.
3. **Eintragen** in `src/renderer/src/tools/registry.ts` (Import + Array `tools`) – die einzige
   Stelle, kein weiterer Menüpunkt nötig.
4. **Oberfläche nach dem Werkzeug-Muster** (`components/ToolShell.tsx`, Vorbild `tools/stage-timer/`):
   - `ToolShell` mit `main`, `bar` und `aside`. **`bar`** = `ToolBar`: hat das Werkzeug eine
     Ausgabe (Monitor, NDI, Handy …), `label="Ausgabe"`, `active` = gerade live (rot), Schalter als
     `BarToggle`, rechts `status` (was läuft). Sonst `kind="job"` mit dem Auftrag (Ziel, Start;
     bernstein, solange er läuft). Weder noch: `bar` weglassen.
   - **Bild-Ausgabe auf einen Monitor** (wie Testbild, Player, Timer): in der Leiste
     `useOutputTarget()` + `OutputControls` (`components/OutputControl.tsx`: Monitore und „Als
     Fenster“, Starten/Beenden, „Monitor wechseln“), im main `createOutputWindow()`
     (`services/windows/outputWindow.ts`: Vollbild oder Fenster, Taskleiste, keine Drosselung,
     zweimal Esc), auf der Ausgabe-Route `OutputCloseButton` – kein eigenes Fenster, kein eigener
     Esc-Handler im Renderer, kein dauerhaft sichtbarer Knopf. Das Ziel per `ausgabeZiel()`
     (`shared/ausgabe.ts`) im Handler prüfen.
   - **`aside`** = Schublade links: `PanelSection`s mit Symbol und `summary` (die wichtigsten Werte,
     auch zugeklappt sichtbar). Felder als `Field`/`Checkbox` mit `hint` – Erklärungen hinter
     dem ⓘ (`InfoTip`), keine Absätze unter jeder Option. **Keine Aktionen** in die Schublade
     (Start, Import, Export, Ein/Aus) – die gehören in Leiste oder Arbeitsfläche.
   - Was die ganze App betrifft, gehört ins App-Menü (`components/app/AppMenu.tsx`), nie ins
     Werkzeug. Die Kopfleiste (`ToolHost`) baut das Werkzeug nicht selbst.
   - **Kleines Werkzeug** (Rechner ohne Ausgabe und Schublade): in `SMALL_TOOLS`
     (`src/shared/toolWindows.ts`) eintragen – es öffnet sich dann immer im eigenen Fenster, die
     Höhe folgt dem Inhalt. Breite `ONE_COLUMN`; zwei Bereiche, die einspaltig höher als ~800 px
     wären, `TWO_COLUMNS` (stehen dann nebeneinander). Bausteine aus `tools/_calc/ui`:
     `CalcPage` (`note` nur für Sicherheitshinweise), `SectionCard` mit EINER kurzen `desc`-Zeile,
     Formeln/Hintergrund/Beispiel als `hint` (ⓘ) an Karte, Feld oder Ergebnis – keine Absätze;
     `NumField`/`SelectField`, Ergebnisse als `Readout` (mehrere in `ReadoutGrid` = Kacheln,
     zweite Einheit per `sub`), Warnungen als `CalcAlert`; Felder, die sich gegenseitig berechnen,
     über `useLinkedFields` (nie eigene bind-Funktionen). Zahlen mit Komma (`trimNum`, `fmt`),
     keine hart kodierten Farben (auch nicht im SVG: `fill-primary`). Die id in `SMALL` (und ggf.
     `TWO_COLUMNS`) in `e2e/layout.mjs` aufnehmen – geprüft werden Höhe, 320 px ohne
     Querscrollen und Kompaktmodus.
   - Bausteine aus `components/ui`, Eingabefelder mit Puffer (`useDraft`, `TextField`,
     `NumberField`; für Inhalte, die leer sein dürfen und eine Vorschau live mitziehen sollen,
     `TextArea`/`LiveInput` aus `components/ui/textarea`), Auswahllisten nur als `<Select>` (Größe `sm` in Leisten, `xs` in dichten
     Zeilen – nie ein rohes `<select>` mit eigenen Klassen), Farben nur über Tailwind-Tokens
     (`primary`, `border` …; Rot ist „live“).
     Läuft etwas nur im Fenster (Ton wie Testton und Jingle), mit `useAktivMelden(key, an)`
     (`@renderer/lib/aktivMelden`) melden – sonst nennt die Rückfrage beim Beenden es nicht;
     neue Kennung in `RENDERER_AKTIV` (`main/services/beenden/laufendText.ts`). Was main kennt
     (Ausgabefenster, Aufträge, Fernsteuerung), sammelt `laufend.ts` selbst.
     Fertige Dateien an den Player: `inDenPlayer(path)` aus `@renderer/lib/inDenPlayer`.
     Listen mit Reihenfolge: `useSortable` + `Griff` aus `components/ui/sortable` (Ziehen nur
     am Griff, damit Text in den Feldern markierbar bleibt), umsortiert über Kennungen
     (`zieheNach`); die Pfeil-Knöpfe bleiben für die Tastatur. Eine Liste in einer Liste bekommt
     ihre eigene Instanz.
     Texte deutsch.
5. **Speichern – vier Orte, nie ein eigener localStorage-Parser:**
   - Einstellungen, die main braucht (Pfade, Geräte): `settings.json` über `useSettings(sel)` und
     `updateSettings(patch)`; neues Feld in `AppSettings` und `DEFAULT_SETTINGS` (`shared/types.ts`),
     immer nur geänderte Felder patchen.
   - Arbeitsdaten des Werkzeugs: zustand-Store mit `persist`, `storage: debouncedStorage()`,
     `version`, `migrate`, `partialize` und `syncAcrossWindows(store)` (Muster
     `tools/media-info/store.ts`). Keine Vorschaubilder oder abgeleiteten Daten speichern.
   - Bedien-Kleinigkeiten: `usePersistentState(key, vorgabe, codec)`.
   - Dateien des Nutzers (Planung zum Weitergeben/Ablegen): Abschnitt in der Projektdatei
     `.mottul` mit Datei-Menü in der Leiste → Skill `projektdatei`.
6. **Braucht das Werkzeug main?** → Skill `ipc-kanal`.
   - **Browser-Berechtigung** (Mikrofon, …): Die App verweigert sie allen Seiten
     (`main/services/windows/windowPolicy.ts`). Freigabe nur je Route und so eng wie möglich –
     der RTA bekommt nur Ton, nur auf `#/tool/rta` (`MIC_ROUTES`); Unit-Test dazu und ein Schritt
     im E2E `security` (hier erlaubt, anderswo weiter gesperrt). Doku: `docs/SICHERHEIT.md`,
     macOS-Hinweistext in `electron-builder.yml` (`extendInfo`). Im Browser (PWA) fragt das
     Gerät selbst, nur über HTTPS.
   - **PDF-Ausgabe:** HTML-String bauen (alles escapen) und `api.util.exportPdf(html, name,
     { pageSize: 'A4' | 'A5', landscape })` – gedruckt wird im main über eine temporäre Datei in
     einer gesperrten Partition (`services/pdf/htmlToPdf.ts`): keine externen Schriften, Bilder
     oder Stylesheets, sie werden nicht geladen. Bilder als `data:` einbetten oder als Foto der
     Projektdatei (`fotoUrl(hash)` aus `shared/fotos.ts`, der main setzt es ein). Fotos einfügen
     über `api.fotos.pick()`, nie als Bytes in einen Store (Skill `projektdatei`). Eine
     **Vorschau** derselben Seite im Werkzeug: Shadow DOM statt iframe (eigene Styles, die
     App-CSP gilt weiter), verkleinert per `zoom` auf die Breite – Muster
     `tools/mini-manual/ui/Vorschau.tsx`. Seitenbauer rein halten (Vorbild
     `tools/mini-manual/seiten.ts`, getestet ohne Electron).
   - **Zeichnen auf Canvas:** Farben aus den Design-Tokens lesen, nie fest (Muster `readTheme`
     in `tools/rta/draw.ts`: CSS-Variablen „H S% L%“ -> `hsl(…)`, neu bei Änderungen an
     `class`/`style` von `<html>`). Farbskalen über Akzent und Schrift, nicht über
     Warnung/Gefahr – die sind wie viele Akzentfarben gelb bzw. rot (das Spektrogramm war
     sonst einfarbig). Messen per Timer, Zeichnen per `requestAnimationFrame` (über Refs, React
     nur ~5× je Sekunde): Verdeckte und minimierte Fenster bekommen keine Bilder, im Bildtakt
     stünde die Messung dann still. Ein Werkzeug, das laufend misst, bekommt in `SMALL_TOOLS`
     `measures: true` (Fenster ohne Hintergrund-Drosselung).
7. **Optional:** Aktivitätsanzeige auf dem Startbildschirm in `launcher/useToolActivity.ts`;
   Kundenansicht über `useKiosk()` (`launcher/kiosk.tsx`), wenn Teile ausgeblendet werden müssen.
8. **Doku:** Abschnitt in `docs/WERKZEUGE.md` (passende Kategorie), Eintrag im README-Überblick,
   erledigten Punkt aus `docs/ROADMAP.md` streichen; Fernsteuerung → `docs/FERNSTEUERUNG.md`.
   Gibt es einen `docs/PLAN-*.md` dazu, nach der Umsetzung nach WERKZEUGE überführen und löschen.
9. **Abschluss:** `/abschluss-check`; für das neue Werkzeug ein E2E-Skript `e2e/<id>.mjs` nach dem Vorbild von `e2e/smoke.mjs` anlegen (`launchApp` aus `e2e/harness.mjs`). Rechenkern vorher mit Labortests auf synthetischen Signalen absichern (Vorbild `tools/rta/*.test.ts` mit `testSignals.ts`: nachgebauter Web-Audio-Analysator).
