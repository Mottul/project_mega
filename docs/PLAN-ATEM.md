# Plan: ATEM-Steuerung

**Status:** Entwurf vom 31. Oktober 2026, noch nichts gebaut. Vor Phase 1 sind die
[offenen Fragen](#offene-fragen) zu klären, vor allem welcher Mischer zum Testen da ist.

Blackmagic-ATEM-Mischer vom Laptop bedienen, später auch vom Tablet oder Handy: Programm und
Vorschau, Übergänge, Keyer, Makros, Ton und eigene Seiten, mit Rückmeldung vom Mischer. Vorbild für
den Funktionsumfang ist [MixEffect Pro](https://mixeffectpro.app); Oberfläche und Namen bleiben
Mottulbox, nachgebaut wird nichts.

- [Entscheidung](#entscheidung-eigenes-werkzeug)
- [Aufbau](#aufbau) – [Bibliothek](#bibliothek), [Weg eines Befehls](#weg-eines-befehls),
  [Verbindung](#verbindung), [Simulator](#simulator)
- [Oberfläche](#oberfläche)
- [Umsetzung im Code](#umsetzung-im-code)
- [Stolpersteine](#stolpersteine)
- [Phasen](#phasen) · [Verzahnung](#verzahnung) · [Tests & Doku](#tests--doku) ·
  [Offene Fragen](#offene-fragen) · [Quellen](#quellen)

## Entscheidung: eigenes Werkzeug

Ein eigenes Werkzeug **„ATEM-Steuerung“** (id `atem-control`, Kategorie „Steuerung“), kein weiteres
Ziel in der OSC-Steuerung.

| Weg | Dafür | Dagegen |
| --- | --- | --- |
| **Eigenes Werkzeug** (gewählt) | Mischer-Zustand ist das Herz: Tally, Hebel, Reihen je nach Modell. Feste Seiten funktionieren sofort, ohne dass jemand etwas anlegt | Eigene Oberfläche |
| Drittes Ziel neben OSC und NovaStar | Editor und Raster sind schon da | Kachel-Raster kennt keinen Gerätezustand; jeder Knopf müsste von Hand angelegt werden, die eine Sache, die der Mischer selbst liefert |

Das Raster der OSC-Steuerung bleibt trotzdem nützlich: [Phase 4](#phasen) nutzt es für eigene
Seiten, statt ein zweites zu bauen.

## Aufbau

![Aufbau: Fenster und Handy sprechen mit dem Hauptprozess, nur er mit dem Mischer](bilder/atem-aufbau.svg)

Der Hauptprozess bleibt autoritativ, wie bei Player und Timer: Er hält **eine** Verbindung, Fenster
und Handy spiegeln nur. So läuft die Verbindung weiter, wenn das Werkzeug geschlossen wird, und
zwei Fenster verbrauchen keinen zweiten Platz am Mischer.

### Bibliothek

[`atem-connection`](https://github.com/Sofie-Automation/sofie-atem-connection): MIT-Lizenz, aus dem
Sofie-Projekt des NRK, Version 3.10.3 vom 1. Oktober 2026 (damit über die 7-Tage-Regel hinaus),
Node ab 18. Sie deckt alles ab, was der Plan braucht: `changeProgramInput`, `changePreviewInput`,
`cut`, `autoTransition`, `setTransitionPosition`, `fadeToBlack`, `setUpstreamKeyerOnAir`,
`setDownstreamKeyOnAir`, `macroRun`, `setMediaPlayerSource`, `setAuxSource`,
`setFairlightAudioMixerSourceProps`, `setClassicAudioMixerInputProps`, `startStreaming`,
`startRecording`, `uploadStill`. Der Zustand kommt über das Ereignis `stateChanged(state, pfade)`,
Pegel über `levelChanged`.

Zwei Abhängigkeiten sind für die Paketierung zu prüfen ([Phase 0](#phasen)):

- **`threadedclass`** legt den UDP-Socket in einen eigenen Thread. Das ist erwünscht: Hängt der
  Hauptprozess kurz, verpasst der Socket sonst Bestätigungen an den Mischer. Geladen wird
  `./atemSocketChild` zur Laufzeit, das muss aus dem `asar`-Archiv heraus funktionieren. Notlösung:
  `disableMultithreaded: true`, dann läuft der Socket im Hauptprozess.
- **`@julusian/freetype2`** ist nur für Multiview-Beschriftungen da, wird aber fest mitgeladen.
  Nötig sind Vorab-Binaries für Windows, macOS und Linux unter der aktuellen Electron-Version.

Das Protokoll ist nicht offiziell dokumentiert, die Bibliothek ist nachgebaut. Blackmagics eigener
Weg ist das ATEM-SDK. Eine neue Firmware kann also ein Update der Bibliothek verlangen; deshalb
zeigt das Werkzeug Modell und Protokollversion an und warnt bei einer unbekannten.

### Weg eines Befehls

![Weg eines Befehls: Klick, Prüfung, Mischer, erst dann leuchtet der Knopf](bilder/atem-befehl.svg)

**Der Knopf zeigt, was der Mischer meldet, nie, was gedrückt wurde.** Bei einer Show ist ein Knopf,
der fälschlich „Programm“ zeigt, schlimmer als gar keiner. Das gilt auch, wenn jemand am Hardware-
Panel oder in ATEM Software Control umschaltet: Alle Ansichten folgen dem Mischer. Der Knopf zeigt
sofort „läuft“, damit der Klick spürbar bleibt.

Befehle kommen vom Fenster und vom Handy und sind in beiden Fällen fremde Eingaben: Sie laufen über
eine Allowlist (`AtemCommand`, Muster `player/remoteCommand.ts`) mit geprüften Werten, also
vorhandene Quelle, vorhandene M/E, Bereich des Hebels.

### Verbindung

Zustände: getrennt, verbindet, verbunden, verloren. Die Bibliothek baut eine verlorene Verbindung
selbst wieder auf; das Werkzeug zeigt das rot in der Leiste und sperrt Knöpfe, statt sie ins Leere
laufen zu lassen. Die letzte Adresse liegt in `settings.json`, „Beim Start verbinden“ ist wählbar.

Die Zahl gleichzeitiger Steuerungen ist begrenzt. Im Blackmagic-Forum ist von fünf die Rede, eine
offizielle Angabe habe ich nicht gefunden. Mottulbox belegt immer genau einen Platz.

### Simulator

Ein `AtemSimulator` im Hauptprozess mit derselben Schnittstelle wie die echte Verbindung: Er führt
Befehle aus und meldet den neuen Zustand, kennt verschiedene Modelle (viele Eingänge, Fairlight
oder klassischer Ton). Das bringt dreierlei:

- E2E-Tests und CI laufen ohne Mischer.
- Die Oberfläche lässt sich für jede Mischer-Größe entwickeln, nicht nur für die vorhandene.
- „Probebetrieb“ in der App: Bedienung üben und Seiten vorbereiten, ohne Gerät. MixEffect bietet
  das ebenfalls.

Er prüft nicht das Protokoll. Dafür bleibt der Abnahmetest am echten Mischer je Phase.

## Oberfläche

![Entwurf der Seite „Mischen“ mit Programm, Vorschau, Hebel, Keyern und Makros](bilder/atem-bedienfeld.svg)

Nach dem Werkzeug-Muster (`ToolShell`, `ToolBar`, Schublade):

- **Leiste:** Verbindung (Adresse, Verbinden), Modell, rechts der Status. Aktiv („live“, rot), solange
  gestreamt oder aufgezeichnet wird.
- **Arbeitsfläche:** Seiten als Reiter. Fest: Mischen, Keyer, Makros, Medien, Ton. Dazu eigene Seiten.
- **Schublade:** Verbindung, Beschriftung, Sperre, Fernsteuerung. Keine Aktionen.
- **Aus dem Mischer statt fest verdrahtet:** Zahl der Quellen, M/Es, Keyer, DSKs, Makros und ihre
  Namen stammen aus dem, was der Mischer meldet (`state.info.capabilities`, `state.inputs`). Ein
  ATEM Mini und ein Constellation nutzen dieselbe Seite.
- **Show-Schutz:** „Sperren“ nimmt alle Knöpfe aus der Bedienung, Maus und Tastatur. Fade to Black
  verlangt einen zweiten Klick. Eine Fehlbedienung geht sofort auf Sendung.
- **Tastatur:** 1–9 Vorschau, Umschalt + 1–9 Programm, Leertaste Cut, Eingabe Auto. Nur aktiv, wenn
  kein Textfeld den Fokus hat.

Farben über Tokens: `destructive` für Programm, `success` für Vorschau, die Akzentfarbe für die
Auswahl. Das passt zur Regel „Rot ist live“. Hart kodiert wird nichts, auch nicht im Hebel.

## Umsetzung im Code

Neue Dateien:

```text
src/shared/
  atem.ts                   Typen AtemCommand, AtemView, AtemStatus; Prüfung atemCommand(v)
  atemView.ts               Mischer-Zustand zu kleiner Ansicht verdichten
src/main/services/atem/
  atemVerbindung.ts         Schnittstelle, die atem-connection kapselt
  atemSimulator.ts          dieselbe Schnittstelle ohne Gerät
  atemService.ts            eine Verbindung, Zustand, Sinks; dünn wie der NovaStar-Dienst
  atemRemoteServer.ts       Fernsteuerung (Phase 5), dazu atemRemotePage.ts
src/renderer/src/tools/atem-control/
  index.ts, AtemControl.tsx Werkzeug, je Seite eine eigene Datei
  useAtem.ts                spiegelt die Ansicht
  store.ts                  eigene Seiten, persistiert und versioniert
```

Die beiden Dateien in `src/shared/` bleiben rein und getestet. Der volle Mischer-Zustand ist groß und ändert
sich laufend, deshalb geht über IPC nur die verdichtete Ansicht.

**IPC** (Skill `ipc-kanal`), mit dem neuen Vertrag nur ein Abschnitt plus Handler:

```ts
atem: {
  status: anfrage<() => AtemStatus>('atem:status'),
  connect: anfrage<(host: string | 'simulator') => AtemStatus>('atem:connect'),
  disconnect: anfrage<() => AtemStatus>('atem:disconnect'),
  view: anfrage<() => AtemView | null>('atem:view'),
  command: anfrage<(cmd: AtemCommand) => void>('atem:command'),
  onStatus: ereignis<(status: AtemStatus) => void>('atem:statusChanged'),
  onView: ereignis<(view: AtemView) => void>('atem:viewChanged'),
  onLevels: ereignis<(levels: AtemLevels) => void>('atem:levels')
}
```

**Speichern:** Adresse und Autostart in `settings.json`, eigene Seiten im Store und als Abschnitt
`atem` der Projektdatei (Skill `projektdatei`), damit sie mit dem Event mitwandern.

## Stolpersteine

- **Hebel:** Beim Ziehen entstehen viele Befehle. Höchstens rund 30 je Sekunde senden, immer den
  neuesten Wert, nie eine Warteschlange. Der Mischer kehrt die Richtung nach jedem Übergang um; das
  muss der Hebel nachbilden, sonst springt er. Die Logik wird rein und getestet.
- **Pegel:** `levelChanged` kommt häufig. Im Hauptprozess zusammenfassen und auf etwa 15 je Sekunde
  begrenzen, Zeichnen wie beim RTA per `requestAnimationFrame` über Refs, nie über React.
- **Zwei Ton-Welten:** Klassische Mischer und Fairlight haben verschiedene Befehle und Felder. Die
  Ansicht vereinheitlicht beide, damit die Seite nur eine Form kennt.
- **Mehrere M/Es:** Größere Modelle haben bis zu vier. Die Seite braucht von Anfang an eine Auswahl,
  sonst muss der Zustand später überall umgebaut werden.
- **Beenden:** Eine offene Verbindung zählt nicht als „läuft noch“, ein Stream oder eine Aufzeichnung
  schon; die laufen aber auf dem Mischer weiter. Die Rückfrage (`laufend.ts`) darf nichts Falsches
  behaupten. `exit-hook` aus der Bibliothek muss sich mit dem eigenen Beenden vertragen.
- **Thread-Abstürze:** Der Socket-Thread startet selbst neu (`autoRestart`). Der Dienst muss das
  überstehen, ohne eine zweite Verbindung aufzubauen.
- **Sicherheit:** Der Mischer prüft keine Anmeldung, wer ihn im Netz erreicht, kann schalten. Die
  Fernsteuerung bringt das auf jedes Handy im WLAN. Deshalb kommt sie erst nach dem PIN aus der
  Roadmap, ist ab Werk aus und hat eine Eintragung in `docs/SICHERHEIT.md`.

## Phasen

![Sechs Phasen, ab Phase 1 im Einsatz nutzbar](bilder/atem-phasen.svg)

| Phase | Inhalt | Fertig, wenn |
| --- | --- | --- |
| **0 Probe** | Bibliothek in Electron einbinden, Paket auf allen drei Systemen bauen, Thread und freetype im Installer prüfen, Anbindung am echten Mischer | Installer verbindet sich auf Windows und macOS. Sonst Entscheidung: `disableMultithreaded`, Abhängigkeit ersetzen oder eigener, kleiner Protokoll-Client |
| **1 Mischen** | Dienst, Simulator, Verbinden, Seite „Mischen“: Programm, Vorschau, Cut, Auto, Fade to Black, Übergangsart und -dauer, Hebel, Sperre, Tastatur | Eine Show lässt sich fahren; E2E mit Simulator; Abnahme am Mischer |
| **2 Mehr Show** | Keyer, DSK, Makros (Liste, Start, Stopp), Media-Player, AUX | Abnahme am Mischer |
| **3 Ton** | Master und Eingänge, Pegel, Stream und Aufzeichnung | Beide Ton-Welten laufen, mindestens im Simulator |
| **4 Seiten** | Eigene Seiten auf dem Raster der OSC-Steuerung, Projektdatei | Seite anlegen, speichern, in anderem Projekt laden |
| **5 Handy** | PIN für Fernsteuerungen (eigene Vorarbeit), Steuerseite, Fernsteuer-App | Tablet schaltet, ohne PIN geht nichts |

**Später:** SuperSource, Multiview-Einstellungen, HyperDeck, mehrere Mischer gleichzeitig,
Kamerasteuerung, automatisches Umschalten nach Tonpegel.

## Verzahnung

- **Netzwerk-Scanner:** Er erkennt ATEMs schon (`netscan/atem.ts`); „In der ATEM-Steuerung
  verwenden“ übergibt die Adresse. Das ist ein Fall für den verallgemeinerten Übergabe-Speicher aus
  der Roadmap.
- **Testbild und Video-Generator:** Standbild per `uploadStill` direkt in den Media-Pool.
- **Mini-Manual:** Kapitel Bedienfeld übernimmt Seiten und Makro-Namen, Muster Jingle-Player und OSC.
- **OSC-Steuerung:** Später ein Kachel-Ziel „ATEM“, damit Companion und Stream Deck über OSC mitschalten.
- **Packliste:** Mischer, Kabel und Tally aus dem Projekt, sobald die Liste mehr Quellen kennt.

## Tests & Doku

- **Unit:** `atemCommand` (Allowlist, Grenzen), `atemView` (kleine und große Modelle, beide
  Ton-Welten), Hebel-Logik, Drosselung.
- **E2E:** eigenes Skript `atem` mit Simulator: Verbinden, Quelle schalten, Knopf folgt erst nach Rückmeldung,
  fremde Änderung erscheint, Sperre wirkt, Verbindungsverlust wird angezeigt.
- **Abnahme am Mischer** je Phase, von Hand: Die CI hat kein Gerät.
- **Doku:** nach der Umsetzung in `docs/WERKZEUGE.md`, README-Überblick, `docs/FERNSTEUERUNG.md`,
  `docs/SICHERHEIT.md`; dieser Plan wird dann gelöscht. Neuer Skill `atem-steuerung`, sobald sich
  Muster gezeigt haben.

## Offene Fragen

1. **Welcher Mischer steht zum Testen bereit?** Ohne Gerät endet jede Phase beim Simulator, und
   Phase 0 lässt sich nicht abschließen. Das Modell entscheidet auch, ob Fairlight oder klassischer
   Ton zuerst kommt.
2. **Wofür zuerst?** Für den Laptop neben dem Mischer oder als Tablet-Bedienung? Beim Tablet rückt
   Phase 5 samt PIN nach vorn.
3. **Sperre:** Genügt ein Schalter, oder soll Entsperren eine eigene Bestätigung verlangen?
4. **Fade to Black mit zweitem Klick:** gewünscht oder im Ernstfall zu langsam?

## Quellen

- [atem-connection](https://github.com/Sofie-Automation/sofie-atem-connection) (Quellcode: Befehle,
  Socket und Thread, Zustand)
- [npm: atem-connection](https://www.npmjs.com/package/atem-connection) (Version, Lizenz, Abhängigkeiten)
- [MixEffect](https://mixeffectpro.app) (Funktionsumfang, Simulator)
- Blackmagic-Forum: [Protokoll](https://forum.blackmagicdesign.com/viewtopic.php?p=676464),
  [Verbindungsgrenze](https://forum.blackmagicdesign.com/viewtopic.php?p=777096)
