// Storyboard: Elemente in Abspielreihenfolge – Kacheln mit Vorschaubild oder Liste (100+
// Fotos), dazwischen der Übergang, darunter ein Zeitlineal. Auswahl per Klick (Strg/Umschalt
// für mehrere), Umsortieren durch Ziehen (auch mehrere zugleich), Dateien lassen sich an eine
// Position ziehen.

import { useRef, useState, type DragEvent, type MouseEvent } from 'react'
import {
  AlertTriangle,
  Film,
  Image as ImageIcon,
  Loader2,
  Move,
  Repeat,
  Sparkles
} from 'lucide-react'
import { api } from '@renderer/lib/api'
import { cn } from '@renderer/lib/utils'
import type { VgenElement } from '@shared/types'
import { VGEN_TRANSITIONS, type VgenElementPlan, type VgenPlan } from '@shared/videoGenPlan'
import type { Meta } from './meta'
import { useThumb } from './meta'
import { basename, fmtDuration } from './presets'

const DRAG_TYPE = 'text/x-vgen-ids'
const transitionLabel = new Map(VGEN_TRANSITIONS.map((t) => [t.kind, t.label]))

export interface StoryboardProps {
  elements: VgenElement[]
  plan: VgenPlan | null
  meta: Record<string, Meta>
  selected: string[]
  view: 'tiles' | 'list'
  loop: boolean
  onSelect: (ids: string[]) => void
  onMove: (ids: string[], beforeId: string | null) => void
  onInsertFiles: (paths: string[], at: number | null) => void
  onRemove: (ids: string[]) => void
  onNudge: (dir: -1 | 1) => void
}

export function Storyboard(p: StoryboardProps): JSX.Element {
  const anchor = useRef<string | null>(null)
  const [dropAt, setDropAt] = useState<string | 'end' | null>(null)
  const byId = new Map(p.plan?.elements.map((e) => [e.id, e]) ?? [])
  const fps = p.plan?.fps ?? 25

  function click(e: MouseEvent, id: string): void {
    if (e.shiftKey && anchor.current) {
      const ids = p.elements.map((x) => x.id)
      const a = ids.indexOf(anchor.current)
      const b = ids.indexOf(id)
      if (a >= 0 && b >= 0) {
        p.onSelect(ids.slice(Math.min(a, b), Math.max(a, b) + 1))
        return
      }
    }
    anchor.current = id
    if (e.ctrlKey || e.metaKey) {
      p.onSelect(p.selected.includes(id) ? p.selected.filter((x) => x !== id) : [...p.selected, id])
    } else p.onSelect([id])
  }

  function dragStart(e: DragEvent, id: string): void {
    const ids = p.selected.includes(id) ? p.selected : [id]
    if (!p.selected.includes(id)) p.onSelect([id])
    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(ids))
    e.dataTransfer.effectAllowed = 'move'
  }

  function drop(e: DragEvent, beforeId: string | null): void {
    e.preventDefault()
    e.stopPropagation()
    setDropAt(null)
    const moving = e.dataTransfer.getData(DRAG_TYPE)
    if (moving) {
      try {
        const ids = JSON.parse(moving) as string[]
        if (Array.isArray(ids)) p.onMove(ids, beforeId)
      } catch {
        // fremde Daten – ignorieren
      }
      return
    }
    const paths = Array.from(e.dataTransfer.files)
      .map((f) => api.pathForFile(f))
      .filter(Boolean)
    if (!paths.length) return
    const at = beforeId === null ? null : p.elements.findIndex((x) => x.id === beforeId)
    p.onInsertFiles(paths, at === null || at < 0 ? null : at)
  }

  const over = (e: DragEvent, key: string | 'end'): void => {
    e.preventDefault()
    if (dropAt !== key) setDropAt(key)
  }

  return (
    <div
      tabIndex={0}
      className="space-y-3 outline-none"
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return
        if ((e.key === 'Delete' || e.key === 'Backspace') && p.selected.length) {
          e.preventDefault()
          p.onRemove(p.selected)
        } else if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault()
          p.onSelect(p.elements.map((x) => x.id))
        } else if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowUp')) {
          e.preventDefault()
          p.onNudge(-1)
        } else if (e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowDown')) {
          e.preventDefault()
          p.onNudge(1)
        } else if (e.key === 'Escape') p.onSelect([])
      }}
    >
      {p.view === 'tiles' ? (
        <div
          className="flex flex-wrap items-stretch gap-y-3"
          onDragOver={(e) => over(e, 'end')}
          onDragLeave={(e) => e.currentTarget === e.target && setDropAt(null)}
          onDrop={(e) => drop(e, null)}
        >
          {p.elements.map((el, i) => {
            const ep = byId.get(el.id)
            const last = i === p.elements.length - 1
            return (
              <div key={el.id} className="flex items-stretch">
                <Tile
                  el={el}
                  index={i}
                  ep={ep}
                  fps={fps}
                  meta={p.meta[el.path]}
                  selected={p.selected.includes(el.id)}
                  dropBefore={dropAt === el.id}
                  onClick={(e) => click(e, el.id)}
                  onDragStart={(e) => dragStart(e, el.id)}
                  onDragOver={(e) => over(e, el.id)}
                  onDrop={(e) => drop(e, el.id)}
                />
                {(!last || p.loop) && (
                  <TransitionChip ep={ep} fps={fps} loop={last} onClick={(e) => click(e, el.id)} />
                )}
              </div>
            )
          })}
          <div
            className={cn(
              'ml-1 w-1 self-stretch rounded transition-colors',
              dropAt === 'end' ? 'bg-primary' : 'bg-transparent'
            )}
          />
        </div>
      ) : (
        <div
          className="divide-y divide-border rounded-md border border-border"
          onDragOver={(e) => over(e, 'end')}
          onDrop={(e) => drop(e, null)}
        >
          {p.elements.map((el, i) => (
            <Row
              key={el.id}
              el={el}
              index={i}
              ep={byId.get(el.id)}
              fps={fps}
              meta={p.meta[el.path]}
              selected={p.selected.includes(el.id)}
              dropBefore={dropAt === el.id}
              last={i === p.elements.length - 1}
              loop={p.loop}
              onClick={(e) => click(e, el.id)}
              onDragStart={(e) => dragStart(e, el.id)}
              onDragOver={(e) => over(e, el.id)}
              onDrop={(e) => drop(e, el.id)}
            />
          ))}
        </div>
      )}
      {p.plan && p.plan.totalFrames > 0 && (
        <Ruler plan={p.plan} selected={p.selected} onSelect={(id) => p.onSelect([id])} />
      )}
    </div>
  )
}

