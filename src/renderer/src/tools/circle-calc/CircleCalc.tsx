import { CalcPage, NumField, SectionCard, parseNum, trimNum, useLinkedFields } from '../_calc/ui'
import { circleFrom, type CircleField } from './math'

// Kreisrechner: vier verknüpfte Felder (Durchmesser, Radius, Umfang, Fläche).
// Das zuletzt bearbeitete Feld ist die Quelle; die übrigen rechnet math.ts daraus.

export function CircleCalc(): JSX.Element {
  const { driver, raw, bind } = useLinkedFields<CircleField>('d', '1')
  const vals = circleFrom(driver, parseNum(raw))
  // Rot ist nur eine Quelle mit negativem Wert – das sagt der Rechenkern
  const bad = (f: CircleField): boolean => vals.invalid.includes(f)

  return (
    <CalcPage>
      <SectionCard
        title="Kreis"
        desc="Einen Wert eingeben – die übrigen folgen."
        hint="Jedes Feld ist Eingabe und Ergebnis zugleich; berechnete Werte sind farbig. Ohne feste Einheit: Längen alle in derselben (z. B. cm), die Fläche dann im Quadrat davon (cm²). U = π · d, A = π · r²."
      >
        <NumField label="Durchmesser d" invalid={bad('d')} {...bind('d', trimNum(vals.d))} />
        <NumField label="Radius r" invalid={bad('r')} {...bind('r', trimNum(vals.r))} />
        <NumField label="Umfang U" invalid={bad('c')} {...bind('c', trimNum(vals.c))} />
        <NumField label="Fläche A" invalid={bad('a')} {...bind('a', trimNum(vals.a))} />
      </SectionCard>
    </CalcPage>
  )
}
