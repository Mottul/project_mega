import { useDraft } from '@renderer/lib/useDraft'
import { cn } from '@renderer/lib/utils'
import { Input } from './input'

const fmt = (v: number, decimals: number): string =>
  new Intl.NumberFormat('de-DE', { maximumFractionDigits: decimals, useGrouping: false }).format(v)

/** „2,5“ und „2.5“ werden gelesen; leer oder ungültig -> null. */
export function parseDecimal(text: string): number | null {
  const t = text.trim().replace(',', '.')
  if (!t || !/^-?\d*\.?\d*$/.test(t)) return null
  const v = Number(t)
  return Number.isFinite(v) ? v : null
}

interface DecimalFieldProps {
  /** null = leer (z. B. „Vorgabe“ bzw. „bis zum Ende“) */
  value: number | null
  onCommit: (value: number | null) => void
  min?: number
  max?: number
  decimals?: number
  /** leeres Feld erlaubt (-> null); sonst springt es auf den alten Wert zurück */
  allowEmpty?: boolean
  suffix?: string
  placeholder?: string
  className?: string
  'aria-label'?: string
}

/**
 * Dezimalzahl mit Komma (Sekunden, dB …). Freies Tippen, geprüft und begrenzt erst beim
 * Verlassen oder Enter; externe Änderungen nur, wenn das Feld nicht fokussiert ist (useDraft).
 */
export function DecimalField({
  value,
  onCommit,
  min,
  max,
  decimals = 2,
  allowEmpty = false,
  suffix,
  placeholder,
  className,
  'aria-label': ariaLabel
}: DecimalFieldProps): JSX.Element {
  const external = value === null ? '' : fmt(value, decimals)
  const { ref, text, setText } = useDraft(external)

  function commit(): void {
    const parsed = parseDecimal(text)
    if (parsed === null) {
      if (allowEmpty && text.trim() === '') {
        onCommit(null)
        return
      }
      setText(external)
      return
    }
    let v = parsed
    if (min !== undefined) v = Math.max(min, v)
    if (max !== undefined) v = Math.min(max, v)
    const f = 10 ** decimals
    v = Math.round(v * f) / f
    setText(fmt(v, decimals))
    onCommit(v)
  }

  return (
    <div className={cn('relative', className)}>
      <Input
        ref={ref}
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={text}
        className={suffix ? 'pr-8' : undefined}
        onChange={(e) => setText(e.target.value.replace(/[^\d,.-]/g, ''))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit()
            ;(e.target as HTMLInputElement).blur()
          }
        }}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          {suffix}
        </span>
      )}
    </div>
  )
}
