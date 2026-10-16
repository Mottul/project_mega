---
name: projektdatei
description: Einem Mottulbox-Werkzeug einen Abschnitt in der Projektdatei (.mottul) geben – Daten und Prüfung, Store-Bindung, Datei-Menü in der Leiste, Migration inkl. Vorlagen, Tests. Verwenden, wenn ein Werkzeug Dateien öffnen/speichern soll (LED-Wall hat es, geplant Anleitung und Packliste) oder am Format der Projektdatei gearbeitet wird.
---

# Projektdatei-Abschnitt für ein Werkzeug

Eine `.mottul`-Datei ist ein ZIP mit projekt.json (ein Abschnitt je Werkzeug) und Fotos. Jedes
Werkzeug liest und schreibt **nur seinen Abschnitt**; es gibt kein app-weites „aktives Projekt“
(Gründe: `docs/PLAN-MINI-MANUAL.md`, „Projektdatei und Projektordner“). Vorbild für alles unten:
der LED-Wall-Konfigurator (`tools/led-wall/config.ts`, `store.ts`, `fileSection.ts`).

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
     ergänzt sie beim Lesen alter Abschnitte.
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
   = „Neu aus Vorlage“: Rückfrage, wenn gebunden, dann `file: null`.

## Regeln

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
  sie liegen im main, über IPC laufen nur Hashes (Phase 1 des Plans).
- Gepufferte Felder (`useDraft`) übernehmen beim Verlassen – der Hook nimmt vor Speichern,
  Öffnen und Neu den Fokus weg (Tastenkürzel tun das nicht von selbst); eigene Wege genauso.
- Rückfragen mit mehr als Ja/Nein über `api.choose` (Knöpfe, `cancelId`).

## Tests

- Rein: `sanitize` (runder Weg, alter Stand, Ungültiges -> Vorgabe), Abschnitt ohne
  Bedienzustand, `migrate` inkl. Vorlagen, „ungespeichert“ (Muster `led-wall/config.test.ts`,
  `led-wall/store.test.ts`; Format/ZIP: `src/main/services/projects/*.test.ts`).
- Dateisystem: `projectFiles.test.ts` – echter tmp-Ordner, `stat` einmalig gestört (Netzlaufwerk
  hakt, Datei taucht zwischen Lesen und Anlegen auf).
- E2E nach `e2e/projektdatei.mjs`: Dialoge im main ersetzen (`showSaveDialog`, `showOpenDialog`,
  `showMessageBox` mit Antwortfolge und Mitschrift), Datei über `api.projects.open` prüfen,
  „Kollege“ per `api.projects.save(… force: true)` simulieren, fremde Datei ohne eigenen
  Abschnitt als kleines ZIP schreiben (`writeForeignProject`), Schreibfehler während einer
  Rückfrage erzeugen (Datei durch einen Ordner ersetzen).

## Doku

`docs/WERKZEUGE.md` („Projektdateien und Projektordner“, Abschnitt des Werkzeugs),
`docs/ENTWICKLUNG.md` (Tabelle „Was wohin gehört“), `docs/SICHERHEIT.md` bei neuen Lese-/Schreibwegen.
