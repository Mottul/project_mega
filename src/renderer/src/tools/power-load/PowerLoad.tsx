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
  ReadoutGrid,
  useLinkedFields
} from '../_calc/ui'
import { devicesPerCircuit, loadFrom, powerFactor, type LoadField, type Phase } from './math'

// Stromlast & Absicherung: oben Leistung <-> Strom, unten wie viele gleiche Geräte auf einen
// Stromkreis passen (mit Reserve). Die Formeln stehen in math.ts.

export function PowerLoad(): JSX.Element {
  const [phase, setPhase] = useState<Phase>('1')
  const [uRaw, setURaw] = useState('230')
  const [pfRaw, setPfRaw] = useState('1')
  const load = useLinkedFields<LoadField>('i', '16')
  const [devRaw, setDevRaw] = useState('500')
  const [breaker, setBreaker] = useState('16')
  const [reserve, setReserve] = useState('1')

  const supply = { phase, u: parseNum(uRaw), pf: parseNum(pfRaw) }
  const pf = powerFactor(supply.pf)
  const { p, i, apparent } = loadFrom(supply, load.driver, parseNum(load.raw))

  function switchPhase(pNew: Phase): void {
    setPhase(pNew)
    // Spannung auf den jeweils üblichen Standard setzen (frei überschreibbar).
    if ((pNew === '3' && uRaw === '230') || (pNew === '1' && uRaw === '400')) {
      setURaw(pNew === '3' ? '400' : '230')
    }
  }

  // Geräte pro Absicherung.
  const { iDev, maxDevices, sumP, sumI } = devicesPerCircuit(
    supply,
    parseNum(devRaw),
    Number(breaker),
    Number(reserve)
  )

  return (
    <CalcPage note="Richtwerte ohne Anlaufströme und Leitungslängen – im Zweifel Herstellerangaben und Elektrofachkraft heranziehen.">
      <SectionCard
        title="Last"
        desc="Leistung oder Strom eingeben – das andere folgt."
        hint="Einphasig: P = U · I · cos φ. Dreiphasig: P = √3 · U · I · cos φ (U = Spannung zwischen zwei Außenleitern, I = Strom je Leiter)."
      >
        <SelectField label="Anschluss" value={phase} onChange={(v) => switchPhase(v as Phase)}>
          <option value="1">Einphasig (230 V)</option>
          <option value="3">Dreiphasig (400 V)</option>
        </SelectField>
        <NumField label="Spannung U" unit="V" value={uRaw} onChange={setURaw} />
        <NumField
          label="Leistungsfaktor cos φ"
          hint="1 bei rein ohmscher Last (Halogen, Heizer). Netzteile, LED-Geräte und Motoren liegen darunter – mit Leistungsfaktorkorrektur (PFC) meist bei 0,9–0,99. Dann fließt mehr Strom als P ÷ U."
          value={pfRaw}
          onChange={setPfRaw}
        />
        <NumField label="Leistung P" unit="W" {...load.bind('p', trimNum(p, 2))} />
        <NumField label="Strom I" unit="A" {...load.bind('i', trimNum(i, 2))} />
        {pf < 1 && (
          <Readout
            label="Scheinleistung S"
            hint="Das, was Leitung und Sicherung tatsächlich tragen: U · I (dreiphasig · √3)."
            value={fmt(apparent)}
            unit="VA"
          />
        )}
      </SectionCard>

      <SectionCard
        title="Geräte pro Stromkreis"
        desc="Wie viele gleiche Geräte verträgt eine Absicherung?"
        hint="Anschluss, Spannung und cos φ gelten wie unter „Last“."
      >
        <NumField label="Leistung je Gerät" unit="W" value={devRaw} onChange={setDevRaw} />
        <SelectField label="Absicherung" value={breaker} onChange={setBreaker}>
          <option value="10">10 A</option>
          <option value="16">16 A (Schuko)</option>
          <option value="32">32 A (CEE)</option>
          <option value="63">63 A (CEE)</option>
        </SelectField>
        <SelectField
          label="Auslastung"
          hint="Für Dauerbetrieb (ganze Show) eine Absicherung nur zu etwa 80 % belasten – Reserve für Wärme und Toleranzen."
          value={reserve}
          onChange={setReserve}
        >
          <option value="1">100 % (Maximum)</option>
          <option value="0.8">80 % (Dauerbetrieb)</option>
        </SelectField>
        <ReadoutGrid>
          <Readout label="Strom je Gerät" value={fmt(iDev)} unit="A" />
          <Readout
            label="Max. Geräte"
            value={maxDevices != null ? String(maxDevices) : ''}
            big
            accent
          />
          <Readout label="Summe Leistung" value={fmt(sumP, 0)} unit="W" />
          <Readout label="Summe Strom" value={fmt(sumI)} unit="A" />
        </ReadoutGrid>
      </SectionCard>
    </CalcPage>
  )
}
