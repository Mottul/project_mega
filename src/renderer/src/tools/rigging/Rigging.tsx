import { useState } from 'react'
import {
  CalcPage,
  FoldCard,
  NumField,
  Readout,
  ReadoutGrid,
  fmt,
  parseNum,
  parseOptional,
  trimNum
} from '../_calc/ui'
import { Alert } from '@renderer/components/ui/alert'
import { STATUS } from '@renderer/components/ui/status'
import { DEFAULT_OWN, bridle, kgToKn, trussLoads, type BridleField, type TrussField } from './math'

// Rigging-Last: zwei Alltagsfälle – Traverse auf zwei Hängepunkten und Bridle mit zwei Strängen
// (Formeln und Warnstufen in math.ts). Richtwerte OHNE Dynamik-/Sicherheitsfaktoren – ersetzt
// keinen Sachkundigen.
// Aufbau nach Muster 2 (Gesamtplan, K6 wie der Pilot Stromlast): Beide Fragen sind zuklappbare
// Karten mit ihrer Antwort als Kurzfassung; am Handy ist ab Werk nur „Traverse“ offen, im breiten
// Fenster stehen beide offen nebeneinander. In jeder Karte steht die Antwort über den Feldern,
// die Warnung direkt darunter – wer am Handy tippt, sieht beides über der Tastatur.

/** kg -> kN mit Einheit (zweite Angabe neben dem kg-Wert) */
function kn(kg: number | null): string {
  return kg == null ? '' : `${fmt(kgToKn(kg), 2)} kN`
}

/** Kurzfassung der Karte „Traverse“: die Kräfte an beiden Punkten */
function trussSummary(fA: number | null, fB: number | null): string {
  return fA == null || fB == null ? '–' : `A ${fmt(fA, 0)} kg · B ${fmt(fB, 0)} kg`
}

/** Kurzfassung der Karte „Bridle“: Kraft je Strang und Winkel zur Senkrechten */
function bridleSummary(legForce: number | null, betaDeg: number | null): string {
  return legForce == null || betaDeg == null
    ? '–'
    : `${fmt(legForce, 0)} kg je Strang · ${fmt(betaDeg, 0)}°`
}

