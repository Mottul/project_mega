// Arbeitsfläche der OSC-Steuerung: Raster mit den Kacheln, Geräte-Vorschau und Auswahl neuer Bedienelemente.

import {
  memo,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode
} from 'react'
import { Plus, Tv } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import {
  NOVA_PALETTE,
  WIDGET_ORDER,
  WIDGET_TYPE_LABEL,
  type NovaWidgetKind,
  type OscWidget,
  type OscWidgetType
} from './store'
import { GAP, type Nova, ROW_H, type SendFn, type SendMany } from './oscShared'
import { GridBackdrop, WidgetTile } from './WidgetTile'

/* ------------------------- Geräte-Vorschau ------------------------------ */

export function DeviceBtn({
  active,
  title,
  onClick,
  children
}: {
  active: boolean
  title: string
  onClick: () => void
  children: ReactNode
}): JSX.Element {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        'flex items-center px-2.5 py-1.5 transition-colors',
        active ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}

// Geräterahmen, der seinen Inhalt (Fläche in Originalauflösung) auf die
// verfügbare Größe herunterskaliert. Reicht den Skalierungsfaktor an die Kinder
// weiter, damit das Ziehen in der Vorschau rastergenau bleibt.
export function DeviceFrame({
  w,
  h,
  children
}: {
  w: number
  h: number
  children: (scale: number) => ReactNode
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = (): void => {
      const availW = el.clientWidth - 24
      const availH = el.clientHeight - 24
      setScale(Math.max(0.2, Math.min(1, availW / (w + 24), availH / (h + 24))))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [w, h])
  return (
    <div ref={ref} className="flex h-full w-full items-center justify-center">
      <div style={{ transform: `scale(${scale})` }} className="origin-center">
        <div className="rounded-[2.6rem] border-[12px] border-neutral-800 bg-neutral-800 shadow-2xl">
          {/* Scrollbar im „Display" ausblenden: die 10px-Scrollleiste läge sonst
              als dicke Linie direkt am Rahmen und würde ihn optisch verdoppeln.
              Gescrollt wird weiterhin (Rad/Ziehen); scrollbar-width für nicht-
              Chromium-Fälle, ::-webkit-scrollbar für Electron. */}
          <div
            style={{ width: w, height: h }}
            className="overflow-auto rounded-[1.6rem] bg-background p-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {children(scale)}
          </div>
        </div>
      </div>
    </div>
  )
}

// Das Raster mit allen Kacheln. Wird sowohl normal als auch in der
// Geräte-Vorschau verwendet; `scale` macht das Ziehen im skalierten Rahmen
// korrekt, `live` entscheidet über Bedienen (true) bzw. Bearbeiten (false).
// memo: Log-/Status-Re-Renders des Elternteils ohne Widget-Änderung überspringen.
export const SurfaceGrid = memo(function SurfaceGrid({
  columns,
  widgets,
  live,
  scale = 1,
  selectedId,
  onSelect,
  onDuplicate,
  onRemove,
  onSend,
  onSendMany,
  onNova,
  onPlacePick
}: {
  columns: number
  widgets: OscWidget[]
  live: boolean
  scale?: number
  selectedId: string | null
  onSelect: (id: string) => void
  onDuplicate: (id: string) => void
  onRemove: (id: string) => void
  onSend: SendFn
  onSendMany: SendMany
  onNova: Nova
  onPlacePick?: (gx: number, gy: number, clientX: number, clientY: number) => void
}): JSX.Element {
  const gridRef = useRef<HTMLDivElement>(null)
  // Merkt sich, wo ein Druck begann -> ein Klick nach Drag/Resize (Bewegung oder
  // Start auf einer Kachel) öffnet NICHT den Picker.
  const downRef = useRef<{ x: number; y: number; onGrid: boolean }>({ x: 0, y: 0, onGrid: false })
  // Zelle unter dem Cursor (nur leere Fläche, Edit) -> Hover-Hinweis „hier einfügen".
  const [hoverCell, setHoverCell] = useState<{ gx: number; gy: number } | null>(null)
  const maxBottom = widgets.reduce((m, w) => Math.max(m, w.gy + w.ch), 0)
  const rows = live ? Math.max(maxBottom, 1) : Math.max(maxBottom + 3, 10)

  function handleGridPointerDown(e: ReactPointerEvent<HTMLDivElement>): void {
    downRef.current = { x: e.clientX, y: e.clientY, onGrid: e.target === gridRef.current }
  }

  /** Rasterzelle aus Bildschirmkoordinaten (berücksichtigt die Vorschau-Skalierung). */
  function cellAt(clientX: number, clientY: number): { gx: number; gy: number } | null {
    const grid = gridRef.current
    if (!grid) return null
    const rect = grid.getBoundingClientRect()
    const colStep = (grid.clientWidth + GAP) / columns
    const rowStep = ROW_H + GAP
    const gx = Math.max(
      0,
      Math.min(columns - 1, Math.floor((clientX - rect.left) / scale / colStep))
    )
    const gy = Math.max(0, Math.floor((clientY - rect.top) / scale / rowStep))
    return { gx, gy }
  }

  // Hover über leere Fläche -> Zelle hervorheben (Rahmen + Plus signalisiert „hier
  // klicken zum Einfügen"). Über Kacheln/Live nichts.
  function handleGridMove(e: ReactMouseEvent<HTMLDivElement>): void {
    if (live || !onPlacePick || e.target !== gridRef.current) {
      if (hoverCell) setHoverCell(null)
      return
    }
    const c = cellAt(e.clientX, e.clientY)
    if (c && (!hoverCell || hoverCell.gx !== c.gx || hoverCell.gy !== c.gy)) setHoverCell(c)
  }

  // Klick auf die leere Rasterfläche (nur Edit) -> Picker an der Zelle öffnen
  // (Klicks auf/aus Kacheln oder nach Drag/Resize werden ignoriert).
  function handleEmptyClick(e: ReactMouseEvent<HTMLDivElement>): void {
    const grid = gridRef.current
    if (live || !onPlacePick || !grid || e.target !== grid) return
    const d = downRef.current
    const moved = Math.abs(e.clientX - d.x) > 4 || Math.abs(e.clientY - d.y) > 4
    if (!d.onGrid || moved) return
    const c = cellAt(e.clientX, e.clientY)
    if (c) onPlacePick(c.gx, c.gy, e.clientX, e.clientY)
  }

  return (
    <div
      ref={gridRef}
      onPointerDown={handleGridPointerDown}
      onClick={handleEmptyClick}
      onMouseMove={handleGridMove}
      onMouseLeave={() => setHoverCell(null)}
      className="grid select-none"
      style={{
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gridAutoRows: `${ROW_H}px`,
        gap: `${GAP}px`
      }}
    >
      {!live && <GridBackdrop columns={columns} rows={rows} />}
      {!live && hoverCell && (
        <div
          className="pointer-events-none z-0 flex items-center justify-center rounded-[4px] border-2 border-dashed border-primary/70 bg-primary/10 text-primary"
          style={{ gridColumn: `${hoverCell.gx + 1}`, gridRow: `${hoverCell.gy + 1}` }}
        >
          <Plus className="size-4" />
        </div>
      )}
      {widgets.map((w) => (
        <WidgetTile
          key={w.id}
          w={w}
          live={live}
          selected={w.id === selectedId}
          columns={columns}
          gridRef={gridRef}
          scale={scale}
          onSelect={onSelect}
          onSend={onSend}
          onSendMany={onSendMany}
          onNova={onNova}
          onDuplicate={onDuplicate}
          onRemove={onRemove}
        />
      ))}
    </div>
  )
})

/** Klick-zum-Einfügen: kleine Palette am Klickpunkt; Auswahl fügt das Widget an
 *  der angeklickten Zelle ein. Per fixed positioniert (außerhalb der skalierten
 *  Geräte-Vorschau gerendert, daher Viewport-Koordinaten). */
export function WidgetPicker({
  x,
  y,
  onPick,
  onPickNova,
  onClose
}: {
  x: number
  y: number
  onPick: (t: OscWidgetType) => void
  onPickNova: (kind: NovaWidgetKind) => void
  onClose: () => void
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  // Schließen erfolgt über Escape, Auswahl oder einen weiteren Klick auf die
  // Arbeitsfläche (Toggle im Aufrufer) – kein eigener Outside-Click-Listener,
  // damit der Flächen-Klick nicht sofort wieder einen neuen Picker öffnet.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  // am Klickpunkt verankern, aber im Viewport halten (höher wegen NovaStar-Block)
  const left = Math.max(8, Math.min(x, window.innerWidth - 220))
  const top = Math.max(8, Math.min(y, window.innerHeight - 420))
  return (
    <div
      ref={ref}
      style={{ position: 'fixed', left, top, zIndex: 50 }}
      className="max-h-[80vh] w-52 select-none overflow-auto rounded-lg border border-border bg-card p-2 shadow-xl"
    >
      <p className="mb-1.5 px-1 text-xs text-muted-foreground">Widget einfügen</p>
      <div className="grid grid-cols-2 gap-1.5">
        {WIDGET_ORDER.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onPick(t)}
            className="flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-left text-xs hover:border-primary/50 hover:bg-muted/40"
          >
            <Plus className="size-3 shrink-0" /> {WIDGET_TYPE_LABEL[t]}
          </button>
        ))}
      </div>
      {/* NovaStar-Bedienelemente: eigene Kacheln, die an den Prozessor senden. */}
      <p className="mb-1.5 mt-2.5 flex items-center gap-1 px-1 text-xs text-muted-foreground">
        <Tv className="size-3" /> NovaStar (LED)
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        {NOVA_PALETTE.map((e) => (
          <button
            key={e.kind}
            type="button"
            onClick={() => onPickNova(e.kind)}
            className="flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-left text-xs hover:border-primary/50 hover:bg-muted/40"
          >
            <Plus className="size-3 shrink-0" /> {e.label}
          </button>
        ))}
      </div>
    </div>
  )
}
