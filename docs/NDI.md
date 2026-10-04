# NDI-Ausgabe (optional, experimentell)

Video-Player und Stage-Timer können ihr Bild als **NDI-Quelle** ins Netz senden – etwa in einen
Bildmischer, nach OBS oder vMix. Das dafür nötige native Binding ist **keine reguläre
Abhängigkeit**: Ohne das Modul läuft die App unverändert, das Panel zeigt dann „NDI-Modul nicht
verfügbar“.

## Bedienung

Im jeweiligen Werkzeug im Seiten-Panel **„NDI-Ausgabe (Netzwerk)“**:

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
Binary, der Zielrechner braucht also keine eigene NDI-Installation.

> **Warum kein `npm install github:rse/grandiose`?** Neuere npm-Versionen blockieren
> Install-Skripte fremder Pakete (allow-scripts). Das Paket landet dann ohne NDI-SDK und
> unkompiliert in `node_modules`, und electron-builder packt undeklarierte Module nicht mit.

NDI ist eine Marke von Vizrt/NewTek; die Lizenzbedingungen des SDK beachten.
