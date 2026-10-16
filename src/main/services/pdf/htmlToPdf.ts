// HTML -> PDF in einem versteckten Fenster (window.open ist app-weit verboten).
//
// Das HTML geht über eine temporäre Datei, nicht als data:-URL: Chromium nimmt URLs nur bis 2 MB,
// und eine längere data:-URL ließ die ganze App abstürzen (gemessen mit Electron 44 – mit Fotos
// schon ab rund 1,5 MB HTML, weil encodeURIComponent base64 um gut ein Drittel verlängert). Über
// die Datei liefen 60 MB HTML in 3 s.
//
// Das Fenster hat eine eigene, flüchtige Partition, die nur Dateien aus seinem Temp-Ordner lädt
// (data:-Bilder laufen ohne Anfrage). Ein Bild von einem Server oder einer UNC-Freigabe
// (file://server/…, unter Windows mit Anmeldeversuch) aus einer fremden Projektdatei wird so nie
// angefragt. Ohne JavaScript und ohne Preload: Ein Name aus der Planung kann nie als Skript laufen.

import { app, BrowserWindow, session } from 'electron'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { PdfPageOptions } from '@shared/types'
import { logLine } from '../log'
import { fileUrlInDir } from './fileUrlInDir'

const PARTITION = 'pdf-export' // ohne „persist:“ – lebt nur im Speicher
const activeDirs = new Set<string>() // mehrere Exporte dürfen gleichzeitig laufen
let filterInstalled = false

function installRequestFilter(): void {
  if (filterInstalled) return
  filterInstalled = true
  session.fromPartition(PARTITION).webRequest.onBeforeRequest((details, callback) => {
    const ok = [...activeDirs].some((dir) => fileUrlInDir(details.url, dir))
    if (!ok) logLine('[pdf] Anfrage gesperrt:', details.url.slice(0, 200))
    callback({ cancel: !ok })
  })
}

export async function htmlToPdf(html: string, page: PdfPageOptions = {}): Promise<Buffer> {
  installRequestFilter()
  const dir = await mkdtemp(join(app.getPath('temp'), 'mottulbox-pdf-'))
  activeDirs.add(dir)
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      javascript: false,
      partition: PARTITION
    }
  })
  try {
    const file = join(dir, 'seite.html')
    await writeFile(file, html, 'utf8')
    await win.loadFile(file)
    return await win.webContents.printToPDF({
      printBackground: true,
      pageSize: page.pageSize ?? 'A4',
      landscape: page.landscape ?? false,
      margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 }
    })
  } finally {
    if (!win.isDestroyed()) win.destroy()
    activeDirs.delete(dir)
    await rm(dir, { recursive: true, force: true }).catch((err) =>
      logLine('[pdf] Temp-Ordner bleibt liegen:', dir, String(err))
    )
  }
}
