# Sicherheit

Zwei Seiten: die Abhängigkeiten (Supply Chain beim Installieren und Bauen) und die laufende App.
Offene Punkte stehen in der [Roadmap](ROADMAP.md#sicherheit).

## Abhängigkeiten (npm / Supply Chain)

Angesichts der npm-Angriffe der letzten Zeit (selbstreplizierende Würmer über gekaperte
Maintainer-Tokens, bösartige Install-Skripte, Typosquatting) ist das Projekt bewusst defensiv
aufgesetzt:

- **`package-lock.json` ist eingecheckt** – mit sha512-Integrity je Paket.
- **Nur zwei Laufzeit-Abhängigkeiten:** `better-sqlite3` und `pdfjs-dist` – beide exakt gepinnt
  und mit Abstand nachgezogen (siehe [Updates einspielen](#updates-einspielen)). Alles andere ist
  Build- bzw. Testwerkzeug, etwa `playwright-core` für die E2E-Läufe: eigene Abhängigkeiten hat es
  keine, Browser lädt es nicht, und die Version (1.63.0) war beim Einspielen über eine Woche alt.
- **`.npmrc`:** `save-exact=true` (neue Pakete werden exakt gepinnt), `engine-strict=true`.
- **Schlanker Install-Baum:** `electron-builder` ist keine Abhängigkeit, sondern wird beim
  Paketieren per `npx` geholt. So bleibt die `node-gyp`/`tar`/`app-builder`-Kette aus `npm ci`
  heraus; das native Modul kommt als Prebuild über `prebuild-install` statt über node-gyp.
- **Externe Programme aus offiziellen Quellen:** ffmpeg (BtbN, evermeet.cx) und die
  Electron-Binary per HTTPS beim Einrichten; yt-dlp lädt die App selbst und vergleicht dabei die
  Prüfsumme des Releases.
- **ffmpeg in der fertigen App** (Windows, Linux; abschaltbar im Video-Konverter): einmal am Tag
  der neueste Build von BtbN, der **mindestens 7 Tage alt** ist (dieselbe Regel wie für npm-Pakete;
  bis dahin hat ihn auch die CI getestet). Download nur von
  `github.com/BtbN/FFmpeg-Builds/releases/download/…` – eine veränderte API-Antwort kann keine
  andere Quelle unterschieben –, Prüfung gegen die `checksums.sha256` desselben Releases (sichert
  die Übertragung, nicht das Release selbst), Selbsttest (Encoder, Filter, Probe-Kodierung) und
  Aktivierung erst beim nächsten Start; „Mitgeliefertes verwenden“ sperrt den Build. macOS
  aktualisiert nicht in der App: evermeet.cx liefert nur GPG-Signaturen, keine Prüfsummen.

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

### Updates einspielen

Mit Abstand: nur Versionen, die schon rund eine Woche draußen sind – kompromittierte Releases
fallen meist in den ersten Tagen auf.

```bash
npm install <paket>@<version> --before <Datum vor 7 Tagen>   # direkte Abhängigkeiten
npm audit fix --before <Datum vor 7 Tagen>                    # Unterabhängigkeiten
npm ci                                                        # frisch installieren wie die CI
```

Danach alle Prüfungen (`format:check`, `lint`, `typecheck`, `typecheck:test`, `test`, `build`)
und ein kurzer App-Start. `save-exact` pinnt dabei auf die genaue Version.

> **npm 10 und vitest:** Updates von vitest brechen mit „Cannot read properties of null (reading
> 'edgesOut')“ ab – ein npm-Fehler beim Auflösen von vitests optionalen Peer-Abhängigkeiten.
> Abhilfe: `--legacy-peer-deps` anhängen. Die Lock-Datei bleibt gleichwertig, weil im Baum keine
> automatisch installierten Peers stecken; `npm ci` danach prüft das.

### Stand der bekannten Lücken

Prüfen mit `npm audit` (alles) bzw. `npm audit --omit=dev` (nur Laufzeit-Abhängigkeiten – Electron
selbst zählt dort nicht mit, obwohl es die Laufzeit der App ist).

**Stand 4. Oktober 2026** – nach den Updates auf Electron 42.11.8, pdfjs-dist 6.3.289,
react-router-dom 7.18.4, vitest 4.1.11, postcss 8.5.28 und vite 7.3.6 (samt Unterabhängigkeiten):

- `npm audit --omit=dev`: **keine Lücken**; Electron selbst ist ebenfalls ohne bekannte Meldung.
- `npm audit`: **5 Meldungen der Tailwind-3-Kette** (`braces` → `micromatch`/`fast-glob`/`chokidar`
  → `tailwindcss`). Sie betreffen nur den Build, der ausschließlich die eigenen Quelldateien
  durchsucht, und verschwinden erst mit Tailwind 4 (siehe [Roadmap](ROADMAP.md#upgrades)).

## Die App

- **Abgeschottete Fenster:** `sandbox`, `contextIsolation` und `nodeIntegration: false` in allen
  Fenstern (Haupt-, Werkzeug-, Ausgabe-, NDI- und PDF-Fenster). Der Preload gibt nur eine
  typisierte API frei, nie rohes `ipcRenderer`. Haupt- und Werkzeugfenster öffnen keine neuen
  Fenster (`window.open` gesperrt); externe Links gehen an den Standardbrowser.
- **Eigene Protokolle** für Handbücher, Player-Medien und Jingles (`manual:`, `media:`, `jingle:`)
  liefern nur Dateien aus den App-Ablagen – der Renderer braucht keinen `file://`-Zugriff.
  `media://vgen/…` liefert nur Vorschaubilder (`vgen-cache/thumbs`, nur `.jpg`) und gerechnete
  Vorschauen (`vgen-cache/previews`, nur `p_<hex>.mp4`) des Video-Generators, jeweils mit sicheren
  Namen. Quelldateien für dessen Live-Vorschau (Videos, GIFs, Musik) gibt es nur über
  `media://vgen/src/<zeichen>/…`: Der main-Prozess vergibt je Datei ein zufälliges 128-bit-Zeichen,
  das nur bis zum Beenden gilt – nur für absolute Pfade ohne Protokolle mit Medien-Endung, die es
  gibt; ein erfundenes Zeichen liefert nichts. Projekte des Video-Generators prüft der main-Prozess Feld für
  Feld, bevor sie an ffmpeg gehen: erlaubte Werte, Grenzen, nur absolute Pfade ohne Protokolle
  (ffmpeg öffnet sonst auch `concat:`, `http:` …), die Zieldatei darf keine Quelle sein.
- **Kein `eval` im Renderer:** Die Content-Security-Policy verbietet `unsafe-eval`; pdfjs 6 kommt
  ohne eval aus – präparierte PDFs können darüber keinen Code ausführen. (`'unsafe-inline'` für
  Skripte braucht noch der Vite-Dev-Server, siehe Roadmap.)
- **Fernsteuerungen** sind standardmäßig aus, im lokalen Netz erreichbar und ohne Passwort – in
  fremden Netzen nur bei Bedarf einschalten. Befehle vom Handy werden Feld für Feld geprüft (nur
  bekannte Befehle, Werte begrenzt; das Idle-Bild bleibt dem Rechner vorbehalten), Nutzertexte in
  den Steuerseiten escaped.
- **Uploads vom Handy** (Video-Player): höchstens 8 GB je Datei, danach müssen 2 GB frei bleiben –
  geprüft vorab und beim Schreiben, denn die Größenangabe kann fehlen oder falsch sein.
  Abgebrochene oder abgewiesene Uploads hinterlassen keine Dateien.
- **yt-dlp-Aufrufe** nehmen nur http(s)-Adressen an, und die Adresse steht immer hinter `--`: eine
  Eingabe, die mit „-“ beginnt, wird nie als Option gelesen.
- **Robust bei Fehlern:** Fehlergrenze je Werkzeug, globale Fehler-Handler mit Debug-Log und
  Wiederherstellung korrupter `settings.json`/`library.db` (Kopie sichern, neu anlegen, melden).
