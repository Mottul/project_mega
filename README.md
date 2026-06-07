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

- **Node.js `^20.19` oder `≥ 22.12`** und npm (von vite 7 vorgegeben; `engine-strict=true` in
  `.npmrc` erzwingt es – ein zu altes Node bricht den Install mit klarer Meldung ab statt
  später kryptisch).
- **Kein C++-Compiler nötig.** Das einzige native Modul (`better-sqlite3`) wird beim `npm install`
  **nicht kompiliert**, sondern als geprüftes **Prebuild** für die Electron-ABI geladen
  (`postinstall` → `scripts/rebuild-native.mjs`).
  - _Fallback_ (nur falls für eine exotische Plattform/Arch kein Prebuild existiert): lokale
    Build-Werkzeuge – Windows „Desktop development with C++" (VS Build Tools) + Python 3,
    macOS `xcode-select --install`, Linux `build-essential python3`. Dann `npm run rebuild:native`.

---

## Installation & Entwicklung

```bash
git clone <repo-url>
cd project_mega

# Abhängigkeiten installieren. Der postinstall erledigt OHNE Compiler:
#   1. better-sqlite3-Prebuild für die Electron-ABI laden
#   2. die Electron-Laufzeit-Binary laden (in reinem Node – funktioniert auch in
#      gehärteten Umgebungen, die electrons eigenen install.js blockieren)
npm install

# App im Entwicklungsmodus starten (Hot Reload)
npm run dev

# Nur für den HAP-Konverter: einmalig HAP-fähiges ffmpeg holen
# (ohne dies zeigt das Tool eine Hinweis-Warnung; im fertigen Paket ist es enthalten)
npm run ff:fetch
```

> Hinweis: `npm run ff:fetch` lädt ein **HAP-fähiges** ffmpeg (mit libsnappy) aus offiziellen
> Quellen – BtbN (Windows + Linux), evermeet.cx (macOS). Die gängigen npm-ffmpeg-Pakete
> enthalten **kein** HAP. Die Binaries landen in `resources/ffmpeg/<os>/` und sind aus dem Git
> ausgenommen.

---

## Sicherheit (npm / supply-chain)

Angesichts der jüngsten npm-Angriffe (selbstreplizierende Worms über gekaperte Maintainer-Tokens,
bösartige Lifecycle-Scripts, Typosquatting) ist dieses Projekt bewusst defensiv aufgesetzt:

