// pdf.js erst bei Bedarf laden (groß) – für die Seiten der Druckvorschau und der Mini-Manual-Vorschau.

export type Pdfjs = typeof import('pdfjs-dist')

let laden: Promise<Pdfjs> | null = null

export function pdfjs(): Promise<Pdfjs> {
  laden ??= (async () => {
    const lib = await import('pdfjs-dist')
    const { default: PdfWorker } = await import('pdfjs-dist/build/pdf.worker.min.mjs?worker')
    // die Manuals-Bibliothek setzt den Worker womöglich schon – nur einer je Fenster
    if (!lib.GlobalWorkerOptions.workerPort) lib.GlobalWorkerOptions.workerPort = new PdfWorker()
    return lib
  })()
  return laden
}
