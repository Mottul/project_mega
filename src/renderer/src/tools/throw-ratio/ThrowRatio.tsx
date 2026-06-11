import { useState } from 'react'
import { CalcPage, NumField, Readout, SectionCard, SelectField, fmt, parseNum, trimNum } from '../_calc/ui'

// Projektionsverhältnis (Throw Ratio = Abstand ÷ Bildbreite). Hilft beim Wählen
// des passenden Objektivs: oben die Leinwandmaße (Seitenverhältnis + ein Maß),
// unten Throw Ratio <-> Projektionsabstand verknüpft.

const ASPECTS: { key: string; label: string; val: number }[] = [
  { key: '16:9', label: '16 : 9', val: 16 / 9 },
  { key: '16:10', label: '16 : 10', val: 16 / 10 },
  { key: '4:3', label: '4 : 3', val: 4 / 3 },
  { key: '1:1', label: '1 : 1', val: 1 },
  { key: '21:9', label: '21 : 9', val: 21 / 9 },
  { key: '2.35:1', label: '2.35 : 1 (Cinemascope)', val: 2.35 }
]

type SizeField = 'w' | 'h' | 'diag'
type ThrowField = 'tr' | 'dist'

export function ThrowRatio(): JSX.Element {
  const [aspectKey, setAspectKey] = useState('16:9')
  const [sizeDriver, setSizeDriver] = useState<SizeField>('w')
  const [sizeRaw, setSizeRaw] = useState('5')
  const [throwDriver, setThrowDriver] = useState<ThrowField>('dist')
  const [throwRaw, setThrowRaw] = useState('8')

  const aspect = ASPECTS.find((a) => a.key === aspectKey)?.val ?? 16 / 9

  // Leinwandmaße aus dem bearbeiteten Maß + Seitenverhältnis.
  const sBase = parseNum(sizeRaw)
  let w: number | null = null
  let h: number | null = null
  let diag: number | null = null
  if (sBase != null && sBase > 0) {
    if (sizeDriver === 'w') {
      w = sBase
      h = w / aspect
    } else if (sizeDriver === 'h') {
      h = sBase
      w = h * aspect
    } else {
      diag = sBase
      w = (diag * aspect) / Math.sqrt(aspect * aspect + 1)
      h = w / aspect
    }
    if (diag == null && w != null && h != null) diag = Math.sqrt(w * w + h * h)
  }
  const sizeVals: Record<SizeField, number | null> = { w, h, diag }

  // Throw Ratio <-> Abstand (über die Bildbreite verknüpft).
  const tBase = parseNum(throwRaw)
  let tr: number | null = null
  let dist: number | null = null
  if (w != null && w > 0 && tBase != null && tBase > 0) {
    if (throwDriver === 'tr') {
      tr = tBase
      dist = tr * w
    } else {
      dist = tBase
      tr = dist / w
    }
  }
  const throwVals: Record<ThrowField, number | null> = { tr, dist }

  function bindSize(field: SizeField): {
    value: string
    derived: boolean
    onChange: (v: string) => void
    onFocus: () => void
  } {
    return {
      value: field === sizeDriver ? sizeRaw : trimNum(sizeVals[field], 3),
      derived: field !== sizeDriver,
      onChange: (v) => {
        setSizeDriver(field)
        setSizeRaw(v)
      },
      onFocus: () => {
        if (field !== sizeDriver) {
          setSizeDriver(field)
          setSizeRaw(trimNum(sizeVals[field], 3))
        }
      }
    }
  }

  function bindThrow(field: ThrowField): {
    value: string
    derived: boolean
    onChange: (v: string) => void
    onFocus: () => void
  } {
    return {
      value: field === throwDriver ? throwRaw : trimNum(throwVals[field], 3),
      derived: field !== throwDriver,
      onChange: (v) => {
        setThrowDriver(field)
        setThrowRaw(v)
      },
      onFocus: () => {
        if (field !== throwDriver) {
          setThrowDriver(field)
          setThrowRaw(trimNum(throwVals[field], 3))
        }
      }
    }
  }

  const area = w != null && h != null ? w * h : null

  return (
    <CalcPage>
      <SectionCard title="Leinwand" desc="Seitenverhältnis wählen und ein Maß eingeben – die übrigen folgen.">
        <SelectField label="Seitenverhältnis" value={aspectKey} onChange={setAspectKey}>
          {ASPECTS.map((a) => (
            <option key={a.key} value={a.key}>
              {a.label}
            </option>
          ))}
        </SelectField>
        <NumField label="Bildbreite" unit="m" {...bindSize('w')} />
        <NumField label="Bildhöhe" unit="m" {...bindSize('h')} />
        <NumField label="Diagonale" unit="m" {...bindSize('diag')} />
        <Readout label="Bildfläche" value={fmt(area)} unit="m²" />
      </SectionCard>

      <SectionCard
        title="Objektiv / Abstand"
        desc="Throw Ratio = Projektionsabstand ÷ Bildbreite. Ein Objektiv wählen, dessen TR-Bereich den Wert abdeckt."
      >
        <NumField label="Throw Ratio" {...bindThrow('tr')} />
        <NumField label="Projektionsabstand" unit="m" {...bindThrow('dist')} />
        {w == null && (
          <p className="text-xs text-amber-400 light:text-amber-700">
            Zuerst oben die Bildbreite festlegen.
          </p>
        )}
        <p className="pt-1 text-xs text-muted-foreground">
          Beispiel: Bildbreite 5 m und Abstand 8 m → TR 1.6. Ein Standardobjektiv mit z. B. 1.2–1.8
          passt.
        </p>
      </SectionCard>
    </CalcPage>
  )
}
