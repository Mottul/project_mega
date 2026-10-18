---
name: projektdatei
description: Einem Mottulbox-Werkzeug einen Abschnitt in der Projektdatei (.mottul) geben – Daten und Prüfung, Store-Bindung, Datei-Menü in der Leiste, Migration inkl. Vorlagen, Tests. Verwenden, wenn ein Werkzeug Dateien öffnen/speichern soll (LED-Wall hat es, geplant Anleitung und Packliste) oder am Format der Projektdatei gearbeitet wird.
---

# Projektdatei-Abschnitt für ein Werkzeug

Eine `.mottul`-Datei ist ein ZIP mit projekt.json (ein Abschnitt je Werkzeug) und Fotos. Jedes
Werkzeug liest und schreibt **nur seinen Abschnitt**; es gibt kein app-weites „aktives Projekt“
(Gründe: `docs/PLAN-MINI-MANUAL.md`, „Projektdatei und Projektordner“). Vorbild für alles unten:
der LED-Wall-Konfigurator (`tools/led-wall/config.ts`, `store.ts`, `fileSection.ts`); mit Fotos
und einem Abschnitt eines anderen Werkzeugs als Kopie das Mini-Manual
(`tools/mini-manual/fileSection.ts`, `ui/useLedWallQuelle.ts` liest per `api.projects.peek`).

## Bausteine

| Ort | Was |
|---|---|
| `src/shared/projectFile.ts` | Format, Grenzen, `PROJECT_SECTION_KEYS`/`PROJECT_SECTION_LABELS`, `canonicalJson`, `digest` |
| `src/main/services/projects/` | `zip.ts` (gehärtetes Lesen), `projectFileCore.ts` (rein: Abschnitt einsetzen, Konflikt, packen), `projectFiles.ts` (Datei, Warteschlange je Pfad, Freigabe, Sicherungen, „Zuletzt geöffnet“), `projectsDir.ts` |
| `src/main/ipc/projects.handlers.ts` | `projects.open`, `chooseTarget`, `save`, `dirInfo` |
| `@renderer/lib/projectFile` | `useProjectFile(optionen)` – Bindung, „ungespeichert“, Abläufe mit Rückfragen, Strg+S/O |
| `@renderer/lib/projectBinding` | Typ `ProjectBinding` + `sanitizeBinding` ohne `api` (für Stores und deren Tests) |
| `components/ProjectFileMenu.tsx` | „Datei ▾“ + Dateichip für die Leiste |

## Schritte

1. **Schlüssel** in `PROJECT_SECTION_KEYS` und Anzeigename in `PROJECT_SECTION_LABELS`
   (`shared/projectFile.ts`). Unbekannte Abschnitte bleiben ohnehin erhalten.
2. **Datenmodul** (rein, eigene Datei wie `led-wall/config.ts`):
   - Typen und Vorgaben; **eine** Prüfung `sanitize…(raw)`, feldweise mit Vorgaben (Allowlist,
     Längen, Zahlenbereiche wie in der Oberfläche) – dieselbe für Store-Migration, Vorlagen und
     Datei.
   - Abschnittsdaten **ohne Bedienzustand** (aktive Auswahl, PDF-Format …) – sonst macht schon
     ein Umschalten die Datei „ungespeichert“.
   - `describe(data)` für Rückfragen („Messe · Kunde, 4 × 2,5 m“), `isDefault…` für „nichts zu
     verlieren“.
   - Schema-Version des Abschnitts als Konstante; neue Felder = Version hoch, `sanitize`
     ergänzt sie beim Lesen alter Abschnitte. Auch wenn `sanitize` ein Feld mit Vorgabe auffüllt:
     Eine ältere Mottulbox würde es beim Speichern verlieren (so LED-Wall 4 `shareWith`, 5
     `fiber`; Anleitung 4 Kapitel Verkabelung, `antwortAus`; Anleitung 5 `ausgabe.online`). Neue Kapitel/Listeneinträge, die
     eine alte Datei nicht hat, an ihre Stelle einsortieren (`neuesKapitel`, hinter den Vorgänger),
     und eine neue, unberührte Anleitung muss die Prüfung unverändert bestehen.
