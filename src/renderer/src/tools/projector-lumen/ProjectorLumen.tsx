import { useState } from 'react'
import {
  CalcPage,
  NumField,
  Readout,
  SectionCard,
  SelectField,
  fmt,
  parseNum,
  ReadoutGrid
} from '../_calc/ui'
import { AMBIENT, ambientLux, projectorLumen } from './math'

// Beamer-Helligkeit: Wieviel ANSI-Lumen braucht die Projektion? Die Faustformel (Ziel-Lux je
// Umgebungslicht × Bildfläche ÷ Gain) steht in math.ts.

export function ProjectorLumen(): JSX.Element {
  const [wRaw, setWRaw] = useState('4')
  const [hRaw, setHRaw] = useState('2,25')
  const [ambient, setAmbient] = useState('dim')
  const [gainRaw, setGainRaw] = useState('1')
  const [haveRaw, setHaveRaw] = useState('')

  const { area, needed, achievedLux, enough } = projectorLumen({
    width: parseNum(wRaw),
    height: parseNum(hRaw),
    targetLux: ambientLux(ambient),
    gain: parseNum(gainRaw),
    have: parseNum(haveRaw)
  })

  return (
    <CalcPage>
      <SectionCard
        title="Projektion"
        desc="Bildgröße und Umgebungslicht angeben."
        hint="Faustformel: Lumen = Ziel-Beleuchtungsstärke (lx) × Bildfläche ÷ Gain. Richtwerte ohne Reserve – für Video und dunkle Inhalte eine Stufe höher planen."
      >
        <NumField label="Bildbreite" unit="m" value={wRaw} onChange={setWRaw} />
        <NumField label="Bildhöhe" unit="m" value={hRaw} onChange={setHRaw} />
        <SelectField
          label="Umgebungslicht"
          hint="Je heller der Raum, desto mehr Licht braucht das Bild, um sich abzuheben – die Zahl ist die angestrebte Helligkeit auf der Leinwand."
          value={ambient}
          onChange={setAmbient}
        >
          {AMBIENT.map((a) => (
            <option key={a.key} value={a.key}>
              {a.label} – Ziel {a.lux} lx
            </option>
          ))}
        </SelectField>
        <NumField
          label="Leinwand-Gain"
          hint="Reflexionsfaktor der Leinwand: 1 = mattweiß. Höherer Gain macht das Bild heller, aber nur in einem engeren Blickwinkel."
          value={gainRaw}
          onChange={setGainRaw}
        />
        <ReadoutGrid>
          <Readout label="Bildfläche" value={fmt(area)} unit="m²" />
          <Readout label="Lumen-Bedarf" value={fmt(needed, 0)} unit="lm" big accent />
        </ReadoutGrid>
      </SectionCard>

      <SectionCard title="Vorhandener Beamer" desc="Optional: Reicht das verfügbare Gerät?">
        <NumField
          label="Beamer-Lichtstrom"
          unit="lm"
          value={haveRaw}
          onChange={setHaveRaw}
          placeholder="z. B. 6500"
        />
        <ReadoutGrid>
          <Readout label="Erreichte Helligkeit" value={fmt(achievedLux, 0)} unit="lx" />
          <Readout
            label="Bewertung"
            value={enough == null ? '' : enough ? 'ausreichend ✓' : 'zu dunkel ✗'}
            accent={enough === true}
          />
        </ReadoutGrid>
      </SectionCard>
    </CalcPage>
  )
}
