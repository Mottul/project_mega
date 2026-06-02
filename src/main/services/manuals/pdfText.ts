// PDF-Textextraktion mit pdfjs-dist (legacy build, laeuft im Node/main-Kontext).
// Hinweis: Die Extraktion laeuft hier im main-Prozess. Fuer sehr grosse Bibliotheken
// liesse sich das in einen utilityProcess/worker auslagern (siehe Plan) -- bewusst
// als spaetere Optimierung offen gelassen.

import { app } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { logLine } from '../log'

export interface ExtractedPage {
  pageNo: number
  text: string
}

export interface ExtractResult {
  pageCount: number
  pages: ExtractedPage[]
}

const PDFJS_REL = 'node_modules/pdfjs-dist/legacy/build/pdf.mjs'
const PDFJS_SPECIFIER = 'pdfjs-dist/legacy/build/pdf.mjs'

// Mehrere Kandidaten-Pfade zur physischen pdf.mjs. Im gepackten App loest der
// ESM-import() den Paket-Specifier NICHT aus dem app.asar heraus auf (anders als
// require) -- wir importieren die entpackte Datei daher per absoluter file://-URL.
function candidatePaths(): string[] {
  const out: string[] = []
  try {
    const appPath = app.getAppPath()
    out.push(join(appPath, PDFJS_REL))
    if (appPath.includes('app.asar')) {
      out.push(join(appPath.replace('app.asar', 'app.asar.unpacked'), PDFJS_REL))
    }
  } catch {
    /* app evtl. noch nicht bereit */
  }
  try {
    if (process.resourcesPath) {
      out.push(join(process.resourcesPath, 'app.asar.unpacked', PDFJS_REL))
      out.push(join(process.resourcesPath, 'app', PDFJS_REL))
    }
  } catch {
    /* ignore */
  }
  return [...new Set(out)]
}

/* eslint-disable @typescript-eslint/no-explicit-any */
let pdfjsPromise: Promise<any> | null = null
function loadPdfjs(): Promise<any> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      for (const file of candidatePaths()) {
        const exists = existsSync(file)
        logLine('[pdfjs] Kandidat exists=' + exists, file)
        if (!exists) continue
        try {
          const mod = await import(/* @vite-ignore */ pathToFileURL(file).href)
          logLine('[pdfjs] geladen via file://', file)
          return mod
        } catch (e) {
          logLine('[pdfjs] file://-import fehlgeschlagen:', e instanceof Error ? e.message : String(e))
        }
      }
      // Fallback: Paket-Specifier (greift in Dev/Node)
      try {
        const mod = await import(/* @vite-ignore */ PDFJS_SPECIFIER)
        logLine('[pdfjs] geladen via Specifier (Fallback)')
        return mod
      } catch (e) {
        logLine('[pdfjs] ALLE Ladewege fehlgeschlagen:', e instanceof Error ? e.message : String(e))
        pdfjsPromise = null // erneuten Versuch beim naechsten Aufruf erlauben
        throw e
      }
    })()
  }
  return pdfjsPromise
}

/** Extrahiert den Text aller Seiten eines PDFs (als Bytes uebergeben). */
export async function extractPdfText(
  data: Uint8Array,
  onPage?: (page: number, total: number) => void
): Promise<ExtractResult> {
  const pdfjs = await loadPdfjs()
  const doc = await pdfjs.getDocument({
    data,
    useSystemFonts: true,
    isEvalSupported: false,
    // im Node-Kontext laeuft pdfjs ohne separaten Worker (Fake-Worker)
    disableFontFace: true
  }).promise

  const pageCount: number = doc.numPages
  const pages: ExtractedPage[] = []
  try {
    for (let i = 1; i <= pageCount; i++) {
      const page = await doc.getPage(i)
      const tc = await page.getTextContent()
      const text = (tc.items as Array<{ str?: string }>)
        .map((it) => (typeof it.str === 'string' ? it.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      pages.push({ pageNo: i, text })
      page.cleanup()
      onPage?.(i, pageCount)
    }
  } finally {
    await doc.destroy()
  }
  return { pageCount, pages }
}
