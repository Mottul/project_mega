# Installation unter Windows und macOS

Kurzanleitung für Anwender. Wer die Pakete selbst erzeugt, findet den Weg dorthin
im [README](../README.md#build--paketierung) (`npm run package`, Ergebnis in `dist/`).

**Vorab nichts installieren.** ffmpeg ist im Paket enthalten, yt-dlp lädt die App
beim ersten Start selbst — weder Python noch eine der beiden Anwendungen müssen
von Hand eingerichtet werden.

| System         | Datei                            |
| -------------- | -------------------------------- |
| Windows 10/11  | `Mottulbox-<Version>-setup.exe`   |
| macOS          | `Mottulbox-<Version>.dmg`         |

---

## Windows

1. `Mottulbox-<Version>-setup.exe` ausführen.
2. SmartScreen meldet einen unbekannten Herausgeber → **Weitere Informationen** →
   **Trotzdem ausführen**. Die Pakete sind bewusst nicht signiert (siehe unten).
3. Der Installer läuft ohne Administratorrechte für den angemeldeten Benutzer;
   der Zielordner lässt sich im Assistenten ändern.
4. Start über das Startmenü, Deinstallation über *Einstellungen → Apps → Mottulbox*.

Einstellungen und geladene Werkzeuge liegen unter `%APPDATA%\Mottulbox`.

## macOS

1. `Mottulbox-<Version>.dmg` öffnen und **Mottulbox** in den Ordner *Programme* ziehen.
2. Beim **ersten** Start nicht doppelklicken, sondern mit gedrückter ctrl-Taste
   klicken (bzw. Rechtsklick) → **Öffnen** → im Dialog nochmals **Öffnen**.
   Gatekeeper weist einen Doppelklick sonst ab, weil die App nicht signiert und
   notarisiert ist.
   - Alternativ nach dem abgewiesenen Versuch: *Systemeinstellungen → Datenschutz
     und Sicherheit → „Dennoch öffnen"*.
   - Meldet macOS „… ist beschädigt und kann nicht geöffnet werden", liegt das am
     Quarantäne-Merkmal des Downloads:
     `xattr -dr com.apple.quarantine /Applications/Mottulbox.app`
3. Ab dem zweiten Start genügt ein Doppelklick.

Einstellungen und geladene Werkzeuge liegen unter
`~/Library/Application Support/Mottulbox`.

> **Prozessor beachten:** Das DMG passt zu dem Mac, auf dem es gebaut wurde. Ein
> auf Intel gebautes Paket läuft auf Apple Silicon über Rosetta, umgekehrt gar
> nicht. Im Zweifel auf dem Zielsystem bauen.

---

## Erster Start des Video-Downloaders

- Die App ermittelt im Hintergrund die neueste stabile yt-dlp-Version und lädt sie
  bei Bedarf nach `<Datenordner>/bin` (rund 18 MB unter Windows, 37 MB unter
  macOS). Vor dem Ablegen wird die Prüfsumme des Releases verglichen.
- Ohne Internet startet die App normal; der Fehler steht dann im Werkzeug und ein
  bereits vorhandener Stand bleibt nutzbar.
- Die automatische Prüfung lässt sich im Werkzeug abschalten
  („Beim Programmstart automatisch auf eine neue yt-dlp-Version prüfen"),
  der Knopf **Prüfen** stößt sie jederzeit von Hand an.
- Hinter Firewall oder Proxy müssen `github.com` und
  `objects.githubusercontent.com` erreichbar sein.

## Aktualisieren

Neue Version installieren: unter Windows den neuen Installer ausführen, unter
macOS die App aus dem neuen DMG über die alte in *Programme* kopieren.
Einstellungen, Projekte und die geladene yt-dlp-Binary bleiben erhalten.

## Warum die Sicherheitswarnungen?

Die Pakete tragen keine Code-Signatur — für den privaten Gebrauch ist ein
Zertifikat (jährliche Kosten bei Microsoft bzw. Apple) nicht vorgesehen. Die
Warnungen beider Systeme besagen genau das und nichts über den Inhalt der App.
Hintergrund und die Auswirkungen auf den Build stehen im
[README](../README.md#build--paketierung).
