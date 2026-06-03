import { useCallback, useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
// vite ?worker -> Worker-Konstruktor; bundelt den pdfjs-Worker sauber mit
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker'
import { Loader2, Maximize, MoveHorizontal, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { NumberField } from '@renderer/components/ui/number-field'
import { api } from '@renderer/lib/api'

pdfjsLib.GlobalWorkerOptions.workerPort = new PdfWorker()

type FitMode = 'width' | 'page' | 'custom'

const PAD = 32 // Innenabstand + Platz fuer die Scrollbar

interface PdfViewerProps {
  manualId: number
  initialPage?: number
}

export function PdfViewer({ manualId, initialPage = 1 }: PdfViewerProps): JSX.Element {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [fit, setFit] = useState<FitMode>('width')
  const [customScale, setCustomScale] = useState(1)
  const [current, setCurrent] = useState(1)

  const [rootEl, setRootEl] = useState<HTMLDivElement | null>(null)
  const [vw, setVw] = useState(800)
  const [vh, setVh] = useState(600)
  const baseSize = useRef<{ w: number; h: number }>({ w: 800, h: 1100 })
  const pageEls = useRef<(HTMLDivElement | null)[]>([])

  // Dokument laden (Bytes per IPC -> direkt an pdfjs)
  useEffect(() => {
    let cancelled = false
    let localDoc: PDFDocumentProxy | null = null
    setLoading(true)
    setError(null)
    setDoc(null)
    void (async () => {
      try {
        const bytes = await api.manuals.bytes(manualId)
        if (cancelled) return
        const d = await pdfjsLib.getDocument({ data: bytes }).promise
        if (cancelled) {
          void d.destroy()
          return
        }
        const p1 = await d.getPage(1)
        const v = p1.getViewport({ scale: 1 })
        baseSize.current = { w: v.width, h: v.height }
        localDoc = d
        setDoc(d)
        setNumPages(d.numPages)
        setCurrent(Math.min(Math.max(1, initialPage), d.numPages))
        setLoading(false)
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e))
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
      if (localDoc) void localDoc.destroy()
    }
  }, [manualId, initialPage])

  // Containergroesse fuer die Einpassen-Modi verfolgen
  useEffect(() => {
    if (!rootEl) return
    const update = (): void => {
      setVw(rootEl.clientWidth)
      setVh(rootEl.clientHeight)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(rootEl)
    return () => ro.disconnect()
  }, [rootEl])

  // Beim Oeffnen aus einem Suchtreffer zur Zielseite springen
  useEffect(() => {
    if (!doc || initialPage <= 1) return
    const t = setTimeout(() => pageEls.current[initialPage - 1]?.scrollIntoView({ block: 'start' }), 120)
    return () => clearTimeout(t)
  }, [doc, initialPage])

  const effScale =
    fit === 'width'
      ? Math.max(0.2, (vw - PAD) / baseSize.current.w)
      : fit === 'page'
        ? Math.max(0.2, Math.min((vw - PAD) / baseSize.current.w, (vh - PAD) / baseSize.current.h))
        : customScale

  // immer aktueller Massstab fuer den (einmal angehaengten) Wheel-Handler
  const effScaleRef = useRef(effScale)
  effScaleRef.current = effScale

  function zoom(factor: number): void {
    setFit('custom')
    setCustomScale(Math.min(5, Math.max(0.2, +(effScaleRef.current * factor).toFixed(3))))
  }

  function scrollToPage(p: number): void {
    const idx = Math.min(numPages, Math.max(1, p)) - 1
    pageEls.current[idx]?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  // Strg+Mausrad bzw. Trackpad-Pinch (Chromium liefert Pinch als ctrl+wheel) -> zoomen.
  // EINMAL anhaengen (nicht bei jeder Massstabsaenderung neu) und Scroll sicher
  // unterbinden, sonst scrollt das PDF statt zu zoomen.
  useEffect(() => {
    if (!rootEl) return
    const onWheel = (e: WheelEvent): void => {
      if (!e.ctrlKey) return
      e.preventDefault()
      e.stopPropagation()
      const factor = e.deltaY < 0 ? 1.1 : 0.9
      const next = Math.min(5, Math.max(0.2, +(effScaleRef.current * factor).toFixed(3)))
      effScaleRef.current = next // sofort aktualisieren -> schnelle Events kompoundieren
      setFit('custom')
      setCustomScale(next)
    }
    rootEl.addEventListener('wheel', onWheel, { passive: false })
    return () => rootEl.removeEventListener('wheel', onWheel)
  }, [rootEl])

  // Aktuelle Seite = oberste Seite, deren Oberkante (knapp) ueber dem Containerrand liegt.
  useEffect(() => {
    if (!rootEl) return
    let raf = 0
    const compute = (): void => {
      const top = rootEl.getBoundingClientRect().top
      let cur = 1
      for (let i = 0; i < pageEls.current.length; i++) {
        const el = pageEls.current[i]
        if (!el) continue
        if (el.getBoundingClientRect().top - top <= 80) cur = i + 1
        else break
      }
      setCurrent(cur)
    }
    const onScroll = (): void => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(compute)
    }
    rootEl.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      rootEl.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [rootEl, numPages])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-center gap-2 border-b border-border px-4 py-2">
        <Button variant="ghost" size="icon" onClick={() => zoom(0.8)} aria-label="Verkleinern">
          <ZoomOut className="size-4" />
        </Button>
        <span className="min-w-14 text-center text-sm tabular-nums text-muted-foreground">
          {Math.round(effScale * 100)}%
        </span>
        <Button variant="ghost" size="icon" onClick={() => zoom(1.25)} aria-label="Vergrößern">
          <ZoomIn className="size-4" />
        </Button>
        <div className="mx-2 h-5 w-px bg-border" />
        <Button
          variant={fit === 'width' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setFit('width')}
        >
          <MoveHorizontal className="size-4" /> Breite
        </Button>
        <Button
          variant={fit === 'page' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setFit('page')}
        >
          <Maximize className="size-4" /> Ganze Seite
        </Button>
        <div className="mx-2 h-5 w-px bg-border" />
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span>Seite</span>
          <NumberField
            value={current}
            min={1}
            max={numPages || 1}
            className="h-7 w-14 text-center"
            aria-label="Seite"
            onCommit={scrollToPage}
          />
          <span>/ {numPages || '–'}</span>
        </div>
      </div>

      <div ref={setRootEl} className="relative flex-1 overflow-auto bg-zinc-900/60">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {error ? (
          <p className="p-6 text-center text-sm text-red-400">PDF konnte nicht geladen werden: {error}</p>
        ) : (
          doc && (
            <div className="flex flex-col items-center gap-4 p-4">
              {Array.from({ length: numPages }, (_, i) => (
                <PdfPage
                  key={i + 1}
                  assignRef={(el) => (pageEls.current[i] = el)}
                  doc={doc}
                  pageNo={i + 1}
                  scale={effScale}
                  estWidth={baseSize.current.w * effScale}
                  estHeight={baseSize.current.h * effScale}
                  root={rootEl}
                />
              ))}
            </div>
          )
        )}
      </div>
    </div>
  )
}

interface PdfPageProps {
  doc: PDFDocumentProxy
  pageNo: number
  scale: number
  estWidth: number
  estHeight: number
  root: HTMLElement | null
  assignRef: (el: HTMLDivElement | null) => void
}

function PdfPage({
  doc,
  pageNo,
  scale,
  estWidth,
  estHeight,
  root,
  assignRef
}: PdfPageProps): JSX.Element {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [shouldRender, setShouldRender] = useState(false)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)

  const setRefs = useCallback(
    (el: HTMLDivElement | null) => {
      wrapRef.current = el
      assignRef(el)
    },
    [assignRef]
  )

  // Nur rendern, wenn (fast) im Sichtbereich -> grosse PDFs bleiben fluessig
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setShouldRender(true)
        }
      },
      { root: root ?? null, rootMargin: '500px 0px', threshold: 0.01 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [root, pageNo])

  // Seite rendern (scharf via devicePixelRatio); bei Zoomwechsel neu
  useEffect(() => {
    if (!shouldRender) return
    let cancelled = false
    let task: RenderTask | null = null
    void (async () => {
      const page = await doc.getPage(pageNo)
      if (cancelled) return
      const dpr = window.devicePixelRatio || 1
      const vp = page.getViewport({ scale: scale * dpr })
      const cssW = vp.width / dpr
      const cssH = vp.height / dpr
      setSize({ w: cssW, h: cssH })
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (!canvas || !ctx) return
      canvas.width = vp.width
      canvas.height = vp.height
      canvas.style.width = `${cssW}px`
      canvas.style.height = `${cssH}px`
      task = page.render({ canvasContext: ctx, viewport: vp })
      try {
        await task.promise
      } catch {
        // Render abgebrochen (Zoom/Scroll) -> ignorieren
      }
    })()
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [shouldRender, scale, doc, pageNo])

  return (
    <div
      ref={setRefs}
      className="relative shrink-0 overflow-hidden rounded bg-white shadow-lg"
      style={{ width: size?.w ?? estWidth, height: size?.h ?? estHeight }}
    >
      {!size && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="size-5 animate-spin text-zinc-400" />
        </div>
      )}
      <canvas ref={canvasRef} className="block" />
    </div>
  )
}
