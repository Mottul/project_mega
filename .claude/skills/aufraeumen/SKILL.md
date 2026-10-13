---
name: aufraeumen
description: Mottulbox aufräumen – Bestandsaufnahme (toter Code, verwaiste Dateien, ungenutzte Pakete, große Dateien), Dateien verschieben mit automatisch neu gerechneten Importen, Ordnung in main/services, Doku- und Skill-Verweise nachziehen. Verwenden, wenn Code umzieht, Ordner neu geordnet, große Dateien geteilt oder Reste entfernt werden sollen.
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

## Abschluss

`/abschluss-check` mit vollem `npm test` und `npm run e2e` (Umzüge in main betreffen Fenster,
Fernsteuerung und NDI); erledigte Punkte aus `docs/ROADMAP.md` streichen.
