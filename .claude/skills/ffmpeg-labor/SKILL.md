---
name: ffmpeg-labor
description: ffmpeg-Verfahren vor dem Einbau messen statt raten – Testmedien per lavfi, Bild- und Samplezahl, Stückgrenzen, Ruckeln, Zeit und Spitzenspeicher. Verwenden bei neuen Filterketten, Übergängen, Ken Burns, Montage oder Audio-Verarbeitung (Video-Generator, Konvertierungs-Kern).
---

# ffmpeg-Labor

Die Pläne in `docs/PLAN-VIDEO-GENERATOR.md` stammen aus Messungen am gebündelten ffmpeg
(`resources/ffmpeg/<os>/`, `npm run ff:fetch`) – dort stehen die geprüften Befehle, Messwerte
und **Stolpersteine** (u. a. `xfade`/`acrossfade` mit Dauer 0, Ton-Drift über den concat-Demuxer,
kein `-filter_complex_script` mehr, `xfade` verlangt identische Größe/Rate/Zeitbasis/Pixelformat).
Dort zuerst nachlesen. Neue Verfahren so prüfen, bevor sie in den Code wandern:

1. **Erst die Fähigkeiten:** `ffmpeg -hide_banner -filters` / `-encoders` – das gebündelte
   ffmpeg ist ein bestimmter Build, nicht das aus dem PATH.
2. **Testmedien per lavfi**, nie echte Kundendateien: `testsrc2` (Bild, Bewegung), `sine` (Ton),
   Fotos als Einzelbild; absichtlich unbequeme Fälle (Hochkant, 29,97/59,94 fps, Mono 44,1 kHz,
   anamorph, ohne Ton, EXIF-gedreht).
3. **Zählen statt schauen:** Bildzahl (`ffprobe -count_frames`), Samplezahl und Dauer
   (`ffprobe -show_entries stream=duration,nb_read_frames`), Soll = Ist auf das Bild/Sample genau.
   Positionen aus der aufsummierten Zeitachse in ganzen Bildern runden, nicht je Stück.
4. **Stückgrenzen vergleichen:** Bild an der Naht gegen die Nachbarbilder (PSNR), sie müssen
   zusammenpassen; ohne Sprung bei Schleife und Übergang.
5. **Ruckeln messen:** einen Marker (kleiner heller Punkt) über die Bahn verfolgen und die
   Unruhe je Bild sowie Rückwärtssprünge zählen – so wurde `perspective` gegenüber `zoompan`
   entschieden.
6. **Zeit und Speicher je Lauf:** Wanduhr und Spitzen-Arbeitsspeicher. Unter Windows
   (PowerShell) den Prozess mit `Start-Process -PassThru` starten und
   `$p.Refresh(); $p.PeakWorkingSet64` in kurzen Abständen lesen; unter Linux `/usr/bin/time -v`.
   Wächst der Speicher mit der Elementzahl, ist die Kette zu groß – in Stücken rechnen.
7. **Lange Filtergraphen** als Datei (`-/filter_complex datei.txt`), die Windows-Kommandozeile
   ist auf 32.767 Zeichen begrenzt.
8. **Ergebnis festhalten:** Befehl, Messwerte und Stolperstein in den Plan bzw. die Doku
   schreiben und das Verfahren als Test in `convertPlan`/`videoGenPlan` oder `e2e/` verankern –
   Laborskripte im Arbeitsordner gehen sonst verloren.

Aufräumen: große Zwischendateien (Intra-Material etwa 320 MB je Minute 1080p) nach dem Lauf
löschen, Messungen im Scratchpad ablegen, nicht im Repository.
