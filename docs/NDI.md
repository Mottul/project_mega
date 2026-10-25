# NDI-Ausgabe (optional, experimentell)

Video-Player und Stage-Timer können ihr Bild als **NDI-Quelle** ins Netz senden – etwa in einen
Bildmischer, nach OBS oder vMix. Das dafür nötige native Binding ist **keine reguläre
Abhängigkeit**: Ohne das Modul läuft die App unverändert, das Panel zeigt dann „NDI-Modul nicht
verfügbar“.

## Bedienung

Ein- und ausschalten mit **„NDI“** in der Ausgabe-Leiste des Werkzeugs (sie ist rot umrandet,
solange etwas live ist); eingestellt wird im Bereich **„NDI“** der Einstellungs-Schublade:

| Werkzeug     | Einstellungen                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------ |
| Video-Player | Quellenname, Auflösung (Wand 1:1, Wand 50 %, eingebettet in 1920 × 1080 oder 1280 × 720), 25/30/50 fps, Ton mitsenden |
| Stage-Timer  | Quellenname, 1920 × 1080 oder 1280 × 720, 25/30/50 fps                                                             |

- Gerendert wird in einem eigenen, unsichtbaren Fenster – ein Vollbild-Ausgabefenster braucht es
  dafür nicht.
- Der Ton des Video-Players geht **Pre-Fader** raus (unabhängig von lokaler Lautstärke/Stumm).
- Volle Auflösung braucht Gigabit-LAN (rund 100–150 Mbit/s bei 1080p30).

## Einrichtung (einmalig)

Voraussetzungen: Internet, git, **Python 3** (python.org, „Add to PATH“ anhaken – node-gyp
braucht es) und C++-Build-Werkzeuge (Windows: Visual Studio „Desktop development with C++“,
macOS: Xcode Command Line Tools, Linux: build-essential).

```bash
npm run ndi:setup               # Neu-Bau erzwingen: npm run ndi:setup -- --force
```

Das Skript arbeitet die Schritte ausdrücklich und kontrolliert ab:

1. klont den sende-fähigen Fork `rse/grandiose` nach `vendor/grandiose`,
2. installiert dessen Laufzeit-Abhängigkeiten ohne Install-Skripte,
3. lädt das NDI-SDK und prüft das Ergebnis (der Upstream-Downloader meldet Fehler sonst nicht),
4. kompiliert gegen die Electron-ABI der App.

Danach die App neu starten. Nach einem Electron-Upgrade genügt ein erneuter Lauf – die
ABI-Abweichung wird erkannt und automatisch neu gebaut.

**Paketierung:** `npm run package` nimmt nur die Laufzeitdateien mit (Binary, NDI-Runtime-DLL,
`index.js`/`package.json`, Lizenz) – nicht SDK, `.git` oder Build-Reste. Die DLL liegt neben dem
Binary, der Zielrechner braucht also keine eigene NDI-Installation. Die Installer aus der CI
(„Installer bauen“, GitHub Releases) enthalten NDI **nicht** – dort läuft kein `ndi:setup`.

**Weitergabe:** Das NDI-SDK ist lizenzgebührenfrei, und die Runtime darf mit der App ausgeliefert
werden – aber nur mit Auflagen, die die App noch nicht erfüllt (laut
[NDI-Doku](https://docs.ndi.video/docs/sdk/licensing), Stand Oktober 2026; verbindlich ist der
Lizenzvertrag im Hauptordner des SDK):

- „NDI® is a registered trademark of Vizrt NDI AB“ im Info-Bereich der App und in der Doku,
- ein Link zu ndi.video nahe jeder Stelle, an der NDI gewählt wird, dazu in Doku und Website,
- die Lizenzbedingungen der App decken die Vorgaben des NDI-Lizenzvertrags ab,
- die Hinweisdatei zu den Fremdbibliotheken des SDK reist mit den NDI-Binärdateien mit (das Setup
  übernimmt bisher nur `include/` und `lib/`),
- die mitgelieferte Runtime wird aktuell gehalten.

Für Installer mit NDI müsste die CI außerdem das Binding je System und Architektur selbst bauen
(Fork klonen, SDK laden, gegen Electron kompilieren) – für macOS also arm64 und x64 getrennt.

> **Warum kein `npm install github:rse/grandiose`?** Neuere npm-Versionen blockieren
> Install-Skripte fremder Pakete (allow-scripts). Das Paket landet dann ohne NDI-SDK und
> unkompiliert in `node_modules`, und electron-builder packt undeklarierte Module nicht mit.

## Aufbau (Entwicklung)

| Datei                            | Aufgabe                                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `main/services/ndi/ndi.ts`           | Binding laden (paketiert → `vendor/` → `node_modules`), Konstanten normalisieren, NDI einmal initialisieren        |
| `main/services/ndi/ndiSender.ts`     | **ein** Offscreen-Sender für beide Werkzeuge: unsichtbares Fenster auf einer App-Route, paint-Frames → NDI, Ton, Start/Stopp/Abbau |
| `main/services/ndi/ndiFrames.ts`     | Eingaben begrenzen, Video- und Audioframes bauen (rein, getestet)                                                  |
| `timer/timerNdi.ts` · `player/playerNdi.ts` | dünne Hüllen: Konfiguration, Status, Route; der Player nimmt die Tonblöcke seines Spiegelfensters an               |

Was der Sender absichert (jeweils schon einmal schiefgegangen): Der native Sender wird erst
zerstört, wenn kein Send mehr läuft (sonst Absturz beim Stoppen), und vor dem nächsten Erstellen
abgewartet. Ein Stopp oder zweiter Start mitten im Start baut den gerade erstellten Sender wieder
ab, statt ein verwaistes Fenster zu öffnen, das unbemerkt weitersendet. `closed` zählt nur vom
aktuellen Fenster. Tonblöcke aus dem Spiegel werden geprüft (gleich lange Float32-Kanäle), bevor
das Binding sie liest.

Prüfen: `npx vitest run src/main/services/ndi` (Sender mit nachgebautem Binding) und
`npm run e2e -- ndi` mit dem echten Binding – ohne `vendor/grandiose` (so in der CI) überspringt
das Skript seine Schritte.

NDI ist eine Marke von Vizrt/NewTek; die Lizenzbedingungen des SDK beachten.
