import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
// vite ?worker -> Worker-Konstruktor; bundelt den pdfjs-Worker sauber mit
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker'
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Maximize,
  MoveHorizontal,
  Search,
  ZoomIn,
  ZoomOut
} from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { NumberField } from '@renderer/components/ui/number-field'
import { api } from '@renderer/lib/api'
import type { InDocHit } from '@shared/types'

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

  const [find, setFind] = useState('')
  const [matches, setMatches] = useState<InDocHit[]>([])
  const [matchIdx, setMatchIdx] = useState(0)
  const [showMatches, setShowMatches] = useState(true)

  const [rootEl, setRootEl] = useState<HTMLDivElement | null>(null)
  const [vw, setVw] = useState(800)
  const [vh, setVh] = useState(600)
  const baseSize = useRef<{ w: number; h: number }>({ w: 800, h: 1100 })
  const pageEls = useRef<(HTMLDivElement | null)[]>([])
  const prevScaleRef = useRef(0) // vorheriger effektiver Massstab (fuer Zoom-Anker)
  const anchorYRef = useRef<number | null>(null) // Fokus-Y im Container beim Zoomen

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
    const t = setTimeout(
      () => pageEls.current[initialPage - 1]?.scrollIntoView({ block: 'start' }),
      120
    )
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

  // Zoom um einen Ankerpunkt: bei Massstabsaenderung scrollTop so nachfuehren, dass
  // der Inhalt unter dem Cursor (bzw. die Mitte) stehen bleibt -> kein Sprung.
  // Funktioniert, weil die Seiten-Wrapper synchron die geschaetzte Hoehe annehmen.
  useLayoutEffect(() => {
    const prev = prevScaleRef.current
    prevScaleRef.current = effScale
    if (!rootEl || prev <= 0 || prev === effScale) return
    const f = effScale / prev
    const anchor = anchorYRef.current ?? rootEl.clientHeight / 2
    rootEl.scrollTop = Math.max(0, (rootEl.scrollTop + anchor) * f - anchor)
    anchorYRef.current = null
  }, [effScale, rootEl])

  function zoom(factor: number): void {
    setFit('custom')
    setCustomScale(Math.min(5, Math.max(0.2, +(effScaleRef.current * factor).toFixed(3))))
  }

  function scrollToPage(p: number): void {
    const idx = Math.min(numPages, Math.max(1, p)) - 1
    pageEls.current[idx]?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  function gotoMatch(idx: number): void {
    if (!matches.length) return
    const i = ((idx % matches.length) + matches.length) % matches.length
    setMatchIdx(i)
    scrollToPage(matches[i].pageNo)
  }

  // Suche IM Dokument (nutzt den DB-Index, nach Manual gefiltert), debounced
  useEffect(() => {
    const q = find.trim()
    if (!q) {
      setMatches([])
      setMatchIdx(0)
      return
    }
    const t = setTimeout(() => {
      void api.manuals.searchInDoc(manualId, q).then((m) => {
        setMatches(m)
        setMatchIdx(0)
        if (m.length) scrollToPage(m[0].pageNo)
      })
    }, 250)
    return () => clearTimeout(t)
    // scrollToPage/manualId stabil genug; nur bei Query-Aenderung neu suchen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [find, manualId])

  // Strg+Mausrad bzw. Trackpad-Pinch (Chromium liefert Pinch als ctrl+wheel) -> zoomen.
  // Auf FENSTER-Ebene in der Capture-Phase abfangen: so wird der Default-Scroll des
  // Containers zuverlaessig unterbunden (am Container selbst wurde er sonst nach dem
  // Scrollen umgangen). Nur wenn der Zeiger ueber dem Viewer ist.
  useEffect(() => {
    if (!rootEl) return
    const onWheel = (e: WheelEvent): void => {
      if (!e.ctrlKey || !rootEl.contains(e.target as Node)) return
      e.preventDefault()
      e.stopPropagation()
      // Fokuspunkt = Mausposition im Container -> dort bleibt der Inhalt stehen
      anchorYRef.current = e.clientY - rootEl.getBoundingClientRect().top
      const factor = e.deltaY < 0 ? 1.1 : 0.9
      const next = Math.min(5, Math.max(0.2, +(effScaleRef.current * factor).toFixed(3)))
      // Diagnose: in den DevTools (F12) sichtbar -> Handler feuert + neuer Massstab
      // eslint-disable-next-line no-console
      console.debug('[pdf-zoom]', {
        from: effScaleRef.current,
        to: next,
        anchorY: anchorYRef.current
      })
      effScaleRef.current = next
      setFit('custom')
      setCustomScale(next)
    }
    window.addEventListener('wheel', onWheel, { passive: false, capture: true })
    return () => window.removeEventListener('wheel', onWheel, { capture: true })
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

      {/* Suche im Dokument */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-1.5">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <Input
          value={find}
          onChange={(e) => setFind(e.target.value)}
          placeholder="In diesem PDF suchen…"
          className="h-8 max-w-xs"
          onKeyDown={(e) => {
            if (e.key === 'Enter') gotoMatch(matchIdx + 1)
          }}
        />
        {find.trim() && (
          <>
            <span className="text-xs tabular-nums text-muted-foreground">
              {matches.length ? `${matchIdx + 1} / ${matches.length}` : 'keine Treffer'}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              disabled={!matches.length}
              onClick={() => gotoMatch(matchIdx - 1)}
              aria-label="Voriger Treffer"
            >
              <ChevronUp className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              disabled={!matches.length}
              onClick={() => gotoMatch(matchIdx + 1)}
              aria-label="Nächster Treffer"
            >
              <ChevronDown className="size-4" />
            </Button>
            {matches.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setShowMatches((s) => !s)}>
                {showMatches ? 'Liste aus' : 'Liste'}
              </Button>
            )}
          </>
        )}
      </div>
      {find.trim() && matches.length > 0 && showMatches && (
        <div className="max-h-44 overflow-auto border-b border-border bg-card/40">
          {matches.map((m, i) => (
            <button
              key={`${m.pageNo}-${i}`}
              onClick={() => gotoMatch(i)}
              className={`flex w-full items-start gap-2 px-4 py-1.5 text-left text-sm hover:bg-muted/50 ${
                i === matchIdx ? 'bg-primary/10' : ''
              }`}
            >
              <span className="mt-0.5 shrink-0 rounded bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">
                S. {m.pageNo}
              </span>
              <span
                className="text-muted-foreground"
                dangerouslySetInnerHTML={{ __html: m.snippet }}
              />
            </button>
          ))}
        </div>
      )}

      <div
        ref={setRootEl}
        className="relative flex-1 overflow-auto bg-zinc-900/60 light:bg-zinc-200/70"
      >
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {error ? (
          <p className="p-6 text-center text-sm text-red-400">
            PDF konnte nicht geladen werden: {error}
          </p>
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
  const [rendered, setRendered] = useState(false)

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

  // Seite rendern (scharf via devicePixelRatio); bei Zoomwechsel neu.
  // Der Wrapper hat IMMER die geschaetzte Groesse (baseSize x scale) -> die Layout-
  // hoehe steht synchron mit dem Massstab, damit der Zoom-Anker korrekt rechnet.
  useEffect(() => {
    if (!shouldRender) return
    let cancelled = false
    let task: RenderTask | null = null
    void (async () => {
      const page = await doc.getPage(pageNo)
      if (cancelled) return
      const dpr = window.devicePixelRatio || 1
      const vp = page.getViewport({ scale: scale * dpr })
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (!canvas || !ctx) return
      canvas.width = vp.width
      canvas.height = vp.height
      task = page.render({ canvasContext: ctx, viewport: vp })
      try {
        await task.promise
        if (!cancelled) setRendered(true)
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
      style={{ width: estWidth, height: estHeight }}
    >
      {!rendered && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="size-5 animate-spin text-zinc-400" />
        </div>
      )}
      <canvas ref={canvasRef} className="block" style={{ width: '100%', height: '100%' }} />
    </div>
  )
}
