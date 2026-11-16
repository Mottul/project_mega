import { useState } from 'react'
import {
  CalcPage,
  NumField,
  Readout,
  SectionCard,
  fmt,
  parseNum,
  parseOptional,
  trimNum,
  ReadoutGrid,
  useLinkedFields
} from '../_calc/ui'
import {
  DEFAULT_TEMP,
  delayFrom,
  speedOfSound,
  splAtDistance,
  type DelayField,
  type SplField
} from './math'

// Audio-Delay (Lautsprecher-Laufzeit) & SPL über Distanz. Die Formeln (Schallgeschwindigkeit
// nach Temperatur, Abstandsgesetz) stehen in math.ts.

export function AudioDelay(): JSX.Element {
  const [tempRaw, setTempRaw] = useState('20')
  const delay = useLinkedFields<DelayField>('dist', '10')

  const [splRaw, setSplRaw] = useState('100')
  const [dRefRaw, setDRefRaw] = useState('1')
  const [dTgtRaw, setDTgtRaw] = useState('10')

  // leer rechnet mit 20 °C, unlesbar gar nicht (parseOptional)
  const c = speedOfSound(parseOptional(tempRaw)) // m/s
  const d = delayFrom(delay.driver, parseNum(delay.raw), c)
  const spl = splAtDistance(parseNum(splRaw), parseNum(dRefRaw), parseNum(dTgtRaw))
  // rot ist, womit der Rechenkern nicht rechnet (negativ, Distanz nicht über 0)
  const badDelay = (f: DelayField): boolean => d.invalid.includes(f)
  const badSpl = (f: SplField): boolean => spl.invalid.includes(f)

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
          signed
          placeholder={trimNum(DEFAULT_TEMP)}
          value={tempRaw}
          onChange={setTempRaw}
        />
        <NumField
          label="Distanz"
          unit="m"
          invalid={badDelay('dist')}
          {...delay.bind('dist', trimNum(d.dist, 3))}
        />
        <NumField
          label="Delay"
          unit="ms"
          invalid={badDelay('delay')}
          {...delay.bind('delay', trimNum(d.delayMs, 3))}
        />
        <ReadoutGrid>
          <Readout label="Schallgeschwindigkeit" value={fmt(c, 1)} unit="m/s" />
          <Readout label="bei 48 kHz" value={fmt(d.samples48, 0)} unit="Samples" />
        </ReadoutGrid>
      </SectionCard>

      <SectionCard
        title="Pegel über Distanz"
        desc="Wie laut ist es weiter hinten?"
        hint="Im Freifeld fällt der Pegel um 6 dB je Verdopplung der Entfernung (Abstandsgesetz). In Räumen fällt er durch Reflexionen weniger stark."
      >
        <NumField label="Pegel (Referenz)" unit="dB" value={splRaw} onChange={setSplRaw} />
        <NumField
          label="Referenz-Distanz"
          unit="m"
          invalid={badSpl('refDist')}
          value={dRefRaw}
          onChange={setDRefRaw}
        />
        <NumField
          label="Ziel-Distanz"
          unit="m"
          invalid={badSpl('targetDist')}
          value={dTgtRaw}
          onChange={setDTgtRaw}
        />
        <Readout label="Pegel in Ziel-Distanz" value={fmt(spl.level, 1)} unit="dB" big accent />
      </SectionCard>
    </CalcPage>
  )
}
