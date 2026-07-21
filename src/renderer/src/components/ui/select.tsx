import type { SelectHTMLAttributes } from 'react'
import { cn } from '@renderer/lib/utils'

// Themekonformes <select>. Eine Quelle statt bislang mehrerer Kopien der
// Klassenkette. Ohne feste Breite -> `w-full` (o.ä.) bei Bedarf über className.
export const selectClass =
  'h-9 rounded-md border border-border bg-input/40 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70'

export function Select({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>): JSX.Element {
  return <select className={cn(selectClass, className)} {...props} />
}
