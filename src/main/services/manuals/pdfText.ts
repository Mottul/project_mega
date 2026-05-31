// PDF-Textextraktion mit pdfjs-dist (legacy build, laeuft im Node/main-Kontext).
// Hinweis: Die Extraktion laeuft hier im main-Prozess. Fuer sehr grosse Bibliotheken
// liesse sich das in einen utilityProcess/worker auslagern (siehe Plan) -- bewusst
// als spaetere Optimierung offen gelassen.

export interface ExtractedPage {
  pageNo: number
  text: string
}

export interface ExtractResult {
  pageCount: number
  pages: ExtractedPage[]
}

// Variable-Specifier -> TS resolved den ESM-Subpfad nicht zur Compile-Zeit (kein
// "Cannot find module") und vite analysiert ihn nicht; Node laedt ihn zur Laufzeit.
const PDFJS_SPECIFIER = 'pdfjs-dist/legacy/build/pdf.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */
let pdfjsPromise: Promise<any> | null = null
function loadPdfjs(): Promise<any> {
  if (!pdfjsPromise) {
    pdfjsPromise = import(/* @vite-ignore */ PDFJS_SPECIFIER)
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
