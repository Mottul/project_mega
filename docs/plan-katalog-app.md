# Plan: Katalog-App für Lernunterlagen in Google Drive

Stand: 2026-07-18 · Status: Entwurf zur Diskussion

## 1. Machbarkeit – Kurzantwort

**Ja, das ist gut machbar.** Google Drive ist die richtige Sorge, aber keine echte
Blockade – es sind drei konkrete Hürden, und alle haben etablierte Lösungen:

| Hürde | Lösung |
| --- | --- |
| Zugang/Authentifizierung zu GDrive | Service-Account, dem der Drive-Ordner geteilt wird (kein OAuth-Zirkus, keine App-Verifizierung, Token läuft nicht ab) |
| Formatvielfalt (Google Office, MS Office, PDF, …) | Drive-Export-API wandelt Google-Formate (Docs→Text/PDF, Sheets→XLSX, Slides→PDF); MS-Office/PDF werden direkt geladen und lokal extrahiert |
| Schnelle Suche über alles | Lokaler SQLite-FTS5-Index – exakt das Muster der bestehenden Manuals-Bibliothek in MegaToolBox (`services/db.ts`, `services/manuals/`) |

Wichtig fürs Modell im Kopf: **Die App ist ein lokaler, durchsuchbarer Spiegel
der Drive-Metadaten** (plus optional Textinhalte). Drive bleibt die Quelle der
Dokumente; die App synchronisiert Metadaten in eine lokale SQLite-Datenbank und
sucht dort – dadurch ist die Suche sofort schnell und funktioniert auch offline.

## 2. Die GDrive-Hürde im Detail

### 2.1 Zugriffsvarianten

**Variante A – Service-Account (empfohlen für Start):**

1. Google-Cloud-Projekt anlegen (kostenlos), Drive-API aktivieren
2. Service-Account erstellen → JSON-Schlüssel herunterladen
3. Den Drive-Ordner mit den Unterlagen für die Service-Account-E-Mail freigeben
   (wie mit einer normalen Person teilen; Rolle „Bearbeiter", damit die App
   Kategorien in Datei-Properties schreiben darf)
4. Die App authentifiziert sich mit dem Schlüssel (JWT → Access-Token)

Vorteile: kein Consent-Screen, keine Google-Verifizierung, kein Token-Ablauf,
Zugriff sauber auf genau diesen Ordner begrenzt. Nachteile: der Schlüssel muss
geschützt werden (→ Electron `safeStorage`, verschlüsselt im userData-Ordner);
alle Nutzer der App agieren als „derselbe" Account.

**Variante B – OAuth-Desktop-Flow (Loopback):** Jeder Nutzer meldet sich mit dem
eigenen Google-Konto an. Nötig, wenn verschiedene Personen ihre je eigene Ablage
sehen sollen. Haken: `drive.readonly` ist ein *restricted scope* – eine
veröffentlichte App braucht Googles Verifizierungsprozess; im „Testing"-Modus
(max. 100 Testnutzer) laufen Refresh-Tokens nach 7 Tagen ab. Für den Eigenbedarf
machbar, aber lästig. → Als spätere Option offenhalten, nicht als Start.

### 2.2 Was die Drive-API v3 liefert (alles, was wir brauchen)

- `files.list` mit Query-Syntax (`'<folderId>' in parents`, `mimeType`, …),
  seitenweise bis 1000 Einträge, schlanke Antworten über den `fields`-Parameter
- `files.export` für Google-Formate (Docs→`text/plain`/PDF, Sheets→XLSX/CSV,
  Slides→PDF) und `files.get?alt=media` für binäre Dateien
- **`appProperties`**: eigene Key-Value-Metadaten *pro Datei, gespeichert in
  Drive* → unsere Kategorien liegen kanonisch am Dokument selbst und sind damit
  automatisch geräteübergreifend
- `changes.list` mit gespeichertem `pageToken` → effizienter Delta-Sync
  (nur Änderungen seit letztem Lauf, kein Voll-Scan)
- `webViewLink` (Dokument im Browser öffnen/bearbeiten), `thumbnailLink`
  (Vorschaubilder fürs Dashboard)
- Serverseitige Volltextsuche: `fullText contains '…'` – Drive indiziert
  Dokumentinhalte bereits; taugt als Online-Fallback ohne eigenen Index
