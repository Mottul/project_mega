import { useState } from 'react'
import { Segmented } from '@renderer/components/ui/segmented'
import {
  CalcPage,
  ChoiceField,
  FieldBlock,
  FoldCard,
  NumField,
  Readout,
  fmt,
  parseNum,
  parseOptional,
  trimNum,
  useLinkedFields
} from '../_calc/ui'
import {
  DEFAULT_PF,
  devicesPerCircuit,
  loadFrom,
  powerFactor,
  type LoadField,
  type Phase,
  type SupplyField
} from './math'

// Stromlast & Absicherung: oben Leistung <-> Strom, unten wie viele gleiche Geräte auf einen
// Stromkreis passen (mit Reserve). Die Formeln stehen in math.ts.
// Aufbau nach Muster 2 (Gesamtplan, Pilot K5): Beide Fragen sind zuklappbare Karten mit ihrer
// Antwort als Kurzfassung. Am Handy ist ab Werk nur „Last“ offen, „Geräte pro Stromkreis“ zeigt
// zugeklappt, wie viele Geräte passen; im breiten Fenster stehen beide offen nebeneinander. In
// der zweiten Karte steht die Antwort über den Feldern – wer am Handy tippt, sieht sie über der
// Tastatur. Wenige Möglichkeiten sind Knopfgruppen: ein Tipp statt zwei, alles sichtbar.

// ⓘ der Karte „Geräte pro Stromkreis“. Dreiphasig sagt es, dass je Außenleiter gezählt wird –
// sonst läse man „Strom je Gerät“ und „Summe Strom“ als Strom des ganzen Stromkreises.
const DEVICES_HINT = 'Anschluss, Spannung und cos φ gelten wie unter „Last“.'
const DEVICES_HINT_3 = `${DEVICES_HINT}\nDreiphasig zählt der Rechner je Außenleiter: Jedes Gerät hängt an einem Leiter (U ÷ √3, bei 400 V rund 230 V), die Absicherung gilt je Leiter. Max. Geräte = 3 × Geräte je Leiter; „Strom je Gerät“ und „Summe Strom“ gelten für einen Leiter. Bei Drehstromgeräten sind es höchstens zwei zu wenig, nie zu viele.`

const PHASES: { value: Phase; label: string }[] = [
  { value: '1', label: '1∼ 230 V' },
  { value: '3', label: '3∼ 400 V' }
]
// Was die Liste früher dazusagte („16 A (Schuko)“, „32 A (CEE)“), steht jetzt hinter dem ⓘ
const BREAKERS = ['10', '16', '32', '63'].map((a) => ({ value: a, label: `${a} A` }))
const RESERVES = [
  { value: '1', label: '100 %' },
  { value: '0.8', label: '80 % Dauer' }
]

/** Kurzfassung der Karte „Last“: ihre Antwort; dreiphasig mit „3∼“, der Strom gilt dann je Leiter */
function loadSummary(phase: Phase, p: number | null, i: number | null): string {
  if (p == null || i == null) return '–'
  return `${phase === '3' ? '3∼ · ' : ''}${fmt(p, 0)} W · ${fmt(i)} A`
}

/** Kurzfassung der Karte „Geräte pro Stromkreis“ */
function devicesSummary(n: number | null): string {
  return n == null ? '–' : `${n} ${n === 1 ? 'Gerät' : 'Geräte'} je Kreis`
}

