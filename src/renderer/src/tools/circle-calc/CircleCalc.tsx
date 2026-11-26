import { CalcPage, NumField, SectionCard, parseNum, trimNum, useLinkedFields } from '../_calc/ui'
import { useCalcFields, type CalcSpec } from '../_calc/useCalcFields'
import { circleFrom, type CircleField } from './math'

// Kreisrechner: vier verknüpfte Felder (Durchmesser, Radius, Umfang, Fläche).
// Das zuletzt bearbeitete Feld ist die Quelle; die übrigen rechnet math.ts daraus.

/** Gemerkt (K4): welches Feld die Quelle ist und ihr Text – ab Werk Durchmesser 1 */
const FELDER = {
  quelle: { vorgabe: 'd', erlaubt: ['d', 'r', 'c', 'a'] satisfies CircleField[] },
  eingabe: '1'
} satisfies CalcSpec<string>

export function CircleCalc(): JSX.Element {
  const f = useCalcFields('circle-calc', FELDER)
  const { driver, raw, bind } = useLinkedFields<CircleField>(
    'd',
    '1',
    f.linked('quelle', 'eingabe')
  )
  const vals = circleFrom(driver, parseNum(raw))
  // Rot ist nur eine Quelle mit negativem Wert – das sagt der Rechenkern
  const bad = (field: CircleField): boolean => vals.invalid.includes(field)

  return (
    <CalcPage onReset={f.changed ? f.reset : undefined}>
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
