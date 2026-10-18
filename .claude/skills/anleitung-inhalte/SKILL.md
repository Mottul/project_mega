---
name: anleitung-inhalte
description: Bausteine und Fehlerfälle für das Mini-Manual schreiben oder ändern – „du“, kurze Sätze, eine Handlung je Schritt, Stufe je Schritt, erst eingrenzen dann beheben, Platzhalter, jeder Fall endet in Gelöst/Lösung/Anrufen, Prüfung mit dem Test der Bibliothek. Verwenden, wenn die mitgelieferte Bibliothek (tools/mini-manual/bibliothek.ts) wächst oder ein Fall aus der Praxis dazukommt.
---

# Inhalte für das Mini-Manual

Die mitgelieferte Bibliothek steht in `src/renderer/src/tools/mini-manual/bibliothek.ts`:
`BAUSTEINE` (Blöcke für ein Kapitel) und `FEHLERFAELLE`. Eine Anleitung bekommt beim Einfügen eine
**Kopie mit Herkunft** (`herkunft: { baustein, version }`) – Kunden-Anleitungen ändern sich nie
still. Datenmodell: `model.ts`; Ausgabe je Stufe: `fehlersuche.ts`; Seiten: `seiten.ts`.

## Sprache

- **„du“, Deutsch**, kurze Hauptsätze. Eine Handlung je Schritt („Stecker fest einstecken.“).
- Fragen so, dass man sie **mit Ja oder Nein** beantworten kann und die Antwort **sieht**
  („Leuchtet die LED rot?“), nicht „Ist alles in Ordnung?“.
- Keine Bedienwege einer Software behaupten, die nicht geprüft sind (Menüpfade wechseln mit
  Versionen) – lieber allgemein („über die Verknüpfung am Desktop starten“).
- Fett mit `**…**`, Listen `- `, nummeriert `1. `, Hinweisbox `> ` (Subset in `markup.ts`). Der Hinweis reicht bis zur nächsten Leerzeile;
  Listen darin mit oder ohne `>` je Zeile (`> Vorsicht:` + `- Netz aus`).

## Stufen (Festlegung 9)

| Stufe | darf |
|---|---|
| 1 Bedienung | ein/aus, Inhalte wählen, Sichtprüfung, eingrenzen; IM-Tausch nur mit Rücksprache (496-2,0, rX3ioBF) |
| 2 Betreuung | neu starten, Sicherung einschalten, Kabel stecken/tauschen |
| 3 Technik | Prozessor-Software, Backbox/IM beim uS2+, Netzwerk, Kalibrierung |

- **Erst eingrenzen, dann beheben:** Die frühen Schritte auf Stufe 1 lassen („Ab welchem Modul?“,
  „Welche Farbe hat die LED?“) – das macht den Anruf kurz, auch wenn Bedienung nichts behebt.
- Ein Sprung zu einem höheren Schritt wird in der Ausgabe von selbst zu „Ab hier bitte anrufen“ –
  keine eigenen „anrufen, wenn du nicht Technik bist“-Texte schreiben.
- Hängt die Stufe am Modul (IM-Tausch), `stufeAus: 'im-tausch'` setzen statt einer festen Stufe;
  `imTausch()` in `fehlersuche.ts` liest Stufe, Rücksprache und Hinweis aus den Stammdaten
  (`led-wall/data.ts`, Feld `ims`) – ein neues Modul trägt sie dort ein.
- **Fragen, die die Planung beantwortet** („Läuft das Signal über Glasfaser?“): `antwortAus:
  'glasfaser'` – haben alle Wände der LED-Wall-Kopie Glasfaser bzw. keine, entfällt die Frage in
  der Ausgabe und es geht mit Ja bzw. Nein weiter (`faelleFuerStufe(…, glasfaser)`,
  `glasfaser()` in `ledWallKopie.ts`). Nicht für den ersten Schritt eines Falls. Weitere Antworten
  (z. B. Backup-Leitung ja/nein) dort ergänzen, nicht als Textvariante.
