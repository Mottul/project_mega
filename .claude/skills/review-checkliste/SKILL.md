---
name: review-checkliste
description: Projektspezifische Prüfliste für Änderungen an Mottulbox, abgeleitet aus bestätigten Review-Befunden (Parallelität, Fernsteuer-Seiten, veraltete Zustände nach await, Einstellungs-Migration). Verwenden zusätzlich zu /code-review, bevor eine Änderung als fertig gilt.
---

# Review-Checkliste Mottulbox

Aus dem Review über die Änderungen vom 7. Oktober 2026 (vier Prüf-Dimensionen, jeder Befund von
zwei Gegenprüfern widerlegt oder bestätigt): Diese Fehlerklassen kamen tatsächlich vor.
Zusätzlich gilt der allgemeine `/code-review`.

## Parallelität und Warteschlangen

- **Sperrschlüssel = Dedup-Identität.** Das Schloss pro Quelle hatte den vollen Pfad, die
  Deduplizierung (`convKeyFor`: Größe-Änderungszeit-Dateiname, ohne Ordner) nicht → zwei
  gleichnamige Kopien aus verschiedenen Ordnern liefen parallel und scheiterten an
  `UNIQUE conv_key`, mit verwaisten Dateien. Schlüssel müssen dieselbe Identität haben; zusätzlich
  vor dem Schreiben noch einmal prüfen (synchron = atomar) und bei Treffer die eigenen Ausgaben
  löschen.
- **Ausschluss gehört in die Warteschlange, nicht in einen belegten Slot.** Wer im Slot auf ein
  Schloss wartet, blockiert andere Quellen und lässt sich nicht abbrechen. Wartende bleiben in
  `waiting` (`ConvertQueue.add(…, key)`).
- Fehlerpfade räumen auf: Ausgabedateien, halbfertige Einträge, Sperren (`finally`).

## Zustand nach `await`

- **Nach einer Rückfrage (`api.confirm`) oder jedem `await` nicht mit dem Stand vom Klick
  weiterarbeiten.** Playlist löschen schrieb eine alte Liste zurück und löschte eine in einem
  anderen Fenster gespeicherte. Einstellungen ersetzen Listen, sie mergen sie nicht → frischen
  Stand holen (`api.getSettings()`) und daraus filtern.
- Der Einstellungs-Broadcast erreicht das auslösende Fenster nicht; mehrere Fenster mitdenken.
- **zustand-Store und lokaler `useState` nach `await` nicht im selben Atemzug setzen, wenn ein
  Effekt beide liest.** Der Store rendert sofort (useSyncExternalStore), der lokale Zustand erst
  im nächsten Durchlauf – ein Wächter-Effekt sieht den Mischstand und dreht die Änderung zurück
  (Video-Generator, 8. Oktober 2026: „Gerechnet“ sprang auf „Live“ zurück). Den Store erst in
  einem Effekt auf den lokalen Zustand nachziehen.
- **`key` von Listen mit Medien nicht aus der Position bilden**, wenn Einträge den Platz
  wechseln: Das `<video>` wird sonst neu geladen und hakt (Live-Vorschau beim Übergang).

## Fernsteuer- und Browser-Seiten

Siehe `/fernsteuerung-seite`: relative Pfade (Schrägstrich-Variante umleiten), Lebenszeichen und
Watchdog gegen halboffene Verbindungen, Zeitzone des Rechners, ES5. Jede neue Route bekommt
einen Test **mit** und **ohne** Schrägstrich.

## Einstellungen und gemerkte Stände

- Ändert eine Option, was ein bestehender Schalter bedeutet (Beispiel: „Kennung“ blendete früher
  Uhr und Sekundenring mit aus), prüfen, was gespeicherte Voreinstellungen jetzt anzeigen –
  Migration oder bewusst begründete Ausnahme.
- Neue Felder: `DEFAULT_SETTINGS`, nur geänderte Felder patchen, Stores mit `version`/`migrate`.
- Textfelder für Einstellungen puffern (`useDraft`/`TextField`).

## Fenster (Oktober 2026)

- **Electron meldet `'closed'` asynchron.** Wer ein Fenster schließt und sofort ein neues in
  dieselbe Modul-Variable legt (Monitorwechsel der Ausgaben), bekommt das `'closed'` des ALTEN
  Fensters erst danach – ein `win = null` dort verliert das neue Fenster (Zustand „zu“, Schließen
  wirkt nicht, das Fenster bleibt verwaist offen). Immer `const self = win` im Handler und
  `if (win !== self) return`. Regressionstest: `e2e/layout.mjs` (zweimal öffnen, dann prüfen).
- **„Live“-Anzeigen** brauchen die Wahrheit aus dem main (Event), nicht den letzten Klick im
  Renderer: Ausgabefenster schließen auch per Esc oder vom Betriebssystem.

## Vor dem Abschluss

Hat der Befund ein Gegenstück in der echten App? Mit `/electron-e2e` nachstellen, bevor man
ihn behebt, und danach als Regressionstest behalten. Behebungen einzeln bestätigen: Ein Teil der
Befunde war real, aber geringfügig (Durchsatz statt Datenverlust), ein Teil nicht haltbar
(Preset-Migration, fehlender EventSource-Schutz auf einer reinen Anzeigeseite) – das Gewicht
benennen, nicht alles gleich schwer nehmen.
