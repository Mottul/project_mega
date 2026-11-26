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
  trimNum,
  useLinkedFields
} from '../_calc/ui'
import { Alert } from '@renderer/components/ui/alert'
import {
  ASPECTS,
  aspectRatio,
  screenSize,
  throwFrom,
  type SizeField,
  type ThrowField
} from './math'

// Projektionsverhältnis (Throw Ratio = Abstand ÷ Bildbreite). Hilft beim Wählen
// des passenden Objektivs: oben die Leinwandmaße (Seitenverhältnis + ein Maß),
// unten Throw Ratio <-> Projektionsabstand verknüpft. Gerechnet wird in math.ts.
// Aufbau wie in allen Rechnern (Gesamtplan, K6; entschieden am 26. November 2026): Beide Karten
// lassen sich zuklappen und zeigen dann ihre Werte; „Objektiv & Abstand“ ist ab Werk nur offen,
// wenn die Karten nebeneinander stehen (im 520 px breiten Fenster und am Handy untereinander).
// Beide Karten bestehen aus verknüpften Feldern – eine eigene Antwort über den Feldern gibt es
// nicht.

/** Kurzfassung der Karte „Leinwand“: Seitenverhältnis und Bildmaße */
function screenSummary(aspect: string, w: number | null, h: number | null): string {
  return w == null || h == null ? '–' : `${aspect} · ${fmt(w)} × ${fmt(h)} m`
}

/** Kurzfassung der Karte „Objektiv & Abstand“: Throw Ratio und Projektionsabstand */
function lensSummary(tr: number | null, dist: number | null): string {
  return tr == null || dist == null ? '–' : `TR ${fmt(tr)} · ${fmt(dist)} m`
}

export function ThrowRatio(): JSX.Element {
  const [aspectKey, setAspectKey] = useState('16:9')
  const size = useLinkedFields<SizeField>('w', '5')
  const lens = useLinkedFields<ThrowField>('dist', '8')

  const screen = screenSize(size.driver, parseNum(size.raw), aspectRatio(aspectKey))
  const { w, h, diag, area } = screen
  const ratio = throwFrom(lens.driver, parseNum(lens.raw), w)
  // rot ist nur eine Quelle, die der Rechenkern nicht rechnet (nicht über 0)
  const badSize = (f: SizeField): boolean => screen.invalid.includes(f)
  const badLens = (f: ThrowField): boolean => ratio.invalid.includes(f)

  const aspectLabel = ASPECTS.find((a) => a.key === aspectKey)?.label ?? aspectKey

  return (
    <CalcPage>
      <FoldCard
        id="throw-ratio:leinwand"
        title="Leinwand"
        summary={screenSummary(aspectLabel, w, h)}
        desc="Seitenverhältnis wählen, ein Maß eingeben – die übrigen folgen."
        defaultOpen
      >
        {/* sechs kurze Möglichkeiten: Knopfgruppe statt Liste, bei schmalem Fenster in Reihen */}
        <FieldBlock label="Seitenverhältnis" hint="2,35 : 1 heißt auch Cinemascope.">
          <Segmented
            label="Seitenverhältnis"
            value={aspectKey}
            options={ASPECTS.map((a) => ({ value: a.key, label: a.label }))}
            onChange={setAspectKey}
            wrap={4}
          />
        </FieldBlock>
        <NumField
          label="Bildbreite"
          unit="m"
          invalid={badSize('w')}
          {...size.bind('w', trimNum(w, 3))}
        />
        <NumField
          label="Bildhöhe"
          unit="m"
          invalid={badSize('h')}
          {...size.bind('h', trimNum(h, 3))}
        />
        <NumField
          label="Diagonale"
          unit="m"
          invalid={badSize('diag')}
          {...size.bind('diag', trimNum(diag, 3))}
        />
        <Readout label="Bildfläche" value={fmt(area)} unit="m²" />
      </FoldCard>

      <FoldCard
        id="throw-ratio:objektiv"
        title="Objektiv & Abstand"
        summary={lensSummary(ratio.tr, ratio.dist)}
        desc="Throw Ratio oder Abstand eingeben – das andere folgt."
        hint="Throw Ratio (TR) = Projektionsabstand ÷ Bildbreite. Passend ist ein Objektiv, dessen TR-Bereich den Wert abdeckt. Beispiel: 5 m Bildbreite aus 8 m Abstand ergibt TR 1,6 – ein Objektiv mit 1,2–1,8 passt."
        defaultOpen="nebeneinander"
      >
        <NumField
          label="Throw Ratio"
          invalid={badLens('tr')}
          {...lens.bind('tr', trimNum(ratio.tr, 3))}
        />
        <NumField
          label="Projektionsabstand"
          unit="m"
          invalid={badLens('dist')}
          {...lens.bind('dist', trimNum(ratio.dist, 3))}
        />
        {w == null && <Alert tone="warning">Zuerst die Bildbreite der Leinwand festlegen.</Alert>}
      </FoldCard>
    </CalcPage>
  )
}
