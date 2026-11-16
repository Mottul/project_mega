import { useState } from 'react'
import {
  CalcPage,
  NumField,
  Readout,
  SectionCard,
  SelectField,
  fmt,
  parseNum,
  parseOptional,
  trimNum,
  ReadoutGrid
} from '../_calc/ui'
import { AMBIENT, DEFAULT_GAIN, ambientLux, projectorLumen, type LumenField } from './math'

// Beamer-Helligkeit: Wieviel ANSI-Lumen braucht die Projektion? Die Faustformel (Ziel-Lux je
// Umgebungslicht × Bildfläche ÷ Gain) steht in math.ts.

export function ProjectorLumen(): JSX.Element {
  const [wRaw, setWRaw] = useState('4')
  const [hRaw, setHRaw] = useState('2,25')
  const [ambient, setAmbient] = useState('dim')
  const [gainRaw, setGainRaw] = useState('1')
  const [haveRaw, setHaveRaw] = useState('')

  const { area, needed, achievedLux, enough, invalid } = projectorLumen({
    width: parseNum(wRaw),
    height: parseNum(hRaw),
    targetLux: ambientLux(ambient),
    // leer rechnet mit Gain 1, unlesbar gar nicht (parseOptional)
    gain: parseOptional(gainRaw),
    have: parseNum(haveRaw)
  })
  // rot ist, womit der Rechenkern nicht rechnet (nicht über 0)
  const bad = (f: LumenField): boolean => invalid.includes(f)

  return (
    <CalcPage>
      <SectionCard
        title="Projektion"
        desc="Bildgröße und Umgebungslicht angeben."
        hint="Faustformel: Lumen = Ziel-Beleuchtungsstärke (lx) × Bildfläche ÷ Gain. Richtwerte ohne Reserve – für Video und dunkle Inhalte eine Stufe höher planen."
      >
        <NumField
          label="Bildbreite"
          unit="m"
          invalid={bad('width')}
          value={wRaw}
          onChange={setWRaw}
        />
        <NumField
          label="Bildhöhe"
          unit="m"
          invalid={bad('height')}
          value={hRaw}
          onChange={setHRaw}
        />
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
          placeholder={trimNum(DEFAULT_GAIN)}
          invalid={bad('gain')}
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
          invalid={bad('have')}
          value={haveRaw}
          onChange={setHaveRaw}
          placeholder="z. B. 6500"
        />
        <ReadoutGrid>
          <Readout label="Erreichte Helligkeit" value={fmt(achievedLux, 0)} unit="lx" />
          {/* die Antwort der Karte: Farbe und Symbol der Statusstufe statt ✓ oder ✗ im Text */}
          <Readout
            label="Bewertung"
            value={enough == null ? '' : enough ? 'ausreichend' : 'zu dunkel'}
            tone={enough == null ? undefined : enough ? 'success' : 'danger'}
            accent
          />
        </ReadoutGrid>
      </SectionCard>
    </CalcPage>
  )
}
