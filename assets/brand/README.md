# Marken-Dateien (Logo-Quellen)

Nicht Teil des Builds – die App zeichnet das Logo selbst (`MottulboxLogo`, Pfade in
`src/renderer/src/components/mottulboxLogoData.ts`), der Installer nutzt `build/icon.*`.

| Datei                      | Inhalt                                                         |
| -------------------------- | -------------------------------------------------------------- |
| `die kreation.jpg`         | Ausgangsmotiv (Vorlage)                                        |
| `MottulBox-Logo.svg`       | Vektorisierte Vorlage                                          |
| `MottulBox-Logo-fine.svg`  | Vektorisierte Vorlage (feiner)                                 |
| `mottulbox-logo.svg`       | Bereinigtes Logo (Widderkopf, `currentColor`) – Basis der App  |

In der Vorlage ragen Hörner und Fühler ein Stück in den Kopf hinein. Die App schneidet sie am
Kopfumriss ab (`outside` in `mottulboxLogoData.ts`: Maske im SVG, Clip auf dem Canvas); die Pfade
selbst und die Dateien hier bleiben wie gezeichnet. Das App-Icon in `build/` ist damit erzeugt.
