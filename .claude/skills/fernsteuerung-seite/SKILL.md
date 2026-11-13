---
name: fernsteuerung-seite
description: Handy-/Browser-Seite einer Mottulbox-Fernsteuerung bauen oder ändern (Player, Jingle, OSC, Timer, Bühnen-Anzeige) – HTML-String-Seite, relative API-Pfade, alte TV-Browser, SSE mit Neuverbindung, Befehle prüfen. Verwenden, bevor eine solche Seite oder ihr Server angefasst wird.
---

# Fernsteuer-Seite

Server: `services/remote/remoteHttp.ts` (`createRemoteHost`, `sendJson`, `readBody`), je Werkzeug ein
`…RemoteServer.ts` mit der Seite als HTML-String (`…RemotePage.ts`, Anzeige: `timerDisplayPage.ts`).
Start/Stopp/Merken/Autostart: `registerRemoteControl()` in `ipc/remoteControls.ts`. Die
Fernsteuer-App (Port 8090, `remoteAppServer.ts`) bindet laufende Fernsteuerungen unter `/<id>/`
ein; zusätzliche Links auf ihrer Startseite über `links` in der App-Definition.

**Im Werkzeug (Renderer)** immer die gemeinsamen Bausteine aus `components/RemoteControl.tsx`,
nie eigene Kopien: `useRemoteControl(api.<werkzeug>, standardPort, nachDemStart?)` (Status,
gemerkter Port, Ein/Aus mit Meldung bei belegtem Port), `RemoteToggle` als Schalter „Handy“ in
der Ausgabe-Leiste und `RemoteSection` als Bereich „Fernsteuerung“ der Schublade (Port, QR-Code,
Adressen). Die Preload-API der Fernsteuerung braucht dafür `remoteStatus`, `remoteStart`,
`remoteStop` und `onRemoteChanged`.

## Regeln

1. **API-Pfade immer relativ** (`api/state`, nie `/api/state`), sonst bricht der Mount unter
   `/<id>/`. Folge: Eine Seite, die auch mit Schrägstrich am Ende erreichbar wäre (`/anzeige/`),
   löst ihre Pfade falsch auf und bleibt schwarz → mit relativem `Location` umleiten
   (`../anzeige`, 301), nicht ausliefern.
2. **Steuerseiten:** `pwaHead()` aus `remotePwa.ts` in den Kopf (Manifest und Icons sind absolut
   und gehören der App-Wurzel; enthält den EventSource-Schutz) und `PWA_SCRIPT`. Reine
   Anzeigeseiten ohne Bedienung dürfen darauf verzichten (so `timerDisplayPage.ts`).
3. **Alte TV-Browser:** ES5 (kein `let`/Pfeilfunktionen/`fetch`), `XMLHttpRequest` mit Timeout,
   `EventSource` mit Polling-Fallback (`api/state` jede Sekunde), keine Annahmen über Zeitzone,
   Sprache oder Wake Lock (über http nicht verfügbar).
4. **Eingefrorene Anzeige darf nie wie echte Daten aussehen.** Der Server sendet mindestens
   jede Sekunde ein Lebenszeichen (`startHeartbeat()` im Timer-Server); die Seite merkt sich den
   Zeitpunkt der letzten Nachricht, gilt nach ~3 s Stille als tot (auch bei „offenem“ Socket
   nach WLAN-Aussetzer), baut den Strom neu auf und zeigt nach 2 s einen Verbindungshinweis.
   Ein Neuaufbau kann einen zweiten Anlauf brauchen – im Test großzügig warten.
5. **Uhrzeit vom Rechner:** `api/time` liefert `{ now, tz }` (Zeitzone des Rechners, Minuten
   östlich von UTC); die Seite synchronisiert den Versatz regelmäßig und formatiert mit `tz`,
   nicht mit der Zone des Geräts.
6. **Befehle vom Handy sind fremde Eingaben:** feldweise prüfen (Allowlist, Werte begrenzen),
   Muster `parseTimerCommand` in `timerRemoteServer.ts` und `player/remoteCommand.ts`; Größe der
   Anfrage begrenzen (`readBody` – liest als UTF-8, Umlaute auf einer Blockgrenze bleiben ganz).
   **Dateien** (Medien, Vorschaubilder) nur mit `sendFile()` aus `services/serveFile.ts`
   ausliefern: versteht `Range` samt `bytes=-N` (`shared/range.ts`) und schließt die Datei,
   wenn das Handy mitten im Abruf abbricht – mit `pipe()` blieb sie offen.
7. **Mehrere offene Fenster:** Befehle gehen nur an das Fenster, dessen Stand das Handy zeigt –
   nichts doppelt ausführen.
8. **Nur Geräte im Netz steuern, keine Websites:** Jeder Server entsteht über `createRemoteHost`
   – dort prüft `nurEigeneHerkunft()` jede Anfrage (`remoteHerkunft.ts`: `Origin` muss zum `Host`
   passen, der `Host` ein Name des eigenen Netzes sein; sonst 403). Für eine Seite heißt das:
   - Zustand ändern nur per **POST** (`api/command`, `api/upload`). Ein GET trägt kein `Origin`,
     der Wächter erkennt eine fremde Seite dort nicht.
   - Die Seite spricht nur ihre eigene Herkunft an (relative Pfade, Regel 1). Ein anderer Port
     desselben Rechners ist schon eine fremde Herkunft und bekommt 403 – deshalb bindet die
     Fernsteuer-App die Handler unter `/<id>/` ein, statt auf deren Ports zu zeigen.
   - Kein eigener `createServer`, kein `Access-Control-Allow-Origin`.
   - Anfragen ohne `Origin` (Companion, curl, Skripte) gehen weiter durch: Das ist die
     Schnittstelle für eigene Programme.

## Prüfen

Unit-Tests wie `timerRemoteServer.test.ts` (Routen, Redirect, `api/time`, keine absoluten
`/api/`-Pfade). Die Seite selbst mit `/electron-e2e` im „fremden Browser“ prüfen
(`e2e/timer.mjs`: Verbindungsabbruch, Zeitzone, toter Strom). Herkunft: `remoteHerkunft.test.ts`
(Regeln), `remoteHttp.test.ts` (Wächter über echtes HTTP) und `e2e/haertung.mjs` (fremder
`Origin` und fremder `Host` gegen die laufende App – mit `http.request`: Nodes `fetch` übergeht
eine gesetzte `Host`-Kopfzeile, gemessen). Doku: `docs/FERNSTEUERUNG.md`, `docs/SICHERHEIT.md`.