- Kontingente sind für privaten/Team-Maßstab großzügig (tausende Anfragen/Minute);
  bei 403/429 exponentielles Backoff

Fazit: Die API deckt Katalog, Kategorien, Delta-Sync, Vorschau und sogar eine
Volltextsuche ab. Die „Hürde" reduziert sich auf das einmalige Google-Cloud-Setup.

## 3. Grundsatzentscheidung: eigenständige App oder MegaToolBox-Tool?

| | A: Tool in MegaToolBox | B: eigenständige App (gleicher Stack) |
| --- | --- | --- |
| Aufwand bis erste nutzbare Version | klein – SQLite+FTS5, IPC-Muster, UI-Kit, Packaging existieren | mittel – schlankes electron-vite-Gerüst + Kern-Bausteine kopieren |
| Weitergabe an Dritte (z. B. Kollegium) | die bekommen die ganze AV-Toolbox mit | sauber: nur der Katalog |
| Wartung | ein Repo, eine Pipeline | zweites Repo/Pipeline |

**Empfehlung:** Start als **Tool in MegaToolBox** (Arbeitstitel `katalog`), aber
den Kern (Drive-Client, Sync, Index) bewusst so schneiden, dass er keinerlei
MegaToolBox-Spezifika kennt. Dann ist die spätere Extraktion in eine
eigenständige, schlanke App ein Umzug von Dateien, kein Umbau. So gibt es schnell
etwas Benutzbares, und die Entscheidung „eigene App" muss heute nicht final sein.

## 4. Architektur (Variante A, MegaToolBox-Konventionen)

```
src/main/services/catalog/
  driveClient.ts     Auth (Service-Account-JWT) + Drive-REST via fetch
                     (bewusst KEIN schweres googleapis-Paket)
  syncService.ts     Erst-Sync (rekursives Listing) + Delta-Sync (changes API)
                     + Schreib-Queue für appProperties
  extractors/        Textextraktion je Format (Phase 2, s. Abschnitt 6)
src/main/ipc/catalog.handlers.ts   IPC-Handler (Registrierung in registry.ts)
src/shared/ipc-contracts.ts        neue Channels + ToolboxApi-Methoden
src/renderer/src/tools/katalog/
  index.ts           ToolDef-Registrierung
  store.ts           zustand-Store (persistiert via debouncedStorage)
  Dashboard.tsx / Katalog.tsx / DokumentDetail.tsx / Einstellungen.tsx
```

Datenfluss: Renderer ruft ausschließlich `api` (Preload) → main. Der main-Prozess
hält Drive-Zugang, SQLite und Sync; der Renderer bekommt fertige Suchergebnisse
und Aggregationen (Dashboard-Zahlen) über IPC. Sync läuft als Hintergrund-Job im
main mit Fortschritts-Broadcast an den Renderer.

IPC-Fläche (erste Runde): `catalogGetStatus`, `catalogSync`, `catalogSearch`,
`catalogGetDoc`, `catalogSetValues`, `catalogGetTaxonomy`, `catalogSetTaxonomy`,
`catalogOpenInDrive`, `catalogConfigure` (+ Broadcast `catalog:sync-progress`).

## 5. Datenmodell

### 5.1 Wo wohnen die Kategorien? (wichtigste Designentscheidung)

- **Kanonisch in Drive, am Dokument selbst**: `appProperties` je Datei, z. B.
  `{ "fach": "mathe", "klasse": "3a", "semester": "2026-1" }`. Überlebt
  Umbenennen/Verschieben (die `fileId` bleibt stabil) und ist auf jedem Gerät
  identisch – kein eigener Sync-Mechanismus für Metadaten nötig.
- **Taxonomie-Definition** (welche Kategorien es gibt, erlaubte Werte, Reihenfolge)
  als eine Datei `_katalog/taxonomie.json` im Drive-Wurzelordner → auch die
  Kategorien-*Struktur* ist geräteübergreifend und vom Nutzer erweiterbar.
- **SQLite ist nur Cache + Suchindex**, jederzeit aus Drive rekonstruierbar.

Grenzen von `appProperties` (max. ~100 Properties/Datei, Key+Wert ≤ 124 Bytes):
für Kategorie-Tags völlig ausreichend; wir verwenden kurze Keys und Wert-IDs
statt Langtexten (Anzeigenamen stehen in der Taxonomie).

