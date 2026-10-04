# Fernsteuerung per Handy/Tablet

Video-Player, Jingle-Player, OSC-Steuerung und Stage-Timer lassen sich vom Handy oder Tablet im
selben Netz steuern – im Browser, ohne App-Installation.

## Einschalten

- Im jeweiligen Werkzeug unter **„Fernsteuerung“** aktivieren. Standardmäßig ist sie aus; sie ist
  im lokalen Netz erreichbar und hat kein Passwort. Der Port ist einstellbar.
- Der **QR-Code** im Werkzeug – oder hinter dem Handy-Knopf auf dem Startbildschirm – führt direkt
  zur Fernsteuer-App.
- Eingeschaltete Fernsteuerungen starten beim nächsten App-Start samt Port wieder. Kacheln von
  Werkzeugen mit laufender Fernsteuerung tragen auf dem Startbildschirm den Hinweis
  „Fernsteuerung“.

## Die Fernsteuer-App

**`http://<IP-des-Rechners>:8090`** – eine Startseite mit großen Kacheln für alle
Fernsteuerungen; ausgeschaltete sind ausgegraut, mit Hinweis, wo man sie einschaltet. Die
Adresse antwortet, solange am Rechner mindestens eine Fernsteuerung läuft.

| Werkzeug      | Seite in der App | Eigene Adresse (weiterhin nutzbar) |
| ------------- | ---------------- | ---------------------------------- |
| Video-Player  | `/player/`       | Port 8088                          |
| Jingle-Player | `/jingle/`       | Port 8089                          |
| OSC-Steuerung | `/osc/`          | Port 8091                          |
| Stage-Timer   | `/timer/`        | Port 8092                          |

## Was die Steuerseiten können

- **Video-Player:** Transport, Playlists wechseln, Playlist ordnen (ziehen, entfernen), Medien aus
  der Bibliothek hinzufügen. **Hochladen** von Dateien sowie Fotos und Videos direkt mit der
  Kamera – sie werden wie beim Import auf die Wand gerechnet. Höchstens 8 GB je Datei, und auf dem
  Rechner müssen danach noch 2 GB frei bleiben; abgewiesene Dateien meldet die Seite mit Grund.
  Dazu Übergang (Schnitt oder Überblenden samt Dauer), Bild-Standzeit und Aufbereitung neuer
  Uploads (Letterbox, Blur, Strecken).
- **Jingle-Player:** Pad-Raster der aktuellen Bank mit Live-Status und „Alles stoppen“. Der Ton
  kommt vom Rechner – dort muss der Jingle-Player geöffnet sein.
- **OSC-Steuerung:** dieselbe Oberfläche wie am Rechner, Sets umschaltbar; gesendet wird vom
  Rechner aus, wo die OSC-Steuerung geöffnet sein muss.
- **Stage-Timer:** große Restzeit in den Farben der Bühnenanzeige, Start/Pause/Stopp, Abschnitte
  vor, zurück, neu starten oder direkt anspringen, ±1 Minute, Timer/Uhr umschalten und Nachrichten
  an die Bühne (mit Schnellnachrichten). Abschnitte und Schwellen werden am Rechner bearbeitet.
  Funktioniert auch bei geschlossenem Werkzeug, weil der Timer im Hauptprozess läuft.

Ist ein Werkzeug in mehreren Fenstern offen, gehen Befehle vom Handy nur an das Fenster, dessen
Stand das Handy zeigt – nichts wird doppelt abgespielt.

## Vollbild

- **iPhone:** Vollbild gibt es nur als Web-App vom Home-Bildschirm – in Safari *Teilen → „Zum
  Home-Bildschirm“*. Sie startet ohne Browserleiste und wechselt zwischen allen Steuerseiten, ohne
  sie zu verlassen (deshalb ein gemeinsamer Port für alle).
- **Android/iPad:** zusätzlich ein Vollbild-Knopf. Die Seite merkt sich den Wunsch und holt das
  Vollbild nach einem App-Wechsel beim nächsten Tippen zurück.

## Grenzen

- Über http im lokalen Netz erlauben Browser weder eine echte App-Installation (Android) noch das
  Wachhalten des Displays (Wake Lock). Für die Show am Gerät die automatische Bildschirmsperre
  abschalten.
- Ohne Passwort kann jeder im selben Netz steuern – in fremden Netzen nur bei Bedarf einschalten
  (siehe [SICHERHEIT.md](SICHERHEIT.md)). Die Befehle werden dabei Feld für Feld geprüft;
  Desktop-Einstellungen wie das Idle-Bild lassen sich vom Handy nicht ändern.