/* --------------------------------- Kachel ---------------------------------- */

interface ItemProps {
  el: VgenElement
  index: number
  ep: VgenElementPlan | undefined
  fps: number
  meta: Meta | undefined
  selected: boolean
  dropBefore: boolean
  onClick: (e: MouseEvent) => void
  onDragStart: (e: DragEvent) => void
  onDragOver: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
}

function KindIcon({ el, className }: { el: VgenElement; className?: string }): JSX.Element {
  if (el.kind === 'video') return <Film className={className} />
  if (el.kind === 'gif') return <Sparkles className={className} />
  return <ImageIcon className={className} />
}

function Thumb({ el, className }: { el: VgenElement; className: string }): JSX.Element {
  const { ref, url } = useThumb(el.path, el.kind === 'video' ? (el.inSec ?? 0) : null)
  return (
    <div ref={ref} className={cn('overflow-hidden bg-black/60', className)}>
      {url ? (
        <img src={url} alt="" draggable={false} className="size-full object-cover" />
      ) : url === null ? (
        <div className="flex size-full items-center justify-center text-muted-foreground">
          <KindIcon el={el} className="size-5" />
        </div>
      ) : (
        <div className="flex size-full items-center justify-center text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
        </div>
      )}
    </div>
  )
}

function durationOf(ep: VgenElementPlan | undefined, fps: number): string {
  return ep ? fmtDuration(ep.frames / fps) : '…'
}

function Tile(p: ItemProps): JSX.Element {
  const error = p.meta?.kind === 'error'
  const kb = p.ep?.kenBurns
  return (
    <div className="flex items-stretch">
      <div
        className={cn(
          'mr-1 w-1 rounded transition-colors',
          p.dropBefore ? 'bg-primary' : 'bg-transparent'
        )}
      />
      <button
        type="button"
        draggable
        onClick={p.onClick}
        onDragStart={p.onDragStart}
        onDragOver={p.onDragOver}
        onDrop={p.onDrop}
        title={error ? `${p.el.path}\n${(p.meta as { message: string }).message}` : p.el.path}
        aria-pressed={p.selected}
        className={cn(
          'flex w-40 flex-col overflow-hidden rounded-md border bg-card text-left transition-colors',
          p.selected
            ? 'border-primary ring-2 ring-primary/40'
            : 'border-border hover:border-primary/50',
          error && 'border-destructive'
        )}
      >
        <div className="relative">
          <Thumb el={p.el} className="aspect-video w-full" />
          <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[10px] tabular-nums text-white">
            {p.index + 1}
          </span>
          {error && (
            <span className="absolute right-1 top-1 rounded bg-destructive px-1 text-white">
              <AlertTriangle className="size-3" />
            </span>
          )}
        </div>
        <div className="space-y-0.5 px-2 py-1.5">
          <p className="truncate text-xs font-medium">{basename(p.el.path)}</p>
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <KindIcon el={p.el} className="size-3" />
            <span className="tabular-nums">{durationOf(p.ep, p.fps)}</span>
            {kb && (
              <span title={`Ken Burns: ${kb.mode}`} className="ml-auto flex items-center">
                <Move className="size-3" />
              </span>
            )}
          </p>
        </div>
      </button>
    </div>
  )
}

