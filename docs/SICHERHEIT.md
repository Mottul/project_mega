# Sicherheit

Zwei Seiten: die Abhängigkeiten (Supply Chain beim Installieren und Bauen) und die laufende App.
Offene Punkte stehen in der [Roadmap](ROADMAP.md#sicherheit).

## Abhängigkeiten (npm / Supply Chain)

Angesichts der npm-Angriffe der letzten Zeit (selbstreplizierende Würmer über gekaperte
Maintainer-Tokens, bösartige Install-Skripte, Typosquatting) ist das Projekt bewusst defensiv
aufgesetzt:

- **`package-lock.json` ist eingecheckt** – mit sha512-Integrity je Paket.
- **Nur zwei Laufzeit-Abhängigkeiten:** `better-sqlite3` (exakt gepinnt und mit „Cooldown“
  nachgezogen – kompromittierte Releases fallen meist in den ersten Tagen auf) und `pdfjs-dist`.
  Alles andere ist Build-Werkzeug.
- **`.npmrc`:** `save-exact=true` (neue Pakete werden exakt gepinnt), `engine-strict=true`.
- **Schlanker Install-Baum:** `electron-builder` ist keine Abhängigkeit, sondern wird beim
  Paketieren per `npx` geholt. So bleibt die `node-gyp`/`tar`/`app-builder`-Kette aus `npm ci`
  heraus; das native Modul kommt als Prebuild über `prebuild-install` statt über node-gyp.
- **Externe Programme aus offiziellen Quellen:** ffmpeg (BtbN, evermeet.cx) und die
  Electron-Binary per HTTPS beim Einrichten; yt-dlp lädt die App selbst und vergleicht dabei die
  Prüfsumme des Releases.

### Installation

```bash
npm ci                  # exakt aus dem Lockfile, prüft die Integrity-Hashes
npm audit signatures    # optional: Registry-Signaturen prüfen
```

**Maximal vorsichtig** – kein Paket-Skript läuft automatisch. Das blockiert den häufigsten
Angriffsweg, Install-Skripte beliebiger transitiver Abhängigkeiten:

```bash
npm ci --ignore-scripts
npm run rebuild:native   # better-sqlite3-Prebuild für die Electron-ABI (reines Node)
npm run electron:bin     # Electron-Laufzeit-Binary laden (reines Node)
```

Ohne die beiden Folgeschritte fehlen Prebuild und Electron-Binary – `npm run dev` bricht dann mit
„Electron uninstall“ ab. Beide Skripte laufen in reinem Node, laden nur Prebuilds bzw. die
offizielle Binary und brauchen keinen Compiler. `electron:bin` umgeht bewusst electrons eigenes
`install.js`, das manche Sicherheits-Wrapper abfangen.

> Tipp: `npm install <paket> --before <Datum>` installiert nur Versionen vor einem Stichtag –
> praktisch, um brandneue (potenziell kompromittierte) Releases zu meiden.

### Stand der bekannten Lücken

Prüfen mit `npm audit` (alles) bzw. `npm audit --omit=dev` (nur Laufzeit-Abhängigkeiten – Electron
selbst zählt dort nicht mit, obwohl es die Laufzeit der App ist).

**Stand 4. Oktober 2026** – Updates stehen aus (siehe [Roadmap](ROADMAP.md#sicherheit)):

| Paket                     | Installiert | Behoben ab | Bedeutung für die App                                                     |
| ------------------------- | ----------- | ---------- | ------------------------------------------------------------------------- |
| `pdfjs-dist`              | 6.1.200     | 6.2.108    | **hoch** – JavaScript-Ausführung beim Öffnen eines präparierten PDFs (Manuals) |
| `electron`                | 42.7.1      | 42.10.0    | **hoch** – mehrere Sandbox-/Protokoll-Lücken in der Laufzeit              |
| `react-router-dom`        | 7.18.1      | 7.18.4     | gering – betrifft nur den RSC-Modus, die App nutzt den HashRouter         |
| Dev-Werkzeuge             | –           | –          | keine Laufzeit-Wirkung: `vitest`, `postcss`, `undici` (Electron-Download), `esbuild` (Dev-Server), Tailwind-3-Kette (`braces` → nur mit Tailwind 4 behoben) u. a. |

## Die App

- **Abgeschottete Fenster:** `sandbox`, `contextIsolation` und `nodeIntegration: false` in allen
  Fenstern (Haupt-, Werkzeug-, Ausgabe-, NDI- und PDF-Fenster). Der Preload gibt nur eine
  typisierte API frei, nie rohes `ipcRenderer`. Haupt- und Werkzeugfenster öffnen keine neuen
  Fenster (`window.open` gesperrt); externe Links gehen an den Standardbrowser.
- **Eigene Protokolle** für Handbücher, Player-Medien und Jingles (`manual:`, `media:`, `jingle:`)
  liefern nur Dateien aus den App-Ablagen – der Renderer braucht keinen `file://`-Zugriff.
- **PDF-Text** wird im Hauptprozess mit `isEvalSupported: false` gelesen (der PDF-Viewer im
  Renderer noch nicht – siehe Roadmap).
- **Fernsteuerungen** sind standardmäßig aus, im lokalen Netz erreichbar und ohne Passwort – in
  fremden Netzen nur bei Bedarf einschalten. Nutzertexte werden in den Steuerseiten escaped.
- **Robust bei Fehlern:** Fehlergrenze je Werkzeug, globale Fehler-Handler mit Debug-Log und
  Wiederherstellung korrupter `settings.json`/`library.db` (Kopie sichern, neu anlegen, melden).
