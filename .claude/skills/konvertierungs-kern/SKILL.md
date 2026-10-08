---
name: konvertierungs-kern
description: Den gemeinsamen Mottulbox-Konvertierungs-Kern erweitern – neue Korrektur, neues Format oder Encoder, Lautheit, ffmpeg-Argumente (Video-Konverter, Player-Import, Testbild-Export, später Video-Generator). Verwenden, bevor an convertPlan.ts, args.ts, encoders.ts oder der Warteschlange gearbeitet wird.
---

# Konvertierungs-Kern erweitern

Ein Kern für alle: Analyse per `probeMediaInfo` (Cache, `main/services/ffmpeg/mediaInfo.ts`, Parser
rein in `mediaInfoParse.ts`), **alle Entscheidungen in `src/shared/convertPlan.ts`**
(`planConversion`, rein, getestet, auch Vorschau im Renderer), Argumente/Runner/Warteschlange in
`src/main/services/convert/`. Neue Korrekturen und Formate **dort** einbauen, nicht je Werkzeug.

| Aufgabe | Ort |
|---|---|
| Was passiert mit einer Quelle (Drehung, Deinterlace, HDR→SDR, Bildrate, Größe, Alpha) | `shared/convertPlan.ts` (`planConversion`, `fitFilters`) + `convertPlan.test.ts` |
| ffmpeg-Argumente je Format | `convert/args.ts` (`buildConvertArgs`), Tests in `convert/convert.test.ts` |
| Encoder (GPU/CPU), Probelauf, Rückfall | `convert/encoders.ts` (`resolveConverterEncoder`, `encodeWithFallback`), Wahl in `shared/encoderChoice.ts` |
| Fähigkeiten des gebündelten ffmpeg (Filter, Encoder) | `convert/capabilities.ts` |
| Lautheit (EBU R128, zweistufig) | `shared/loudness.ts` (rein) + `convert/loudness.ts` (`measureLoudness`), Ergebnis als `loudness` an `buildConvertArgs` |
| ffmpeg ausführen | **immer** `runFfmpeg()` (Fortschritt aus `-progress`, Abbruch per `AbortSignal`, Fehlertext); Pfade nur über `ffmpegBinPath()` – es liefert den in der App aktualisierten Build (`ffmpeg/ffmpegUpdate.ts`, gilt ab dem nächsten Start), sonst den mitgelieferten |
| Warteschlange | `convert/queue.ts` (Spuren `player`/`converter`, Grenze `setLimit`, Ausschluss gleicher Quellen) |
| Video-Generator | Zeitachse, Ken Burns, Filter, Bildliste (auch Ausschnitte), Ton-Graph, Musik, Absenken rein in `shared/videoGenPlan.ts` (+ Labortest `convert/videoGen.lab.test.ts` mit echtem ffmpeg); gemeinsame Schritte `convert/videoGenRender.ts`, Rechenlauf `convert/videoGenJobs.ts`, „Vorschau rechnen“ `convert/videoGenPreview.ts` |

## Vorgehen

1. **Plan zuerst:** Entscheidung in `planConversion` (mit `steps`/`issues` für die Vorschau im
   Renderer), dazu einen Test in `convertPlan.test.ts`. Testdaten mit der Fabrik
   `renderer/src/tools/media-info/testFactory.ts` (`mediaInfo`, `videoTrack`, `audioTrack`).
2. **Argumente danach:** nur umsetzen, was der Plan beschlossen hat; Test in `convert.test.ts`.
3. **Neue Quelle von Wissen** (z. B. ein ffprobe-Feld) im Parser ergänzen (`mediaInfoParse.ts`)
   und mit echter ffprobe-Ausgabe als Fixture testen (`__fixtures__/`). Beispiel: die
   EXIF-Drehung von Fotos steckt nur in den Frame-Seitendaten (`3x3 displaymatrix`).
4. **GPU-/Schnell-Encoder nur nach Probelauf**; Aufträge über `encodeWithFallback()` (scheitert
   die GPU, einmal CPU). Halbfertige Ausgabedatei bei Fehler löschen.
5. **Wirkt die Änderung auf Player-Import und Konverter?** Beide prüfen (Bibliothek-Dedup-Schlüssel
   `convKeyFor` in `player/mediaLibrary.ts` beachten: Änderungen am Ergebnis brauchen ggf. eine
   neue Variante im Schlüssel).
6. **Parallelität:** Sperren müssen dieselbe Identität nutzen wie die Deduplizierung; Ausschluss
   gleicher Quellen gehört in die Warteschlange, nicht in einen belegten Slot (siehe
   `/review-checkliste`).
7. Abschluss: `/abschluss-check`; Doku in `docs/WERKZEUGE.md` (Video-Konverter/Player).
