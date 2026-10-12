// Themekonformes <select> als Komponente – eine Quelle für alle Auswahllisten der App, statt einer
// Klassenkette mit abgewandelten Kopien. Größen: `md` (Standard, Formulare und Schublade), `sm`
// (Leisten), `xs` (dichte Zeilen wie die Kategorie einer Packlisten-Position). Die Breite gibt der
// Aufrufer über className (meist `w-full` in Formularen).
import { forwardRef, type SelectHTMLAttributes } from 'react'
import { cn } from '@renderer/lib/utils'

const SIZES = {
  md: 'h-9 px-3 text-sm',
  sm: 'h-8 px-3 text-sm',
  xs: 'h-7 px-2 text-xs'
} as const

export type SelectSize = keyof typeof SIZES

export const Select = forwardRef<
  HTMLSelectElement,
  // `size` des HTML-Elements (Zeilen einer Liste) braucht die App nicht – hier ist es die Größe
  Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> & { size?: SelectSize }
>(({ size = 'md', className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      'rounded-md border border-border bg-input/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 disabled:cursor-not-allowed disabled:opacity-50',
      SIZES[size],
      className
    )}
    {...props}
  />
))
Select.displayName = 'Select'
