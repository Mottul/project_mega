import { forwardRef, type HTMLAttributes } from 'react'
import { cn } from '@renderer/lib/utils'

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('rounded-lg border border-border bg-card text-foreground', className)}
      {...props}
    />
  )
)
Card.displayName = 'Card'
