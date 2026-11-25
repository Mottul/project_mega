import { useState } from 'react'
import { Segmented } from '@renderer/components/ui/segmented'
import {
  CalcPage,
  FieldBlock,
  NumField,
  Readout,
  SectionCard,
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

  const screen = screenSize(size.driver, parseNum(size.raw), aspectRatio(aspectKey))
  const { w, h, diag, area } = screen
  const ratio = throwFrom(lens.driver, parseNum(lens.raw), w)
  // rot ist nur eine Quelle, die der Rechenkern nicht rechnet (nicht über 0)
  const badSize = (f: SizeField): boolean => screen.invalid.includes(f)
  const badLens = (f: ThrowField): boolean => ratio.invalid.includes(f)

  return (
    <CalcPage>
      <SectionCard
        title="Leinwand"
        desc="Seitenverhältnis wählen, ein Maß eingeben – die übrigen folgen."
      >
        {/* sechs kurze Möglichkeiten: Knopfgruppe statt Liste, bei schmalem Fenster in Reihen */}
        <FieldBlock label="Seitenverhältnis" hint="2,35 : 1 heißt auch Cinemascope.">
          <Segmented
            label="Seitenverhältnis"
            value={aspectKey}
            options={ASPECTS.map((a) => ({ value: a.key, label: a.label }))}
            onChange={setAspectKey}
            wrap={4}
          />
        </FieldBlock>
        <NumField
          label="Bildbreite"
          unit="m"
          invalid={badSize('w')}
          {...size.bind('w', trimNum(w, 3))}
        />
        <NumField
          label="Bildhöhe"
          unit="m"
          invalid={badSize('h')}
          {...size.bind('h', trimNum(h, 3))}
        />
        <NumField
          label="Diagonale"
          unit="m"
          invalid={badSize('diag')}
          {...size.bind('diag', trimNum(diag, 3))}
        />
        <Readout label="Bildfläche" value={fmt(area)} unit="m²" />
      </SectionCard>

      <SectionCard
        title="Objektiv & Abstand"
        desc="Throw Ratio oder Abstand eingeben – das andere folgt."
        hint="Throw Ratio (TR) = Projektionsabstand ÷ Bildbreite. Passend ist ein Objektiv, dessen TR-Bereich den Wert abdeckt. Beispiel: 5 m Bildbreite aus 8 m Abstand ergibt TR 1,6 – ein Objektiv mit 1,2–1,8 passt."
      >
        <NumField
          label="Throw Ratio"
          invalid={badLens('tr')}
          {...lens.bind('tr', trimNum(ratio.tr, 3))}
        />
        <NumField
          label="Projektionsabstand"
          unit="m"
          invalid={badLens('dist')}
          {...lens.bind('dist', trimNum(ratio.dist, 3))}
        />
        {w == null && <Alert tone="warning">Zuerst die Bildbreite der Leinwand festlegen.</Alert>}
      </SectionCard>
    </CalcPage>
  )
}
