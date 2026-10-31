import type { LucideIcon } from 'lucide-react'
import { cn } from '@renderer/lib/utils'

/** Reiter zum Umschalten zwischen Ansichten oder Seiten eines Werkzeugs. */
export function Reiter<T extends string>({
  label,
  value,
  options,
  onChange,
  className
}: {
  label: string
  value: T
  options: readonly { id: T; label: string; icon?: LucideIcon }[]
  onChange: (id: T) => void
  className?: string
}): JSX.Element {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn('flex rounded-md border border-border bg-muted/30 p-0.5', className)}
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            'flex items-center gap-1.5 rounded px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70',
            value === o.id
              ? 'bg-card font-medium text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {o.icon && <o.icon className="size-4" />}
          {o.label}
        </button>
      ))}
    </div>
  )
}
