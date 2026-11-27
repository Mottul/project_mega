// RTA (Echtzeit-Analysator): Spektrum des Mikrofons in Terzen bis 1/12 Oktave mit feiner Kurve,
// Bewertung Z/A/C, Mittelung, Spitzen, Pegelmesser (LAF, Leq, Max), Spektrogramm, Referenzkurven
// mit Differenzansicht, Kalibrierung (Offset, Kalibrator, Korrekturdatei) und Feedback-Finder.
// Kleines Werkzeug: läuft im eigenen Fenster und in der Handy-PWA – nur Web-APIs, kein `api`.
// Gemessen wird pro Bild über Refs (ohne React); die Zahlen gehen ~5× je Sekunde in den Zustand.
// Hier stehen Kopf und Anordnung; Messen und Zeichnen in useRtaMessung.ts, Spektrum und
// Spektrogramm in RtaSpektrum.tsx, ihre Bedienung und die Statuszeile in RtaBedienung.tsx, die
// Karten in RtaCards.tsx.

import { useState, type PointerEvent } from 'react'
import { AlertTriangle, Mic } from 'lucide-react'
import { Alert } from '@renderer/components/ui/alert'
import { Card } from '@renderer/components/ui/card'
import { CalcPage, Readout, ReadoutGrid, RunButton } from '../_calc/ui'
import { unsupportedReason } from './engine'
import { MessStatus, SpektrumBedienung } from './RtaBedienung'
import { DisplayCard, FeedbackCard, InputCard, ReferenceCard } from './RtaCards'
import { dbText, Spektrogramm, Spektrum } from './RtaSpektrum'
import { useRta } from './store'
import { useRtaMessung, type Pointer } from './useRtaMessung'

export function Rta(): JSX.Element {
  const p = useRta()
  const [frozen, setFrozen] = useState(false)
  const [hover, setHover] = useState<Pointer | null>(null)
  const {
    running,
    starting,
    error,
    info,
    inputs,
    read,
    start,
    stop,
    reset,
    calibrate,
    proc,
    tracker,
    graph,
    spec,
    specAxes,
    history,
    shown
  } = useRtaMessung(p, frozen, hover)
  const unsupported = unsupportedReason()

  /* ---- Ablesen per Zeiger/Finger ---- */
  const pointerIn =
    (area: Pointer['area']) =>
    (e: PointerEvent<HTMLDivElement>): void => {
      const r = e.currentTarget.getBoundingClientRect()
      setHover({ x: e.clientX - r.left, y: e.clientY - r.top, area })
    }

  const unit = p.diffRef ? 'dB' : p.offset != null ? 'dB' : 'dBFS'
  const lname = (suffix: string): string => `L${p.weighting}${suffix}`
  const off = p.offset ?? 0

  const head = (
    <Card className="space-y-3 p-3 sm:p-4">
      {/* Start und der Hauptpegel in einer Zeile, darunter die übrigen Pegel klein */}
      <div className="flex items-center gap-3">
        <RunButton
          big
          running={running}
          starting={starting}
          onStart={() => void start()}
          onStop={stop}
          startLabel="Messen"
          startIcon={Mic}
          disabled={Boolean(unsupported)}
          className="w-32 min-w-0 shrink-0 px-3"
        />
        <div className="min-w-0 flex-1">
          <Readout
            label={lname(p.meter)}
            hint={`Pegel mit Bewertung ${p.weighting} und Zeitbewertung ${p.meter === 'F' ? 'Fast (125 ms)' : 'Slow (1 s)'}. In dB SPL erst nach dem Kalibrieren, sonst relativ zur Vollaussteuerung (dBFS).`}
            value={dbText(read.level + off)}
            unit={unit}
            big
            accent
          />
        </div>
      </div>

      {unsupported && <Alert tone="warning">{unsupported}</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}
      {read.clip && running && (
        <Alert tone="danger" icon={AlertTriangle} title="Übersteuert">
          Der Eingang erreicht Vollaussteuerung – Pegel am Interface senken, sonst stimmt nichts.
        </Alert>
      )}

      <ReadoutGrid min="6rem">
        <Readout
          label={lname('eq')}
          hint="Energetischer Mittelwert seit dem Start bzw. „Zurücksetzen“."
          value={dbText(read.leq + off)}
          unit={unit}
        />
        <Readout
          label={lname(`${p.meter}max`)}
          hint="Höchster Pegel (zeitbewertet) seit dem Start bzw. „Zurücksetzen“."
          value={dbText(read.lmax + off)}
          unit={unit}
        />
        <Readout
          label="Spitze"
          hint="Größter Abtastwert am Eingang (Sample-Peak, unbewertet) – zeigt, wie viel Luft bis zur Vollaussteuerung bleibt."
          value={dbText(read.peak)}
          unit="dBFS"
        />
      </ReadoutGrid>

      <Spektrum
        graph={graph}
        running={running}
        unsupported={unsupported}
        hover={hover}
        setHover={setHover}
        pointerIn={pointerIn}
        proc={proc}
        shown={shown}
        unit={unit}
      />
      {p.spectrogram !== 'off' && (
        <Spektrogramm
          p={p}
          spec={spec}
          specAxes={specAxes}
          history={history}
          running={running}
          hover={hover}
          setHover={setHover}
          pointerIn={pointerIn}
          unit={unit}
        />
      )}

      <SpektrumBedienung
        p={p}
        frozen={frozen}
        setFrozen={setFrozen}
        running={running}
        reset={reset}
      />

      <MessStatus info={info} p={p} frozen={frozen} />
    </Card>
  )

  return (
    <CalcPage head={head}>
      <FeedbackCard
        tracks={read.feedback}
        log={read.log}
        running={running}
        onClearLog={() => tracker.current.reset()}
        offset={off}
        unit={unit}
      />
      <ReferenceCard
        canAdd={running}
        onAdd={() => useRta.getState().addReference(proc.current.curveZ())}
      />
      <InputCard inputs={inputs} running={running} onCalibrate={calibrate} levelZ={read.levelZ} />
      <DisplayCard />
    </CalcPage>
  )
}
