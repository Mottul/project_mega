---
name: aufraeumen
description: Mottulbox aufräumen – Bestandsaufnahme (toter Code, verwaiste Dateien, ungenutzte Pakete, große Dateien), Dateien verschieben mit automatisch neu gerechneten Importen, große Komponenten aufteilen ohne sichtbare Änderung, Ordnung in main/services, Doku- und Skill-Verweise nachziehen. Verwenden, wenn Code umzieht, Ordner neu geordnet, große Dateien geteilt oder Reste entfernt werden sollen.
---

# Aufräumen

Aus dem Aufräumen vom 13. Oktober 2026 (`main/services` nach Bereichen geordnet, Status-Tabelle
gebündelt): Verschieben ist mechanisch und gefahrlos, solange Importe per Skript statt von Hand
geändert werden und Doku und Skills mitziehen. Aufräumen ist ein eigener Branch und PR, ohne
Verhaltensänderung nebenbei.

## 1. Bestandsaufnahme

```bash
node .claude/skills/aufraeumen/inventur.mjs          # --alle: auch Exporte, die nur die eigene Datei braucht
```

Zeigt Exporte, die keine andere Datei nennt, Dateien ohne Import, Pakete ohne Verwendung,
TODO/FIXME und die zehn größten Dateien. Die Suche ist grob (Text, nicht Typsystem): jeden
Treffer ansehen, bevor er geht.

- **„NIRGENDS benutzt“** → löschen.
- **„nur in Tests“** → Hilfsfunktion in den Test ziehen (so `rmsDb` aus `tone/plan.ts`), außer der
  Test prüft genau diese Funktion.
- **„nur in der eigenen Datei“** (über 200, meist Typen und für Tests exportierte Helfer) → lassen;
  das `export` zu entfernen ist viel Änderung ohne Nutzen.
- Pakete: `postcss` taucht nur als Plugin-Träger auf (Tailwind/Autoprefixer) – bleibt.
- Offene Punkte stehen in `docs/ROADMAP.md` („Große Umbauten“: große Dateien teilen,
  IPC-Vertrag generieren, Handy-Seiten als echte Dateien).

## 2. Dateien verschieben

```bash
node .claude/skills/aufraeumen/move.mjs alt/datei.ts=neuer/ordner/ alt/b.ts=neu/b-name.ts
node .claude/skills/aufraeumen/move.mjs --apply alt/datei.ts=neuer/ordner/ …
```

Ohne `--apply` nur Vorschau. Das Skript verschiebt per `git mv` (Historie bleibt), nimmt Tests
neben der Datei mit (`<name>.test.ts`, `<name>.lab.test.ts`) und rechnet jeden Import neu: relative
Pfade, `@shared/`/`@renderer/`, `import()`, `vi.mock(…)`, `require`, Endungen wie `?asset`.
Danach `npm run typecheck`, `npm run typecheck:test` und die Tests des Bereichs.

- **Dateinamen beim Umzug behalten** (`timer/timerRemoteServer.ts` bleibt so, auch wenn
  `player/` die Kurzform `remoteServer.ts` nutzt):
  eindeutige Namen finden sich per Suche, und die Doku darf weiter den bloßen Namen nennen.
- `__dirname` in main-Dateien zeigt auf das gebündelte `out/main`, nicht auf die Quelle – ein
  Umzug ändert daran nichts. Tests mit Pfaden relativ zur Quelle (`__fixtures__/`) prüfen.
- Ordner `windows/`, `remote/` usw. heißen nach dem Bereich, nicht nach der Technik.

## 3. Ordnung in `src/main/services`

Lose Dateien nur für das ganze Programm: `store.ts`, `db.ts`, `log.ts`, `broadcast.ts`,
`fileDialogs.ts` (+ `dialogStartPath.ts`), `shutdown.ts`. Alles andere in den Ordner seines
Bereichs: `windows/`, `remote/` (Fernsteuer-Basis und -App), `ndi/` (gemeinsamer Sender),
`player/`, `timer/`, `jingle/`, `osc/`, `pattern/`, `convert/`, `jobs/`, `ffmpeg/`, `ytdlp/`,
`netscan/`, `novastar/`, `manuals/`. Die NDI-Hülle eines Werkzeugs liegt beim Werkzeug
(`timer/timerNdi.ts`, `player/playerNdi.ts`), die Fernsteuer-Seite ebenso. Neuer Bereich →
neuer Ordner, Baum in `docs/ENTWICKLUNG.md` („Aufbau“) ergänzen.

## 4. Doku und Skills nachziehen

```bash
npm run check:refs
```

Prüft jeden Dateiverweis in Backticks in `CLAUDE.md`, `README.md`, `docs/*.md` und den
`SKILL.md` der Projekt-Skills (voller Pfad, Teilpfad oder bloßer Name; läuft auch in der CI).
Treffer per Suchen/Ersetzen auf den neuen Pfad ändern – Skills zuerst, sie lenken die nächste
Arbeit. Gibt es eine Datei nur im Build, zur Laufzeit oder in einem Paket, gehört ihr Name in
`ELSEWHERE` in `scripts/check-doc-refs.mjs`. Beispiele und Platzhalter mit spitzen Klammern
schreiben (`<name>.test.ts`) – die prüft sie nicht. Neue, noch nicht vorgemerkte Dateien zählen mit.

## 5. Zusammenlegen

