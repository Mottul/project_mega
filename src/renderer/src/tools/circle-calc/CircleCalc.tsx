import { CalcPage, NumField, SectionCard, parseNum, trimNum, useLinkedFields } from '../_calc/ui'
import { circleFrom, type CircleField } from './math'

// Kreisrechner: vier verknüpfte Felder (Durchmesser, Radius, Umfang, Fläche).
// Das zuletzt bearbeitete Feld ist die Quelle; die übrigen rechnet math.ts daraus.

export function CircleCalc(): JSX.Element {
  const { driver, raw, bind } = useLinkedFields<CircleField>('d', '1')
  const vals = circleFrom(driver, parseNum(raw))

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
