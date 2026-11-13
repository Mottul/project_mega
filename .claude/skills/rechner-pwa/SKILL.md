---
name: rechner-pwa
description: Kleine Werkzeuge der Mottulbox für die Handy-PWA bauen oder ändern (Rechner, RTA, Testtongenerator) – was dort nicht geht (api, Einstellungen, Toasts), Tailwind-Quellen, Service Worker, Ton und Mikrofon am Handy, Tastaturen der Felder, Prüfen im Handyformat und am Gerät. Verwenden, bevor ein kleines Werkzeug, src/pwa/ oder tools/_calc, tools/_tone angefasst wird.
---

# Rechner-PWA – kleine Werkzeuge am Handy

Jedes kleine Werkzeug (`SMALL_TOOLS` in `src/shared/toolWindows.ts`) läuft zweimal: im eigenen
kleinen Fenster der App und als Web-App fürs Handy (`src/pwa/`, veröffentlicht unter
https://mottul.github.io/project_mega/). Derselbe Code – was in der PWA fehlt, darf das Werkzeug
nicht brauchen. Aufbau und Veröffentlichen: `docs/ENTWICKLUNG.md`, Abschnitt „Rechner-PWA“.

## Was ein kleines Werkzeug nicht darf

- **Kein `api`, keine Einstellungen** (`lib/api`, `lib/settings`, `electron`): Der PWA-Build bricht
  ab (`src/pwa/build/plugin.ts`). Gemerktes in einen eigenen zustand-Store (`debouncedStorage`,
  `version`, `syncAcrossWindows`; Muster `tools/tone-generator/store.ts`) – den Stand beim Laden
  prüfen wie fremde Eingabe.
- **Keine Toasts:** Die PWA zeigt keine. Meldungen als `Alert` in der Seite.
- **Was die App von außen einhängt, bleibt in der PWA still:** „läuft“ (`useAktivMelden`, Melder
  aus `main.tsx`) und gescheitertes Speichern (`setStorageErrorHandler`). Neues dieser Art
  genauso bauen: Melder setzen, nicht importieren.
- **Tailwind-Klassen nur aus `src/pwa/build/sources.ts`:** Bindet das Werkzeug einen neuen Ordner
  ein (wie `tools/_tone`), dort eintragen – der Build meldet sonst die Datei. Grund: Jede
  Klasse irgendwo in der App ergäbe sonst eine neue PWA-Version.
- Neues Werkzeug: in `SMALL_TOOLS`, `tools/registry.ts` **und** `src/pwa/tools.ts`
  (`src/pwa/tools.test.ts` vergleicht); Beschreibung im Manifest (`src/pwa/build/plugin.ts`)
  und in `src/pwa/index.html` nachziehen. Jede Änderung, die die PWA erreicht, meldet sich am
  Handy als „Neue Version bereit“.

## Bedienen mit dem Finger

- Bausteine aus `tools/_calc/ui` – sie sind fürs Handy gebaut: `ChoiceField`/`Segmented` (bei
  grobem Zeiger höher), `QuickPick`, `RunButton big` für die Hauptaktion, `RangeField`.
  Auswahl bis vier kurze Möglichkeiten als Knopfgruppe, nicht als Liste.
- **Tastaturen:** `inputMode="decimal"` hat am iPhone kein Minus (WebKit-Fehler 193825) – Felder
  mit negativen Werten anders lösen; `numeric` hat keinen Doppelpunkt (Timecode: Ziffern
  erlauben). Felder sind auf Touch-Geräten 16 px groß (`pwa.css`), sonst zoomt iOS hinein.
- **ⓘ:** schließt beim Tippen daneben (auf dem Handy kommt dabei oft kein `blur`), hat eine
  unsichtbar größere Tippfläche; Darüberfahren zählt nur mit der Maus.
- Was sich beim Umschalten ändert, nach unten: Was man im Betrieb greift, steht oben immer an
  derselben Stelle (Testtongenerator: Start, Pegel, Kanäle oben, die Felder des Signals unten).

## Ton und Mikrofon am Handy

- **Ton nur aus einer Bedienung:** Den `AudioContext` im Klick selbst erzeugen und `resume()`
  aufrufen, vor dem ersten `await` – danach gilt der Tipp nicht mehr. Nie von selbst starten.
  Nur über den Kern in `tools/_tone` (`useToneEngine`).
- **iPhone-Stummschalter:** Web Audio schweigt dort, außer die Seite meldet Wiedergabe
  (`navigator.audioSession.type = 'playback'`, ab iOS 17, nur Safari). Danach zurück auf
  `'auto'`, sonst bekommt der RTA kein Mikrofon. Erledigt der Kern.
- **App gewechselt, gesperrt, Anruf:** iOS hält den Kontext an. Nie still „läuft“ zeigen – der
  Kern meldet `onEnded`, das Werkzeug zeigt einen Hinweis und den Startknopf.
- **Bildschirm wach:** `useWakeLock(läuft)` (nur HTTPS; im installierten iPhone-Webapp erst ab
  iOS 18.4 zuverlässig).
- **Mikrofon** nur über HTTPS; ohne HTTPS (PWA im LAN per `pwa:preview`) gibt es weder
  `navigator.mediaDevices` noch Service Worker – Code muss das aushalten (`?.`).
- Ausgabegerät wählen (`setSinkId`) geht am Handy nicht: Zeile ausblenden
  (`canChooseOutputDevice()` und Geräte mit Namen).

## Prüfen

1. `npm run pwa:build` (Wächter, Quellen) und `npx vitest run src/pwa src/renderer/src/tools`.
2. **Handyformat im eingebauten Browser:** `npm run pwa:build`, dann `npm run pwa:preview`
   (Port 5181) im Hintergrund, im Browser-Bereich öffnen, `resize_window` mit `preset: 'mobile'`
   und neu laden; Ton per Analysator messen wie im E2E (Skill `electron-e2e`, `toneTap.mjs` als
   Vorlage). Danach `preset: 'desktop'`.
3. In der App: `e2e/layout.mjs` (kleines Fenster, 320 px ohne Querscrollen) und das E2E des
   Werkzeugs.
4. **Am Gerät** (kann kein Test): iPhone als installierte App (Stummschalter, App wechseln und
   zurück, Bildschirm bleibt an, danach misst der RTA noch), Android (Chrome), Tastaturen der
   Felder, ⓘ antippen und daneben tippen. Ergebnis in die Doku, nicht nur „sollte gehen“.
