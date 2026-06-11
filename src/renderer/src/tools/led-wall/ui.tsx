// Kompaktes Eingabefeld für den LED-Wall-Konfigurator: Label OBEN, Einheit im
// Feld. Anders als das Rechner-NumField (Label links, feste Breite) bricht das
// in engen Karten-Spalten nicht um.

import { Input } from '@renderer/components/ui/input'

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
