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

// Projektionsverhältnis (Throw Ratio = Abstand ÷ Bildbreite). Hilft beim Wählen
// des passenden Objektivs: oben die Leinwandmaße (Seitenverhältnis + ein Maß),
// unten Throw Ratio <-> Projektionsabstand verknüpft.

const ASPECTS: { key: string; label: string; val: number }[] = [
  { key: '16:9', label: '16 : 9', val: 16 / 9 },
  { key: '16:10', label: '16 : 10', val: 16 / 10 },
  { key: '4:3', label: '4 : 3', val: 4 / 3 },
  { key: '1:1', label: '1 : 1', val: 1 },
  { key: '21:9', label: '21 : 9', val: 21 / 9 },
  { key: '2.35:1', label: '2,35 : 1 (Cinemascope)', val: 2.35 }
]

type SizeField = 'w' | 'h' | 'diag'
type ThrowField = 'tr' | 'dist'

export function ThrowRatio(): JSX.Element {
  const [aspectKey, setAspectKey] = useState('16:9')
  const size = useLinkedFields<SizeField>('w', '5')
  const lens = useLinkedFields<ThrowField>('dist', '8')

  const aspect = ASPECTS.find((a) => a.key === aspectKey)?.val ?? 16 / 9

  // Leinwandmaße aus dem bearbeiteten Maß + Seitenverhältnis.
  const sBase = parseNum(size.raw)
  let w: number | null = null
  let h: number | null = null
  let diag: number | null = null
  if (sBase != null && sBase > 0) {
    if (size.driver === 'w') {
      w = sBase
      h = w / aspect
    } else if (size.driver === 'h') {
      h = sBase
      w = h * aspect
    } else {
      diag = sBase
      w = (diag * aspect) / Math.sqrt(aspect * aspect + 1)
      h = w / aspect
    }
    if (diag == null && w != null && h != null) diag = Math.sqrt(w * w + h * h)
  }

  // Throw Ratio <-> Abstand (über die Bildbreite verknüpft).
  const tBase = parseNum(lens.raw)
  let tr: number | null = null
  let dist: number | null = null
  if (w != null && w > 0 && tBase != null && tBase > 0) {
    if (lens.driver === 'tr') {
      tr = tBase
      dist = tr * w
    } else {
      dist = tBase
      tr = dist / w
    }
  }

  const area = w != null && h != null ? w * h : null

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
