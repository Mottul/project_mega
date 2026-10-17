// Ziehen zum Sortieren mit HTML5-Drag-&-Drop – ohne Paket. Gezogen wird nur am Griff: Die Zeile
// wird erst beim Drücken des Griffs ziehbar, sonst ließe sich in ihren Eingabefeldern kein Text
// mehr markieren. Jede Liste hat ihre eigene Instanz; eine Zeile aus einer anderen Liste (Schritt
// über einem Block) wird nicht angenommen und das Ereignis läuft zur äußeren Liste weiter.
// Die Pfeil-Knöpfe bleiben daneben für die Tastatur.

import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import { GripVertical } from 'lucide-react'
import { cn } from '@renderer/lib/utils'

type Over = { id: string; after: boolean } | null

export interface Sortable {
  /** an die Zeile: Ziel und Markierung (`className` zeigt die Einfügestelle) */
  item: (id: string) => {
    ref: (el: HTMLElement | null) => void
    onDragStart: (e: DragEvent) => void
    onDragOver: (e: DragEvent) => void
    onDrop: (e: DragEvent) => void
    onDragEnd: () => void
    'data-sort-id': string
    className: string
  }
  /** an den Griff: macht die Zeile ziehbar, solange er gedrückt ist */
  handle: (id: string) => { onPointerDown: () => void }
}

/**
 * @param onMove „`from` vor bzw. hinter `to` setzen“ – rein umsetzen, z. B. mit `zieheNach`
 *   (`tools/mini-manual/aktionen.ts`)
 */
export function useSortable(onMove: (from: string, to: string, after: boolean) => void): Sortable {
  const els = useRef(new Map<string, HTMLElement>())
  const dragging = useRef<string | null>(null)
  const [over, setOver] = useState<Over>(null)
  const move = useRef(onMove)
  move.current = onMove

  const reset = useCallback(() => {
    for (const el of els.current.values()) el.draggable = false
    dragging.current = null
    setOver(null)
  }, [])

  // Griff gedrückt, aber nicht gezogen: Zeile wieder unbeweglich machen
  useEffect(() => {
    const up = (): void => {
      if (!dragging.current) for (const el of els.current.values()) el.draggable = false
    }
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
  }, [])

  return {
    item: (id) => ({
      ref: (el) => {
        if (el) els.current.set(id, el)
        else els.current.delete(id)
      },
      onDragStart: (e) => {
        // nur die eigene Zeile, nicht eine innere Liste, die das Ereignis hochreicht
        if (e.target !== els.current.get(id)) return
        dragging.current = id
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', id)
      },
      onDragOver: (e) => {
        if (!dragging.current) return
        e.preventDefault()
        e.stopPropagation()
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
        const after = e.clientY > r.top + r.height / 2
        setOver((o) => (o?.id === id && o.after === after ? o : { id, after }))
      },
      onDrop: (e) => {
        const from = dragging.current
        if (!from) return
        e.preventDefault()
        e.stopPropagation()
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
        if (from !== id) move.current(from, id, e.clientY > r.top + r.height / 2)
        reset()
      },
      onDragEnd: reset,
      'data-sort-id': id,
      className: cn(
        over?.id === id && !over.after && 'shadow-[0_-3px_0_0_hsl(var(--primary))]',
        over?.id === id && over.after && 'shadow-[0_3px_0_0_hsl(var(--primary))]'
      )
    }),
    handle: (id) => ({
      onPointerDown: () => {
        const el = els.current.get(id)
        if (el) el.draggable = true
      }
    })
  }
}

/** Griff zum Ziehen (die Zeile selbst wird gezogen) */
export function Griff({
  sort,
  id,
  was
}: {
  sort: Sortable
  id: string
  /** für die Beschriftung: „Block“, „Kapitel“ … */
  was: string
}): JSX.Element {
  return (
    <span
      {...sort.handle(id)}
      role="img"
      aria-label={`${was} ziehen zum Verschieben`}
      title="Ziehen zum Verschieben"
      className="flex shrink-0 cursor-grab touch-none items-center text-muted-foreground hover:text-foreground active:cursor-grabbing"
    >
      <GripVertical className="size-4" />
    </span>
  )
}
