---
name: abschluss-check
description: Prüfung vor dem Abschluss einer Änderung in Mottulbox – Prettier, ESLint, Typecheck, Tests und bei App-Änderungen der E2E-Rauchtest. Verwenden, bevor etwas als fertig gemeldet oder committet wird.
---

# Abschluss-Check

1. **Geänderte Dateien** ansehen: `git status --short`. Markdown ist von Prettier ausgenommen.
2. **Format, Dateinamen, Verweise:** `npm run format:check`, `npm run check:refs` (nennen Doku und
   Skills eine Datei, die verschoben oder gelöscht wurde?) und `npm run check:files` (neue Datei, die sich
   von einer vorhandenen nur in der Groß-/Kleinschreibung unterscheidet? Unter Windows/macOS liegt
   dann nur eine auf der Platte, Git meldet die andere dauernd als geändert). Prettier steht auf
   `endOfLine: auto`, deshalb besteht der Lauf auch unter Windows mit CRLF-Dateien. Bei Treffern nur die betroffenen Dateien
   formatieren (`npx prettier --write <Dateien>`), **nie** `npm run format` auf alles. Die
   Git-Warnung „LF will be replaced by CRLF“ ist harmlos. Ein `docs/PLAN-*.md` nennt geplante Dateien
   im Textblock (```` ```text ````), nicht in Backticks: `check:refs` kennt sie noch nicht. Grafiken
   liegen als SVG in `docs/bilder/`, mit eigenen Farben für den Dunkelmodus.
3. **Lint** (warnungsfrei): `npm run lint`.
4. **Typen:** `npm run typecheck` und `npm run typecheck:test`.
5. **Tests:** erst die betroffenen (`npx vitest run <Pfad>`), zum Schluss `npm test` – unter
   Windows wie Linux vollständig grün; Pfade in Tests mit `path.join` bilden, nicht mit `/`.
6. **App-Verhalten geändert** (Oberfläche, IPC, Ausgabefenster, Fernsteuerung)? Dann zusätzlich
   `npm run e2e` (baut die App und startet den Rauchtest). Für ein neues Werkzeug ein eigenes
   Skript neben `e2e/smoke.mjs` anlegen, das `launchApp` aus `e2e/harness.mjs` nutzt.
   **Paket betroffen** (`electron-builder.yml`, `asarUnpack`, `extraResources`, ein neues natives
   oder ESM-only-Modul im main)? Dann `npm run package:dir` und `npm run e2e -- paket` – die CI
   prüft die gepackte App zwar je Betriebssystem, aber erst ganz am Ende des Laufs. Ändert der PR
   `electron-builder.yml`, läuft dazu „Installer bauen“ (echte Installer, macOS arm64 + x64).
7. **Doku:** Neue oder geänderte Funktion in `docs/WERKZEUGE.md`, Erledigtes aus
   `docs/ROADMAP.md` streichen (CLAUDE.md, Abschnitt Doku).
8. **Bericht:** kurz sagen, was grün ist und was nicht (mit Ausgabe), nichts beschönigen.
   Danach committen, pushen und den Pull Request anlegen (vom Nutzer freigegeben, 8. Oktober
   2026) – auf einem eigenen Branch je Vorhaben, nie auf `main` oder `stoffl`. Gemergt wird auf
   GitHub vom Nutzer.
