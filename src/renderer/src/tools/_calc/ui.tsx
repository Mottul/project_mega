// Gemeinsame Bausteine der Rechner-Tools: schlankes, einheitliches Formular-Layout
// (Label links, Eingabe rechts mit Einheit), Ergebnis-Zeilen und Zahl-Helfer.
// Bewusst dezimalfähig (NumberField rundet auf ganze Zahlen -> hier nicht nutzbar).
import type { ReactNode } from 'react'
import { Card } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'

export const selectClass =
  'h-9 w-full rounded-md border border-border bg-input/40 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70'

/** Zentrierte Rechner-Seite (in den Tool-Host eingebettet, scrollbar). */
export function CalcPage({ children }: { children: ReactNode }): JSX.Element {
  return <div className="mx-auto max-w-2xl space-y-5 p-6">{children}</div>
}

export function SectionCard({
  title,
  desc,
  children
}: {
  title: string
  desc?: string
  children: ReactNode
}): JSX.Element {
  return (
    <Card className="p-5">
      <h2 className="font-medium">{title}</h2>
      {desc && <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>}
      <div className="mt-4 space-y-3">{children}</div>
    </Card>
  )
}

/** Eingabe- oder (readOnly) Ergebnisfeld mit Label und Einheit. */
export function NumField({
  label,
  unit,
  value,
  onChange,
  onFocus,
  readOnly,
  placeholder
}: {
  label: string
  unit?: string
  value: string
  onChange?: (v: string) => void
  onFocus?: () => void
  readOnly?: boolean
  placeholder?: string
}): JSX.Element {
  return (
    <label className="flex items-center gap-3">
      <span className="w-44 shrink-0 text-sm text-muted-foreground">{label}</span>
      <div className="relative flex-1">
        <Input
          inputMode="decimal"
          value={value}
          placeholder={placeholder}
          readOnly={readOnly}
          onFocus={onFocus}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          className={`${unit ? 'pr-12' : ''} ${readOnly ? 'cursor-default bg-muted/30' : ''}`}
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

export function SelectField({
  label,
  value,
  onChange,
  children
}: {
  label: string
  value: string
  onChange: (v: string) => void
  children: ReactNode
}): JSX.Element {
  return (
    <label className="flex items-center gap-3">
      <span className="w-44 shrink-0 text-sm text-muted-foreground">{label}</span>
      <select className={`${selectClass} flex-1`} value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </label>
  )
}

/** Hervorgehobene Ergebniszeile. */
export function Readout({
  label,
  value,
  unit,
  big
}: {
  label: string
  value: string
  unit?: string
  big?: boolean
}): JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-3 rounded-md border border-border bg-muted/20 px-3 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`tabular-nums ${big ? 'text-lg font-semibold' : 'font-medium'}`}>
        {value || '–'}
        {unit && value && <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span>}
      </span>
    </div>
  )
}

/** Text -> Zahl (akzeptiert Komma als Dezimaltrenner). Leer/ungültig -> null. */
export function parseNum(s: string): number | null {
  const t = (s ?? '').replace(',', '.').trim()
  if (t === '' || t === '-' || t === '.' || !/^-?\d*\.?\d*$/.test(t)) return null
  const v = Number(t)
  return Number.isFinite(v) ? v : null
}

/** Zahl als editierbarer Klartext (ohne Tausenderpunkte), auf n Stellen gekürzt. */
export function trimNum(n: number | null, digits = 4): string {
  if (n == null || !Number.isFinite(n)) return ''
  return String(Number(n.toFixed(digits)))
}

/** Zahl hübsch für Ergebnisse (de-DE, Tausenderpunkte). */
export function fmt(n: number | null, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return ''
  return Number(n.toFixed(digits)).toLocaleString('de-DE', { maximumFractionDigits: digits })
}
