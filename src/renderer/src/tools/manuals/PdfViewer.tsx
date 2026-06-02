import { useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
// vite ?worker -> Worker-Konstruktor; bundelt den pdfjs-Worker sauber mit
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { api } from '@renderer/lib/api'

pdfjsLib.GlobalWorkerOptions.workerPort = new PdfWorker()

interface PdfViewerProps {
  manualId: number
  initialPage?: number
}

export function PdfViewer({ manualId, initialPage = 1 }: PdfViewerProps): JSX.Element {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const renderTaskRef = useRef<RenderTask | null>(null)
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [page, setPage] = useState(Math.max(1, initialPage))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Dokument laden -- PDF-Bytes per IPC holen und direkt an pdfjs geben
  // (umgeht das manual://-Protokoll, das im gepackten App "Unexpected server
  // response (0)" lieferte).
  useEffect(() => {
    let cancelled = false
    let localDoc: PDFDocumentProxy | null = null
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const bytes = await api.manuals.bytes(manualId)
        if (cancelled) return
        const d = await pdfjsLib.getDocument({ data: bytes }).promise
        if (cancelled) {
          void d.destroy()
          return
        }
        localDoc = d
        setDoc(d)
        setNumPages(d.numPages)
        setPage(Math.min(Math.max(1, initialPage), d.numPages))
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      cancelled = true
      if (localDoc) void localDoc.destroy()
    }
  }, [manualId, initialPage])

  // Aktuelle Seite rendern
  useEffect(() => {
    if (!doc) return
    let cancelled = false
    setLoading(true)
    void (async () => {
      const p = await doc.getPage(page)
      if (cancelled) return
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (!canvas || !ctx) return
      const available = (wrapRef.current?.clientWidth ?? 800) - 32
      const base = p.getViewport({ scale: 1 })
      const scale = Math.min(2.5, Math.max(0.4, available / base.width))
      const viewport = p.getViewport({ scale })
      canvas.width = viewport.width
      canvas.height = viewport.height
      renderTaskRef.current?.cancel()
      const renderTask = p.render({ canvasContext: ctx, viewport })
      renderTaskRef.current = renderTask
      try {
        await renderTask.promise
        if (!cancelled) setLoading(false)
      } catch {
        // Render abgebrochen (Seitenwechsel) -> ignorieren
      }
    })()
    return () => {
      cancelled = true
      renderTaskRef.current?.cancel()
    }
  }, [doc, page])

  function go(delta: number): void {
    setPage((p) => Math.min(Math.max(1, p + delta), numPages || 1))
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-center gap-3 border-b border-border px-4 py-2">
        <Button variant="ghost" size="icon" onClick={() => go(-1)} disabled={page <= 1}>
          <ChevronLeft className="size-4" />
        </Button>
        <span className="min-w-28 text-center text-sm tabular-nums text-muted-foreground">
          Seite {page} / {numPages || '–'}
        </span>
        <Button variant="ghost" size="icon" onClick={() => go(1)} disabled={page >= numPages}>
          <ChevronRight className="size-4" />
        </Button>
      </div>
      <div ref={wrapRef} className="relative flex-1 overflow-auto bg-zinc-900/60 p-4">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {error ? (
          <p className="text-center text-sm text-red-400">PDF konnte nicht geladen werden: {error}</p>
        ) : (
          <canvas ref={canvasRef} className="mx-auto rounded shadow-lg" />
        )}
      </div>
    </div>
  )
}