- **`package-lock.json` ist eingecheckt** – mit sha512-Integrity je Paket.
- **`better-sqlite3` ist exakt gepinnt** (`12.8.0`) und bewusst **nicht** die brandneueste Version
  („Cooldown" – kompromittierte Releases fallen meist in den ersten Tagen auf).
- **`.npmrc`**: `save-exact=true` (neue Pakete werden exakt gepinnt), `engine-strict=true`.
- **Schlanker Install-Baum:** `electron-builder` ist **keine** Standard-Abhängigkeit, sondern wird
  beim Paketieren on-demand via `npx` geladen. Dadurch bleibt die gesamte
  `node-gyp` / `tar` / `app-builder`-Kette aus `npm ci` heraus. Der native Rebuild läuft über
  `prebuild-install` (Prebuild-Download) statt über node-gyp.
- Die App läuft offline.

**Empfohlene Installation:**

```bash
# installiert exakt aus dem Lockfile und verifiziert die Integrity-Hashes
npm ci
npm audit signatures   # optional: Registry-Signaturen prüfen
```

> `npm audit` meldet aktuell **0 Findings**. Erreicht durch: `electron-builder` aus den
> Standard-Deps entfernt (eliminiert die `node-gyp`/`tar`-Kette), Electron auf eine **unterstützte**
> Version (40.x statt EOL-33), und das Dev-Tooling (`vite`/`electron-vite`) auf aktuelle Stände.

**Maximal vorsichtig** (blockiert den häufigsten Vektor – Install-Scripts beliebiger Transitive-Deps):

```bash
npm ci --ignore-scripts   # kein Paket-Script läuft automatisch
npm run rebuild:native    # better-sqlite3-Prebuild für die Electron-ABI (reines Node)
npm run electron:bin      # Electron-Laufzeit-Binary laden (reines Node; sonst "Electron uninstall")
```

> Beide Skripte laufen in reinem Node und laden nur geprüfte Prebuilds (kein Compiler, keine
> Transitive-Install-Scripts). `npm run electron:bin` umgeht bewusst electrons eigenen
> `install.js` – der wird von manchen Security-Wrappern abgefangen.

> Bei `--ignore-scripts` läuft auch Electrons eigener postinstall **nicht** – ohne den manuellen
> `electron/install.js`-Schritt fehlt die Electron-Binary und `npm run dev` bricht mit
> **„Electron uninstall"** ab. Die beiden Folge-Befehle laden nur geprüfte Prebuilds (kein Compiler).

> Tipp: `npm install <pkg> --before 2026-05-01` installiert nur Versionen vor einem Datum –
> praktisch, um brandneue (potenziell kompromittierte) Releases zu meiden.

---

## Build & Paketierung

```bash
# Typecheck + Bundles bauen
npm run build

# Installer für das aktuelle Betriebssystem erzeugen
#   - holt ffmpeg (ff:fetch), baut, und ruft electron-builder on-demand via npx
#   - der erste Lauf lädt electron-builder einmalig in den npx-Cache (nicht in node_modules)
npm run package
```

Ergebnis-Installer liegen unter `dist/`:

| OS      | Target      |
| ------- | ----------- |
| Windows | NSIS `.exe` |
| macOS   | `.dmg`      |
| Linux   | AppImage    |

> Die fertig gepackte (noch nicht installierte) App liegt zusätzlich unter
> `dist/win-unpacked/` (bzw. `*-unpacked/`) und ist von dort direkt startbar – praktisch
> zum Testen ohne Installation.

**Code-Signierung ist absichtlich deaktiviert** (`win.signAndEditExecutable: false` in
`electron-builder.yml`). Sonst würde electron-builder **jede** `.exe` signieren wollen (auch die
gebündelten `ffmpeg.exe`/`ffprobe.exe`) und dafür das `winCodeSign`-Paket laden, dessen Entpacken
auf Windows an macOS-Symlinks scheitert („Dem Client fehlt ein erforderliches Recht"). Ein
Zertifikat ist für den privaten Gebrauch nicht nötig; Kosten sind nur fehlende
Icon-/Versions-Metadaten in der `.exe` (kosmetisch).

> `npm run ff:fetch` lädt ffmpeg nur, wenn es noch nicht in `resources/ffmpeg/<os>/` liegt
> (mit `--force` erzwingbar) – wiederholte `npm run package`-Läufe sind dadurch schnell.

> Plattform-Hinweis: Installer baut man jeweils **auf dem Zielbetriebssystem**, weil `ff:fetch`
> und der native Rebuild plattformspezifisch sind. Für macOS liefert evermeet getrennte
> x64/arm64-Binaries (für Universal-Builds beide nötig).

---

## Projektstruktur

```
src/
├── main/                     # Electron Main-Prozess
│   ├── index.ts              # App-Lifecycle, Fenster (sichere Defaults), Protocol
│   ├── ipc/                  # IPC-Handler (dialog, ffmpeg, manuals, player) + Registry
│   └── services/
│       ├── db.ts             # SQLite (better-sqlite3) + FTS5-Migrationen + media_items
│       ├── ffmpeg/           # ffmpegPath, probe, hapEncoder, jobManager (Queue)
│       ├── manuals/          # manualsService, pdfText (pdfjs)
│       └── player/           # mediaLibrary, encoder (Fit/GPU), convertManager, playerState, playerWindow
├── preload/index.ts          # contextBridge -> window.api (typisiert)
├── shared/                   # ipc-contracts.ts + types.ts (single source of truth)
└── renderer/src/
    ├── launcher/             # Launcher + ToolHost (Router)
    ├── components/ui/        # UI-Primitives (Button, Card, …)
    └── tools/
        ├── registry.ts       # ◀ EINZIGE Stelle zum Eintragen neuer Tools
        ├── hap-converter/
        ├── manuals/
        ├── test-patterns/
        └── video-player/     # Steuer-UI (VideoPlayer) + Vollbild-Ausgabe (PlayerOutput)
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
| `npm run typecheck`     | TypeScript-Prüfung (main/preload/shared **und** renderer)    |
| `npm run ff:fetch`      | HAP-fähiges ffmpeg holen (`--all` / `--platform <os>` mögl.) |
| `npm run rebuild:native`| better-sqlite3-Prebuild für die Electron-ABI laden (kein Compiler) |
| `npm run electron:bin`  | Electron-Laufzeit-Binary laden (reines Node; Fix für „Electron uninstall") |
| `npm run package`       | Installer fürs aktuelle OS (inkl. ff:fetch, electron-builder via npx) |
| `npm run start`         | Produktions-Build lokal previewen                            |

---

## Status

**Umgesetzt:**

- **Fundament** – electron-vite (main/preload/renderer), sichere Fenster-Defaults, typisierte
  IPC-Brücke, Tool-Modulsystem, Launcher mit Suche, Gold-Akzent (#ffce2c) auf kühlem Dark-Theme,
  App-Icon, **0 npm-Vulnerabilities**, schlanker Install ohne Compiler (Prebuilds).
- **HAP-Konverter** – Batch nach HAP/HAP Q/HAP Alpha, gebündeltes ffmpeg, Parallel + Kompressor,
  Auto-Padding auf ×4-Maße. End-to-end getestet.
- **Manuals-Bibliothek** – PDF-Import (SHA-256-Dedup), FTS5-Volltextsuche mit aufklappbaren
  Trefferboxen, **Kategorien** (Filter), In-App-PDF-Viewer (Scroll, Zoom/Pinch, Seiten-Sprung,
  **Suche im PDF**).
- **Testbildgenerator** – Muster (Gitter/Module, Geometrie, Farbbalken, Graustufen, Siemensstern,
  Konvergenz), **bewegte** Muster (Pixelcheck-Loop, Scroll, Timecode), **Vollbild-Ausgabe** auf
  gewähltem Monitor (pixelgenau, live), PNG- + Video-Export, **Presets**.
- **Video-Player / LED-Wall-Player** – Playlist-Player für LED-Wände/Beamer. Medien werden auf die
  **Wand-Auflösung eingebacken** (Fit-Modi **Blur-Fill / Schwarze Ränder / Strecken**) und nach
  **H.264/MP4** konvertiert (Chromium dekodiert das hardwarebeschleunigt; **GPU-Encoder** wie
  NVENC/QSV/AMF/VideoToolbox werden erkannt **und validiert**, sonst libx264-Fallback). Bilder
  werden gebacken (freie Standzeit), GIFs zu Loop-Videos. **Vollbild-Ausgabe** auf gewähltem
  Monitor mit **doppelt gepuffertem** HTML5-Player (nahtlose Übergänge), wahlweise **Schnitt oder
  Überblenden** zwischen Medien (mit Audio-Fade). Transport
  (Play/Pause/Skip/**Seek**/**Loop**/**Shuffle**/Stumm), **Playlist** mit Drag&Drop, verwaltete
  Bibliothek (Thumbnails, Datei-**Drag&Drop**-Import, Listen-/Kachelansichten) und eine **In-App-Vorschau**
  (treibt die Wiedergabe auch ohne geöffnetes Ausgabefenster – praktisch ohne zweiten Bildschirm).
  **Fernsteuerung per Tablet/Handy** über einen eingebetteten, dependency-freien Webserver
  (mobile Steuerseite + Live-Sync via SSE, LAN, einschaltbar). Adaptiert den bestehenden
  „LED Wall Player V4" (Python/mpv) in die Electron/React-Suite – nutzt das
  Multi-Monitor-Ausgabefenster und das gebündelte ffmpeg.

## Roadmap

- **Video-Player – nächste Ausbaustufe:** **gespeicherte Playlists/Tabs**, **Idle-/Fallback-Bild**
  (Testbild über den vorhandenen Generator), **Batch-Reconvert** bei Auflösungswechsel, optional
  QR-Code für die Fernsteuerungs-Adresse.
- **Projektionsverhältnis-Rechner**, **LED-Wall-Konfigurator** – kleinere Rechner-Tools.
- **Mobile Manuals-Companion** (Idee) – die Manuals-Bibliothek ließe sich als Tablet-/Handy-App
  (Capacitor) umsetzen; HAP/Testbilder bleiben Desktop (siehe Diskussion).