Kopierte Tabellen und Bausteine an eine Stelle neben das, was sie ergänzen (Status-Tabelle
`components/ui/status.ts` neben den Badge-Tönen; Werkzeuge bilden ihre Stufennamen darauf ab).
Ändert das Zusammenlegen sichtbar etwas (Toast „Info“ jetzt neutral statt in Akzentfarbe), im PR
nennen.

## 6. Große Komponenten teilen

Vorbilder (13. Oktober 2026): `VideoPlayer.tsx` (1.765 → 291 Zeilen: `Library`, `ConvertQueue`,
`PlaybackPanel`, `Playlist`, `SetupPanels`, `NdiPanel`, `usePlayback`, `format`) und `OscControl.tsx`
(3.276 → 387 Zeilen: Bedienelemente, Kachel, Fläche, Editor, Panels, Kopfzeile, fünf Hooks).

**Oberste Ebene per Werkzeug, nicht von Hand:**

```bash
node .claude/skills/aufraeumen/teilen.mjs plan.json            # Vorschau: Zeilen, Bezüge, Probleme
node .claude/skills/aufraeumen/teilen.mjs plan.json --apply
```

Der Plan nennt je neuer Datei die Deklarationsnamen (Format im Kopf des Skripts). Code und
Kommentare wandern wörtlich, der TypeScript-Checker löst jeden Bezeichner auf: jedes Modul
bekommt genau seine Importe, Gebrauchtes ein `export`, die Quelle einen neuen Importblock
(fehlen ihr Importe für Neues, erst ergänzen – Überzähliges räumt das Werkzeug weg). Es lehnt ab,
was beim Laden bräche: neue Module, die aus der Quelle importieren (Kreis), und Namen, die
zugleich importiert und deklariert sind (Icon `Send` neben `type Send` – vorher umbenennen, OSC:
`SendFn`). Bewährte Aufteilung: Gemeinsames (Hilfen, Typen, Kontext) in eine Blattdatei
(`oscShared.ts`), sonst nach Bereich.

**Innerhalb einer Komponente** (Hooks, große JSX-Blöcke) gibt es keine Deklarationen zum Greifen:
Blöcke per Skript an eindeutigen Markierungszeilen ausschneiden (Anfang inklusive, Ende
exklusive) und wörtlich in den Rumpf des neuen Hooks bzw. der Komponente setzen, an der alten
Stelle der Aufruf (`const runNova = useNovaRunner(pushLog)`). Typecheck nennt dann fehlende
Importe der neuen Dateien; ein Lauf von `teilen.mjs` danach räumt die Quelle auf.

- **Zustand, den mehrere Teile brauchen, bleibt oben** und geht als Props hinunter (Wand,
  Fit, Bibliothek, Wiedergabezustand); auch das Abonnement, das ihn lädt (`applySettings` setzt
  viele Felder auf einmal – nicht zerreißen).
- **Zustand, den nur ein Teil braucht, zieht samt Laden und Abo mit** (Konvertier-Aufträge in
  `ConvertQueue`, Ansicht und Drag-Zustand in `Library`, gemerkte Vorschau-Schalter in
  `PlaybackPanel`). Ein Rückruf nach oben (`onDone`) über eine Ref, damit das Abo nicht bei
  jedem Rendern neu bindet.
- **Logik ohne Oberfläche als Hook** (`usePlayback`: Tick, Ziehen am Regler, Tastatur) – Leiste
  und Karte lesen dieselbe Position, der Hook liefert sie beiden.
- Kommentare, Texte und Klassen wörtlich übernehmen; nur Variablennamen dürfen sich ändern.
  Funktionen, die ein Effekt mit `[]` aufruft, auf Modulebene legen (sonst meldet
  `react-hooks/exhaustive-deps` sie, und `--max-warnings 0` bricht).

**Prüfen, dass nichts verloren ging:**

```bash
node .claude/skills/aufraeumen/texte.mjs alt/Gross.tsx alt/Gross.tsx neu/A.tsx neu/B.tsx …
```

Vergleicht Texte, Titel, Klassen und Befehle der Fassung aus HEAD mit den neuen Dateien; jeden
fehlenden Treffer erklären können (erwartet: umbenannte Variablen, aufgeteilte Klassen). In zwei
Schritten committet, vergleicht der zweite Lauf gegen den ersten Commit.
Dazu ein **Vorher/Nachher-Screenshot** der echten App mit Inhalt (`/electron-e2e`, Harness
`launchApp`, Testclip per lavfi als Standbild, Wiedergabe angehalten): `git stash push -u`,
`npx electron-vite build`, Aufnahme, `git stash pop`, bauen, Aufnahme – beim Video-Player waren
beide PNGs byte-gleich. Weichen sie ab: `node .claude/skills/aufraeumen/pixel.mjs vorher.png
nachher.png` zeigt Pixelzahl, größte Abweichung und Rechteck – bei der OSC-Steuerung lag es genau
auf einer Kachel, die nach dem letzten Klick ihre Hover-Leiste noch ausblendete (Maus weg und
Übergänge abwarten). **Hat das Werkzeug keinen E2E-Test, zuerst einen schreiben** und gegen den
alten Stand grün bekommen (so entstand `e2e/osc.mjs`); danach die E2E des Werkzeugs und alle.

## Abschluss

`/abschluss-check` mit vollem `npm test` und `npm run e2e` (Umzüge in main betreffen Fenster,
Fernsteuerung und NDI); erledigte Punkte aus `docs/ROADMAP.md` streichen.