### 5.2 SQLite-Schema (Erweiterung von `services/db.ts`)

```sql
CREATE TABLE catalog_docs (
  drive_id       TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  mime_type      TEXT NOT NULL,
  parent_path    TEXT,              -- Ordnerpfad in Drive (Anzeige/Filter)
  modified_time  INTEGER NOT NULL,
  size_bytes     INTEGER,
  web_view_link  TEXT,
  thumb_link     TEXT,
  trashed        INTEGER NOT NULL DEFAULT 0,
  text_state     TEXT NOT NULL DEFAULT 'none'  -- none|indexed|failed (Phase 2)
);

-- Taxonomie: benutzerdefinierbare Kategorien ("Semester", "Klasse", "Fach", …)
CREATE TABLE catalog_fields (
  id        TEXT PRIMARY KEY,       -- kurzer Key, identisch zum appProperty-Key
  label     TEXT NOT NULL,
  kind      TEXT NOT NULL,          -- 'select' | 'text' | 'multi'
  options   TEXT,                   -- JSON: erlaubte Werte (bei select/multi)
  sort      INTEGER NOT NULL
);

CREATE TABLE catalog_values (
  drive_id  TEXT NOT NULL REFERENCES catalog_docs ON DELETE CASCADE,
  field_id  TEXT NOT NULL,
  value     TEXT NOT NULL,
  PRIMARY KEY (drive_id, field_id, value)
);

-- FTS5 über Name + Kategorienwerte (+ später extrahierter Text),
-- gleiches external-content-Muster wie pages_fts der Manuals-Bibliothek
CREATE VIRTUAL TABLE catalog_fts USING fts5(
  name, values_text, content_text,
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TABLE catalog_state (key TEXT PRIMARY KEY, value TEXT); -- pageToken etc.
```

## 6. Suche

1. **Sofortsuche (Phase 1):** FTS5 über Dateiname + Kategorienwerte, mit
   Präfix-Matching während des Tippens; kombinierbar mit Facetten-Filtern
   (Semester/Klasse/Fach als Chips, UND-verknüpft). Antwortzeit lokal < 10 ms.
2. **Volltext (Phase 2):** Textextraktion beim Sync, inkrementell im Hintergrund:
   - Google-Formate: `files.export` als `text/plain` (Docs/Slides) bzw. CSV (Sheets)
   - PDF: `pdfjs-dist` (bereits im Projekt, Code in `services/manuals/pdfText.ts`)
   - DOCX: `mammoth` (klein, reine JS-Lib) · XLSX: `exceljs` · PPTX: XML aus dem
     ZIP lesen (PPTX ist ZIP+XML, kein natives Modul nötig)
   - Altformate (.doc/.ppt): kein lokaler Volltext – nur Metadaten
3. **Online-Fallback:** Button „In Drive suchen" → `fullText contains`-Query;
   deckt auch Altformate ab, braucht aber Internet.

## 7. UI

- **Dashboard** (Einstieg): Schnellsuchfeld; Kacheln „Dokumente je Fach /
  Semester / Klasse" (klickbar → vorgefilterter Katalog); zuletzt geändert;
  zuletzt geöffnet; Sync-Status mit „Jetzt synchronisieren".
