import { useState } from 'react'
import {
  CalcPage,
  NumField,
  Readout,
  SectionCard,
  fmt,
  parseNum,
  trimNum,
  ReadoutGrid
} from '../_calc/ui'

// Audio-Delay (Lautsprecher-Laufzeit) & SPL über Distanz.
// Schallgeschwindigkeit temperaturabhängig: c = 331.3 + 0.606·T (m/s).
// Pegel im Freifeld: −6 dB je Abstandsverdopplung (Inverse-Square).

type DelayField = 'dist' | 'delay'

export function AudioDelay(): JSX.Element {
  const [tempRaw, setTempRaw] = useState('20')
  const [driver, setDriver] = useState<DelayField>('dist')
  const [delayRaw, setDelayRaw] = useState('10')

  const [splRaw, setSplRaw] = useState('100')
  const [dRefRaw, setDRefRaw] = useState('1')
  const [dTgtRaw, setDTgtRaw] = useState('10')

  const tParsed = parseNum(tempRaw)
  const c = 331.3 + 0.606 * (tParsed == null ? 20 : tParsed) // m/s

  const base = parseNum(delayRaw)
  let dist: number | null = null
  let delayMs: number | null = null
  if (base != null && base >= 0) {
    if (driver === 'dist') {
      dist = base
      delayMs = (base / c) * 1000
    } else {
      delayMs = base
      dist = (base / 1000) * c
    }
  }
  const delayVals: Record<DelayField, number | null> = { dist, delay: delayMs }
  const samples48 = delayMs == null ? null : (delayMs / 1000) * 48000

  function bindDelay(field: DelayField): {
    value: string
    derived: boolean
    onChange: (v: string) => void
    onFocus: () => void
  } {
    return {
      value: field === driver ? delayRaw : trimNum(delayVals[field], 3),
      derived: field !== driver,
      onChange: (v) => {
        setDriver(field)
        setDelayRaw(v)
      },
      onFocus: () => {
        if (field !== driver) {
          setDriver(field)
          setDelayRaw(trimNum(delayVals[field], 3))
        }
      }
    }
  }

  // Pegel über Distanz.
  const spl = parseNum(splRaw)
  const dRef = parseNum(dRefRaw)
  const dTgt = parseNum(dTgtRaw)
  const splTarget =
    spl != null && dRef != null && dRef > 0 && dTgt != null && dTgt > 0
      ? spl - 20 * Math.log10(dTgt / dRef)
      : null

  return (
    <CalcPage>
      <SectionCard
        title="Delay (Laufzeit)"
        desc="Distanz oder Delay eingeben – das andere folgt."
        hint="Verzögerung für Delay- und Stützlautsprecher, damit ihr Schall zeitgleich mit dem der Hauptanlage ankommt. Distanz = Abstand zwischen Haupt- und Delay-Lautsprecher in Richtung Publikum."
      >
        <NumField
          label="Temperatur"
          hint="Schall wird mit der Wärme schneller: c = 331,3 + 0,606 · T m/s (etwa 0,6 m/s je °C)."
          unit="°C"
          value={tempRaw}
          onChange={setTempRaw}
        />
        <NumField label="Distanz" unit="m" {...bindDelay('dist')} />
        <NumField label="Delay" unit="ms" {...bindDelay('delay')} />
        <ReadoutGrid>
          <Readout label="Schallgeschwindigkeit" value={fmt(c, 1)} unit="m/s" />
          <Readout label="bei 48 kHz" value={fmt(samples48, 0)} unit="Samples" />
        </ReadoutGrid>
      </SectionCard>

      <SectionCard
        title="Pegel über Distanz"
        desc="Wie laut ist es weiter hinten?"
        hint="Im Freifeld fällt der Pegel um 6 dB je Verdopplung der Entfernung (Abstandsgesetz). In Räumen fällt er durch Reflexionen weniger stark."
      >
        <NumField label="Pegel (Referenz)" unit="dB" value={splRaw} onChange={setSplRaw} />
        <NumField label="Referenz-Distanz" unit="m" value={dRefRaw} onChange={setDRefRaw} />
        <NumField label="Ziel-Distanz" unit="m" value={dTgtRaw} onChange={setDTgtRaw} />
        <Readout label="Pegel in Ziel-Distanz" value={fmt(splTarget, 1)} unit="dB" big accent />
      </SectionCard>
    </CalcPage>
  )
}
