# Marken-Dateien (Logo-Quellen)

Nicht Teil des Builds – die App zeichnet das Logo selbst (`MottulboxLogo`, Pfade in
`src/renderer/src/components/mottulboxLogoData.ts`), der Installer nutzt `build/icon.*`.

| Datei                      | Inhalt                                                         |
| -------------------------- | -------------------------------------------------------------- |
| `die kreation.jpg`         | Ausgangsmotiv (Zeichnung)                                      |
| `MottulBox-Logo-fine.svg`  | Vektorisierte Vorlage (Inkscape, ~746 KB), Ebenen siehe unten  |
| `mottulbox-logo.svg`       | Bereinigtes Logo (Widderkopf, `currentColor`) – Basis der App  |

Ebenen der Inkscape-Vorlage: `foto` (eingebetteter Scan des Ausgangsmotivs), `back` (weiße
Fläche), `head` (kräftige Linien, 15 px – ausgeblendet) und `head fine (5px)` (sichtbar).
`mottulbox-logo.svg` ist die Ebene `head` ohne Inkscape-Ballast und Scan, Koordinaten auf zwei
Nachkommastellen gerundet; die Pfade in `mottulboxLogoData.ts` stammen daraus. Für die kräftige
Ansicht in Inkscape einfach die Ebenen `head` und `head fine (5px)` umschalten.

Früher lag hier noch `MottulBox-Logo.svg` – dieselbe Vorlage, nur mit sichtbarer Ebene `head`.
Ihr Name unterschied sich von `mottulbox-logo.svg` nur in der Schreibweise, die Windows und macOS
nicht auseinanderhalten; daher keine Dateinamen anlegen, die das tun. Die alte Datei liegt in der
Historie (`git show a9e745d:build/MottulBox-Logo.svg`).

In der Vorlage ragen Hörner und Fühler ein Stück in den Kopf hinein. Die App schneidet sie am
Kopfumriss ab (`outside` in `mottulboxLogoData.ts`: Maske im SVG, Clip auf dem Canvas); die Pfade
selbst und die Dateien hier bleiben wie gezeichnet. Das App-Icon in `build/` ist damit erzeugt.