- **Katalog**: Tabellen-/Kachelansicht, Filterleiste mit Chips je Kategorie,
  Sortierung (Name/Datum/Fach), Mehrfachauswahl → Kategorien in Serie zuweisen
  (der eigentliche Pflege-Workflow: 30 Dateien markieren → „Fach: Mathe" setzen).
- **Dokument-Detail**: Vorschau (thumbnailLink bzw. lokal gecachtes PDF),
  Kategorien bearbeiten (Eingaben über `useDraft()`), „In Drive öffnen"
  (webViewLink im Standardbrowser).
- **Einstellungen**: Service-Account-Schlüssel hinterlegen (verschlüsselt via
  `safeStorage`), Wurzelordner wählen, Taxonomie-Editor (Kategorien + Werte
  anlegen/umbenennen/sortieren), Sync-Intervall.

Theme/Farben nach Projektkonvention (Tailwind-Tokens, dunkel Standard).

## 8. Sync-Strategie

- **Erst-Sync:** rekursives Listing ab Wurzelordner (Batch à 1000, nur benötigte
  `fields`); bei ~1000 Dokumenten wenige Sekunden.
- **Delta-Sync:** `changes.list` mit gespeichertem `startPageToken`
  (in `catalog_state`); Intervall (z. B. 15 min) + manueller Button + beim Start.
- **Schreibpfad:** Kategorie-Änderung wird sofort lokal gespeichert und in eine
  Queue gelegt; die Queue schreibt `files.update` (appProperties) nach Drive –
  dadurch offlinefähig, Änderungen laufen nach, sobald Netz da ist.
- **Konflikte:** last-write-wins pro Property – bei 1–2 pflegenden Personen
  unkritisch; Drive-seitige Änderungen kommen über den Delta-Sync zurück.

## 9. Meilensteine

| # | Inhalt | Fertig, wenn … |
| --- | --- | --- |
| M0 | Google-Setup: Cloud-Projekt, Service-Account, Ordner teilen; Smoke-Test-Skript listet den Ordner | Skript gibt Dateiliste des echten Ordners aus |
| M1 | `driveClient` + Schema + Erst-Sync + IPC-Grundfläche | Kompletter Drive-Ordner landet in SQLite, Status im UI sichtbar |
| M2 | Katalog-UI: Liste, FTS-Suche, Facetten-Filter; Taxonomie-Editor; Kategorien setzen (einzeln + Serie) inkl. Rückschreiben nach Drive | Suche+Filter finden Dokumente; Kategorie in Drive-Properties nachweisbar |
| M3 | Dashboard + Öffnen/Vorschau (webViewLink, Thumbnails) | Vom Dashboard in 2 Klicks zum geöffneten Dokument |
| M4 | Delta-Sync (changes API), Volltext-Extraktion + -Suche, Offline-Cache | Änderung in Drive erscheint ohne Voll-Scan; Suchtreffer im Dokumentinhalt |
| M5 | Portable Packaging (Win portable exe, macOS, Linux AppImage), Feinschliff | Installationsfreie Exe läuft auf frischem Rechner |

Anmerkung „portable": electron-builder-Target `portable` (Windows) heißt
installationsfrei; Nutzdaten liegen standardmäßig trotzdem in `userData`. Echte
Stick-Portabilität (Daten neben der Exe) ist eine kleine Zusatzoption in M5.

## 10. Risiken & Gegenmaßnahmen

| Risiko | Wirkung | Gegenmaßnahme |
| --- | --- | --- |
| Service-Account-Schlüssel gelangt in fremde Hände | Zugriff auf den geteilten Ordner | Schlüssel nie ins Repo/Paket; Eingabe in Einstellungen, Ablage verschlüsselt via Electron `safeStorage`; Freigabe jederzeit in Drive entziehbar |
| Später doch Mehrbenutzer mit eigenen Konten nötig | OAuth-Verifizierung (restricted scope) | Architektur hält Auth austauschbar (`driveClient` kapselt Tokens); Variante B als eigener Meilenstein |
| Sehr große Ablage (10k+ Dateien) | langsamer Erst-Sync, Quota | `fields` minimal halten, Backoff bei 429, Volltext nur inkrementell im Leerlauf |
| appProperties-Limits (124 Bytes, ~100 Props) | lange Kategorienwerte passen nicht | kurze Keys + Wert-IDs, Anzeigenamen in `taxonomie.json` |
| Altformate .doc/.ppt | kein lokaler Volltext | Metadaten-Suche + Drive-`fullText`-Fallback |
| Shared Drives (Team-Ablagen) | Dateien fehlen im Listing | `supportsAllDrives`/`includeItemsFromAllDrives` von Anfang an setzen |

## 11. Offene Fragen an dich

1. Nutzt nur du die App, oder sollen Kolleg:innen mit eigenen Google-Konten auf
   je eigene Ablagen zugreifen? (entscheidet Variante A vs. B)
2. Grobe Größenordnung: wie viele Dokumente liegen/landen im Ordner?
3. Reicht der Start als MegaToolBox-Tool, oder soll es von Anfang an ein
   eigenes, schlankes Programm sein?
4. Ist Volltextsuche im Dokumentinhalt für Version 1 Pflicht, oder genügt
   zunächst Name + Kategorien (Volltext dann in M4)?
