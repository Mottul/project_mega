// App-Icon zur Laufzeit: Pfad für die Fenster (Taskleiste/Titelleiste) und PNGs
// in Wunschgröße für die Fernsteuer-Web-App (Home-Bildschirm-Icon, Manifest).

import { app, nativeImage } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { logLine } from './log'

/** Pfad zu icon.png (gepackt: extraResources, Entwicklung: build/). Auf macOS
 *  kommt das Fenster-Icon aus dem Bundle, dort hat er für Fenster keine Wirkung. */
export function appIconPath(): string | undefined {
  const candidate = app.isPackaged
    ? join(process.resourcesPath, 'icon.png')
    : join(app.getAppPath(), 'build', 'icon.png')
  return existsSync(candidate) ? candidate : undefined
}

/** Füllt (teil)transparente Pixel mit der Hintergrundfarbe des Icons, gemessen
 *  oben mittig (dort liegt nur Hintergrund). Grund: iOS füllt Transparenz im
 *  Home-Bildschirm-Icon schwarz, Android legt sie auf eine helle Fläche – die
 *  runden Ecken des App-Icons sollen stattdessen in der Icon-Farbe auslaufen
 *  (die Systeme runden selbst ab). Erwartet 4 Byte je Pixel mit Alpha an
 *  Stelle 3 und vormultiplizierten Farben (Electron-Bitmap); die Kanalreihenfolge
 *  ist egal, weil die Füllfarbe aus demselben Puffer stammt. Ändert `bmp`. */
export function fillTransparent(bmp: Buffer, width: number, height: number): Buffer {
  const ref = (Math.floor(height * 0.08) * width + Math.floor(width / 2)) * 4
  const bg = [bmp[ref], bmp[ref + 1], bmp[ref + 2]]
  for (let i = 0; i + 3 < bmp.length; i += 4) {
    const a = bmp[i + 3]
    if (a === 255) continue
    for (let k = 0; k < 3; k++) {
      bmp[i + k] = Math.min(255, bmp[i + k] + Math.round(((255 - a) * bg[k]) / 255))
    }
    bmp[i + 3] = 255
  }
  return bmp
}

const pngCache = new Map<number, Buffer | null>()

/** App-Icon als quadratisches, randlos gefülltes PNG (zwischengespeichert). */
export function appIconPng(size: number): Buffer | null {
  const cached = pngCache.get(size)
  if (cached !== undefined) return cached
  let png: Buffer | null = null
  try {
    const path = appIconPath()
    const img = path ? nativeImage.createFromPath(path) : null
    if (img && !img.isEmpty()) {
      const scaled = img.resize({ width: size, height: size, quality: 'best' })
      const { width, height } = scaled.getSize()
      const bmp = fillTransparent(scaled.toBitmap(), width, height)
      png = nativeImage.createFromBitmap(bmp, { width, height }).toPNG()
    }
  } catch (e) {
    logLine('[app-icon] Icon nicht erzeugbar:', e instanceof Error ? e.message : String(e))
  }
  pngCache.set(size, png)
  return png
}