- **Keine Textvarianten je Stufe.** Die Stufe steuert nur, was erscheint.

## Fehlerfälle

- Bauen mit den Helfern in `bibliothek.ts`: `q(id, stufe, text, ja, nein, { hinweis, ruecksprache,
  stufeAus, antwortAus })`, Ziele `zu('id')`, `L('Lösungstext')`, `OK` (gelöst), `RUF` (anrufen),
  `FALL('lib-…')`. `nein: null` = Anweisung mit „Weiter“.
- Jeder Weg endet in **Gelöst, Lösung oder Anrufen**; jeder Fall hat mindestens einen Ausgang
  „Anrufen“. Eine Lösung, die nicht sicher hilft, sagt, was dann zu tun ist („Fliegt sie wieder
  raus: nicht nochmal, anrufen.“).
- Kennungen: Fall `lib-<name>`, Schritte kurz und im Fall eindeutig (`t1`, `t2` …). Ziele zeigen
  auf Kennungen, nie auf Nummern – Nummern rechnet die Ausgabe neu.
- Verweise auf andere Fälle (`FALL`) bringt `fallMitVerweisen` beim Einfügen mit.
- Neue Fälle aus der Praxis: Matthias' Formulierung übernehmen, Annahmen als
  „abgeleitet, im Betrieb bestätigen“ im Plan festhalten.

## Platzhalter

`{projekt.name|kunde|ort|zeitraum}`, `{wand.groesse|aufloesung|modul|module|…}`,
`{<kurzname>.name|modell|standort|ip}` (Geräte), `{kontakt.name|mobil|…}`, `{firma.name|fernwartung}`
– Liste in `platzhalter.ts`. Sparsam einsetzen: Jeder leere Platzhalter erscheint in der Prüfung
vor dem Export (gewollt bei `{pc.name}`, `{prozessor.name}`). Eingesetzte Werte erscheinen von
selbst fett (Klasse `ph`); `**…**` drumherum nur, wenn mehr als der Wert hervorgehoben sein soll
(`**{wand.aufloesung} Pixel**`).

## Bausteine

- Ein Baustein gehört zu genau einem Kapitel (`kapitel`), `stichworte` (klein) für Vorschläge.
- Die Kurzkarte nimmt die **Schritt-Listen** (`typ: 'schritte'`) des Kapitels „Ein- und
  Ausschalten“ – Titel kurz halten („Einschalten“, „Ausschalten“).
- Inhalt geändert → `version` erhöhen (Anleitungen sehen später „aktualisieren“).
- **Eigene Bausteine** (Nutzer, `userData/Bausteine`): Namen sind je Kapitel eindeutig
  (`namensgleiche` in `shared/bausteine.ts`, ohne Groß/Klein und Leerraum). Speichern läuft immer
  über `speichereBaustein()` (`ui/bausteinSpeichern.ts`): Bei gleichem Namen fragt es
  Ersetzen (Kennung bleibt, Version + 1) / Beide behalten (`freierTitel` → „… (2)“) / Abbrechen –
  nie direkt `api.bausteine.save` aus einem Editor. Weitergeben per Export-Datei
  (`packBausteine`); der Import (`importZusammenfuehren`) nimmt Neues, ersetzt nur bei höherer
  Version und benennt fremde Namensgleiche um. Dieselben Regeln gelten später für den geteilten
  Ordner (Phase 5) – dort nichts Neues erfinden.
- Neue Anleitungen enthalten `START_BAUSTEINE` und `START_FAELLE` mit festen Kennungen
  (`vorlage.ts`) – nicht mit `uid()` füllen, sonst gilt „Neu“ als ungespeichert.

## Prüfen

`npx vitest run src/renderer/src/tools/mini-manual` – der Test „jeder mitgelieferte Fehlerfall
besteht die Prüfung“ (`logik.test.ts`) verlangt: keine fehlenden Ziele, alle Schritte erreichbar,
keine Schleife, ein Ausgang „Anrufen“. Das Beispiel „Ein Teil der Wand ist dunkel“ prüft die
Ausgabe je Stufe und Modul.
