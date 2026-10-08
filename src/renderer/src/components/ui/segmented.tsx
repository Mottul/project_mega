import type { LucideIcon } from 'lucide-react'
import { cn } from '@renderer/lib/utils'

/** Umschalter aus mehreren Knöpfen (Text und/oder Symbol). */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className
}: {
  label: string
  value: T
  options: { value: T; label: string; Icon?: LucideIcon; iconOnly?: boolean }[]
  onChange: (v: T) => void
  className?: string
}): JSX.Element {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn('flex rounded-md border border-border bg-muted/30 p-0.5', className)}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          title={o.label}
          aria-label={o.iconOnly ? o.label : undefined}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded px-2.5 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70',
            value === o.value
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {o.Icon && <o.Icon className="size-4" />}
          {!o.iconOnly && o.label}
        </button>
      ))}
    </div>
  )
}
