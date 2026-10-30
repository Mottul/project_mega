// Drucken und PDF – für alle Werkzeuge gleich: `PrintButton` in der Leiste öffnet `PrintDialog`.
// Links die Optionen des Werkzeugs, in der Mitte die echten Seiten (dasselbe PDF wie beim Speichern,
// so sieht man Umbrüche vorher), unten „Als PDF speichern…“ und „Drucken…“. Erzeugt wird im main
// (verstecktes Fenster), deshalb nach einer kurzen Pause und nur die neueste Anfrage.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, FileDown, Loader2, Minus, Plus, Printer, X } from 'lucide-react'
import type { PdfExportResult, PdfPageOptions } from '@shared/types'
import { Alert } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { api } from '@renderer/lib/api'
import { druckeSeiten } from '@renderer/lib/pdfDruck'
import { pdfjs } from '@renderer/lib/pdfjs'
import { toast } from '@renderer/lib/toast'
import { useElementWidth } from '@renderer/lib/useElementWidth'

const PAUSE_MS = 400
/** Breite einer Seite in Prozent der Spalte: von vier nebeneinander bis formatfüllend */
const ZOOM = [24, 32, 49, 74, 100]

export interface DruckAuftrag {
  html: string
  /** Dateiname fürs Speichern, ohne Pfad */
  name: string
  page?: PdfPageOptions
}

export function PrintButton({
  onClick,
  disabled
}: {
  onClick: () => void
  disabled?: boolean
}): JSX.Element {
  return (
    <Button size="sm" disabled={disabled} onClick={onClick}>
      <Printer className="size-4" /> Drucken / PDF
    </Button>
  )
}