function TransitionChip({
  ep,
  fps,
  loop,
  onClick
}: {
  ep: VgenElementPlan | undefined
  fps: number
  loop: boolean
  onClick: (e: MouseEvent) => void
}): JSX.Element {
  const tr = ep?.transition
  const shortened = tr && tr.frames < tr.requestedFrames
  const label = tr ? (transitionLabel.get(tr.kind) ?? tr.kind) : '…'
  return (
    <button
      type="button"
      onClick={onClick}
      title={
        (loop ? 'Schleife: Übergang in den Anfang – ' : 'Übergang – ') +
        label +
        (tr && tr.frames > 0 ? ` ${fmtDuration(tr.frames / fps)}` : '') +
        (shortened ? ' (gekürzt)' : '')
      }
      className={cn(
        'mx-1 flex w-[4.75rem] flex-col items-center justify-center gap-0.5 self-center rounded-md border border-dashed px-1 py-1.5 text-[10px] leading-tight text-muted-foreground hover:border-primary/60 hover:text-foreground',
        shortened ? 'border-amber-500/70 text-amber-400 light:text-amber-700' : 'border-border'
      )}
    >
      {loop ? <Repeat className="size-3.5" /> : <span className="text-xs">⇄</span>}
      <span className="w-full truncate text-center">{label}</span>
      {tr && tr.frames > 0 && <span className="tabular-nums">{fmtDuration(tr.frames / fps)}</span>}
    </button>
  )
}

/* ---------------------------------- Liste ---------------------------------- */

function Row(p: ItemProps & { last: boolean; loop: boolean }): JSX.Element {
  const error = p.meta?.kind === 'error'
  const tr = p.ep?.transition
  const showTr = !p.last || p.loop
  return (
    <div
      role="button"
      tabIndex={-1}
      draggable
      onClick={p.onClick}
      onDragStart={p.onDragStart}
      onDragOver={p.onDragOver}
      onDrop={p.onDrop}
      title={error ? (p.meta as { message: string }).message : p.el.path}
      className={cn(
        'flex cursor-default items-center gap-3 px-2 py-1.5 text-sm',
        p.selected ? 'bg-primary/10' : 'hover:bg-muted/40',
        p.dropBefore && 'border-t-2 border-t-primary',
        error && 'text-destructive'
      )}
    >
      <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {p.index + 1}
      </span>
      <Thumb el={p.el} className="h-9 w-16 shrink-0 rounded" />
      <KindIcon el={p.el} className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{basename(p.el.path)}</span>
      <span className="w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {p.ep ? `ab ${fmtDuration(Math.max(0, p.ep.start) / p.fps)}` : ''}
      </span>
      <span className="w-16 shrink-0 text-right text-xs tabular-nums">
        {durationOf(p.ep, p.fps)}
      </span>
      <span className="w-36 shrink-0 truncate text-xs text-muted-foreground">
        {showTr && tr
          ? `${p.last ? '↺ ' : '⇄ '}${transitionLabel.get(tr.kind) ?? tr.kind}${tr.frames > 0 ? ` ${fmtDuration(tr.frames / p.fps)}` : ''}`
          : ''}
      </span>
    </div>
  )
}

/* -------------------------------- Zeitlineal ------------------------------- */

function Ruler({
  plan,
  selected,
  onSelect
}: {
  plan: VgenPlan
  selected: string[]
  onSelect: (id: string) => void
}): JSX.Element {
  const total = plan.totalFrames
  const sec = plan.durationSec
  const step = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600].find((s) => sec / s <= 12) ?? 1200
  const ticks = Array.from({ length: Math.floor(sec / step) + 1 }, (_, i) => i * step)
  return (
    <div className="space-y-1">
      <div className="relative h-6 overflow-hidden rounded border border-border bg-muted/30">
        {plan.elements.map((e, i) => {
          const start = Math.max(0, e.start)
          const end = Math.min(total, e.start + e.frames)
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => onSelect(e.id)}
              title={`${i + 1}: ${basename(e.path)}`}
              className={cn(
                'absolute inset-y-0 border-r border-background/60',
                selected.includes(e.id)
                  ? 'bg-primary/70'
                  : i % 2
                    ? 'bg-primary/25 hover:bg-primary/40'
                    : 'bg-primary/15 hover:bg-primary/40'
              )}
              style={{
                left: `${(start / total) * 100}%`,
                width: `${((end - start) / total) * 100}%`
              }}
            />
          )
        })}
      </div>
      <div className="relative h-4 text-[10px] tabular-nums text-muted-foreground">
        {ticks.map((t) => {
          const at = Math.min(100, (t / sec) * 100)
          // Ränder: Beschriftung nach innen statt mittig (sonst bricht sie am Rand um)
          const shift = at < 3 ? '' : at > 97 ? '-translate-x-full' : '-translate-x-1/2'
          return (
            <span
              key={t}
              className={cn('absolute whitespace-nowrap', shift)}
              style={{ left: `${at}%` }}
            >
              {fmtDuration(t)}
            </span>
          )
        })}
      </div>
    </div>
  )
}
