import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@renderer/lib/utils'

/** Rahmen einer Knopfgruppe – auch für Schnellwahlen, die wie eine aussehen sollen (QuickPick) */
export const segmentGroupClass = 'rounded-md border border-border bg-muted/30 p-0.5'

/**
 * Ein Knopf der Gruppe. Gewählt: Fläche mit feinem Rand – im dunklen Design ist die Karte
 * dunkler als die Gruppe, ohne Rand verschwände die Wahl fast.
 */
export function segmentButtonClass(selected: boolean): string {
  return cn(
    'flex items-center justify-center gap-1.5 rounded px-2.5 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 disabled:cursor-not-allowed [@media(pointer:coarse)]:py-2.5',
    selected
      ? 'bg-card text-foreground shadow-sm ring-1 ring-border'
      : 'text-muted-foreground hover:text-foreground'
  )
}

/**
 * Wie viele Knöpfe je Reihe, gleichmäßig verteilt: 7 bei höchstens 4 je Reihe -> 4 + 3, 5 bei
 * höchstens 4 -> 3 + 2 (nicht 4 + 1). Die längeren Reihen stehen oben.
 */
export function balancedRows(count: number, maxPerRow: number): number[] {
  if (count <= 0) return []
  const rows = Math.ceil(count / Math.max(1, Math.floor(maxPerRow)))
  const base = Math.floor(count / rows)
  const extra = count % rows
  return Array.from({ length: rows }, (_, i) => base + (i < extra ? 1 : 0))
}

/** Wie viele Knöpfe von mindestens `minRem` Breite nebeneinander in das Element passen */
function useFitCount(ref: RefObject<HTMLElement>, minRem: number, count: number): number {
  const [fit, setFit] = useState(count)
  // vor dem Zeichnen messen: sonst stünden im ersten Bild alle Knöpfe in einer Reihe
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = (): void => {
      // in rem der Wurzel: der Kompaktmodus verkleinert sie, die Knöpfe schrumpfen mit
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
      const gap = 2
      const inner = el.clientWidth - 4 // p-0.5 links und rechts
      setFit(Math.max(1, Math.min(count, Math.floor((inner + gap) / (minRem * rem + gap)))))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref, minRem, count])
  return fit
}

type Option<T> = { value: T; label: string; Icon?: LucideIcon; iconOnly?: boolean }

/**
 * Umschalter aus mehreren Knöpfen (Text und/oder Symbol). `wrap`: Die Knöpfe brechen in Reihen
 * um, statt überzulaufen (viele Möglichkeiten in einem schmalen Fenster oder am Handy) – so
 * viele je Reihe, wie mit der Mindestbreite passen (Zahl in rem, sonst 6), und die Reihen
 * gleichmäßig gefüllt, jede über die ganze Breite: keine Lücke, kein einzelner Knopf unten.
 * Bei grobem Zeiger (Finger) sind die Knöpfe höher.
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  wrap = false,
  disabled = false,
  className
}: {
  label: string
  value: T
  options: Option<T>[]
  onChange: (v: T) => void
  wrap?: boolean | number
  disabled?: boolean
  className?: string
}): JSX.Element {
  // in Reihen gleich breit (min-w-0, die Mindestbreite sichert der Umbruch), sonst so breit wie
  // ihr Text
  const button = (o: Option<T>, equal = false): JSX.Element => (
    <button
      key={o.value}
      type="button"
      disabled={disabled}
      aria-pressed={value === o.value}
      title={o.label}
      aria-label={o.iconOnly ? o.label : undefined}
      onClick={() => onChange(o.value)}
      className={cn(segmentButtonClass(value === o.value), 'flex-1', equal && 'min-w-0 px-1')}
    >
      {o.Icon && <o.Icon className="size-4 shrink-0" />}
      {!o.iconOnly && o.label}
    </button>
  )
  const group = cn(segmentGroupClass, disabled && 'opacity-50', className)
  if (wrap !== false) {
    return (
      <WrappedGroup
        label={label}
        className={group}
        minRem={typeof wrap === 'number' ? wrap : 6}
        options={options}
        render={(o) => button(o, true)}
      />
    )
  }
  return (
    <div role="group" aria-label={label} className={cn(group, 'flex')}>
      {options.map((o) => button(o))}
    </div>
  )
}

function WrappedGroup<T extends string>({
  label,
  className,
  minRem,
  options,
  render
}: {
  label: string
  className: string
  minRem: number
  options: Option<T>[]
  render: (o: Option<T>) => JSX.Element
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const fit = useFitCount(ref, minRem, options.length)
  let at = 0
  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      className={cn(className, 'flex flex-col gap-0.5')}
    >
      {balancedRows(options.length, fit).map((n) => {
        const row = options.slice(at, (at += n))
        return (
          <div key={row[0].value} className="flex gap-0.5">
            {row.map(render)}
          </div>
        )
      })}
    </div>
  )
}