3. **Store:** `file: ProjectBinding | null` **neben** der Konfiguration (Vorlagen nehmen die
   Bindung nie mit), `setFile`, `replaceConfig` (Bedienzustand behalten). Persist-`version`
   erhöhen, `migrate` als reine exportierte Funktion: Konfiguration **und jede Vorlage** durch
   `sanitize` (zustand ergänzt nur oberste Felder), `file` durch `sanitizeBinding`. Im Store nur
   `@renderer/lib/projectBinding` importieren – `lib/projectFile` zieht `api` mit (Node-Tests).
4. **Optionen** (`fileSection.ts`, Typ `ProjectFileOptions`): `data`, `binding`/`setBinding`,
   `apply` (prüfen, abgeleitete Größen gleich passend machen – sonst ist die Datei direkt nach
   dem Öffnen „ungespeichert“; `false` = unbrauchbar), `reset`, `blank` (Daten nach `reset`,
   für „Leere anlegen“ – geschrieben wird, bevor der Arbeitsstand geleert wird), `isEmpty`,
   `suggestedName`, `describe`.
5. **Oberfläche:** `const file = useProjectFile(OPTIONEN)` im Werkzeug, `<ProjectFileMenu
   file={file} />` als erstes in die Leiste (`ToolBar`) – nie in die Schublade. „Vorlage laden“
   ersetzt den ganzen Arbeitsstand: „Neu aus Vorlage“ (Rückfrage, wenn gebunden, dann
   `file: null`). Ersetzt sie nur einen Teil (LED-Wall: die gewählte Wand), ist sie eine
   gewöhnliche Änderung – Bindung bleibt, Datei wird „ungespeichert“, Rückfrage nur, wenn im
   Teil schon etwas steht, und nach der Rückfrage prüfen, ob sich der Teil geändert hat.

## Mehrere Einträge in einem Abschnitt (Muster: Wände der LED-Wall, Version 3)

- **Gewählter Eintrag in den flachen Feldern, die übrigen in einer Liste daneben** (`walls`,
  `config: null` = der gewählte). So lesen alle Ansichten weiter `s.widthM` … ; wer alle
  braucht (Datei, Packliste, Mini-Manual), nimmt **immer** `plannedWalls(s)` – nie `walls`
  direkt und nie die flachen Felder allein. Gemeinsames (Projekt, Kunde) steht einmal oben.
- **Form statt Versionsnummer entscheidet beim Lesen** (`wallsOf`: ohne `walls` = alter
  Abschnitt mit einer Wand, feste Kennung `FIRST_WALL_ID`) – so lesen auch Kopien in anderen
  Werkzeugen (`api.projects.peek`) jede Version richtig, und Verweise auf die eine alte Wand
  bleiben stabil.
- Kaputte Liste (leer, kein Objekt, zu lang) = Abschnitt unbrauchbar; Grenzen auch **in Summe**
  (Zellen aller Wände); Kennungen eindeutig machen mit Zähler (`wand-3-2`), nie durch Anhängen
  und Abschneiden – das konnte endlos kreisen.
- Wechseln des gewählten Eintrags ist Bedienzustand (nicht „ungespeichert“), Umbenennen,
  Hinzufügen und Entfernen sind Änderungen. Eine Ansicht, die beim Öffnen etwas passend macht
  (`ensureGridSize`), muss auch beim Wechsel laufen – eine neue Wand hat noch leere Raster,
  vielleicht bei gleicher Modulzahl.

## Regeln

- **Formwechsel im Datenmodell** (Store-Version oder Prüfung bringt alte Stände in neue Form):
  Eine gespeicherte Bindung bleibt „gespeichert“ – `savedDigest` umrechnen, wenn er zum alten
  Stand passte (`migrateLedWall` v3, `migrateMiniManual`); sonst stünde nach dem Update jede Datei
  als ungespeichert da. Eine ungespeicherte bleibt ungespeichert.

- **main entscheidet:** Schreiben nur in `.mottul`-Pfade aus Dialog/geöffneter Datei (nach
  Neustart aus „Zuletzt geöffnet“ nur auf eine vorhandene gültige Datei); Konflikt über den
  sha256 des eigenen Abschnitts (`baseSha`), nie still überschreiben; Abschnitt aus neuerer
  Version nie überschreiben; `rev` nur bei geändertem Inhalt.
