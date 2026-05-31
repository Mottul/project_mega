import { cn } from '@renderer/lib/utils'

interface ProgressProps {
  /** 0..1 */
  value: number
  className?: string
  indeterminate?: boolean
}

export function Progress({ value, className, indeterminate }: ProgressProps): JSX.Element {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}>
      <div
        className={cn(
          'h-full rounded-full bg-primary transition-[width] duration-200',
          indeterminate && 'w-1/3 animate-pulse'
        )}
        style={indeterminate ? undefined : { width: `${pct}%` }}
      />
    </div>
  )
}
