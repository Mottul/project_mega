import { useState } from 'react'
import { CalcPage, NumField, Readout, SectionCard, SelectField, fmt, parseNum } from '../_calc/ui'
import { angleOfView, diag, equiv35, fovAtDistance, framingLabel } from './optics'

// Kameraobjektiv-Rechner: aus Brennweite, Sensor, optionalem Telekonverter
// („Doppler") und Entfernung wird der Bildausschnitt berechnet und visualisiert –
// wie viel einer Person bei maximalem Zoom ins Bild passt. Lochkamera-Näherung
// (Sichtfeld = Entfernung · Sensormaß ÷ Brennweite); dieselbe Dreiecks-Mathematik
// wie der Throw-Ratio-Rechner, nur kameraseitig. Die Optik-Formeln liegen in optics.ts.

const SENSORS: { key: string; label: string; w: number; h: number }[] = [
  { key: 'ff', label: 'Vollformat (Kleinbild)', w: 36, h: 24 },
  { key: 'apsc', label: 'APS-C (Nikon/Sony, 1.5×)', w: 23.5, h: 15.6 },
  { key: 'apsc-c', label: 'APS-C (Canon, 1.6×)', w: 22.3, h: 14.9 },
  { key: 's35', label: 'Super 35 (Cine)', w: 24.89, h: 18.66 },
  { key: 'mft', label: 'MFT / Four Thirds (2×)', w: 17.3, h: 13 },
  { key: '1in', label: '1 Zoll', w: 13.2, h: 8.8 },
  { key: 's16', label: 'Super 16', w: 12.52, h: 7.41 }
]

const TELECONV: { key: string; label: string; f: number }[] = [
  { key: '1', label: 'keiner (1×)', f: 1 },
  { key: '1.4', label: '1.4× Telekonverter', f: 1.4 },
  { key: '1.7', label: '1.7× Telekonverter', f: 1.7 },
  { key: '2', label: '2× Telekonverter (Doppler)', f: 2 }
]