- **Dateisystem:** „fehlt“ nur bei `ENOENT`/`ENOTDIR` – jeder andere Lesefehler bricht ab, statt
  die Datei als neu zu behandeln. Neue Dateien exklusiv anlegen (`writeNewFileAsync`), vorhandene
  atomar ersetzen (`writeFileAtomicAsync`) mit Sicherung davor. `packProject` schreibt nur, was
  dieselben Grenzen und Prüfungen wie beim Lesen besteht (`'zu-gross'`/`'ungueltig'`).
- **„Ungespeichert“** = `digest(daten) !== binding.savedDigest`. Prüfsumme **vor** dem `await`
  nehmen; nach dem Speichern nur binden, wenn nicht inzwischen anders gebunden wurde.
- **Rückfragen sperren nur das eigene Fenster:** Jede Aktion hält zu Beginn Daten und Bindung
  fest (`snapshot`), schreibt genau diese und bricht nach einer Rückfrage ab, wenn ein anderes
  Fenster inzwischen etwas geändert hat (`changedMeanwhile`). Zurücksetzen erst nach Erfolg.
- **Fotos nie in einen persistierten Store** (`debouncedStorage` verschluckt „Speicher voll“) –
  sie liegen im main unter ihrem sha256 (`services/fotos/fotoStore.ts`, `userData/Projektfotos`),
  im Werkzeug steht nur der Hash. Einfügen: `api.fotos.pick()` (verkleinert auf 2000 px, nach
  EXIF aufgerichtet, ohne Metadaten); anzeigen: `<img src={fotoUrl(hash)}>` (`shared/fotos.ts`,
  auch in HTML für das PDF – main setzt die Bilder dort ein). Dem Hook die benutzten Hashes
  geben (`fotos: (data) => [...]`): Speichern holt sie aus dem Foto-Speicher in die Datei
  (`'foto-fehlt'`, wenn eines nirgends liegt), Öffnen legt sie wieder dort ab – nur, wenn der
  Inhalt zum Hash passt.
- Gepufferte Felder (`useDraft`) übernehmen beim Verlassen – der Hook nimmt vor Speichern,
  Öffnen und Neu den Fokus weg (Tastenkürzel tun das nicht von selbst); eigene Wege genauso.
- Rückfragen mit mehr als Ja/Nein über `api.choose` (Knöpfe, `cancelId`).

## Tests

- Rein: `sanitize` (runder Weg, alter Stand, Ungültiges -> Vorgabe), Abschnitt ohne
  Bedienzustand, `migrate` inkl. Vorlagen, „ungespeichert“ (Muster `led-wall/config.test.ts`,
  `led-wall/store.test.ts`; Format/ZIP: `src/main/services/projects/*.test.ts`).
- Dateisystem: `projectFiles.test.ts` – echter tmp-Ordner, `stat` einmalig gestört (Netzlaufwerk
  hakt, Datei taucht zwischen Lesen und Anlegen auf).
- **Versionssprung des Abschnitts:** Tests, die als „Kollege“ per `api.projects.save` schreiben,
  auf die neue Version ziehen – main lehnt eine ältere Version über einer neueren ab (gewollt;
  so war `projektdatei.mjs` nach LED-Wall Version 4 dreimal rot). Erwartete `section.version`
  ebenso.
- E2E nach `e2e/projektdatei.mjs`: Dialoge im main ersetzen (`showSaveDialog`, `showOpenDialog`,
  `showMessageBox` mit Antwortfolge und Mitschrift), Datei über `api.projects.open` prüfen,
  „Kollege“ per `api.projects.save(… force: true)` simulieren, fremde Datei ohne eigenen
  Abschnitt als kleines ZIP schreiben (`writeForeignProject`), Schreibfehler während einer
  Rückfrage erzeugen (Datei durch einen Ordner ersetzen).

## Doku

`docs/WERKZEUGE.md` („Projektdateien und Projektordner“, Abschnitt des Werkzeugs),
`docs/ENTWICKLUNG.md` (Tabelle „Was wohin gehört“), `docs/SICHERHEIT.md` bei neuen Lese-/Schreibwegen.
