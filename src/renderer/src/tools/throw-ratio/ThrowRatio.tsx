import { useState } from 'react'
import {
  CalcPage,
  NumField,
  Readout,
  SectionCard,
  SelectField,
  fmt,
  parseNum,
  trimNum,
  useLinkedFields
} from '../_calc/ui'
import { Alert } from '@renderer/components/ui/alert'
import {
  ASPECTS,
  aspectRatio,
  screenSize,
  throwFrom,
  type SizeField,
  type ThrowField
} from './math'

// Projektionsverhältnis (Throw Ratio = Abstand ÷ Bildbreite). Hilft beim Wählen
// des passenden Objektivs: oben die Leinwandmaße (Seitenverhältnis + ein Maß),
// unten Throw Ratio <-> Projektionsabstand verknüpft. Gerechnet wird in math.ts.

export function ThrowRatio(): JSX.Element {
  const [aspectKey, setAspectKey] = useState('16:9')
  const size = useLinkedFields<SizeField>('w', '5')
  const lens = useLinkedFields<ThrowField>('dist', '8')

  const { w, h, diag, area } = screenSize(size.driver, parseNum(size.raw), aspectRatio(aspectKey))
  const { tr, dist } = throwFrom(lens.driver, parseNum(lens.raw), w)

  return (
    <CalcPage>
      <SectionCard
        title="Leinwand"
        desc="Seitenverhältnis wählen, ein Maß eingeben – die übrigen folgen."
      >
        <SelectField label="Seitenverhältnis" value={aspectKey} onChange={setAspectKey}>
          {ASPECTS.map((a) => (
            <option key={a.key} value={a.key}>
              {a.label}
            </option>
          ))}
        </SelectField>
        <NumField label="Bildbreite" unit="m" {...size.bind('w', trimNum(w, 3))} />
        <NumField label="Bildhöhe" unit="m" {...size.bind('h', trimNum(h, 3))} />
        <NumField label="Diagonale" unit="m" {...size.bind('diag', trimNum(diag, 3))} />
        <Readout label="Bildfläche" value={fmt(area)} unit="m²" />
      </SectionCard>

      <SectionCard
        title="Objektiv & Abstand"
        desc="Throw Ratio oder Abstand eingeben – das andere folgt."
        hint="Throw Ratio (TR) = Projektionsabstand ÷ Bildbreite. Passend ist ein Objektiv, dessen TR-Bereich den Wert abdeckt. Beispiel: 5 m Bildbreite aus 8 m Abstand ergibt TR 1,6 – ein Objektiv mit 1,2–1,8 passt."
      >
        <NumField label="Throw Ratio" {...lens.bind('tr', trimNum(tr, 3))} />
        <NumField label="Projektionsabstand" unit="m" {...lens.bind('dist', trimNum(dist, 3))} />
        {w == null && <Alert tone="warning">Zuerst die Bildbreite der Leinwand festlegen.</Alert>}
      </SectionCard>
    </CalcPage>
  )
}