export function CameraLens(): JSX.Element {
  const [sensorKey, setSensorKey] = useState('ff')
  const [sensorWRaw, setSensorWRaw] = useState('36')
  const [sensorHRaw, setSensorHRaw] = useState('24')
  const [focalRaw, setFocalRaw] = useState('200')
  const [tcKey, setTcKey] = useState('1')
  const [distRaw, setDistRaw] = useState('25')
  const [personRaw, setPersonRaw] = useState('1.75')

  function pickSensor(key: string): void {
    setSensorKey(key)
    const s = SENSORS.find((x) => x.key === key)
    if (s) {
      setSensorWRaw(String(s.w))
      setSensorHRaw(String(s.h))
    }
  }

  const sensorW = parseNum(sensorWRaw)
  const sensorH = parseNum(sensorHRaw)
  const focal = parseNum(focalRaw)
  const tc = TELECONV.find((t) => t.key === tcKey)?.f ?? 1
  const dist = parseNum(distRaw)
  const person = parseNum(personRaw)

  const focalEff = focal != null && focal > 0 ? focal * tc : null
  const sensorDiag = sensorW != null && sensorH != null ? diag(sensorW, sensorH) : null
  const equiv =
    focalEff != null && sensorDiag != null && sensorDiag > 0 ? equiv35(focalEff, sensorDiag) : null
  const aovH =
    sensorW != null && sensorW > 0 && focalEff != null ? angleOfView(sensorW, focalEff) : null
  const aovV =
    sensorH != null && sensorH > 0 && focalEff != null ? angleOfView(sensorH, focalEff) : null

  const fovW =
    dist != null && dist > 0 && sensorW != null && focalEff != null
      ? fovAtDistance(dist, sensorW, focalEff)
      : null
  const fovH =
    dist != null && dist > 0 && sensorH != null && focalEff != null
      ? fovAtDistance(dist, sensorH, focalEff)
      : null

  // Rahmenhöhe gemessen in Personenhöhen (>=1 -> ganze Person passt).
  const ratio = fovH != null && person != null && person > 0 ? fovH / person : null
  const visiblePct = ratio != null ? Math.min(1, ratio) * 100 : null

  return (
    <CalcPage>
      <SectionCard
        title="Kamera & Objektiv"
        desc="Sensor wählen (oder Maße eintippen), Brennweite und – falls genutzt – einen Telekonverter."
      >
        <SelectField label="Sensor" value={sensorKey} onChange={pickSensor}>
          {SENSORS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
          <option value="custom">Eigene Maße …</option>
        </SelectField>
        <NumField
          label="Sensorbreite"
          unit="mm"
          value={sensorWRaw}
          onChange={(v) => {
            setSensorWRaw(v)
            setSensorKey('custom')
          }}
        />
        <NumField
          label="Sensorhöhe"
          unit="mm"
          value={sensorHRaw}
          onChange={(v) => {
            setSensorHRaw(v)
            setSensorKey('custom')
          }}
        />
        <NumField
          label="Brennweite (max. Zoom)"
          unit="mm"
          value={focalRaw}
          onChange={setFocalRaw}
        />
        <SelectField label="Telekonverter" value={tcKey} onChange={setTcKey}>
          {TELECONV.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </SelectField>
        {tc !== 1 && <Readout label="Effektive Brennweite" value={fmt(focalEff, 0)} unit="mm" />}
        <Readout label="KB-Äquivalent" value={fmt(equiv, 0)} unit="mm" accent />
        <Readout
          label="Bildwinkel (horiz. × vert.)"
          value={aovH != null && aovV != null ? `${fmt(aovH, 1)} × ${fmt(aovV, 1)}` : ''}
          unit="°"
        />
      </SectionCard>

      <SectionCard
        title="Motiv & Bildausschnitt"
        desc="Entfernung zur Person eingeben – die Visualisierung zeigt, wie viel bei maximalem Zoom ins Bild passt."
      >
        <NumField label="Entfernung zur Person" unit="m" value={distRaw} onChange={setDistRaw} />
        <NumField label="Personengröße" unit="m" value={personRaw} onChange={setPersonRaw} />
        <Readout
          label="Sichtfeld bei dieser Entfernung"
          value={fovW != null && fovH != null ? `${fmt(fovW, 2)} × ${fmt(fovH, 2)}` : ''}
          unit="m (B×H)"
        />
        <Readout
          label={ratio != null ? framingLabel(ratio) : 'Bildausschnitt'}
          value={visiblePct != null ? fmt(visiblePct, 0) : ''}
          unit="% der Körperhöhe im Bild"
          accent
          big
        />
        <FramingView fovH={fovH} person={person} sensorW={sensorW} sensorH={sensorH} />
        <p className="pt-1 text-xs text-muted-foreground">
          Näherung (Lochkamera): Sichtfeld = Entfernung × Sensormaß ÷ Brennweite. Beispiel: 200 mm
          auf Vollformat in 25 m → ~3 m hohes Sichtfeld, die ganze Person passt locker; mit
          2×-Doppler (400 mm) bleiben ~1,5 m → etwa ab der Hüfte aufwärts.
        </p>
      </SectionCard>
    </CalcPage>
  )
}

/** Silhouette + Kamerarahmen: zeigt, welcher (mittig zentrierte) Anteil der Person
 *  bei maximalem Zoom ins Bild fällt. Rahmenhöhe = Sichtfeldhöhe in Personenhöhen. */
function FramingView({
  fovH,
  person,
  sensorW,
  sensorH
}: {
  fovH: number | null
  person: number | null
  sensorW: number | null
  sensorH: number | null
}): JSX.Element {
  if (
    fovH == null ||
    fovH <= 0 ||
    person == null ||
    person <= 0 ||
    sensorW == null ||
    sensorH == null ||
    sensorH <= 0
  ) {
    return (
      <div className="flex h-64 items-center justify-center rounded-md border border-dashed border-border text-center text-xs text-muted-foreground">
        Brennweite, Sensor, Entfernung und Personengröße eingeben.
      </div>
    )
  }

  const VB_W = 240
  const VB_H = 300
  const padY = 18
  const personPx = VB_H - padY * 2
  const cx = VB_W / 2
  const top = padY
  const centerY = top + personPx / 2

  // Rahmen mittig auf die Person; sehr große Rahmen begrenzen (Clip bleibt korrekt).
  const cap = VB_H * 20
  const frameH = Math.min((fovH / person) * personPx, cap)
  const frameW = Math.min(frameH * (sensorW / sensorH), VB_W * 20)
  const fx = cx - frameW / 2
  const fy = centerY - frameH / 2

  // Personen-Silhouette (Kopf + Rumpf + zwei Beine) als wiederverwendbare Gruppe.
  const headR = personPx * 0.075
  const headCy = top + headR
  const torsoTop = headCy + headR * 0.85
  const torsoBot = top + personPx * 0.58
  const torsoW = personPx * 0.2
  const legW = torsoW * 0.42
  const legGap = torsoW * 0.14
  const feetY = top + personPx
  const personShapes = (fill: string, opacity: number): JSX.Element => (
    <g fill={fill} opacity={opacity}>
      <circle cx={cx} cy={headCy} r={headR} />
      <rect
        x={cx - torsoW / 2}
        y={torsoTop}
        width={torsoW}
        height={torsoBot - torsoTop}
        rx={torsoW * 0.28}
      />
      <rect
        x={cx - legGap / 2 - legW}
        y={torsoBot - 4}
        width={legW}
        height={feetY - torsoBot + 4}
        rx={legW * 0.4}
      />
      <rect
        x={cx + legGap / 2}
        y={torsoBot - 4}
        width={legW}
        height={feetY - torsoBot + 4}
        rx={legW * 0.4}
      />
    </g>
  )

  return (
    <div className="flex justify-center rounded-md border border-border bg-muted/20 p-3 text-muted-foreground">
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="h-64 w-auto" style={{ overflow: 'hidden' }}>
        <defs>
          <clipPath id="camframe">
            <rect x={fx} y={fy} width={frameW} height={frameH} />
          </clipPath>
        </defs>
        <line
          x1={cx - 64}
          y1={feetY}
          x2={cx + 64}
          y2={feetY}
          stroke="currentColor"
          strokeOpacity={0.45}
          strokeWidth={1}
        />
        {/* ganze Person gedämpft */}
        {personShapes('currentColor', 0.22)}
        {/* im Rahmen sichtbarer Teil in Akzentfarbe */}
        <g clipPath="url(#camframe)">{personShapes('#ffce2c', 1)}</g>
        {/* Kamerarahmen */}
        <rect
          x={fx}
          y={fy}
          width={frameW}
          height={frameH}
          fill="none"
          stroke="#ffce2c"
          strokeWidth={2}
          rx={3}
        />
      </svg>
    </div>
  )
}
