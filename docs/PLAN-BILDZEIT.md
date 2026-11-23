# Entwurf: Bildzeit aus dem Spiegel (Paket ST6)

**Entwurf zu Paket ST6** – Messwerte, Möglichkeiten, Stolpersteine. **Was offen ist und wann es
drankommt, steht im [Gesamtplan](PLAN.md#st--stream-fürs-heimnetz-heimkino-box).** Nach der
Umsetzung in WERKZEUGE und die Skills überführen und diesen Entwurf löschen.

**Status (23.11.2026):** Messung abgeschlossen (#250), Empfehlung B. Entschieden wird nach der
Abnahme am Mac ([Gesamtplan](PLAN.md#abnahmen-am-gerät)): Seit #253 zählt der Stream im Protokoll,
wie oft der main stockt („main-Prozess stockte“). Von B ist noch nichts gebaut.

## Heute

Im Stream bekommt der Ton seine Zeit im Spiegel: Der Ton-Takt legt jeden Block nach seiner
Renderzeit im AudioWorklet (`stream/tontakt.ts`). Das Bild bekommt seine Zeit erst im main: Das
Offscreen-Fenster malt, der main nimmt das paint an, schreibt es über TCP an ffmpeg, und ffmpeg
stempelt es beim Lesen mit der Wanduhr (`-use_wallclock_as_timestamps 1`). Stockt der main, kommt
das paint zu spät, und das Bild liegt so viel zu spät im Strom; der Ton nicht. Der Sender gleicht
nur den gemessenen typischen Weg aus (Median), keine einzelne Stockung.

Belege: main nach #248 auf dem macOS-Runner −126 ms am ersten Blitz; in #249 −92 ms, das paint
kam 92 ms nach der Anzeige im Spiegel (normal 20–30), bei anderen Blitzen 200 und 124 ms.

## Messung

Testclip mit der Bildnummer oben links (16 Felder, binär), die der main aus jedem paint liest;
der Spiegel meldet je Bild Medienzeit und Anzeigezeit (`requestVideoFrameCallback`,
`presentationTime`). Zeile „Zeitbasis Spiegel (ST6)“ im Stream-E2E (`e2e/avDiagnose.mjs`), in
jedem Lauf. Labor: `MOTTULBOX_E2E_LAST=1` lässt den main 40–200 ms stocken,
`MOTTULBOX_E2E_ST6=1` schaltet die teuren Messungen zu A (Marke) und D (Vorschaubilder) zu.

### Windows lokal

| | ohne Last | mit Last (26 Stockungen, 3 s) |
| --- | --- | --- |
| paint nach der Anzeige: Median / p90 / größter | 10 / 11 / 793 ms (Hänger) | 9 / 79 / 1005 ms |
| paints über Median + 50 ms | 16 | 63 |
| paint vor seiner Anzeige | 0 | 0 |
| Zuordnung nach Reihenfolge falsch (`erfassung/bildweg.ts`) | 39 von 553, bis 23 Bilder | 114 von 547 (21 %), bis 29 |
| Anzeigezeit um die Gerade über der Bildnummer (p10 … p90) | −1 … 1 ms, keine über 20 | −1 … 1 ms, keine über 20 |
| Marke des Spiegels = Bild im selben paint | 527, ein Bild hinterher 48 | 516, ein Bild hinterher 66 |
| angezeigt, aber nie gemalt | 22 von 542 | 28 von 547 |
| Ton − Bild | grün | einmal rot (−103 ms), einmal grün – eine Stockung trifft nur manchmal einen Blitz |

### CI (Lauf 45024137810, ohne künstliche Last)

| | macOS | Linux | Windows |
| --- | --- | --- | --- |
| paint nach der Anzeige: Median / p90 | 19 / 21 ms | 5 / 6 ms | – |
| Zuordnung nach Reihenfolge falsch | 52 von 590 | 6 von 525 | – |
| Anzeigezeit um die Gerade (p10 … p90) | −1 … 1 ms, keine über 20 | −1 … 0 ms, 2 über 20 | −1 … 1 ms, 2 über 20 |
| Marke = Bild / ein Bild hinterher | 182 / 392 | 49 / 508 | – |
| Ton − Bild | −14 bei jedem Blitz | −4 bei jedem Blitz | −3, nach Hänger 2 −37 |

Auf dem Windows-Runner passten die gelesenen Bildnummern nie zur Medienzeit (lokal unter Windows
schon) – die Probe im nächsten Lauf soll zeigen, warum. In diesem Lauf stockte der main des
macOS-Runners nicht so, dass ein Blitz getroffen wurde.

### Was daraus folgt

- **Die Anzeigezeiten taugen als Zeitbasis:** Sie liegen auf 1 ms genau auf einer Geraden über
  der Bildnummer, auch wenn der main stockt (Windows, mit Last), und ebenso auf macOS und Linux –
  der Spiegel zeigt unbeirrt weiter, nur die paints stauen sich.
- **Eine Marke im Rückruf kennzeichnet das Bild nicht sicher:** Ob sie im selben paint landet wie
  ihr Bild, hängt vom System ab – Windows meist ja (90 %), Linux meist eines später (90 %), macOS
  gemischt (31 % zu 68 %).
- **Die heutige Zuordnung taugt nicht:** „erster paint nach der Anzeige“ trifft unter Last jedes
  fünfte Mal ein anderes Bild, bis fast eine Sekunde daneben. Wer Anzeigezeiten nutzen will,
  braucht eine sichere Kennung des Bildes im paint.
- **Früher gesehene „negative“ Werte waren Fehler der Zuordnung,** nicht der Anzeigezeit: Mit
  sicherer Kennung kam nie ein paint vor seiner Anzeige.
- **Nicht jedes angezeigte Bild wird gemalt** (4–5 %); eine Zuordnung nur nach der Reihenfolge
  ist deshalb nicht eindeutig.

## Möglichkeiten

**A – Marke im Rand, Bildtakt.** Der Spiegel zeichnet im Rückruf jedes Bildes dessen Nummer als
schmale Marke in einen Rand unter dem Bild (das Offscreen-Fenster wird dafür einige Pixel höher,
ffmpeg schneidet den Rand weg). Der main liest die Marke aus dem paint und weiß so, welches Bild
es zeigt und wann der Spiegel es angezeigt hat. ffmpeg zählt die Bilder (`setpts` wie `asetpts`
beim Ton), der Sender legt jedes Bild nach seiner Anzeigezeit in den Takt und füllt Lücken.
Gemessen landet die Marke je nach System im selben paint oder eines später (macOS: 31 % zu
68 %) – ein Teil der Bilder bekäme den Zeitstempel ein Bild daneben (33 ms). Heute sind es bei
einem Stocken 100 ms und mehr, aber sicher ist A nicht.

**B – Der Spiegel zeichnet das Video selbst.** Im Rückruf zeichnet er das Bild und die Marke in
dieselbe Leinwand; paint und Kennung passen dann immer zusammen. Exakt, auch unter Last: Gemalt
wird nur, was gezeichnet wurde – fehlt ein Rückruf, fehlt im Strom ein Bild, aber keines bekommt
eine falsche Zeit. `drawImage` in eine sichtbare Leinwand bleibt auf der Grafikkarte (kein
Zurücklesen wie bei D). Dafür ein Umbau des Spiegels: Übergänge, Einpassen und Ränder des Players
müssten dort nachgebaut werden.

**C – Ohne Kennung, nur besser zuordnen.** Gestaute paints nach der Reihenfolge den Anzeigen der
Stockung zuordnen. Das ginge nur, wenn zu jeder Anzeige genau ein paint käme – gemessen bleiben
4–5 % der angezeigten Bilder ungemalt, vor allem beim Stocken. Damit nicht eindeutig.

**D – Bild am Inhalt erkennen.** Der Spiegel rechnet im Rückruf jedes Bildes ein winziges
Vorschaubild genau dieses Bildes (`drawImage` in eine kleine Leinwand – im Rückruf ist das
garantiert das angezeigte Bild) und schickt es mit der Anzeigezeit. Der main verkleinert jedes
paint genauso (auf die Fläche des Videos, ohne Ränder) und sucht das ähnlichste Bild der letzten
1,5 s. Keine sichtbare Marke, kein Umbau des Spiegels. Gleiche Bilder hintereinander sind nicht
zu unterscheiden – dann steht das Bild, und Lippen bewegen sich nicht.

Gemessen (Windows lokal, Testclip mit bewegtem Testbild, Vorschaubild 32 × 18):

| | ohne Last | mit Last (26 Stockungen) | mit Last, zweiter Lauf |
| --- | --- | --- | --- |
| richtig / gleich gut | 538 / 36 von 575 | 449 / 39 von 569 | 483 / 40 von 588 |
| falsch | 1 (1 Bild daneben) | 81 (bis 6 Bilder) | 65 (bis 3), davon 48 ohne Rückruf zum richtigen Bild |
| Vorschaubild im Spiegel: Median / größter | 7,4 / 26,1 ms | 5,5 / 17,3 ms | 5,8 / 18,3 ms |
| Vorschaubild im main: Median / größter | 1,2 / 3,5 ms | 1,2 / 7 ms | 1,2 / 6,5 ms |

CI (Lauf 45027756171, ohne künstliche Last):

| | macOS | Linux | Windows |
| --- | --- | --- | --- |
| richtig / gleich gut | 534 / 38 von 573 | 153 / 29 von 556 | 546 / 5 von 559 |
| falsch | 1 | 374 (bis 5 Bilder), davon 96 ohne Rückruf | 8, alle ohne Rückruf |
| Vorschaubild im Spiegel: Median / größter | 2,7 / 15,2 ms | 4,2 / 9,7 ms | 4,2 / 13,8 ms |

Ohne Last trifft D auf Windows und macOS praktisch immer; unter Last liegt es bei 11–14 % der
paints daneben. Drei Viertel davon sind grundsätzlich: Stockt der main, ruft der Spiegel nicht für
jedes Bild zurück, das trotzdem gemalt wird – zu diesem Bild gibt es kein Vorschaubild. Auf dem
Linux-Runner (ohne Grafikkarte, 19 Bilder/s im Spiegel) weichen Vorschaubild und paint so
voneinander ab, dass zwei Drittel falsch zugeordnet werden. Dazu kostet das Zurücklesen des
Vorschaubilds im Spiegel 3–7 ms je Bild – diese Last machte im selben Lauf den Schritt
„lippensynchron“ auf dem Windows-Runner rot (−62 ms); die Messungen zu A und D laufen seither nur
noch mit `MOTTULBOX_E2E_ST6=1`.

## Empfehlung

**B.** Nur dort passt die Kennung immer zum gemalten Bild, auch wenn der main stockt: Gemalt wird
nur, was der Spiegel im Rückruf selbst gezeichnet hat. A scheidet aus (die Marke landet je nach
System und Lauf im selben paint oder eines später, macOS einmal 31 %, einmal 95 % richtig), C ist
nicht eindeutig (4–5 % der Bilder werden nie gemalt), D trifft unter Last 11–14 % daneben, drei
Viertel davon grundsätzlich (kein Rückruf zum gemalten Bild), und auf dem Linux-Runner zwei
Drittel.

Aufwand für B (eher L als M):
- Der Spiegel (`PlayerNdiOutput`, heute der passive PlaybackEngine) zeichnet auf eine Leinwand:
  zwei Ebenen (Video oder Bild), Überblendung mit laufender Opazität, Einpassen (füllen oder
  einbetten), Standbilder, Ruhebild und Testbilder.
- Kennung je Bild: in einem Rand, den NDI und Stream wegschneiden, oder unsichtbar in den
  untersten Bits einzelner Pixel (zu prüfen: bleiben sie im paint unverändert, auch unter macOS
  mit Farbprofil?).
- Bildtakt im Sender (unten), Neustart, Hänger, Standbild; Tests für den Takt, E2E wie heute.

## Bildtakt (für A, B und D)

- ffmpeg liest die Bilder ohne Wanduhr; Bild n liegt bei Start + n / Bildrate (`setpts`), wie der
  Ton bei Start + Sample / 48000.
- Der Sender legt jedes Bild auf den Platz, der seiner Anzeigezeit entspricht; fehlt ein Platz
  (Stocken, Standbild), wiederholt er das letzte Bild; ist ein Platz schon geschrieben, fällt das
  Bild weg.
- Offen: Hänger von 0,8 s heißen 24 Wiederholungen auf einmal; ein Neustart von ffmpeg braucht
  einen neuen Startpunkt (wie heute `-copyts`); kommt ffmpeg dauerhaft nicht nach, darf der
  Rückstand nicht wachsen.

## Stolpersteine

- `app.evaluate((electron, arg) => …)`: Das Argument kommt als zweiter Parameter – die künstliche
  Last lief zunächst gar nicht (Skill `electron-e2e`).
- Die Marke im Rückruf landet nicht immer im selben paint wie ihr Bild (siehe oben).

## Offene Fragen

- Wie wichtig ist der Fall? Stockt der main beim Nutzer so wie auf dem macOS-Runner? Die Antwort
  kommt aus der Abnahme am Mac (Protokollzeile „main-Prozess stockte“, `stream/stockWaechter.ts`).
  „Bild spät an ffmpeg“ taugt dafür nicht: Die Erfassung stempelt das paint erst bei der Ankunft.
