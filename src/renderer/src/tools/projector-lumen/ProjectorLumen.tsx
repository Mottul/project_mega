import { useState } from 'react'
import { Segmented } from '@renderer/components/ui/segmented'
import {
  CalcPage,
  FieldBlock,
  FoldCard,
  NumField,
  Readout,
  fmt,
  parseNum,
  parseOptional,
  trimNum
} from '../_calc/ui'
import { AMBIENT, DEFAULT_GAIN, ambientLux, projectorLumen, type LumenField } from './math'

// Beamer-Helligkeit: Wieviel ANSI-Lumen braucht die Projektion? Die Faustformel (Ziel-Lux je
// Umgebungslicht × Bildfläche ÷ Gain) steht in math.ts.
// Aufbau nach Muster 2 (Gesamtplan, K6 wie der Pilot Stromlast): Beide Fragen sind zuklappbare
// Karten mit ihrer Antwort als Kurzfassung; „Vorhandener Beamer“ ist ab Werk nur offen, wenn
// die Karten nebeneinander stehen (im 520 px breiten Fenster stehen sie untereinander). In jeder
// Karte steht die Antwort über den Feldern. Das Umgebungslicht ist eine Knopfgruppe mit kurzen
// Namen, darunter die Erklärung der gewählten Stufe – wie die Signale im Testtongenerator.

/** Kurzfassung der Karte „Vorhandener Beamer“: sein Lichtstrom und die Bewertung */
function beamerSummary(have: number | null, enough: boolean | null): string {
  return have == null || enough == null
    ? '–'
    : `${fmt(have, 0)} lm · ${enough ? 'ausreichend' : 'zu dunkel'}`
}

export function ProjectorLumen(): JSX.Element {
  const [wRaw, setWRaw] = useState('4')
  const [hRaw, setHRaw] = useState('2,25')
  const [ambient, setAmbient] = useState('dim')
  const [gainRaw, setGainRaw] = useState('1')
  const [haveRaw, setHaveRaw] = useState('')

  const have = parseNum(haveRaw)
  const { area, needed, achievedLux, enough, invalid } = projectorLumen({
    width: parseNum(wRaw),
    height: parseNum(hRaw),
    targetLux: ambientLux(ambient),
    // leer rechnet mit Gain 1, unlesbar gar nicht (parseOptional)
    gain: parseOptional(gainRaw),
    have
  })
  // rot ist, womit der Rechenkern nicht rechnet (nicht über 0)
  const bad = (f: LumenField): boolean => invalid.includes(f)
  const stufe = AMBIENT.find((a) => a.key === ambient)

  return (
    <CalcPage>
      <FoldCard
        id="projector-lumen:projektion"
        title="Projektion"
        summary={needed == null ? '–' : `${fmt(needed, 0)} lm`}
        desc="Bildgröße und Umgebungslicht angeben."
        hint="Faustformel: Lumen = Ziel-Beleuchtungsstärke (lx) × Bildfläche ÷ Gain. Richtwerte ohne Reserve – für Video und dunkle Inhalte eine Stufe höher planen."
        defaultOpen
      >
        {/* die Antwort zuerst, darunter die Felder, darunter die Nebenwerte */}
        <Readout label="Lumen-Bedarf" value={fmt(needed, 0)} unit="lm" big accent />
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
        <FieldBlock
          label="Umgebungslicht"
          hint="Je heller der Raum, desto mehr Licht braucht das Bild, um sich abzuheben – die Zahl ist die angestrebte Helligkeit auf der Leinwand."
        >
          <Segmented
            label="Umgebungslicht"
            value={ambient}
            options={AMBIENT.map((a) => ({ value: a.key, label: a.name }))}
            onChange={setAmbient}
            wrap={4.75}
          />
        </FieldBlock>
        {/* was die Liste je Stufe dazusagte, steht für die gewählte darunter */}
        {stufe && (
          <p className="text-sm text-muted-foreground" data-testid="umgebungslicht-text">
            {stufe.where} · Ziel {fmt(stufe.lux, 0)} lx
          </p>
        )}
        <NumField
          label="Leinwand-Gain"
          hint="Reflexionsfaktor der Leinwand: 1 = mattweiß. Höherer Gain macht das Bild heller, aber nur in einem engeren Blickwinkel."
          placeholder={trimNum(DEFAULT_GAIN)}
          invalid={bad('gain')}
          value={gainRaw}
          onChange={setGainRaw}
        />
        <Readout label="Bildfläche" value={fmt(area)} unit="m²" />
      </FoldCard>

      <FoldCard
        id="projector-lumen:beamer"
        title="Vorhandener Beamer"
        summary={beamerSummary(have, enough)}
        desc="Optional: Reicht das verfügbare Gerät?"
        defaultOpen="nebeneinander"
      >
        {/* die Antwort zuerst: Farbe und Symbol der Statusstufe statt ✓ oder ✗ im Text */}
        <Readout
          label="Bewertung"
          value={enough == null ? '' : enough ? 'ausreichend' : 'zu dunkel'}
          tone={enough == null ? undefined : enough ? 'success' : 'danger'}
          big
          accent
        />
        <NumField
          label="Beamer-Lichtstrom"
          unit="lm"
          invalid={bad('have')}
          value={haveRaw}
          onChange={setHaveRaw}
          placeholder="z. B. 6500"
        />
        <Readout label="Erreichte Helligkeit" value={fmt(achievedLux, 0)} unit="lx" />
      </FoldCard>
    </CalcPage>
  )
}
