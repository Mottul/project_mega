import { useState } from 'react'
import { CalcPage, NumField, SectionCard, parseNum, trimNum } from '../_calc/ui'

// Kreisrechner: vier verknüpfte Felder (Durchmesser, Radius, Umfang, Fläche).
// Das zuletzt bearbeitete Feld ist die Quelle; die übrigen werden daraus berechnet.
type Field = 'd' | 'r' | 'c' | 'a'
const TAU = Math.PI * 2

export function CircleCalc(): JSX.Element {
  const [driver, setDriver] = useState<Field>('d')
  const [raw, setRaw] = useState('1')

  const base = parseNum(raw)
  const r =
    base == null || base < 0
      ? null
      : driver === 'd'
        ? base / 2
        : driver === 'r'
          ? base
          : driver === 'c'
            ? base / TAU
            : Math.sqrt(base / Math.PI) // aus Fläche
  const vals: Record<Field, number | null> = {
    d: r == null ? null : r * 2,
    r,
    c: r == null ? null : TAU * r,
    a: r == null ? null : Math.PI * r * r
  }

  function bind(field: Field): { value: string; onChange: (v: string) => void; onFocus: () => void } {
    return {
      value: field === driver ? raw : trimNum(vals[field]),
      onChange: (v) => {
        setDriver(field)
        setRaw(v)
      },
      onFocus: () => {
        if (field !== driver) {
          setDriver(field)
          setRaw(trimNum(vals[field]))
        }
      }
    }
  }

  return (
    <CalcPage>
      <SectionCard
        title="Kreisrechner"
        desc="Einen Wert eingeben – die anderen drei werden berechnet. Jedes Feld ist Eingabe und Ergebnis zugleich."
      >
        <NumField label="Durchmesser d" {...bind('d')} />
        <NumField label="Radius r" {...bind('r')} />
        <NumField label="Umfang U" {...bind('c')} />
        <NumField label="Fläche A" {...bind('a')} />
        <p className="pt-1 text-xs text-muted-foreground">
          Einheitenfrei: Längen in derselben Einheit (z. B. cm); die Fläche ist dann das Quadrat
          davon (cm²). U = π·d, A = π·r².
        </p>
      </SectionCard>
    </CalcPage>
  )
}
