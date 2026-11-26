import {
  CalcPage,
  FoldCard,
  NumField,
  Readout,
  fmt,
  parseNum,
  parseOptional,
  trimNum,
  ReadoutGrid,
  useLinkedFields
} from '../_calc/ui'
import { useCalcFields, type CalcSpec } from '../_calc/useCalcFields'
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
// Aufbau nach Muster 2 (Gesamtplan, K6 wie der Pilot Stromlast): Beide Fragen sind zuklappbare
// Karten mit ihrer Antwort als Kurzfassung; „Pegel über Distanz“ ist ab Werk nur offen, wenn die
// Karten nebeneinander stehen (im 520 px breiten Fenster stehen sie untereinander), und stellt
// offen die Antwort über die Felder. „Delay“ besteht aus verknüpften Feldern und bleibt, wie es war.

/** Kurzfassung der Karte „Delay“: die verknüpften Werte */
function delaySummary(dist: number | null, delayMs: number | null): string {
  return dist == null || delayMs == null ? '–' : `${fmt(dist, 2)} m · ${fmt(delayMs, 1)} ms`
}

/** Kurzfassung der Karte „Pegel über Distanz“: der Pegel in der Ziel-Distanz */
function splSummary(level: number | null, targetDist: number | null): string {
  return level == null || targetDist == null
    ? '–'
    : `${fmt(level, 1)} dB in ${fmt(targetDist, 2)} m`
}

/** Gemerkt (K4): alle Eingaben, beim Delay auch, welches Feld die Quelle ist */
const FELDER = {
  temperatur: '20',
  delayQuelle: { vorgabe: 'dist', erlaubt: ['dist', 'delay'] satisfies DelayField[] },
  delay: '10',
  pegel: '100',
  referenz: '1',
  ziel: '10'
} satisfies CalcSpec<string>

export function AudioDelay(): JSX.Element {
  const f = useCalcFields('audio-delay', FELDER)
  const delay = useLinkedFields<DelayField>('dist', '10', f.linked('delayQuelle', 'delay'))
  const { temperatur: tempRaw, pegel: splRaw, referenz: dRefRaw, ziel: dTgtRaw } = f.v

  // leer rechnet mit 20 °C, unlesbar gar nicht (parseOptional)
  const c = speedOfSound(parseOptional(tempRaw)) // m/s
  const d = delayFrom(delay.driver, parseNum(delay.raw), c)
  const targetDist = parseNum(dTgtRaw)
  const spl = splAtDistance(parseNum(splRaw), parseNum(dRefRaw), targetDist)
  // rot ist, womit der Rechenkern nicht rechnet (negativ, Distanz nicht über 0)
  const badDelay = (field: DelayField): boolean => d.invalid.includes(field)
  const badSpl = (field: SplField): boolean => spl.invalid.includes(field)

  return (
    <CalcPage onReset={f.changed ? f.reset : undefined}>
      <FoldCard
        id="audio-delay:delay"
        title="Delay (Laufzeit)"
        summary={delaySummary(d.dist, d.delayMs)}
        desc="Distanz oder Delay eingeben – das andere folgt."
        hint="Verzögerung für Delay- und Stützlautsprecher, damit ihr Schall zeitgleich mit dem der Hauptanlage ankommt. Distanz = Abstand zwischen Haupt- und Delay-Lautsprecher in Richtung Publikum."
        defaultOpen
      >
        <NumField
          label="Temperatur"
          hint="Schall wird mit der Wärme schneller: c = 331,3 + 0,606 · T m/s (etwa 0,6 m/s je °C)."
          unit="°C"
          signed
          placeholder={trimNum(DEFAULT_TEMP)}
          {...f.bind('temperatur')}
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
      </FoldCard>

      <FoldCard
        id="audio-delay:pegel"
        title="Pegel über Distanz"
        summary={splSummary(spl.level, targetDist)}
        desc="Wie laut ist es weiter hinten?"
        hint="Im Freifeld fällt der Pegel um 6 dB je Verdopplung der Entfernung (Abstandsgesetz). In Räumen fällt er durch Reflexionen weniger stark."
        defaultOpen="nebeneinander"
      >
        {/* die Antwort zuerst, darunter die Felder */}
        <Readout label="Pegel in Ziel-Distanz" value={fmt(spl.level, 1)} unit="dB" big accent />
        <NumField label="Pegel (Referenz)" unit="dB" {...f.bind('pegel')} />
        <NumField
          label="Referenz-Distanz"
          unit="m"
          invalid={badSpl('refDist')}
          {...f.bind('referenz')}
        />
        <NumField
          label="Ziel-Distanz"
          unit="m"
          invalid={badSpl('targetDist')}
          {...f.bind('ziel')}
        />
      </FoldCard>
    </CalcPage>
  )
}
