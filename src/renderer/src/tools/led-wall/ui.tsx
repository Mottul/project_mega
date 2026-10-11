// Eingabe-Bausteine des LED-Wall-Konfigurators (Schublade).

import { Input } from '@renderer/components/ui/input'
import { useDraft } from '@renderer/lib/useDraft'
import { cn } from '@renderer/lib/utils'

/** Zahlenfeld, das den Wert ERST bei Blur/Enter übernimmt (und dann clamped) –
 *  so wird beim Tippen von „1" (für 10) nicht sofort der Mindestwert gesetzt.
 *  Bares Input (ohne Label-Wrapper), via className einsetzbar. */
export function NumCommit({
  value,
  onCommit,
  min,
  max,
  integer,
  className,
  'aria-label': ariaLabel
}: {
  value: number
  onCommit: (v: number) => void
  min?: number
  max?: number
  integer?: boolean
  className?: string
  'aria-label'?: string
}): JSX.Element {
  const { ref, text, setText } = useDraft(String(value).replace('.', ','))
  function commit(): void {
    let n = parseFloat(text.replace(',', '.'))
    if (!Number.isFinite(n)) {
      setText(String(value).replace('.', ','))
      return
    }
    if (integer) n = Math.round(n)
    if (min != null) n = Math.max(min, n)
    if (max != null) n = Math.min(max, n)
    onCommit(n)
    setText(String(n).replace('.', ','))
  }
  return (
    <Input
      ref={ref}
      inputMode="decimal"
      aria-label={ariaLabel}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commit()
          ;(e.target as HTMLInputElement).blur()
        }
      }}
      className={className}
    />
  )
}

/**
 * Textfeld für Maße mit Einheit im Feld (Komma-tolerant; geparst wird beim Rechnen). Ohne
 * eigene Beschriftung – steht in einem `Field`, dessen <label> das Feld umschließt.
 */
export function UnitInput({
  value,
  onChange,
  unit,
  placeholder,
  className
}: {
  value: string
  onChange: (v: string) => void
  unit?: string
  placeholder?: string
  className?: string
}): JSX.Element {
  return (
    <div className={cn('relative', className)}>
      <Input
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={unit ? 'pr-9' : ''}
      />
      {unit && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          {unit}
        </span>
      )}
    </div>
  )
}