export function PrintDialog({
  titel,
  auftrag,
  optionen,
  onClose,
  vorAusgabe,
  onGespeichert,
  seitenHinweis
}: {
  titel: string
  /** aus den aktuellen Optionen gebaut – eine Änderung zeichnet die Vorschau neu */
  auftrag: DruckAuftrag
  optionen?: ReactNode
  onClose: () => void
  /** Rückfrage vor Speichern und Drucken (Prüfung des Mini-Manuals); false = abbrechen */
  vorAusgabe?: () => Promise<boolean>
  /** statt der üblichen Meldung nach dem Speichern */
  onGespeichert?: (res: PdfExportResult) => void
  /** Warnung zur Seitenzahl, z. B. „passt nicht auf eine Seite“ */
  seitenHinweis?: (seiten: number) => string | null
}): JSX.Element {
  const { html, name, page } = auftrag
  const seitenKey = JSON.stringify(page ?? {})
  const quer = page?.landscape === true
  const [measure, breite] = useElementWidth<HTMLDivElement>()
  const liste = useRef<HTMLDivElement | null>(null)
  const [stand, setStand] = useState<'laedt' | 'fertig' | 'fehler'>('laedt')
  const [seiten, setSeiten] = useState(0)
  const [aktuell, setAktuell] = useState(1)
  const [zoom, setZoom] = useState<number | null>(null)
  const [beschaeftigt, setBeschaeftigt] = useState<string | null>(null)
  const pdf = useRef<{ key: string; bytes: Uint8Array } | null>(null)
  const nr = useRef(0)
  // Vorgabe: Hochformat zwei nebeneinander, Querformat die ganze Breite
  const seitenBreite = zoom ?? (quer ? 74 : 49)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (breite <= 0) return
    const meine = ++nr.current
    const key = `${seitenKey}\n${html}`
    const neu = pdf.current?.key !== key
    setStand('laedt')
    const t = setTimeout(
      () => {
        void (async () => {
          try {
            const bytes = neu
              ? await api.util.renderPdf(html, JSON.parse(seitenKey) as PdfPageOptions)
              : pdf.current!.bytes
            if (meine !== nr.current) return
            pdf.current = { key, bytes }
            const lib = await pdfjs()
            const doc = await lib.getDocument({ data: bytes.slice() }).promise
            // auch bei einer überholten Anfrage (return) das Dokument wieder freigeben
            try {
              const boxen: HTMLElement[] = []
              const dpr = window.devicePixelRatio || 1
              for (let i = 1; i <= doc.numPages; i++) {
                const s = await doc.getPage(i)
                const vp1 = s.getViewport({ scale: 1 })
                // scharf bis zur vollen Spaltenbreite; der Zoom ändert nur die Anzeigegröße
                const vp = s.getViewport({ scale: (breite / vp1.width) * dpr })
                const c = document.createElement('canvas')
                c.width = Math.floor(vp.width)
                c.height = Math.floor(vp.height)
                c.className = 'block w-full rounded-sm bg-white shadow-sm'
                await s.render({ canvas: c, canvasContext: c.getContext('2d')!, viewport: vp })
                  .promise
                const box = document.createElement('div')
                box.dataset.testid = 'druck-seite'
                box.style.width = 'var(--seite)'
                box.append(c)
                boxen.push(box)
              }
              if (meine !== nr.current) return
              liste.current?.replaceChildren(...boxen)
              setSeiten(doc.numPages)
              setAktuell(1)
              setStand('fertig')
            } finally {
              void doc.loadingTask.destroy()
            }
          } catch {
            if (meine === nr.current) setStand('fehler')
          }
        })()
      },
      neu && pdf.current ? PAUSE_MS : 0
    )
    return () => clearTimeout(t)
  }, [html, seitenKey, breite])

  const onScroll = (): void => {
    const el = liste.current
    if (!el) return
    const boxen = [...el.children] as HTMLElement[]
    const i = boxen.findIndex((b) => b.offsetTop + b.offsetHeight > el.scrollTop + 8)
    setAktuell(i < 0 ? seiten : i + 1)
  }

  /** Eine Reihe weiter: Stehen Seiten nebeneinander, läge die nächste Seite auf derselben Höhe */
  const blaettern = (richtung: 1 | -1): void => {
    const el = liste.current
    if (!el) return
    const boxen = [...el.children] as HTMLElement[]
    const hoehe = boxen[aktuell - 1]?.offsetTop ?? 0
    const ziel =
      richtung > 0
        ? boxen.find((b) => b.offsetTop > hoehe)
        : boxen.reverse().find((b) => b.offsetTop < hoehe)
    // nur die Liste scrollen, nicht die Seite dahinter
    if (ziel) el.scrollTop = ziel.offsetTop
  }

  async function speichern(): Promise<void> {
    if (vorAusgabe && !(await vorAusgabe())) return
    setBeschaeftigt('PDF wird gespeichert …')
    try {
      const res = await api.util.exportPdf(html, name, page)
      if (!res) return
      if (onGespeichert) onGespeichert(res)
      else toast.success('PDF gespeichert', res.path)
      onClose()
    } catch {
      toast.error('PDF ließ sich nicht speichern')
    } finally {
      setBeschaeftigt(null)
    }
  }

  async function drucken(): Promise<void> {
    const bytes = pdf.current?.bytes
    if (!bytes) return
    if (vorAusgabe && !(await vorAusgabe())) return
    try {
      await druckeSeiten(bytes, name.replace(/\.pdf$/i, ''), (s, von) =>
        setBeschaeftigt(`Seite ${s} von ${von} wird vorbereitet …`)
      )
    } catch {
      toast.error('Drucken ging nicht')
    } finally {
      setBeschaeftigt(null)
    }
  }

  const zoomStufe = ZOOM.indexOf(seitenBreite)
  const hinweis = stand === 'fertig' ? seitenHinweis?.(seiten) : null
  const bereit = stand === 'fertig' && !beschaeftigt
  const format = `${page?.pageSize ?? 'A4'} ${quer ? 'quer' : 'hoch'}`

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={onClose}
    >
      <Card
        role="dialog"
        aria-label={titel}
        className="flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
          <Printer className="size-4 text-muted-foreground" />
          <h2 className="font-semibold">{titel}</h2>
          <span className="text-sm text-muted-foreground" data-testid="druck-stand">
            {stand === 'fertig' && `${seiten} ${seiten === 1 ? 'Seite' : 'Seiten'} · ${format}`}
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="ml-auto"
            aria-label="Dialog schließen"
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="flex min-h-0 flex-1">
          {(optionen || hinweis) && (
            <div className="w-72 shrink-0 space-y-4 overflow-y-auto border-r border-border p-4">
              {optionen}
              {hinweis && <Alert tone="warning">{hinweis}</Alert>}
            </div>
          )}
          <div className="flex min-w-0 flex-1 flex-col bg-muted/30">
            <div ref={measure} className="relative min-h-0 flex-1">
              <div
                ref={liste}
                onScroll={onScroll}
                style={{ '--seite': `${seitenBreite}%` } as React.CSSProperties}
                className="absolute inset-0 flex flex-wrap content-start justify-center gap-4 overflow-auto p-4"
                data-testid="druck-seiten"
              />
              {stand !== 'fertig' && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/40 text-sm">
                  {stand === 'laedt' ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="size-4 animate-spin" /> Seiten werden erstellt …
                    </span>
                  ) : (
                    <span className="text-danger">Seiten ließen sich nicht erstellen.</span>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center justify-center gap-1 border-t border-border py-1 text-xs text-muted-foreground">
              <Button
                size="icon"
                variant="ghost"
                aria-label="Vorige Seite"
                disabled={aktuell <= 1}
                onClick={() => blaettern(-1)}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="min-w-24 text-center">
                {seiten ? `Seite ${aktuell} von ${seiten}` : ''}
              </span>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Nächste Seite"
                disabled={aktuell >= seiten}
                onClick={() => blaettern(1)}
              >
                <ChevronRight className="size-4" />
              </Button>
              <span className="mx-2 h-4 w-px bg-border" />
              <Button
                size="icon"
                variant="ghost"
                aria-label="Kleiner"
                disabled={zoomStufe <= 0}
                onClick={() => setZoom(ZOOM[zoomStufe - 1])}
              >
                <Minus className="size-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Größer"
                disabled={zoomStufe >= ZOOM.length - 1}
                onClick={() => setZoom(ZOOM[zoomStufe + 1])}
              >
                <Plus className="size-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-border px-4 py-2.5">
          <span className="text-sm text-muted-foreground">
            {beschaeftigt ?? 'Optionen ändern die Vorschau sofort'}
          </span>
          <Button className="ml-auto" size="sm" variant="ghost" onClick={onClose}>
            Schließen
          </Button>
          <Button size="sm" variant="outline" disabled={!bereit} onClick={() => void speichern()}>
            <FileDown className="size-4" /> Als PDF speichern…
          </Button>
          <Button size="sm" disabled={!bereit} onClick={() => void drucken()}>
            <Printer className="size-4" /> Drucken…
          </Button>
        </div>
      </Card>
    </div>,
    document.body
  )
}
