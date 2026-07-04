import { cn } from '@renderer/lib/utils'
import type { HTMLAttributes } from 'react'

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  info: 'bg-primary/20 text-primary',
  success: 'bg-emerald-500/20 text-emerald-400 light:text-emerald-700',
  warning: 'bg-amber-500/20 text-amber-400 light:text-amber-700',
  danger: 'bg-destructive/20 text-red-400 light:text-red-600'
}

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
  /** Führender, pulsierender Punkt in der Ton-Farbe – für „aktiv/läuft"-Indikatoren. */
  dot?: boolean
}

export function Badge({
  className,
  tone = 'neutral',
  dot = false,
  children,
  ...props
}: BadgeProps): JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        tones[tone],
        className
      )}
      {...props}
    >
      {dot && <span className="size-1.5 animate-pulse rounded-full bg-current" />}
      {children}
    </span>
  )
}
