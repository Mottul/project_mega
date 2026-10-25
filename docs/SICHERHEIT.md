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
- **`.npmrc`:** `ignore-scripts=true` (keine Install-Skripte, siehe [Installation](#installation)),
  `save-exact=true` (neue Pakete werden exakt gepinnt), `engine-strict=true`.
- **Schlanker Install-Baum:** `electron-builder` ist keine Abhängigkeit, sondern wird beim
  Paketieren per `npx` geholt. So bleibt die `node-gyp`/`tar`/`app-builder`-Kette aus `npm ci`
  heraus. Das native Modul `better-sqlite3` bringt seit Version 13 fertige N-API-Binaries im Paket
  mit – ohne Install-Skript, ohne `prebuild-install`, ohne node-gyp.
- **Externe Programme aus offiziellen Quellen:** ffmpeg (BtbN, evermeet.cx) und die
  Electron-Binary per HTTPS beim Einrichten; die Electron-Binary wird gegen die SHA-256-Summe aus
  `electron/checksums.json` geprüft (kommt mit dem npm-Paket, also über die Integrity der
  Lock-Datei abgesichert). ffmpeg prüft `scripts/download-ffmpeg.mjs` vor dem Auspacken: BtbN
  gegen die `checksums.sha256` desselben Releases, evermeet.cx nur gegen die veröffentlichte Größe
  der versionierten Datei (es gibt dort nur GPG-Signaturen) – das fängt abgebrochene oder
  vertauschte Downloads, kein verändertes Release. yt-dlp lädt die App selbst und vergleicht dabei
  die Prüfsumme des Releases.
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

**Kein Paket-Skript läuft automatisch** (`.npmrc`: `ignore-scripts=true`). Das blockiert den
häufigsten Angriffsweg, Install-Skripte beliebiger transitiver Abhängigkeiten – und keines unserer
Pakete braucht eines:

- `better-sqlite3` bringt fertige Binaries mit. Sein `binding.gyp` würde bei `npm ci` trotz
  `"gypfile": false` einen node-gyp-Bau auslösen (npm speichert das Feld nicht in der
  Lock-Datei) – ohne C++-Compiler bricht der Install dann ab.
- Die Electron-Binary lädt `scripts/fetch-electron-bin.mjs` in reinem Node und prüft ihre
  Prüfsumme; `npm run dev`, `start` und `e2e` rufen es als ersten Schritt auf (einzeln:
  `npm run electron:bin`). Es umgeht bewusst electrons eigenes `install.js`.
- `esbuild` prüft in seinem Install-Skript nur das Binary; es läuft auch ohne.

Folge: npm führt auch keine `pre`-/`post`-Skripte aus. Was vor einem Befehl passieren soll,
steht deshalb direkt in dessen Skript (`package.json`).

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

**Automatisch:** Dependabot (`.github/dependabot.yml`) öffnet jeden Montag Pull Requests – nach
derselben Regel (`cooldown`: 7 Tage). Patch- und Minor-Updates kommen gesammelt in einem PR,
Hauptversionen einzeln; die großen Umstiege der [Roadmap](ROADMAP.md#upgrades) (React, Tailwind,
Vite, TypeScript …) bleiben eigene Vorhaben und kommen nicht als PR. Auch die GitHub Actions der
CI hält Dependabot aktuell. Gemergt wird erst nach grüner CI, von Hand.

**Electron-Hauptversionen:** Electron pflegt nur die drei neuesten (etwa alle 8 Wochen eine neue).
Vor dem Umstieg die [Breaking Changes](https://www.electronjs.org/docs/latest/breaking-changes)
durchgehen – beim Schritt 42 → 44 z. B. starten Datei-Dialoge ohne Startpfad im Downloads-Ordner
(deshalb `services/fileDialogs.ts`), und macOS braucht ab 44 mindestens Version 13.

> **npm 10 und vitest:** Updates von vitest brechen mit „Cannot read properties of null (reading
> 'edgesOut')“ ab – ein npm-Fehler beim Auflösen von vitests optionalen Peer-Abhängigkeiten.
> Abhilfe: `--legacy-peer-deps` anhängen. Die Lock-Datei bleibt gleichwertig, weil im Baum keine
> automatisch installierten Peers stecken; `npm ci` danach prüft das.

### Stand der bekannten Lücken

Prüfen mit `npm audit` (alles) bzw. `npm audit --omit=dev` (nur Laufzeit-Abhängigkeiten – Electron
selbst zählt dort nicht mit, obwohl es die Laufzeit der App ist).

**Stand 11. Oktober 2026** (unverändert seit 9. Oktober) – nach den Updates auf Electron 44.5.1, better-sqlite3 13.0.3,
eslint 10.11.0, typescript-eslint 8.71.0, prettier 3.9.9 u. a. (samt Unterabhängigkeiten, z. B.
`source-map-js` 1.2.2):

- `npm audit --omit=dev`: **keine Lücken**; Electron 44.5.1 enthält die Chromium-/V8-Korrekturen
  vom 30. September (dieselben wie 42.11.10).
- `npm audit`: **7 Meldungen der Tailwind-3-Kette** (`braces` → `micromatch`/`fast-glob`/`chokidar`
  sowie `postcss-selector-parser` → `postcss-nested`, alle unter `tailwindcss`). Sie betreffen nur
  den Build, der ausschließlich die eigenen Quelldateien verarbeitet, und verschwinden erst mit
  Tailwind 4 (siehe [Roadmap](ROADMAP.md#upgrades)).

## Die App

- **Abgeschottete Fenster:** `sandbox`, `contextIsolation`, `nodeIntegration: false` und keine
  Webviews in allen Fenstern mit App-Seite (Haupt-, Werkzeug-, Ausgabe- und NDI-Fenster, eine
  Quelle: `secureWebPreferences` in `services/windows/appWindows.ts`). Der Preload gibt nur eine
  typisierte API frei, nie rohes `ipcRenderer`. Das unsichtbare Fenster für den PDF-Export
  (`services/pdf/htmlToPdf.ts`) hat keinen Preload und kein JavaScript und eine eigene, flüchtige
  Partition, die nur Dateien aus dem eigenen Temp-Ordner lädt: Bilder von Servern oder
  UNC-Freigaben (`file://server/…`, unter Windows mit Anmeldeversuch) aus einer fremden
  Projektdatei werden nie angefragt (`e2e/pdf.mjs`). Die fertige App lädt nie eine Seite aus
  `ELECTRON_RENDERER_URL`, beim Entwickeln nur einen lokalen Vite-Server.
- **Fenster-Wächter für alle Fenster** (`services/windows/windowGuards.ts`, über `web-contents-created`,
  auch für künftige): keine neuen Fenster (`window.open` gesperrt), keine Navigation weg von der
  App-Seite – so bekommt nie eine fremde Seite die App-API –, keine Webviews. Externe Links gehen
  an den Standardbrowser, und zwar nur http(s). Browser-Berechtigungen nur für die App-Seite und
  nur Vollbild, Schreiben in die Zwischenablage und die Wahl des Audio-Ausgabegeräts. Das
  Mikrofon nur der RTA: nur auf seiner Route (`#/tool/rta`), nur Ton – jede andere Seite und
  jedes andere Fenster bekommt es nie, auch nicht als Abfrage (sonst sähe sie die Namen aller
  Mikrofone). Kamera, Standort, Benachrichtigungen usw. nie. Regeln rein und getestet in
  `windowPolicy.ts`, in der echten App per E2E `security` und `rta` (dieser ohne
  `--use-fake-ui-for-media-stream`, das die Regel umginge). Die Regeln werfen nie: Vor Oktober
  2026 warf `isAppPage` bei kaputter %-Kodierung (`file:///C:/x%E0.html`), und der Wächter ließ die
  Navigation samt App-API durch – jetzt per Unit- und E2E-Test abgedeckt.
- **Shell-Aufrufe:** „Ordner öffnen“ (`shell.openPath` startet Dateien mit ihrem Programm) nur
  für vorhandene lokale Ordner; „Im Ordner zeigen“ nur mit absolutem Pfad (Netzwerkpfade erlaubt,
  es startet nichts).
- **Eigene Protokolle** für Handbücher, Player-Medien, Jingles und Fotos der Projektdateien
  (`manual:`, `media:`, `jingle:`, `foto:`) liefern nur Dateien aus den App-Ablagen – der
  Renderer braucht keinen `file://`-Zugriff. `foto://bild/<hash>` nimmt nur 64 Hex-Zeichen und
  liest nur aus `userData/Projektfotos`.
  `media://vgen/…` liefert nur Vorschaubilder (`vgen-cache/thumbs`, nur `.jpg`) und gerechnete
  Vorschauen (`vgen-cache/previews`, nur `p_<hex>.mp4`) des Video-Generators, jeweils mit sicheren
  Namen. Quelldateien für dessen Live-Vorschau (Videos, GIFs, Musik) gibt es nur über
  `media://vgen/src/<zeichen>/…`: Der main-Prozess vergibt je Datei ein zufälliges 128-bit-Zeichen,
  das nur bis zum Beenden gilt – nur für absolute Pfade ohne Protokolle mit Medien-Endung, die es
  gibt; ein erfundenes Zeichen liefert nichts. Projekte des Video-Generators prüft der main-Prozess Feld für
  Feld, bevor sie an ffmpeg gehen: erlaubte Werte, Grenzen, nur absolute Pfade ohne Protokolle
  (ffmpeg öffnet sonst auch `concat:`, `http:` …), die Zieldatei darf keine Quelle sein.
- **Projektdateien** (`.mottul`) kommen von Kollegen oder per Mail und gelten als fremde Eingabe.
  Gelesen wird nur in den Speicher, nie auf die Platte entpackt: eigener ZIP-Leser mit harten
  Grenzen (Methode nur Speichern/Deflate, keine Verschlüsselung, Namen ohne `..`/absolute Pfade,
  Größe je Eintrag und gesamt, Zahl der Einträge, CRC-Prüfung – gegen ZIP-Bomben und Zip-Slip),
  der Inhalt Feld für Feld geprüft (`sanitize…` je Werkzeug). Ein kaputter Teil macht die ganze
  Datei ungültig, statt beim Speichern still verloren zu gehen. **Geschrieben** wird nur in
  `.mottul`-Pfade aus einem Dialog oder einer in dieser Sitzung geöffneten Datei; aus „Zuletzt
  geöffnet“ (nach einem Neustart) nur, wenn dort schon eine gültige Projektdatei liegt – der
  Renderer kann so keinen beliebigen Pfad beschreiben. Atomar (Nachbardatei, dann umbenennen), mit
  Warteschlange je Datei und einer Sicherung des vorigen Stands unter `userData/Sicherungen`; neue
  Dateien nur exklusiv (nie über eine, die inzwischen jemand angelegt hat), und nur, was sich mit
  denselben Grenzen wieder öffnen lässt. Ein Lesefehler (Netzlaufwerk hakt) gilt nie als „Datei
  fehlt“. Schlüssel aus der Datei werden nur als eigene Eigenschaften nachgeschlagen
  (`Object.hasOwn`), nie über den Prototyp. **Fotos** aus einer Datei übernimmt die App beim
  Öffnen nur, wenn ihr Inhalt zu ihrem sha256 passt – eine präparierte Datei kann so kein Foto
  einer anderen Planung ersetzen. Eingefügte Fotos werden neu kodiert; dabei fallen EXIF-Daten
  wie GPS-Koordinaten des Aufbauorts weg, bevor die Datei an Kunden geht. Andere Abschnitte
  derselben Datei liest ein Werkzeug nur über `projects.peek` (nur `.mottul`, ohne Freigabe zum
  Schreiben).
- **Handy-Fassung und Online-Ablage (Mini-Manual):** Die HTML-Datei lädt nichts nach (Fotos als
  `data:`-URLs, die main aus der eigenen Ablage über den geprüften Hash einsetzt) und enthält nur
  unser eigenes kleines Skript; alle Texte sind escaped wie im PDF. **Online nie Zugangsdaten** –
  das Kapitel fällt weg, höchstens Stufe Betreuung –, `noindex` im Kopf. main schreibt nur in den
  Ordner der Online-Ablage (Einstellung, im Ordner-Dialog gewählt, mit Zeitlimit geprüft) und
  dort nur `<Ordner>/index.html` mit einem Namen, den main selbst erzeugt hat (`[a-z0-9-]`, kein
  Weg nach oben); die Adresse nur `https` ohne Abfrage. Der Ordnername ist nicht erratbar
  (40 Bit Zufall) – geheim ist die Seite trotzdem nicht: Wer die Kurzkarte sieht, kann sie öffnen.
- **Anleitungen (Mini-Manual):** Alle Texte aus der Datei werden zuerst escaped, erst dann wird
  das kleine Auszeichnungs-Subset umgesetzt; Links nur `https:`, `tel:`, `mailto:`; die
  Akzentfarbe kommt nur als geprüftes Hex ins CSS. **Zugangsdaten stehen im Klartext** in der
  Projektdatei – wer die Datei hat, kennt sie. Im PDF ab Werk „wird separat übergeben“, die
  Stufe Bedienung zeigt sie nie. **Eigene Bausteine** liegen als JSON unter
  `userData/Bausteine`; der Dateiname ist immer die geprüfte Kennung, nie ein Name vom Renderer,
  und den Inhalt prüft das Werkzeug vor dem Einfügen. Eine **Bausteine-Datei zum Import** ist
  fremde Eingabe: nur über den Öffnen-Dialog des main (höchstens 50 Dateien, je 20 MB), Kopf
  `mottulbox`/`bausteine` mit bekannter Version, höchstens 500 Bausteine, jeder einzeln geprüft
  (Kennung, Art, Längen) und erst dann geschrieben; vorhandene werden nur durch eine höhere
  Version ersetzt.
- **Kein `eval` im Renderer:** Die Content-Security-Policy verbietet `unsafe-eval`; pdfjs 6 kommt
  ohne eval aus – präparierte PDFs können darüber keinen Code ausführen. (`'unsafe-inline'` für
  Skripte braucht noch der Vite-Dev-Server, siehe Roadmap.)
- **Fernsteuerungen** sind standardmäßig aus, im lokalen Netz erreichbar und ohne Passwort – in
  fremden Netzen nur bei Bedarf einschalten. Befehle vom Handy werden Feld für Feld geprüft (nur
  bekannte Befehle, Werte begrenzt; das Idle-Bild bleibt dem Rechner vorbehalten), Nutzertexte in
  den Steuerseiten escaped. Wirft ein Handler (etwa bei kaputter %-Kodierung in einer
  Medien-Adresse), antwortet der Server mit einem Fehler und läuft weiter (`safeHandler` in
  `remoteHttp.ts`), statt die Anfrage hängen zu lassen.
- **Uploads vom Handy** (Video-Player): höchstens 8 GB je Datei, danach müssen 2 GB frei bleiben –
  geprüft vorab und beim Schreiben, denn die Größenangabe kann fehlen oder falsch sein.
  Abgebrochene oder abgewiesene Uploads hinterlassen keine Dateien.
- **yt-dlp-Aufrufe** nehmen nur http(s)-Adressen an, und die Adresse steht immer hinter `--`: eine
  Eingabe, die mit „-“ beginnt, wird nie als Option gelesen.
- **Cookies für yt-dlp** (Anmeldung, aus): Die App liest, speichert und überträgt keine Cookies.
  Sie gibt yt-dlp nur den Browsernamen (feste Liste) oder den Pfad einer vom Nutzer gewählten
  cookies.txt (absolut, muss existieren) mit; die Einstellung liest der main bei jedem Aufruf aus
  settings.json, nie aus der Anfrage des Renderers. yt-dlp schreibt eine cookies.txt beim Laden
  aktualisiert zurück.
- **Robust bei Fehlern:** Fehlergrenze je Werkzeug, globale Fehler-Handler mit Debug-Log und
  Wiederherstellung korrupter `settings.json`/`library.db` (Kopie sichern, neu anlegen, melden).
