// Seitenansicht der Vorschau: das echte Handbuch-PDF (derselbe Druck wie beim Export), Seite für
// Seite – so sieht man, wo es umbricht. Das Kapitel-HTML allein kann das nicht zeigen: Umbrüche
// hängen am ganzen Dokument. Gedruckt wird im main (verstecktes Fenster, gut eine Sekunde), deshalb
// erst nach einer Pause im Tippen und nur die neueste Anfrage. pdf.js lädt erst hier.

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { api } from '@renderer/lib/api'
import { useElementWidth } from '@renderer/lib/useElementWidth'

const PAUSE_MS = 1200

type Pdfjs = typeof import('pdfjs-dist')
let pdfjsLaden: Promise<Pdfjs> | null = null

function pdfjs(): Promise<Pdfjs> {
  pdfjsLaden ??= (async () => {
    const lib = await import('pdfjs-dist')
    const { default: PdfWorker } = await import('pdfjs-dist/build/pdf.worker.min.mjs?worker')
    // die Manuals-Bibliothek setzt den Worker womöglich schon – nur einer je Fenster
    if (!lib.GlobalWorkerOptions.workerPort) lib.GlobalWorkerOptions.workerPort = new PdfWorker()
    return lib
  })()
  return pdfjsLaden
}

const regexText = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Auf welcher Seite beginnt das Kapitel? Kopf „07 Bedienfeld“ im Text der Seite suchen */
async function seiteVon(
  doc: Awaited<ReturnType<Pdfjs['getDocument']>['promise']>,
  nr: number | null,
  titel: string
): Promise<number> {
  if (nr === null) return 1
  const re = new RegExp(`${String(nr).padStart(2, '0')}\\s*${regexText(titel)}`)
  for (let i = 1; i <= doc.numPages; i++) {
    const t = await (await doc.getPage(i)).getTextContent()
    const text = t.items.map((x) => ('str' in x ? x.str : '')).join(' ')
    if (re.test(text)) return i
  }
  return 1
}

export function Seitenansicht({
  html,
  footer,
  zielNr,
  zielTitel
}: {
  html: string
  footer: string
  /** Nummer und Titel des Kapitels, zu dem gescrollt wird; null = Deckblatt (Seite 1) */
  zielNr: number | null
  zielTitel: string
}): JSX.Element {
  const [measure, width] = useElementWidth<HTMLDivElement>()
  const liste = useRef<HTMLDivElement | null>(null)
  const [stand, setStand] = useState<'laedt' | 'fertig' | 'fehler'>('laedt')
  const [seiten, setSeiten] = useState(0)
  const nr = useRef(0)
  // zuletzt gedrucktes PDF: Ändert sich nur die Breite oder das Ziel, wird nicht neu gedruckt
  const zuletzt = useRef<{ key: string; bytes: Uint8Array } | null>(null)

  useEffect(() => {
    if (width <= 0) return
    const meine = ++nr.current
    const key = `${footer}\n${html}`
    const neuDrucken = zuletzt.current?.key !== key
    setStand('laedt')
    const t = setTimeout(
      () => {
        void (async () => {
          try {
            const bytes = neuDrucken
              ? await api.util.renderPdf(html, { footer })
              : zuletzt.current!.bytes
            if (meine !== nr.current) return
            zuletzt.current = { key, bytes }
            const lib = await pdfjs()
            // pdf.js übernimmt den Puffer – eine Kopie, damit der gemerkte heil bleibt
            const doc = await lib.getDocument({ data: bytes.slice() }).promise
            // auch bei einer überholten Anfrage (return) das Dokument wieder freigeben
            try {
              const canvases: HTMLElement[] = []
              const dpr = window.devicePixelRatio || 1
              for (let i = 1; i <= doc.numPages; i++) {
                const page = await doc.getPage(i)
                const vp1 = page.getViewport({ scale: 1 })
                const vp = page.getViewport({ scale: (width / vp1.width) * dpr })
                const c = document.createElement('canvas')
                c.width = Math.floor(vp.width)
                c.height = Math.floor(vp.height)
                c.style.width = `${width}px`
                c.className = 'block rounded-sm border border-border bg-white shadow-sm'
                await page.render({ canvas: c, canvasContext: c.getContext('2d')!, viewport: vp })
                  .promise
                const box = document.createElement('div')
                box.dataset.testid = 'pdf-seite'
                box.className = 'space-y-1'
                const label = document.createElement('div')
                label.className = 'text-xs text-muted-foreground'
                label.textContent = `Seite ${i} von ${doc.numPages}`
                box.append(c, label)
                canvases.push(box)
              }
              if (meine !== nr.current) return
              const el = liste.current
              if (!el) return
              el.replaceChildren(...canvases)
              setSeiten(doc.numPages)
              setStand('fertig')
              const s = await seiteVon(doc, zielNr, zielTitel)
              // nur die Liste scrollen, nicht die ganze Seite (scrollIntoView zöge alle Vorfahren mit)
              const box = canvases[s - 1]
              if (meine === nr.current && box) el.scrollTop = box.offsetTop
            } finally {
              void doc.loadingTask.destroy()
            }
          } catch {
            if (meine === nr.current) setStand('fehler')
          }
        })()
      },
      neuDrucken ? PAUSE_MS : 0
    )
    return () => clearTimeout(t)
  }, [html, footer, width, zielNr, zielTitel])

  return (
    <div ref={measure} className="w-full space-y-2">
      <div className="flex h-5 items-center gap-2 text-xs text-muted-foreground">
        {stand === 'laedt' && (
          <>
            <Loader2 className="size-3.5 animate-spin" /> Seiten werden erstellt …
          </>
        )}
        {stand === 'fertig' && `${seiten} Seiten wie im PDF (Handbuch)`}
        {stand === 'fehler' && (
          <span className="text-danger">Seiten ließen sich nicht erstellen.</span>
        )}
      </div>
      <div
        ref={liste}
        className="relative max-h-[calc(100vh-220px)] space-y-4 overflow-auto pr-1"
        data-testid="mini-manual-seiten"
      />
    </div>
  )
}
