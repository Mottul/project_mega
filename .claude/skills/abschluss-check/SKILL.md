---
name: abschluss-check
description: Prüfung vor dem Abschluss einer Änderung in Mottulbox – Prettier, ESLint, Typecheck, Tests und bei App-Änderungen der E2E-Rauchtest. Verwenden, bevor etwas als fertig gemeldet oder committet wird.
---

# Abschluss-Check

1. **Geänderte Dateien** ansehen: `git status --short`. Markdown ist von Prettier ausgenommen.
2. **Format:** `npm run format:check`. Prettier steht auf `endOfLine: auto`, deshalb besteht der
   Lauf auch unter Windows mit CRLF-Dateien. Bei Treffern nur die betroffenen Dateien
   formatieren (`npx prettier --write <Dateien>`), **nie** `npm run format` auf alles. Die
   Git-Warnung „LF will be replaced by CRLF“ ist harmlos.
3. **Lint** (warnungsfrei): `npm run lint`.
4. **Typen:** `npm run typecheck` und `npm run typecheck:test`.
5. **Tests:** erst die betroffenen (`npx vitest run <Pfad>`), zum Schluss `npm test`.
   Stand 7. Oktober 2026 schlägt unter Windows `src/main/services/convert/convert.test.ts`
   („Ausgabename: nie überschreiben …“) wegen der Pfadtrenner in `uniqueOutputPath` fehl,
   unabhängig von eigenen Änderungen – nicht als neuen Fehler melden, alles andere schon.
6. **App-Verhalten geändert** (Oberfläche, IPC, Ausgabefenster, Fernsteuerung)? Dann zusätzlich
   `npm run e2e` (baut die App und startet den Rauchtest). Für ein neues Werkzeug ein eigenes
   Skript neben `e2e/smoke.mjs` anlegen, das `launchApp` aus `e2e/harness.mjs` nutzt.
7. **Doku:** Neue oder geänderte Funktion in `docs/WERKZEUGE.md`, Erledigtes aus
   `docs/ROADMAP.md` streichen (CLAUDE.md, Abschnitt Doku).
8. **Bericht:** kurz sagen, was grün ist und was nicht (mit Ausgabe), nichts beschönigen.
   Danach committen, pushen und den Pull Request anlegen (vom Nutzer freigegeben, 8. Oktober
   2026) – auf einem eigenen Branch je Vorhaben, nie auf `main` oder `stoffl`. Gemergt wird auf
   GitHub vom Nutzer.
