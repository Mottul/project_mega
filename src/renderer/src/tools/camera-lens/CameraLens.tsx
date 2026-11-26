import { Segmented } from '@renderer/components/ui/segmented'
import { cn } from '@renderer/lib/utils'
import {
  CalcPage,
  FieldBlock,
  FoldCard,
  NumField,
  Readout,
  SelectField,
  fmt,
  parseNum,
  trimNum
} from '../_calc/ui'
import { useCalcFields, type CalcSpec } from '../_calc/useCalcFields'
import { framingLabel, lensView, type LensField } from './optics'

// Kameraobjektiv-Rechner: aus Brennweite, Sensor, optionalem Telekonverter
// („Doppler") und Entfernung wird der Bildausschnitt berechnet und visualisiert –
// wie viel einer Person bei maximalem Zoom ins Bild passt. Lochkamera-Näherung
// (Sichtfeld = Entfernung · Sensormaß ÷ Brennweite); dieselbe Dreiecks-Mathematik
// wie der Throw-Ratio-Rechner, nur kameraseitig. Gerechnet wird in optics.ts (lensView).
// Aufbau nach Muster 2 (Gesamtplan, K6): „Kamera & Objektiv“ stellt man einmal ein – am Handy
// ist die Karte ab Werk zu und zeigt Sensor und Brennweite; „Motiv & Bildausschnitt“ ist die
// Frage, ihre Antwort steht über den Feldern. Im breiten Fenster stehen beide offen nebeneinander.

/** `short`: Name in der Kurzfassung der zugeklappten Karte */
const SENSORS: { key: string; label: string; short: string; w: number; h: number }[] = [
  { key: 'ff', label: 'Vollformat (Kleinbild)', short: 'Vollformat', w: 36, h: 24 },
  { key: 'apsc', label: 'APS-C (Nikon/Sony, 1,5×)', short: 'APS-C 1,5×', w: 23.5, h: 15.6 },
  { key: 'apsc-c', label: 'APS-C (Canon, 1,6×)', short: 'APS-C 1,6×', w: 22.3, h: 14.9 },
  { key: 's35', label: 'Super 35 (Cine)', short: 'Super 35', w: 24.89, h: 18.66 },
  { key: 'mft', label: 'MFT / Four Thirds (2×)', short: 'MFT', w: 17.3, h: 13 },
  { key: '1in', label: '1 Zoll', short: '1 Zoll', w: 13.2, h: 8.8 },
  { key: 's16', label: 'Super 16', short: 'Super 16', w: 12.52, h: 7.41 }
]

// Was die Liste dazusagte („2× Telekonverter (Doppler)“), steht hinter dem ⓘ
const TELECONV: { key: string; label: string; f: number }[] = [
  { key: '1', label: 'keiner', f: 1 },
  { key: '1.4', label: '1,4×', f: 1.4 },
  { key: '1.7', label: '1,7×', f: 1.7 },
  { key: '2', label: '2×', f: 2 }
]

/**
 * Kurzfassung der Karte „Kamera & Objektiv“: Sensor, Brennweite und – falls einer dran ist – der
 * Telekonverter („Vollformat · 200 mm · 2×“); „–“, solange damit nicht zu rechnen ist.
 */
function cameraSummary(
  sensorKey: string,
  input: { sensorW: number | null; sensorH: number | null; focal: number | null },
  tele: { f: number; label: string },
  equiv: number | null
): string {
  const { sensorW, sensorH, focal } = input
  if (equiv == null || sensorW == null || sensorH == null || focal == null) return '–'
  const sensor =
    SENSORS.find((s) => s.key === sensorKey)?.short ?? `${fmt(sensorW, 2)} × ${fmt(sensorH, 2)} mm`
  return `${sensor} · ${fmt(focal, 1)} mm${tele.f !== 1 ? ` · ${tele.label}` : ''}`
}

/** Kurzfassung der Karte „Motiv & Bildausschnitt“: Einstellungsgröße und Anteil im Bild */
function framingSummary(ratio: number | null, visiblePct: number | null): string {
  if (ratio == null || visiblePct == null) return '–'
  // ohne die Erklärung in Klammern: „Totale (ganze Person + Luft)“ -> „Totale“
  return `${framingLabel(ratio).split(' (')[0]} · ${fmt(visiblePct, 0)} %`
}

