import { useState } from 'react'
import {
  CalcPage,
  NumField,
  Readout,
  SectionCard,
  SelectField,
  fmt,
  parseNum,
  trimNum
} from '../_calc/ui'

// Stromlast & Absicherung. Einphasig: P = U·I·cosφ. Dreiphasig: P = √3·U·I·cosφ.
// Unten: wie viele gleiche Geräte passen auf einen Stromkreis (mit Reserve)?

const SQRT3 = Math.sqrt(3)
type LoadField = 'p' | 'i'

export function PowerLoad(): JSX.Element {
  const [phase, setPhase] = useState<'1' | '3'>('1')
  const [uRaw, setURaw] = useState('230')
  const [pfRaw, setPfRaw] = useState('1')
  const [driver, setDriver] = useState<LoadField>('i')
  const [loadRaw, setLoadRaw] = useState('16')
  const [devRaw, setDevRaw] = useState('500')
  const [breaker, setBreaker] = useState('16')
  const [reserve, setReserve] = useState('1')

  const u = parseNum(uRaw)
  const pfParsed = parseNum(pfRaw)
  const pf = pfParsed == null ? 1 : Math.min(1, Math.max(0.01, pfParsed))
  const factor = phase === '3' ? SQRT3 : 1
  const denom = u != null && u > 0 ? factor * u * pf : null // U·cosφ (·√3)

  // Leistung <-> Strom verknüpft.
  const lBase = parseNum(loadRaw)
  let p: number | null = null
  let i: number | null = null
  if (lBase != null && lBase >= 0 && denom != null) {
    if (driver === 'p') {
      p = lBase
      i = p / denom
    } else {
      i = lBase
      p = i * denom
    }
  }
  const loadVals: Record<LoadField, number | null> = { p, i }
  const apparent = u != null && i != null ? factor * u * i : null // Scheinleistung VA

  function bindLoad(field: LoadField): {
    value: string
    derived: boolean
    onChange: (v: string) => void
    onFocus: () => void
  } {
    return {
      value: field === driver ? loadRaw : trimNum(loadVals[field], 2),
      derived: field !== driver,
      onChange: (v) => {
        setDriver(field)
        setLoadRaw(v)
      },
      onFocus: () => {
        if (field !== driver) {
          setDriver(field)
          setLoadRaw(trimNum(loadVals[field], 2))
        }
      }
    }
  }

  function switchPhase(pNew: '1' | '3'): void {
    setPhase(pNew)
    // Spannung auf den jeweils üblichen Standard setzen (frei überschreibbar).
    if ((pNew === '3' && uRaw === '230') || (pNew === '1' && uRaw === '400')) {
      setURaw(pNew === '3' ? '400' : '230')
    }
  }

  // Geräte pro Absicherung.
  const pDev = parseNum(devRaw)
  const iDev = pDev != null && pDev > 0 && denom != null ? pDev / denom : null
  const maxA = Number(breaker) * Number(reserve)
  const maxDevices = iDev != null && iDev > 0 ? Math.floor(maxA / iDev) : null
  const sumP = maxDevices != null && pDev != null ? maxDevices * pDev : null
  const sumI = maxDevices != null && iDev != null ? maxDevices * iDev : null

  return (
    <CalcPage>
      <SectionCard
        title="Last"
        desc="Leistung und Strom umrechnen – ein Feld eingeben, das andere folgt."
      >
        <SelectField label="Anschluss" value={phase} onChange={(v) => switchPhase(v as '1' | '3')}>
          <option value="1">Einphasig (~230 V)</option>
          <option value="3">Dreiphasig (~400 V)</option>
        </SelectField>
        <NumField label="Spannung U" unit="V" value={uRaw} onChange={setURaw} />
        <NumField label="Leistungsfaktor cosφ" value={pfRaw} onChange={setPfRaw} />
        <NumField label="Leistung P" unit="W" {...bindLoad('p')} />
        <NumField label="Strom I" unit="A" {...bindLoad('i')} />
        {pf < 1 && <Readout label="Scheinleistung S" value={fmt(apparent)} unit="VA" />}
      </SectionCard>

      <SectionCard
        title="Geräte pro Stromkreis"
        desc="Wie viele gleiche Geräte verträgt eine Absicherung? (Anschluss/Spannung/cosφ von oben.)"
      >
        <NumField label="Leistung je Gerät" unit="W" value={devRaw} onChange={setDevRaw} />
        <SelectField label="Absicherung" value={breaker} onChange={setBreaker}>
          <option value="10">10 A</option>
          <option value="16">16 A (Schuko)</option>
          <option value="32">32 A (CEE)</option>
          <option value="63">63 A (CEE)</option>
        </SelectField>
        <SelectField label="Auslastung" value={reserve} onChange={setReserve}>
          <option value="1">100 % (Maximum)</option>
          <option value="0.8">80 % (Dauerbetrieb empfohlen)</option>
        </SelectField>
        <div className="grid gap-2 sm:grid-cols-2">
          <Readout label="Strom je Gerät" value={fmt(iDev)} unit="A" />
          <Readout
            label="max. Geräte"
            value={maxDevices != null ? String(maxDevices) : ''}
            big
            accent
          />
          <Readout label="Summe Leistung" value={fmt(sumP, 0)} unit="W" />
          <Readout label="Summe Strom" value={fmt(sumI)} unit="A" />
        </div>
        <p className="text-xs text-muted-foreground">
          Richtwert ohne Anlaufströme/Leitungslängen – im Zweifel die Herstellerangaben und die
          Elektrofachkraft heranziehen.
        </p>
      </SectionCard>
    </CalcPage>
  )
}