export function PowerLoad(): JSX.Element {
  const [phase, setPhase] = useState<Phase>('1')
  const [uRaw, setURaw] = useState('230')
  const [pfRaw, setPfRaw] = useState('1')
  const load = useLinkedFields<LoadField>('i', '16')
  const [devRaw, setDevRaw] = useState('500')
  const [breaker, setBreaker] = useState('16')
  const [reserve, setReserve] = useState('1')

  // cos φ: leer rechnet mit 1, unlesbar gar nicht (parseOptional)
  const supply = { phase, u: parseNum(uRaw), pf: parseOptional(pfRaw) }
  const pf = powerFactor(supply.pf)
  const last = loadFrom(supply, load.driver, parseNum(load.raw))
  const { p, i, apparent } = last
  // rot ist, womit der Rechenkern nicht rechnet (U nicht über 0, cos φ außerhalb von 0 bis 1 …)
  const bad = (f: SupplyField | LoadField): boolean => last.invalid.includes(f)

  function switchPhase(pNew: Phase): void {
    setPhase(pNew)
    // Spannung auf den jeweils üblichen Standard setzen (frei überschreibbar).
    if ((pNew === '3' && uRaw === '230') || (pNew === '1' && uRaw === '400')) {
      setURaw(pNew === '3' ? '400' : '230')
    }
  }

  // Geräte pro Absicherung.
  const { iDev, maxDevices, sumP, sumI, invalid } = devicesPerCircuit(
    supply,
    parseNum(devRaw),
    Number(breaker),
    Number(reserve)
  )

  return (
    <CalcPage note="Richtwerte ohne Anlaufströme und Leitungslängen – im Zweifel Herstellerangaben und Elektrofachkraft heranziehen.">
      <FoldCard
        id="power-load:last"
        title="Last"
        summary={loadSummary(phase, p, i)}
        desc="Leistung oder Strom eingeben – das andere folgt."
        hint="Einphasig: P = U · I · cos φ. Dreiphasig: P = √3 · U · I · cos φ (U = Spannung zwischen zwei Außenleitern, I = Strom je Leiter)."
        defaultOpen
      >
        <ChoiceField
          label="Anschluss"
          hint="1∼ einphasig, 3∼ dreiphasig (Drehstrom)."
          value={phase}
          options={PHASES}
          onChange={switchPhase}
        />
        <NumField label="Spannung U" unit="V" invalid={bad('u')} value={uRaw} onChange={setURaw} />
        <NumField
          label="Leistungsfaktor cos φ"
          hint="1 bei rein ohmscher Last (Halogen, Heizer). Netzteile, LED-Geräte und Motoren liegen darunter – mit Leistungsfaktorkorrektur (PFC) meist bei 0,9–0,99. Dann fließt mehr Strom als P ÷ U."
          placeholder={trimNum(DEFAULT_PF)}
          invalid={bad('pf')}
          value={pfRaw}
          onChange={setPfRaw}
        />
        <NumField
          label="Leistung P"
          unit="W"
          invalid={bad('p')}
          {...load.bind('p', trimNum(p, 2))}
        />
        <NumField label="Strom I" unit="A" invalid={bad('i')} {...load.bind('i', trimNum(i, 2))} />
        {pf != null && pf < 1 && (
          <Readout
            label="Scheinleistung S"
            hint="Das, was Leitung und Sicherung tatsächlich tragen: U · I (dreiphasig · √3)."
            value={fmt(apparent)}
            unit="VA"
          />
        )}
      </FoldCard>

      <FoldCard
        id="power-load:geraete"
        title="Geräte pro Stromkreis"
        summary={devicesSummary(maxDevices)}
        desc="Wie viele gleiche Geräte verträgt eine Absicherung?"
        hint={phase === '3' ? DEVICES_HINT_3 : DEVICES_HINT}
        defaultOpen="nebeneinander"
      >
        {/* die Antwort zuerst, darunter die Felder, darunter die Nebenwerte */}
        <Readout
          label="Max. Geräte"
          value={maxDevices != null ? String(maxDevices) : ''}
          big
          accent
        />
        <NumField
          label="Leistung je Gerät"
          unit="W"
          invalid={invalid.includes('pDev')}
          value={devRaw}
          onChange={setDevRaw}
        />
        <FieldBlock
          label="Absicherung"
          hint="16 A: Schuko-Steckdose. 32 A und 63 A: CEE-Anschluss."
        >
          <Segmented label="Absicherung" value={breaker} options={BREAKERS} onChange={setBreaker} />
        </FieldBlock>
        <ChoiceField
          label="Auslastung"
          hint="Für Dauerbetrieb (ganze Show) eine Absicherung nur zu etwa 80 % belasten – Reserve für Wärme und Toleranzen."
          value={reserve}
          options={RESERVES}
          onChange={setReserve}
        />
        <Readout label="Strom je Gerät" value={fmt(iDev)} unit="A" />
        <Readout label="Summe Leistung" value={fmt(sumP, 0)} unit="W" />
        <Readout label="Summe Strom" value={fmt(sumI)} unit="A" />
      </FoldCard>
    </CalcPage>
  )
}
