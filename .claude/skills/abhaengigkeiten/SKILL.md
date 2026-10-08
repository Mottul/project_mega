---
name: abhaengigkeiten
description: Abhängigkeiten von Mottulbox aktualisieren – Dependabot-PRs prüfen, Pakete mit 7 Tagen Abstand einspielen, eine neue Electron-Hauptversion übernehmen (Breaking Changes, native Module, Doku). Verwenden bei Paket-Updates, npm-audit-Befunden oder einem Electron-Upgrade.
---

# Abhängigkeiten aktualisieren

Regel aus `docs/SICHERHEIT.md` („Updates einspielen“): **nur Versionen, die schon 7 Tage draußen
sind.** Dependabot (`.github/dependabot.yml`, `cooldown` 7 Tage) öffnet montags PRs; gemergt wird
vom Nutzer nach grüner CI.

## Von Hand einspielen

```bash
npm view <paket> time --json          # Veröffentlichungsdaten (Ausgabe kann ein Array sein)
npm install <paket>@<version> --before <Datum vor 7 Tagen>
npm audit fix --before <Datum vor 7 Tagen>
npm audit --omit=dev                  # Laufzeit: muss ohne Befund bleiben
```

- Nach `npm install <paket>` fehlt die Electron-Binary (npm ersetzt den Paketordner, das
  Root-`postinstall` läuft nur bei `npm install` ohne Argumente): `npm run electron:bin`.
- npm 12 blockiert Install-Skripte von Abhängigkeiten (Hinweis „install-scripts blocked“ für
  esbuild) – gewollt, esbuild läuft auch so.
- Große Umstiege (React, Tailwind, Vite, TypeScript, vitest) sind eigene Vorhaben in
  `docs/ROADMAP.md` und in `dependabot.yml` als Hauptversion ausgenommen.

## Neue Electron-Hauptversion

Electron pflegt nur die drei neuesten Hauptversionen (etwa alle 8 Wochen eine neue). Dependabot
schickt sie als eigenen PR.

1. **Breaking Changes lesen** – für jede übersprungene Version:
   `gh api "repos/electron/electron/contents/docs/breaking-changes.md?ref=v<version>" --jq .content | base64 -d`.
   Jede Änderung gegen den Code prüfen (`Grep`). Beispiele aus 42 → 44: Datei-Dialoge starten
   ohne Startpfad in „Downloads“ (→ `services/fileDialogs.ts`), `NativeImage.toBitmap()` rechnet
   nach sRGB um (NDI-Sender; gemessen 4,1–4,6 statt 3,8 ms je 1080p-Bild), `clipboard` im Renderer
   entfernt, macOS ab 13, kein 32-Bit-Windows mehr, Ausgabefenster sind `fullscreen` (abgerundete
   Ecken unter Linux egal).
2. **Sicherheits-Backports vergleichen:** Release-Notes der Zielversion und der bisherigen
   Patch-Linie (`gh api repos/electron/electron/releases/tags/v<version>`) – die gewählte Version
   darf keine Korrektur verlieren, die die alte Linie schon hat.
3. **Native Module:** better-sqlite3 nutzt die N-API (Binaries im Paket, kein Rebuild). Das
   optionale NDI-Binding (`vendor/grandiose`) ist an die Electron-ABI gebunden: `npm run ndi:setup`
   erkennt die Abweichung und baut neu (braucht C++-Werkzeuge, siehe `docs/NDI.md`).
4. **Prüfen:** `/abschluss-check` inkl. `npm run e2e` (alle Skripte). Zusätzlich das fertige Paket:
   `npm_config_before=<Datum> npx --yes electron-builder@26 --dir`, dann
   `dist/<os>-unpacked` mit eigenem `--user-data-dir` starten und Datenbank-Aufrufe testen
   (z. B. `api.manuals.list('')`, `api.player.libraryList()`) – nie mit den echten App-Daten.
5. **Doku:** Version in `README.md` (Technik) und `docs/ENTWICKLUNG.md` (Node-Vorgabe),
   Systemvoraussetzungen in `docs/INSTALL.md`, „Stand der bekannten Lücken“ in
   `docs/SICHERHEIT.md`, `docs/ROADMAP.md` (Bereits erledigt).