export function Rigging(): JSX.Element {
  // Traverse
  const [spanRaw, setSpanRaw] = useState('8')
  const [posRaw, setPosRaw] = useState('3')
  const [loadRaw, setLoadRaw] = useState('120')
  const [ownRaw, setOwnRaw] = useState('10')

  // Bridle
  const [bLoadRaw, setBLoadRaw] = useState('200')
  const [heightRaw, setHeightRaw] = useState('2')
  const [widthRaw, setWidthRaw] = useState('4')

  const truss = trussLoads(
    parseNum(spanRaw),
    parseNum(posRaw),
    parseNum(loadRaw),
    // leer zählt als 0, unlesbar gar nicht (parseOptional)
    parseOptional(ownRaw)
  )
  const { fA, fB, outside } = truss
  const b = bridle(parseNum(bLoadRaw), parseNum(heightRaw), parseNum(widthRaw))
  const { betaDeg, spreadDeg, factor, legForce, legLen, level } = b
  // rot ist, womit der Rechenkern nicht rechnet
  const badTruss = (f: TrussField): boolean => truss.invalid.includes(f)
  const badBridle = (f: BridleField): boolean => b.invalid.includes(f)

  return (
    <CalcPage note="Statische Richtwerte ohne Dynamik-, Sicherheits- und Anschlagmittel-Faktoren – Auslegung und Abnahme gehören in die Hände eines Sachkundigen (DGUV V 17/18, SQ Q2).">
      <FoldCard
        id="rigging:traverse"
        title="Traverse auf zwei Punkten"
        summary={trussSummary(fA, fB)}
        desc="Wie verteilt sich eine Punktlast auf die Hängepunkte A und B?"
        hint="Einfacher Träger: A = F · (L − a) ÷ L, B = F · a ÷ L; das Eigengewicht tragen A und B je zur Hälfte. Mehrere Punktlasten einzeln rechnen und die Ergebnisse addieren."
        defaultOpen
      >
        {/* die Antwort zuerst, die Meldung direkt darunter, dann die Felder */}
        <ReadoutGrid>
          <Readout label="Punkt A" value={fmt(fA, 1)} unit="kg" sub={kn(fA)} big accent />
          <Readout label="Punkt B" value={fmt(fB, 1)} unit="kg" sub={kn(fB)} big accent />
        </ReadoutGrid>
        {outside && <Alert tone="danger">Die Lastposition liegt außerhalb der Spannweite.</Alert>}
        <NumField
          label="Spannweite A–B"
          unit="m"
          invalid={badTruss('span')}
          value={spanRaw}
          onChange={setSpanRaw}
        />
        <NumField
          label="Lastposition ab A"
          unit="m"
          invalid={badTruss('pos')}
          value={posRaw}
          onChange={setPosRaw}
        />
        <NumField
          label="Punktlast"
          unit="kg"
          invalid={badTruss('load')}
          value={loadRaw}
          onChange={setLoadRaw}
        />
        <NumField
          label="Eigengewicht"
          hint="Gewicht der Traverse je Meter (Datenblatt des Herstellers)."
          unit="kg/m"
          placeholder={trimNum(DEFAULT_OWN)}
          invalid={badTruss('ownPerM')}
          value={ownRaw}
          onChange={setOwnRaw}
        />
      </FoldCard>

      <FoldCard
        id="rigging:bridle"
        title="Bridle (2 Stränge)"
        summary={bridleSummary(legForce, betaDeg)}
        desc="Je flacher der Winkel, desto höher die Kraft im Strang."
        hint="Symmetrisches Bridle, statisch: Kraft je Strang = halbe Last ÷ cos β; β ist der Winkel eines Strangs zur Senkrechten."
        defaultOpen="nebeneinander"
      >
        <Readout
          label="Kraft je Strang"
          value={fmt(legForce, 1)}
          unit="kg"
          sub={kn(legForce)}
          big
          accent
        />
        {/* Warnstufen mit Titel und dem Symbol der Statusstufe – wie überall in der App */}
        {level === 'gelb' && (
          <Alert tone="warning" title="Flacher Winkel" icon={STATUS.warning.icon}>
            Winkel ab 45° zur Senkrechten – deutlich mehr Kraft im Strang (Faktor ab 1,41). Höher
            anschlagen oder die Punkte enger setzen.
          </Alert>
        )}
        {level === 'rot' && (
          <Alert tone="danger" title="So nicht anschlagen" icon={STATUS.danger.icon}>
            Winkel ab 60° zur Senkrechten – jeder Strang trägt mindestens die ganze Last (Faktor ab
            2).
          </Alert>
        )}
        <NumField
          label="Last"
          unit="kg"
          invalid={badBridle('load')}
          value={bLoadRaw}
          onChange={setBLoadRaw}
        />
        <NumField
          label="Höhe"
          hint="Senkrechter Abstand vom Lastpunkt (Zusammenführung der Stränge) bis auf die Höhe der Anschlagpunkte."
          unit="m"
          invalid={badBridle('height')}
          value={heightRaw}
          onChange={setHeightRaw}
        />
        <NumField
          label="Punktabstand"
          hint="Waagerechter Abstand der beiden Anschlagpunkte."
          unit="m"
          invalid={badBridle('width')}
          value={widthRaw}
          onChange={setWidthRaw}
        />
        <ReadoutGrid>
          <Readout label="Winkel zur Senkrechten" value={fmt(betaDeg, 1)} unit="°" />
          <Readout
            label="Spreizwinkel"
            hint="Winkel zwischen den beiden Strängen."
            value={fmt(spreadDeg, 1)}
            unit="°"
          />
          <Readout
            label="Lastfaktor"
            hint="1 ÷ cos β: So viel mehr als die halbe Last zieht an jedem Strang."
            value={fmt(factor, 2)}
            unit="×"
          />
          <Readout label="Stranglänge" value={fmt(legLen, 2)} unit="m" />
        </ReadoutGrid>
      </FoldCard>
    </CalcPage>
  )
}
