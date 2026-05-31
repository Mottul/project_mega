# AV Toolbox (project_mega)

Plattformübergreifende Desktop-App (Windows / macOS / Linux), die kleine AV-Arbeitswerkzeuge
unter einem Dach bündelt und über einen Launcher auswählbar macht. Läuft **offline**.

Enthaltene Werkzeuge (Runde 1):

- **HAP-Konverter** – Videos im Batch nach HAP / HAP Q / HAP Alpha konvertieren (z.B. für Resolume).
- **Manuals-Bibliothek** – Geräte-Handbücher (PDF) importieren und per **Volltextsuche** offline durchsuchen.

Tech-Stack: **Electron + React + TypeScript** (electron-vite), Tailwind CSS,
`better-sqlite3` (FTS5), `pdfjs-dist`, gebündeltes `ffmpeg`.

---

## Voraussetzungen

- **Node.js ≥ 20** und npm
- **Build-Werkzeuge** für das native Modul `better-sqlite3` (wird beim `npm install` gegen die
  Electron-ABI neu gebaut):
  - **Windows:** „Desktop development with C++" (Visual Studio Build Tools) + Python 3
  - **macOS:** Xcode Command Line Tools (`xcode-select --install`)
  - **Linux:** `build-essential` und `python3` (z.B. `sudo apt install build-essential python3`)

---

## Installation & Entwicklung

```bash
git clone <repo-url>
cd project_mega

# Abhängigkeiten installieren (postinstall baut better-sqlite3 für Electron)
npm install

# Einmalig: HAP-fähiges ffmpeg für die aktuelle Plattform holen
# (ohne dies zeigt der HAP-Konverter eine Hinweis-Warnung)
npm run ff:fetch

# App im Entwicklungsmodus starten (Hot Reload)
npm run dev
```

> Hinweis: `npm run ff:fetch` lädt ein **HAP-fähiges** ffmpeg (mit libsnappy) aus offiziellen
> Quellen – gyan.dev (Windows), BtbN (Linux), evermeet.cx (macOS). Die gängigen npm-ffmpeg-Pakete
> enthalten **kein** HAP. Die Binaries landen in `resources/ffmpeg/<os>/` und sind aus dem Git
> ausgenommen.

---

## Build & Paketierung

```bash
# Typecheck + Bundles bauen
npm run build

# Installer für das aktuelle Betriebssystem erzeugen
#   - holt zuerst das passende ffmpeg (ff:fetch), dann build + electron-builder
npm run package
```

Ergebnis-Installer liegen unter `dist/`:

| OS      | Target      |
| ------- | ----------- |
| Windows | NSIS `.exe` |
| macOS   | `.dmg`      |
| Linux   | AppImage    |

> Plattform-Hinweis: Installer baut man jeweils **auf dem Zielbetriebssystem**, weil `ff:fetch`
> und der native Rebuild plattformspezifisch sind. Für macOS liefert evermeet getrennte
> x64/arm64-Binaries (für Universal-Builds beide nötig).

---

## Projektstruktur

```
src/
├── main/                     # Electron Main-Prozess
│   ├── index.ts              # App-Lifecycle, Fenster (sichere Defaults), Protocol
│   ├── ipc/                  # IPC-Handler (dialog, ffmpeg, manuals) + Registry
│   └── services/
│       ├── db.ts             # SQLite (better-sqlite3) + FTS5-Migrationen
│       ├── ffmpeg/           # ffmpegPath, probe, hapEncoder, jobManager (Queue)
│       └── manuals/          # manualsService, pdfText (pdfjs)
├── preload/index.ts          # contextBridge -> window.api (typisiert)
├── shared/                   # ipc-contracts.ts + types.ts (single source of truth)
└── renderer/src/
    ├── launcher/             # Launcher + ToolHost (Router)
    ├── components/ui/        # UI-Primitives (Button, Card, …)
    └── tools/
        ├── registry.ts       # ◀ EINZIGE Stelle zum Eintragen neuer Tools
        ├── hap-converter/
        └── manuals/
```

### Ein neues Tool hinzufügen

1. Ordner unter `src/renderer/src/tools/<mein-tool>/` anlegen mit einer Komponente und einer
   `index.ts`, die ein `ToolModule` exportiert (siehe `tools/hap-converter/index.ts`).
2. In `src/renderer/src/tools/registry.ts` **eine Zeile** ergänzen:
   ```ts
   export const tools: ToolModule[] = [hapConverterTool, manualsTool, meinTool]
   ```
3. Braucht das Tool Main-Prozess-Logik: Kanäle in `src/shared/ipc-contracts.ts` ergänzen,
   Handler in `src/main/ipc/` registrieren.

---

## NPM-Skripte

| Skript              | Zweck                                                        |
| ------------------- | ------------------------------------------------------------ |
| `npm run dev`       | Entwicklungsmodus (electron-vite, Hot Reload)                |
| `npm run build`     | Typecheck + Produktions-Bundles (`out/`)                     |
| `npm run typecheck` | TypeScript-Prüfung (main/preload/shared **und** renderer)    |
| `npm run ff:fetch`  | HAP-fähiges ffmpeg holen (`--all` / `--platform <os>` mögl.) |
| `npm run package`   | Installer fürs aktuelle OS (inkl. ff:fetch)                  |
| `npm run start`     | Produktions-Build lokal previewen                            |

---

## Status

Runde 1 (Fundament + HAP-Konverter + Manuals-Bibliothek) ist umgesetzt.
Verifiziert: `typecheck` und `build` grün; HAP-Encode (hap_q → `HapY`, hap_alpha → `Hap5`)
end-to-end mit gebündeltem ffmpeg getestet.

Roadmap (Runde 2+): LED-Wall-Konfigurator, Testbildgenerator, Videoplayer (Multi-Monitor),
Projektionsverhältnis-Rechner – jeweils als zusätzliche Module.