/** Gemerkt (K4): alle Eingaben; Sensor und Telekonverter nur als einer ihrer Einträge */
const FELDER = {
  sensor: { vorgabe: 'ff', erlaubt: [...SENSORS.map((s) => s.key), 'custom'] },
  sensorBreite: '36',
  sensorHoehe: '24',
  brennweite: '200',
  konverter: { vorgabe: '1', erlaubt: TELECONV.map((t) => t.key) },
  entfernung: '25',
  person: '1,75'
} satisfies CalcSpec<string>

export function CameraLens(): JSX.Element {
  const f = useCalcFields('camera-lens', FELDER)
  const { sensor: sensorKey, sensorBreite: sensorWRaw, sensorHoehe: sensorHRaw } = f.v
  const { brennweite: focalRaw, konverter: tcKey, entfernung: distRaw, person: personRaw } = f.v
  const setFocalRaw = (v: string): void => f.set('brennweite', v)
  const setTcKey = (v: string): void => f.set('konverter', v)
  const setDistRaw = (v: string): void => f.set('entfernung', v)
  const setPersonRaw = (v: string): void => f.set('person', v)

  function pickSensor(key: string): void {
    const s = SENSORS.find((x) => x.key === key)
    f.patch(
      s ? { sensor: key, sensorBreite: trimNum(s.w), sensorHoehe: trimNum(s.h) } : { sensor: key }
    )
  }

  const tele = TELECONV.find((t) => t.key === tcKey) ?? TELECONV[0]
  const tc = tele.f
  const camera = {
    sensorW: parseNum(sensorWRaw),
    sensorH: parseNum(sensorHRaw),
    focal: parseNum(focalRaw)
  }
  const { focalEff, equiv, aovH, aovV, fovW, fovH, ratio, visiblePct, aspect, invalid } = lensView({
    ...camera,
    teleconverter: tc,
    dist: parseNum(distRaw),
    person: parseNum(personRaw)
  })
  // rot ist, womit der Rechenkern nicht rechnet (nicht über 0)
  const bad = (field: LensField): boolean => invalid.includes(field)

  return (
    <CalcPage onReset={f.changed ? f.reset : undefined}>
      <FoldCard
        id="camera-lens:kamera"
        title="Kamera & Objektiv"
        summary={cameraSummary(sensorKey, camera, tele, equiv)}
        desc="Sensor, Brennweite und ggf. Telekonverter wählen."
        defaultOpen="nebeneinander"
      >
        <SelectField
          label="Sensor"
          hint="Aus der Liste wählen oder Breite und Höhe selbst eintragen (Datenblatt der Kamera)."
          value={sensorKey}
          onChange={pickSensor}
        >
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
          invalid={bad('sensorW')}
          value={sensorWRaw}
          onChange={(v) => {
            f.patch({ sensorBreite: v, sensor: 'custom' })
          }}
        />
        <NumField
          label="Sensorhöhe"
          unit="mm"
          invalid={bad('sensorH')}
          value={sensorHRaw}
          onChange={(v) => {
            f.patch({ sensorHoehe: v, sensor: 'custom' })
          }}
        />
        <NumField
          label="Brennweite"
          hint="Die längste Brennweite des Objektivs (maximaler Zoom) – für den engsten Ausschnitt."
          unit="mm"
          invalid={bad('focal')}
          value={focalRaw}
          onChange={setFocalRaw}
        />
        <FieldBlock
          label="Telekonverter"
          hint="Verlängert die Brennweite um seinen Faktor (ein 2×-Konverter heißt auch „Doppler“) und kostet Licht: 1,4× eine, 2× zwei Blendenstufen."
        >
          <Segmented
            label="Telekonverter"
            value={tcKey}
            options={TELECONV.map((t) => ({ value: t.key, label: t.label }))}
            onChange={setTcKey}
          />
        </FieldBlock>
        {tc !== 1 && <Readout label="Effektive Brennweite" value={fmt(focalEff, 0)} unit="mm" />}
        <Readout
          label="KB-Äquivalent"
          hint="Die Brennweite, die an Vollformat (Kleinbild) denselben Bildwinkel ergibt."
          value={fmt(equiv, 0)}
          unit="mm"
          accent
        />
        <Readout
          label="Bildwinkel (B × H)"
          value={aovH != null && aovV != null ? `${fmt(aovH, 1)} × ${fmt(aovV, 1)}` : ''}
          unit="°"
        />
      </FoldCard>

      <FoldCard
        id="camera-lens:motiv"
        title="Motiv & Bildausschnitt"
        summary={framingSummary(ratio, visiblePct)}
        desc="Wie viel der Person passt bei maximalem Zoom ins Bild?"
        hint="Näherung (Lochkamera): Sichtfeld = Entfernung × Sensormaß ÷ Brennweite. Beispiel: 200 mm an Vollformat in 25 m ergibt ein etwa 3 m hohes Sichtfeld – die ganze Person passt; mit 2×-Konverter (400 mm) bleiben etwa 1,5 m, also ab der Hüfte aufwärts."
        defaultOpen
      >
        {/* die Antwort zuerst, darunter die Felder, darunter Sichtfeld und Bild */}
        <Readout
          label={ratio != null ? framingLabel(ratio) : 'Bildausschnitt'}
          hint="Anteil der Körperhöhe, der ins Bild passt – mit der Kamera mittig auf die Person gerichtet."
          value={visiblePct != null ? fmt(visiblePct, 0) : ''}
          unit="% im Bild"
          accent
          big
        />
        <NumField
          label="Entfernung zur Person"
          unit="m"
          invalid={bad('dist')}
          value={distRaw}
          onChange={setDistRaw}
        />
        <NumField
          label="Personengröße"
          unit="m"
          invalid={bad('person')}
          value={personRaw}
          onChange={setPersonRaw}
        />
        <Readout
          label="Sichtfeld"
          value={fovW != null && fovH != null ? `${fmt(fovW, 2)} × ${fmt(fovH, 2)}` : ''}
          unit="m (B × H)"
        />
        <FramingView ratio={ratio} aspect={aspect} />
      </FoldCard>
    </CalcPage>
  )
}

