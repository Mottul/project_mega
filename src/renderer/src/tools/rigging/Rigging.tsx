import { useState } from 'react'
import { CalcPage, NumField, Readout, SectionCard, fmt, parseNum } from '../_calc/ui'

// Rigging-Last: zwei Alltagsfälle.
// 1) Traverse auf zwei Hängepunkten (einfacher Träger): Auflagerkräfte aus
//    Punktlast-Position + Eigengewicht. A = F·(L−a)/L + w·L/2, B = F·a/L + w·L/2.
// 2) Bridle (zweisträngiges Anschlagmittel): Kraft je Strang = F / (2·cosβ),
//    β aus Höhe und Punktabstand. Der Faktor 1/cosβ explodiert bei flachen
//    Winkeln -> Warnstufen ab 45°/60°.
// Richtwerte OHNE Dynamik-/Sicherheitsfaktoren – ersetzt keinen Sachkundigen.

const G = 9.81

function kn(kg: number | null): string {
  return kg == null ? '' : fmt((kg * G) / 1000, 2)
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
    <CalcPage>
      <SectionCard
        title="Traverse auf zwei Punkten"
        desc="Punktlast auf einem einfachen Träger: wie verteilt sich die Last auf die Hängepunkte A und B?"
      >
        <NumField label="Spannweite A–B" unit="m" value={spanRaw} onChange={setSpanRaw} />
        <NumField label="Lastposition (von A)" unit="m" value={posRaw} onChange={setPosRaw} />
        <NumField label="Punktlast" unit="kg" value={loadRaw} onChange={setLoadRaw} />
        <NumField label="Traversen-Eigengewicht" unit="kg/m" value={ownRaw} onChange={setOwnRaw} />
        {L != null && aPos != null && aPos > L && (
          <p className="text-xs text-destructive">Lastposition liegt außerhalb der Spannweite.</p>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          <Readout label="Punkt A" value={fmt(fA, 1)} unit="kg" big accent />
          <Readout label="Punkt B" value={fmt(fB, 1)} unit="kg" big accent />
          <Readout label="Punkt A" value={kn(fA)} unit="kN" />
          <Readout label="Punkt B" value={kn(fB)} unit="kN" />
        </div>
        <p className="pt-1 text-xs text-muted-foreground">
          Eigengewicht wird je zur Hälfte auf A und B verteilt. Mehrere Punktlasten: einzeln rechnen
          und Auflagerkräfte addieren (Superposition).
        </p>
      </SectionCard>

      <SectionCard
        title="Bridle / Anschlagwinkel (2 Stränge)"
        desc="Je flacher der Winkel, desto höher die Kraft im Strang – aus Höhe und Abstand der Anschlagpunkte."
      >
        <NumField label="Last" unit="kg" value={bLoadRaw} onChange={setBLoadRaw} />
        <NumField label="Höhe (vertikal)" unit="m" value={heightRaw} onChange={setHeightRaw} />
        <NumField
          label="Abstand der Anschlagpunkte"
          unit="m"
          value={widthRaw}
          onChange={setWidthRaw}
        />
        <div className="grid gap-2 sm:grid-cols-2">
          <Readout label="Kraft je Strang" value={fmt(legForce, 1)} unit="kg" big accent />
          <Readout label="Kraft je Strang" value={kn(legForce)} unit="kN" />
          <Readout label="Winkel zur Vertikalen" value={fmt(betaDeg, 1)} unit="°" />
          <Readout
            label="Spreizwinkel gesamt"
            value={fmt(betaDeg != null ? betaDeg * 2 : null, 1)}
            unit="°"
          />
          <Readout label="Lastfaktor (1/cos β)" value={fmt(factor, 2)} unit="×" />
          <Readout label="Stranglänge" value={fmt(legLen, 2)} unit="m" />
        </div>
        {level === 'gelb' && (
          <p className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-medium text-primary">
            ⚠ Winkel ≥ 45° zur Vertikalen – Strangkraft deutlich erhöht (Faktor ≥ 1,41). Höher
            anschlagen oder Punkte enger setzen.
          </p>
        )}
        {level === 'rot' && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
            ⚠ Winkel ≥ 60° zur Vertikalen – Strangkraft ≥ doppelte halbe Last (Faktor ≥ 2). So nicht
            anschlagen!
          </p>
        )}
        <p className="pt-1 text-xs text-muted-foreground">
          Symmetrisches 2-Strang-Bridle, statisch. OHNE Dynamik-, Sicherheits- und
          Anschlagmittel-Faktoren – Auslegung und Abnahme gehören in die Hände eines Sachkundigen
          (DGUV 17/18, SQ Q2).
        </p>
      </SectionCard>
    </CalcPage>
  )
}
