---
name: release
description: Ein Release der Mottulbox veröffentlichen – Version wählen, Tag auf main setzen, Ablauf „Installer bauen“ mit den vier Installern, Text des Release, was danach zu prüfen ist und was bei einem Fehlschlag. Verwenden nach einem Electron-Update mit Sicherheitskorrekturen, wenn Anwender eine Korrektur oder Funktion brauchen oder wenn der Nutzer ein Release möchte.
---

# Release veröffentlichen

Grundablauf in `docs/ENTWICKLUNG.md` („Release veröffentlichen“), der Ablauf selbst in
`.github/workflows/installer.yml`. Ohne `electron-updater` (Paket S3 im Gesamtplan) kommen
Korrekturen nur mit einem neuen Installer bei den Anwendern an – vor allem die Chromium-Patches
eines Electron-Updates (Skill `abhaengigkeiten`, Schritt „Ausliefern“). Das erste Release war
`v0.1.0` am 24.11.2026.

## Vorher

- **Nur nach einem ausdrücklichen Ja des Nutzers.** Das Repository ist öffentlich: Installer und
  Text lädt jeder ohne Anmeldung. Erst Versionsnummer und Inhalt vorschlagen, dann warten.
- **Version:** Die Version in `package.json` darf noch keinen Tag haben
  (`git ls-remote --tags origin`). Sonst zuerst per Pull Request erhöhen:
  `npm version 0.2.0 --no-git-tag-version` (ändert auch `package-lock.json`). Eine Version mit
  Bindestrich (`v1.0.0-beta.1`) wird Vorabversion.
- **main grün:** Der letzte CI-Lauf auf main muss genau den Commit geprüft haben, der den Tag
  bekommt (`gh run list --workflow ci.yml --branch main --limit 1`, `headSha` vergleichen).

## Taggen

Im gemeinsamen Ordner nicht auf main wechseln, sondern den Commit ausdrücklich nennen – der lokale
Branch steht oft woanders:

```bash
git fetch origin
git tag v0.2.0 <sha von origin/main>
git push origin v0.2.0
```

Der Tag startet „Installer bauen“: zuerst der Vergleich von Tag und `package.json` (bricht vor dem
Bauen ab), dann je System bauen, den Installer ausführen und die App daraus starten
(`e2e/paket.mjs`), zuletzt der Job „Release“ – nur wenn alle drei bestanden haben. Dauer bei
`v0.1.0`: Linux 2, macOS und Windows je 4 Minuten, der Release-Job unter 1 Minute.

## Danach prüfen

- `gh release view v0.2.0 --json isDraft,isPrerelease,assets`: vier Dateien im Zustand
  `uploaded` – `Mottulbox-<Version>-setup.exe`, `-arm64.dmg`, `-x64.dmg` und `.AppImage`
  (bei `v0.1.0` 190 bis 285 MB je Datei).
- **Text:** eine Zeile zu Signatur, NDI und `docs/INSTALL.md`, darunter die Pull Requests seit dem
  letzten Tag, von GitHub erzeugt und mit den Dependabot-PRs. Das erste Release listete alle 252
  bis dahin. Kürzen geht danach auf GitHub.
- Dem Nutzer den Link nennen. Am Gerät installieren lohnt sich, wenn ohnehin eine Abnahme ansteht:
  SmartScreen und Gatekeeper warnen, weil nichts signiert ist (`docs/INSTALL.md`); das Protokoll
  `avtoolbox-debug.log` im Benutzerordner schreibt auch die gepackte App.

## Wenn es scheitert

- Scheitert ein System, entsteht kein Release, nie ein halbes – nur der Tag bleibt stehen.
  Protokoll lesen, per Pull Request beheben, dann den Tag löschen und auf den neuen Stand von main
  setzen: `git push origin :refs/tags/v0.2.0` und `git tag -d v0.2.0`, danach wie oben.
- Ein zweiter Lauf zum selben Tag (Re-run) ersetzt nur die Dateien; Text und Status bleiben.
- Die echten Installer entstehen sonst nur, wenn jemand „Installer bauen“ von Hand startet oder
  ein Pull Request die Paketierung ändert (`electron-builder.yml`, den Ablauf, `e2e/paket.mjs`).
  Vor `v0.1.0` lag der letzte Lauf über drei Wochen zurück, Electron 45 kam erst danach. Ein
  Fehlschlag nach langer Pause ist also möglich. Eine Probe von Hand vorab ist trotzdem nicht
  nötig: Der Lauf zum Tag veröffentlicht ohnehin nur, was bestanden hat.
