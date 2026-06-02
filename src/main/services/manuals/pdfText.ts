// PDF-Textextraktion mit pdfjs-dist (legacy build, laeuft im Node/main-Kontext).
// Hinweis: Die Extraktion laeuft hier im main-Prozess. Fuer sehr grosse Bibliotheken
// liesse sich das in einen utilityProcess/worker auslagern (siehe Plan) -- bewusst
// als spaetere Optimierung offen gelassen.

import { app } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export interface ExtractedPage {
  pageNo: number
  text: string
}

export interface ExtractResult {
  pageCount: number
  pages: ExtractedPage[]
}

const PDFJS_SUBPATH = 'node_modules/pdfjs-dist/legacy/build/pdf.mjs'
const PDFJS_SPECIFIER = 'pdfjs-dist/legacy/build/pdf.mjs'

// Absolute file://-URL zur pdf.mjs ermitteln. Wichtig fuer das gepackte App:
// aus dem app.asar heraus loest der ESM-import() den Paket-Specifier NICHT auf
// (anders als require, das Electron auf app.asar.unpacked umbiegt). Wir importieren
// die physische Datei (pdfjs-dist ist via asarUnpack entpackt) direkt per file://-URL.
function pdfjsFileUrl(): string | null {
  try {
    const appPath = app.getAppPath() // dev: Projektroot; prod: .../resources/app.asar
    const base = appPath.includes('app.asar')
      ? appPath.replace('app.asar', 'app.asar.unpacked')
      : appPath
    const file = join(base, PDFJS_SUBPATH)
    return existsSync(file) ? pathToFileURL(file).href : null
  } catch {
    return null
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
let pdfjsPromise: Promise<any> | null = null
function loadPdfjs(): Promise<any> {
  if (!pdfjsPromise) {
    const url = pdfjsFileUrl()
    // Bevorzugt die absolute file://-URL (funktioniert auch aus dem asar heraus);
    // Fallback auf den Paket-Specifier (greift in Dev/Node zuverlaessig).
    pdfjsPromise = import(/* @vite-ignore */ url ?? PDFJS_SPECIFIER)
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
