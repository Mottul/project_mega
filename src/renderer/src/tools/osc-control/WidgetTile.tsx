// Kachel der OSC-Steuerung: Rahmen um ein Bedienelement, im Edit-Modus verschieb- und ziehbar.

import {
  memo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject
} from 'react'
import { Copy, Trash2 } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { MAX_CH, useOscSurface, type OscWidget } from './store'
import { clampInt, GAP, type Nova, ROW_H, type SendFn, type SendMany } from './oscShared'
import { Fader, Knob, Momentary, SelectPad, Toggle, XYPad } from './Controls'
import { ColorPad } from './ColorPad'
import { LabelView, Meter } from './Displays'
import { BankGrid } from './BankGrid'

/* ------------------------------- Kachel --------------------------------- */

// Schwach sichtbares Raster im Edit-Modus (Zellen als nicht-interaktive Kacheln
// hinter den Widgets) -> man sieht, wo gerastert wird.
export function GridBackdrop({ columns, rows }: { columns: number; rows: number }): JSX.Element {
  const cells: JSX.Element[] = []
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      cells.push(
        <div
          key={`${x}-${y}`}
          style={{ gridColumn: `${x + 1}`, gridRow: `${y + 1}` }}
          className="pointer-events-none rounded-[3px] border border-dashed border-border/40"
        />
      )
    }
  }
  return <>{cells}</>
}

