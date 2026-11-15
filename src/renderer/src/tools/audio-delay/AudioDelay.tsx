import { useState } from 'react'
import {
  CalcPage,
  NumField,
  Readout,
  SectionCard,
  fmt,
  parseNum,
  trimNum,
  ReadoutGrid,
  useLinkedFields
} from '../_calc/ui'
import { delayFrom, speedOfSound, splAtDistance, type DelayField } from './math'

// Audio-Delay (Lautsprecher-Laufzeit) & SPL über Distanz. Die Formeln (Schallgeschwindigkeit
// nach Temperatur, Abstandsgesetz) stehen in math.ts.

export function AudioDelay(): JSX.Element {
  const [tempRaw, setTempRaw] = useState('20')
  const delay = useLinkedFields<DelayField>('dist', '10')

  const [splRaw, setSplRaw] = useState('100')
  const [dRefRaw, setDRefRaw] = useState('1')
  const [dTgtRaw, setDTgtRaw] = useState('10')

  const c = speedOfSound(parseNum(tempRaw)) // m/s
  const { dist, delayMs, samples48 } = delayFrom(delay.driver, parseNum(delay.raw), c)
  const splTarget = splAtDistance(parseNum(splRaw), parseNum(dRefRaw), parseNum(dTgtRaw))

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
        <NumField label="Distanz" unit="m" {...delay.bind('dist', trimNum(dist, 3))} />
        <NumField label="Delay" unit="ms" {...delay.bind('delay', trimNum(delayMs, 3))} />
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
