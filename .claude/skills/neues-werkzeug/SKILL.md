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
   - **`aside`** = Schublade links: `PanelSection`s mit Symbol und `summary` (die wichtigsten Werte,
     auch zugeklappt sichtbar). Felder als `Field`/`Checkbox` mit `hint` – Erklärungen hinter
     dem ⓘ (`InfoTip`), keine Absätze unter jeder Option. **Keine Aktionen** in die Schublade
     (Start, Import, Export, Ein/Aus) – die gehören in Leiste oder Arbeitsfläche.
   - Was die ganze App betrifft, gehört ins App-Menü (`components/app/AppMenu.tsx`), nie ins
     Werkzeug. Die Kopfleiste (`ToolHost`) baut das Werkzeug nicht selbst.
   - Bausteine aus `components/ui`, Eingabefelder mit Puffer (`useDraft`, `TextField`,
     `NumberField`), Farben nur über Tailwind-Tokens (`primary`, `border` …; Rot ist „live“).
     Texte deutsch.
5. **Speichern – drei Orte, nie ein eigener localStorage-Parser:**
   - Einstellungen, die main braucht (Pfade, Geräte): `settings.json` über `useSettings(sel)` und
     `updateSettings(patch)`; neues Feld in `AppSettings` und `DEFAULT_SETTINGS` (`shared/types.ts`),
     immer nur geänderte Felder patchen.
   - Arbeitsdaten des Werkzeugs: zustand-Store mit `persist`, `storage: debouncedStorage()`,
     `version`, `migrate`, `partialize` und `syncAcrossWindows(store)` (Muster
     `tools/media-info/store.ts`). Keine Vorschaubilder oder abgeleiteten Daten speichern.
   - Bedien-Kleinigkeiten: `usePersistentState(key, vorgabe, codec)`.
6. **Braucht das Werkzeug main?** → Skill `ipc-kanal`.
7. **Optional:** Aktivitätsanzeige auf dem Startbildschirm in `launcher/useToolActivity.ts`;
   Kundenansicht über `useKiosk()` (`launcher/kiosk.tsx`), wenn Teile ausgeblendet werden müssen.
8. **Doku:** Abschnitt in `docs/WERKZEUGE.md` (passende Kategorie), Eintrag im README-Überblick,
   erledigten Punkt aus `docs/ROADMAP.md` streichen; Fernsteuerung → `docs/FERNSTEUERUNG.md`.
   Gibt es einen `docs/PLAN-*.md` dazu, nach der Umsetzung nach WERKZEUGE überführen und löschen.
9. **Abschluss:** `/abschluss-check`; für das neue Werkzeug ein E2E-Skript `e2e/<id>.mjs` nach dem Vorbild von `e2e/smoke.mjs` anlegen (`launchApp` aus `e2e/harness.mjs`).