/** Höhe der Zeichnung: am Handy kleiner – mit der vollen Höhe war die Seite 726 px hoch, der
 *  Bildschirm zeigt 657 */
const viewH = 'h-44 sm:h-64'

/** Silhouette + Kamerarahmen: zeigt, welcher (mittig zentrierte) Anteil der Person
 *  bei maximalem Zoom ins Bild fällt. Rahmenhöhe = Sichtfeldhöhe in Personenhöhen (`ratio`),
 *  Rahmenbreite nach dem Seitenverhältnis des Sensors – beide aus dem Rechenkern, nur über 0. */
function FramingView({
  ratio,
  aspect
}: {
  ratio: number | null
  aspect: number | null
}): JSX.Element {
  if (ratio == null || aspect == null) {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-md border border-dashed border-border text-center text-xs text-muted-foreground',
          viewH
        )}
      >
        Sensor, Brennweite, Entfernung und Personengröße eingeben.
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
  const frameH = Math.min(ratio * personPx, cap)
  const frameW = Math.min(frameH * aspect, VB_W * 20)
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
  // Farben über Klassen (Akzent als Token), nicht als SVG-Attribut – dort wirken keine
  // CSS-Variablen.
  const personShapes = (className: string): JSX.Element => (
    <g className={className}>
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
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className={cn('w-auto', viewH)}
        style={{ overflow: 'hidden' }}
      >
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
        {personShapes('fill-current opacity-[0.22]')}
        {/* im Rahmen sichtbarer Teil in Akzentfarbe */}
        <g clipPath="url(#camframe)">{personShapes('fill-primary')}</g>
        {/* Kamerarahmen */}
        <rect
          x={fx}
          y={fy}
          width={frameW}
          height={frameH}
          fill="none"
          className="stroke-primary"
          strokeWidth={2}
          rx={3}
        />
      </svg>
    </div>
  )
}
