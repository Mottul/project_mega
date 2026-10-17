// HTML -> PDF in einem versteckten Fenster (window.open ist app-weit verboten).
//
// Das HTML geht über eine temporäre Datei, nicht als data:-URL: Chromium nimmt URLs nur bis 2 MB,
// eine längere data:-URL brach mit ERR_INVALID_URL ab (gemessen mit Electron 44 – mit Fotos schon
// ab rund 1,5 MB HTML, weil encodeURIComponent base64 um gut ein Drittel verlängert). Über die
// Datei liefen 60 MB HTML in 3 s.
//
// Das Fenster hat eine eigene, flüchtige Partition, die nur Dateien aus seinem Temp-Ordner lädt
// (data:-Bilder laufen ohne Anfrage). Ein Bild von einem Server oder einer UNC-Freigabe
// (file://server/…, unter Windows mit Anmeldeversuch) aus einer fremden Projektdatei wird so nie
// angefragt. Ohne JavaScript und ohne Preload: Ein Name aus der Planung kann nie als Skript laufen.
//
// Fotos schickt der Renderer nur als Adresse foto://bild/<hash> (wie in der Vorschau); hier
// kommen sie als Kopie in den Temp-Ordner, und die Adresse wird relativ.

import { app, BrowserWindow, session } from 'electron'
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fotoHashesIn, replaceFotoUrls } from '@shared/fotos'
import { esc } from '@shared/html'
import type { PdfPageOptions } from '@shared/types'
import { findFoto } from '../fotos/fotoStore'
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

/** Benutzte Fotos nach `dir/fotos` kopieren; liefert das HTML mit relativen Adressen. */
async function withFotos(html: string, dir: string): Promise<string> {
  const hashes = fotoHashesIn(html)
  if (!hashes.length) return html
  await mkdir(join(dir, 'fotos'))
  const rel = new Map<string, string>()
  for (const hash of hashes) {
    const found = await findFoto(hash)
    if (!found) {
      logLine('[pdf] Foto fehlt:', hash) // bleibt als foto://-Adresse stehen und wird gesperrt
      continue
    }
    const name = `${hash}.${found.ext}`
    await copyFile(found.path, join(dir, 'fotos', name))
    rel.set(hash, `fotos/${name}`)
  }
  return replaceFotoUrls(html, (hash) => rel.get(hash) ?? null)
}

/**
 * Seiten eines PDFs aus Chromium zählen. Dessen Skia-Ausgabe schreibt jedes Seitenobjekt
 * unkomprimiert mit „/Type /Page“ – für fremde PDFs taugt das nicht (dafür pdfjs).
 */
export function chromiumPdfPages(pdf: Uint8Array): number {
  return (
    Buffer.from(pdf)
      .toString('latin1')
      .match(/\/Type\s*\/Page(?!s)/g) ?? []
  ).length
}

/** Maßstäbe beim Einpassen auf eine Seite: printToPDF kann nicht „einpassen“, also probieren */
const EINE_SEITE = [1, 0.93, 0.86, 0.8, 0.74, 0.68, 0.62]

/** Fußzeile: Text links, Seitenzahlen rechts (Chromium füllt pageNumber/totalPages) */
function footerTemplate(text: string): string {
  return `<div style="font-family:'Segoe UI',system-ui,sans-serif;font-size:8px;color:#777;width:100%;padding:0 0.4in;display:flex;justify-content:space-between"><span>${esc(text)}</span><span>Seite <span class="pageNumber"></span> von <span class="totalPages"></span></span></div>`
}

export async function htmlToPdf(
  html: string,
  page: PdfPageOptions = {}
): Promise<{ pdf: Buffer; pages: number; scale: number }> {
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
    await writeFile(file, await withFotos(html, dir), 'utf8')
    await win.loadFile(file)
    const footer = page.footer?.trim()
    const print = (scale: number): Promise<Buffer> =>
      win.webContents.printToPDF({
        printBackground: true,
        pageSize: page.pageSize ?? 'A4',
        landscape: page.landscape ?? false,
        scale,
        margins: { top: 0.4, bottom: footer ? 0.6 : 0.4, left: 0.4, right: 0.4 },
        ...(footer
          ? {
              displayHeaderFooter: true,
              headerTemplate: '<span></span>',
              footerTemplate: footerTemplate(footer)
            }
          : {})
      })
    let out: { pdf: Buffer; pages: number; scale: number } = {
      pdf: Buffer.alloc(0),
      pages: 0,
      scale: 1
    }
    for (const scale of page.onePage ? EINE_SEITE : [1]) {
      const pdf = await print(scale)
      out = { pdf, pages: chromiumPdfPages(pdf), scale }
      if (out.pages <= 1) break
    }
    if (page.onePage && out.pages > 1) logLine('[pdf] passt nicht auf eine Seite:', out.pages)
    return out
  } finally {
    if (!win.isDestroyed()) win.destroy()
    activeDirs.delete(dir)
    await rm(dir, { recursive: true, force: true }).catch((err) =>
      logLine('[pdf] Temp-Ordner bleibt liegen:', dir, String(err))
    )
  }
}