// memo: OSC-Feedback/Log-Spam rendert sonst bei JEDER Nachricht ALLE Kacheln neu.
// Der Store erhält die Identität unveränderter Widgets, die Callbacks sind
// id-basiert und stabil -> nur tatsächlich betroffene Kacheln rendern.
export const WidgetTile = memo(function WidgetTile({
  w,
  live,
  selected,
  columns,
  gridRef,
  scale = 1,
  onSelect,
  onSend,
  onSendMany,
  onNova,
  onDuplicate,
  onRemove
}: {
  w: OscWidget
  live: boolean
  selected: boolean
  columns: number
  gridRef: RefObject<HTMLDivElement>
  scale?: number
  onSelect: (id: string) => void
  onSend: SendFn
  onSendMany: SendMany
  onNova: Nova
  onDuplicate: (id: string) => void
  onRemove: (id: string) => void
}): JSX.Element {
  const tileRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const gx = Math.min(Math.max(0, w.gx), columns - 1)
  const cw = Math.min(w.cw, columns - gx)
  // Sehr flach (1 Zeile): Beschriftung weglassen, damit der Regler nicht
  // verschwindet -> ein 1×1-Taster zeigt weiterhin einen Taster.
  const compact = w.ch <= 1

  // Kachel ziehen = im Raster verschieben. Griffe/Buttons sind data-no-drag und
  // starten kein Verschieben.
  function startDrag(e: ReactPointerEvent): void {
    if (live) return
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return
    onSelect(w.id)
    const grid = gridRef.current
    if (!grid) return
    const colStep = (grid.clientWidth + GAP) / columns
    const rowStep = ROW_H + GAP
    const sgx = gx
    const sgy = w.gy
    const spx = e.clientX
    const spy = e.clientY
    setDragging(true)
    const move = (ev: PointerEvent): void => {
      // In der skalierten Geräte-Vorschau zeigt der Zeiger Bildschirm-Pixel ->
      // durch scale teilen, um Layout-Pixel zu erhalten.
      const ngx = clampInt(sgx + (ev.clientX - spx) / scale / colStep, 0, columns - cw)
      const ngy = Math.max(0, Math.round(sgy + (ev.clientY - spy) / scale / rowStep))
      useOscSurface.getState().moveWidgetTo(w.id, ngx, ngy)
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setDragging(false)
      useOscSurface.getState().settleWidget(w.id) // Überlappung auflösen
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function startResize(e: ReactPointerEvent): void {
    e.preventDefault()
    const grid = gridRef.current
    const tile = tileRef.current
    if (!grid || !tile) return
    const colStep = (grid.clientWidth + GAP) / columns
    const rowStep = ROW_H + GAP
    const rect = tile.getBoundingClientRect()
    const left = rect.left
    const top = rect.top
    const move = (ev: PointerEvent): void => {
      const ncw = clampInt(((ev.clientX - left) / scale + GAP) / colStep, 1, columns - gx)
      const nch = clampInt(((ev.clientY - top) / scale + GAP) / rowStep, 1, MAX_CH)
      useOscSurface.getState().resizeWidget(w.id, ncw, nch)
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      useOscSurface.getState().settleWidget(w.id) // Überlappung auflösen
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const showAddr =
    !live &&
    w.ch >= 2 &&
    w.type !== 'label' &&
    w.type !== 'select' &&
    w.type !== 'bank' &&
    !(w.type === 'meter' && w.source === 'video')

  return (
    <div
      ref={tileRef}
      onPointerDown={startDrag}
      style={{ gridColumn: `${gx + 1} / span ${cw}`, gridRow: `${w.gy + 1} / span ${w.ch}` }}
      className={cn(
        'group relative z-10 flex h-full min-h-0 flex-col rounded-lg border bg-card transition-colors',
        compact ? 'p-1' : 'p-2',
        selected && !live ? 'border-foreground/60 ring-1 ring-foreground/30' : 'border-border',
        !live && 'cursor-move hover:border-foreground/40',
        dragging && 'z-20 opacity-80 shadow-lg'
      )}
    >
      {!compact && w.type !== 'label' && (
        <div className="mb-1 flex items-center gap-1.5">
          <span className="size-2 shrink-0 rounded-full" style={{ background: w.color }} />
          <span className="truncate text-xs font-medium" title={w.label}>
            {w.label || '—'}
          </span>
        </div>
      )}

      <div className={cn('min-h-0 flex-1', !live && 'pointer-events-none')}>
        {w.type === 'fader' && <Fader w={w} onSend={onSend} onNova={onNova} />}
        {w.type === 'knob' && <Knob w={w} onSend={onSend} />}
        {w.type === 'toggle' && <Toggle w={w} onSend={onSend} onNova={onNova} />}
        {w.type === 'button' && <Momentary w={w} onSend={onSend} onNova={onNova} />}
        {w.type === 'xy' && <XYPad w={w} onSendMany={onSendMany} />}
        {w.type === 'color' && <ColorPad w={w} onSend={onSend} />}
        {w.type === 'label' && <LabelView w={w} />}
        {w.type === 'meter' && <Meter w={w} />}
        {w.type === 'select' && <SelectPad w={w} onSend={onSend} onNova={onNova} />}
        {w.type === 'bank' && <BankGrid w={w} onSend={onSend} />}
      </div>

      {showAddr && (
        <div
          className="mt-1 truncate pr-4 font-mono text-[10px] text-muted-foreground"
          title={w.address}
        >
          {w.address}
          {w.type === 'xy' && w.addressY ? `  ${w.addressY}` : ''}
        </div>
      )}

      {!live && (
        <>
          <div
            data-no-drag
            className="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100"
          >
            <TileBtn title="Duplizieren" onClick={() => onDuplicate(w.id)}>
              <Copy className="size-3.5" />
            </TileBtn>
            <TileBtn title="Entfernen" onClick={() => onRemove(w.id)}>
              <Trash2 className="size-3.5" />
            </TileBtn>
          </div>
          <div
            data-no-drag
            onPointerDown={startResize}
            title="Größe ziehen"
            className="absolute bottom-0 right-0 flex size-4 cursor-nwse-resize items-end justify-end p-0.5 text-muted-foreground/60 hover:text-foreground"
          >
            <svg viewBox="0 0 6 6" className="size-2.5 fill-current">
              <circle cx="5" cy="5" r="0.8" />
              <circle cx="5" cy="2.5" r="0.8" />
              <circle cx="2.5" cy="5" r="0.8" />
            </svg>
          </div>
        </>
      )}
    </div>
  )
})

function TileBtn({
  title,
  disabled,
  onClick,
  children
}: {
  title: string
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}): JSX.Element {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="rounded bg-background/80 p-1 text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
    >
      {children}
    </button>
  )
}
