import { useState } from 'react'
import {
  CalcAlert,
  CalcPage,
  NumField,
  Readout,
  ReadoutGrid,
  SectionCard,
  fmt,
  parseNum
} from '../_calc/ui'

// Rigging-Last: zwei Alltagsfälle.
// 1) Traverse auf zwei Hängepunkten (einfacher Träger): Auflagerkräfte aus
//    Punktlast-Position + Eigengewicht. A = F·(L−a)/L + w·L/2, B = F·a/L + w·L/2.
// 2) Bridle (zweisträngiges Anschlagmittel): Kraft je Strang = F / (2·cosβ),
//    β aus Höhe und Punktabstand. Der Faktor 1/cosβ explodiert bei flachen
//    Winkeln -> Warnstufen ab 45°/60°.
// Richtwerte OHNE Dynamik-/Sicherheitsfaktoren – ersetzt keinen Sachkundigen.

const G = 9.81

/** kg -> kN mit Einheit (zweite Angabe neben dem kg-Wert) */
function kn(kg: number | null): string {
  return kg == null ? '' : `${fmt((kg * G) / 1000, 2)} kN`
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

  const L = parseNum(spanRaw)
  const aPos = parseNum(posRaw)
  const F = parseNum(loadRaw)
  const w = parseNum(ownRaw) ?? 0

  const valid = L != null && L > 0 && aPos != null && aPos >= 0 && aPos <= L && F != null && F >= 0
  const own = valid ? (w * L!) / 2 : null
  const fA = valid ? (F! * (L! - aPos!)) / L! + own! : null
  const fB = valid ? (F! * aPos!) / L! + own! : null

  const bF = parseNum(bLoadRaw)
  const h = parseNum(heightRaw)
  const b = parseNum(widthRaw)
  const bValid = bF != null && bF > 0 && h != null && h > 0 && b != null && b >= 0
  const beta = bValid ? Math.atan(b! / 2 / h!) : null // Winkel von der Vertikalen
  const betaDeg = beta != null ? (beta * 180) / Math.PI : null
  const factor = beta != null ? 1 / Math.cos(beta) : null
  const legForce = bValid && factor != null ? (bF! / 2) * factor : null
  const legLen = bValid ? Math.hypot(h!, b! / 2) : null
  const level = betaDeg == null ? null : betaDeg >= 60 ? 'rot' : betaDeg >= 45 ? 'gelb' : 'ok'

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
        {L != null && aPos != null && aPos > L && (
          <CalcAlert tone="danger">Die Lastposition liegt außerhalb der Spannweite.</CalcAlert>
        )}
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
            value={fmt(betaDeg != null ? betaDeg * 2 : null, 1)}
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
          <CalcAlert tone="warning">
            ⚠ Winkel ab 45° zur Senkrechten – deutlich mehr Kraft im Strang (Faktor ab 1,41). Höher
            anschlagen oder die Punkte enger setzen.
          </CalcAlert>
        )}
        {level === 'rot' && (
          <CalcAlert tone="danger">
            ⚠ Winkel ab 60° zur Senkrechten – jeder Strang trägt mindestens die ganze Last (Faktor
            ab 2). So nicht anschlagen!
          </CalcAlert>
        )}
      </SectionCard>
    </CalcPage>
  )
}
