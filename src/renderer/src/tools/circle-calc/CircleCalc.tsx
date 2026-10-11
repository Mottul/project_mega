import { CalcPage, NumField, SectionCard, parseNum, trimNum, useLinkedFields } from '../_calc/ui'

// Kreisrechner: vier verknüpfte Felder (Durchmesser, Radius, Umfang, Fläche).
// Das zuletzt bearbeitete Feld ist die Quelle; die übrigen werden daraus berechnet.
type Field = 'd' | 'r' | 'c' | 'a'
const TAU = Math.PI * 2

export function CircleCalc(): JSX.Element {
  const { driver, raw, bind } = useLinkedFields<Field>('d', '1')

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

  return (
    <CalcPage>
      <SectionCard
        title="Kreis"
        desc="Einen Wert eingeben – die übrigen folgen."
        hint="Jedes Feld ist Eingabe und Ergebnis zugleich; berechnete Werte sind farbig. Ohne feste Einheit: Längen alle in derselben (z. B. cm), die Fläche dann im Quadrat davon (cm²). U = π · d, A = π · r²."
      >
        <NumField label="Durchmesser d" {...bind('d', trimNum(vals.d))} />
        <NumField label="Radius r" {...bind('r', trimNum(vals.r))} />
        <NumField label="Umfang U" {...bind('c', trimNum(vals.c))} />
        <NumField label="Fläche A" {...bind('a', trimNum(vals.a))} />
      </SectionCard>
    </CalcPage>
  )
}
