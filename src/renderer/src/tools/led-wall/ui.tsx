// Kompaktes Eingabefeld für den LED-Wall-Konfigurator: Label OBEN, Einheit im
// Feld. Anders als das Rechner-NumField (Label links, feste Breite) bricht das
// in engen Karten-Spalten nicht um.

import { useEffect, useState } from 'react'
import { Input } from '@renderer/components/ui/input'

/** Zahlenfeld, das den Wert ERST bei Blur/Enter übernimmt (und dann clamped) –
 *  so wird beim Tippen von „1" (für 10) nicht sofort der Mindestwert gesetzt.
 *  Bares Input (ohne Label-Wrapper), via className einsetzbar. */
export function NumCommit({
  value,
  onCommit,
  min,
  max,
  integer,
  className
}: {
  value: number
  onCommit: (v: number) => void
  min?: number
  max?: number
  integer?: boolean
  className?: string
}): JSX.Element {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  function commit(): void {
    let n = parseFloat(text.replace(',', '.'))
    if (!Number.isFinite(n)) {
      setText(String(value))
      return
    }
    if (integer) n = Math.round(n)
    if (min != null) n = Math.max(min, n)
    if (max != null) n = Math.min(max, n)
    onCommit(n)
    setText(String(n))
  }
  return (
    <Input
      inputMode="decimal"
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

export function LField({
  label,
  unit,
  value,
  onChange,
  placeholder,
  min,
  max,
  step,
  number
}: {
  label: string
  unit?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  min?: number
  max?: number
  step?: number
  number?: boolean // echtes number-Feld (für ganzzahlige Zähler), sonst dezimal-tolerant
}): JSX.Element {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      <div className="relative">
        <Input
          type={number ? 'number' : 'text'}
          inputMode={number ? 'numeric' : 'decimal'}
          value={value}
          placeholder={placeholder}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(e.target.value)}
          className={unit ? 'pr-9' : ''}
        />
        {unit && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {unit}
          </span>
        )}
      </div>
    </label>
  )
}
