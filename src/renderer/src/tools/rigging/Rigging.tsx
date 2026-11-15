import { useState } from 'react'
import { CalcPage, NumField, Readout, ReadoutGrid, SectionCard, fmt, parseNum } from '../_calc/ui'
import { Alert } from '@renderer/components/ui/alert'
import { bridle, kgToKn, trussLoads } from './math'

// Rigging-Last: zwei Alltagsfälle – Traverse auf zwei Hängepunkten und Bridle mit zwei Strängen
// (Formeln und Warnstufen in math.ts). Richtwerte OHNE Dynamik-/Sicherheitsfaktoren – ersetzt
// keinen Sachkundigen.

/** kg -> kN mit Einheit (zweite Angabe neben dem kg-Wert) */
function kn(kg: number | null): string {
  return kg == null ? '' : `${fmt(kgToKn(kg), 2)} kN`
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

  const { fA, fB, outside } = trussLoads(
    parseNum(spanRaw),
    parseNum(posRaw),
    parseNum(loadRaw),
    parseNum(ownRaw)
  )
  const { betaDeg, spreadDeg, factor, legForce, legLen, level } = bridle(
    parseNum(bLoadRaw),
    parseNum(heightRaw),
    parseNum(widthRaw)
  )

  return (
    <CalcPage note="Statische Richtwerte ohne Dynamik-, Sicherheits- und Anschlagmittel-Faktoren – Auslegung und Abnahme gehören in die Hände eines Sachkundigen (DGUV V 17/18, SQ Q2).">
      <SectionCard
        title="Traverse auf zwei Punkten"
        desc="Wie verteilt sich eine Punktlast auf die Hängepunkte A und B?"
        hint="Einfacher Träger: A = F · (L − a) ÷ L, B = F · a ÷ L; das Eigengewicht tragen A und B je zur Hälfte. Mehrere Punktlasten einzeln rechnen und die Ergebnisse addieren."
      >
        <NumField label="Spannweite A–B" unit="m" value={spanRaw} onChange={setSpanRaw} />
        <NumField label="Lastposition ab A" unit="m" value={posRaw} onChange={setPosRaw} />
        <NumField label="Punktlast" unit="kg" value={loadRaw} onChange={setLoadRaw} />
        <NumField
          label="Eigengewicht"
          hint="Gewicht der Traverse je Meter (Datenblatt des Herstellers)."
          unit="kg/m"
          value={ownRaw}
          onChange={setOwnRaw}
        />
        {outside && <Alert tone="danger">Die Lastposition liegt außerhalb der Spannweite.</Alert>}
        <ReadoutGrid>
          <Readout label="Punkt A" value={fmt(fA, 1)} unit="kg" sub={kn(fA)} big accent />
          <Readout label="Punkt B" value={fmt(fB, 1)} unit="kg" sub={kn(fB)} big accent />
        </ReadoutGrid>
      </SectionCard>

      <SectionCard
        title="Bridle (2 Stränge)"
        desc="Je flacher der Winkel, desto höher die Kraft im Strang."
        hint="Symmetrisches Bridle, statisch: Kraft je Strang = halbe Last ÷ cos β; β ist der Winkel eines Strangs zur Senkrechten."
      >
        <NumField label="Last" unit="kg" value={bLoadRaw} onChange={setBLoadRaw} />
        <NumField
          label="Höhe"
          hint="Senkrechter Abstand vom Lastpunkt (Zusammenführung der Stränge) bis auf die Höhe der Anschlagpunkte."
          unit="m"
          value={heightRaw}
          onChange={setHeightRaw}
        />
        <NumField
          label="Punktabstand"
          hint="Waagerechter Abstand der beiden Anschlagpunkte."
          unit="m"
          value={widthRaw}
          onChange={setWidthRaw}
        />
        <Readout
          label="Kraft je Strang"
          value={fmt(legForce, 1)}
          unit="kg"
          sub={kn(legForce)}
          big
          accent
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
        {level === 'gelb' && (
          <Alert tone="warning">
            ⚠ Winkel ab 45° zur Senkrechten – deutlich mehr Kraft im Strang (Faktor ab 1,41). Höher
            anschlagen oder die Punkte enger setzen.
          </Alert>
        )}
        {level === 'rot' && (
          <Alert tone="danger">
            ⚠ Winkel ab 60° zur Senkrechten – jeder Strang trägt mindestens die ganze Last (Faktor
            ab 2). So nicht anschlagen!
          </Alert>
        )}
      </SectionCard>
    </CalcPage>
  )
}
