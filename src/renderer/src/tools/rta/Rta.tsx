// RTA (Echtzeit-Analysator): Spektrum des Mikrofons in Terzen bis 1/12 Oktave mit feiner Kurve,
// Bewertung Z/A/C, Mittelung, Spitzen, Pegelmesser (LAF, Leq, Max), Spektrogramm, Referenzkurven
// mit Differenzansicht, Kalibrierung (Offset, Kalibrator, Korrekturdatei) und Feedback-Finder.
// Kleines Werkzeug: läuft im eigenen Fenster und in der Handy-PWA – nur Web-APIs, kein `api`.
// Gemessen wird pro Bild über Refs (ohne React); die Zahlen gehen ~5× je Sekunde in den Zustand.
// Hier stehen Kopf und Anordnung; Messen und Zeichnen in useRtaMessung.ts, Spektrum und
// Spektrogramm in RtaSpektrum.tsx, ihre Bedienung und die Statuszeile in RtaBedienung.tsx, die
// Karten in RtaCards.tsx. Quer (Handy, niedriges Fenster; Variante `quer:`) rechts die Bedienung,
// links Spektrum und Wasserfall in voller Höhe, die Karten als Schublade – Skizzen
// docs/bilder/rta-quer-*.svg.

import { useState, type PointerEvent } from 'react'
import { AlertTriangle, ChevronRight, Mic, SlidersHorizontal, X } from 'lucide-react'
import { Alert } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { cn } from '@renderer/lib/utils'
import { CalcPage, Readout, ReadoutGrid, RunButton } from '../_calc/ui'
import { unsupportedReason } from './engine'
import { MessStatus, PegelZeile, SpektrumBedienung } from './RtaBedienung'
import { DisplayCard, FeedbackCard, InputCard, ReferenceCard } from './RtaCards'
import { dbText, Spektrogramm, Spektrum } from './RtaSpektrum'
import { useRta } from './store'
import { useRtaMessung, type Pointer } from './useRtaMessung'

/**
 * Quer offen: die Karten als Schublade links über dem Spektrum. Sie lässt die Spalte rechts frei
 * (14rem, dazu je 0,5rem Rand von Seite und Kopf), scrollt in sich und schließt per ✕ oder Tipp
 * daneben. `auto-rows-max`: Die Schublade ist fest hoch, die Karten haben `overflow-hidden` –
 * ohne das stauchte das Raster ihre Zeilen auf die Höhe der Schublade, und jede Karte lag über
 * der nächsten.
 */
const SCHUBLADE =
  'quer:absolute quer:inset-y-0 quer:left-0 quer:z-20 quer:!mt-0 quer:w-[min(23rem,calc(100%-15.5rem))] quer:auto-rows-max quer:content-start quer:gap-2 quer:overflow-y-auto quer:border-r quer:border-border quer:bg-background quer:p-2 quer:shadow-xl'

export function Rta(): JSX.Element {
  const p = useRta()
  const [frozen, setFrozen] = useState(false)
  const [hover, setHover] = useState<Pointer | null>(null)
  // Quer: Karten in der Schublade zeigen („Einstellungen“); hochkant stehen sie unter dem Kopf
  const [karten, setKarten] = useState(false)
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

  // Leq, Max und Spitze: hochkant als Kacheln unter dem Pegel, quer als Zeile unter dem Wasserfall
  const kleinePegel = [
    {
      label: lname('eq'),
      hint: 'Energetischer Mittelwert seit dem Start bzw. „Zurücksetzen“.',
      value: dbText(read.leq + off),
      unit
    },
    {
      label: lname(`${p.meter}max`),
      hint: 'Höchster Pegel (zeitbewertet) seit dem Start bzw. „Zurücksetzen“.',
      value: dbText(read.lmax + off),
      unit
    },
    {
      label: 'Spitze',
      hint: 'Größter Abtastwert am Eingang (Sample-Peak, unbewertet) – zeigt, wie viel Luft bis zur Vollaussteuerung bleibt.',
      value: dbText(read.peak),
      unit: 'dBFS'
    }
  ]

  // Hochkant steht alles untereinander, die Reihenfolge setzt `order` (die Gruppen sind dort
  // `contents`). Quer ein Raster: links Spektrum und Wasserfall in voller Höhe über beide Reihen,
  // rechts oben Start und Pegel, darunter die Bedienung. Dieselben Elemente, nur anders
  // angeordnet – Drehen baut nichts neu auf, die Zeichenflächen bleiben (Gesamtplan, K9). Im Baum
  // steht jedes Element vor bzw. nach den Zeichenflächen wie früher: Sonst glättet Chromium die
  // Schrift anders, und hochkant wäre der RTA nicht mehr pixelgleich. `data-fuellt-quer`: Das
  // Fenster der App gibt quer seine Höhe her (ToolHost), statt sich nach dem Inhalt zu richten.
  const head = (
    <Card
      data-fuellt-quer
      className="flex flex-col gap-3 p-3 sm:p-4 quer:grid quer:h-full quer:grid-cols-[minmax(0,1fr)_14rem] quer:grid-rows-[auto_minmax(0,1fr)] quer:gap-x-2 quer:gap-y-1.5 quer:p-2"
    >
      {/* Start und der Hauptpegel in einer Zeile, darunter die übrigen Pegel klein */}
      <div className="order-1 flex items-center gap-3 quer:flex-col quer:items-stretch quer:col-start-2 quer:row-start-1 quer:gap-1.5">
        <RunButton
          big
          running={running}
          starting={starting}
          onStart={() => void start()}
          onStop={stop}
          startLabel="Messen"
          startIcon={Mic}
          disabled={Boolean(unsupported)}
          className="w-32 min-w-0 shrink-0 px-3 quer:w-full"
        />
        <div className="min-w-0 flex-1 quer:flex-none">
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

      <div className="order-3 quer:hidden">
        <ReadoutGrid min="6rem">
          {kleinePegel.map((k) => (
            <Readout key={k.label} label={k.label} hint={k.hint} value={k.value} unit={k.unit} />
          ))}
        </ReadoutGrid>
      </div>

      <div className="contents quer:col-start-1 quer:row-span-2 quer:row-start-1 quer:flex quer:min-h-0 quer:min-w-0 quer:flex-col quer:gap-2">
        {unsupported && (
          <Alert tone="warning" className="order-2">
            {unsupported}
          </Alert>
        )}
        {error && (
          <Alert tone="danger" className="order-2">
            {error}
          </Alert>
        )}
        {read.clip && running && (
          <Alert tone="danger" icon={AlertTriangle} title="Übersteuert" className="order-2">
            Der Eingang erreicht Vollaussteuerung – Pegel am Interface senken, sonst stimmt nichts.
          </Alert>
        )}

        <Spektrum
          className="order-4 quer:min-h-0 quer:flex-[3]"
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
            className={cn(
              'order-5 quer:min-h-0',
              p.spectrogram === 'waterfall' ? 'quer:flex-[2]' : 'quer:flex-[1.4]'
            )}
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

        <div className="order-7 quer:flex quer:min-w-0 quer:items-baseline quer:gap-3">
          <PegelZeile pegel={kleinePegel} className="hidden shrink-0 quer:flex" />
          <MessStatus
            className="quer:min-w-0 quer:flex-1 quer:flex-nowrap quer:overflow-hidden quer:whitespace-nowrap"
            info={info}
            p={p}
            frozen={frozen}
          />
        </div>

        {/* quer bei offener Schublade: Spektrum abgedunkelt, ein Tipp darauf schließt sie */}
        {karten && (
          <div
            aria-hidden
            onClick={() => setKarten(false)}
            className="hidden quer:absolute quer:inset-y-0 quer:left-0 quer:right-[15rem] quer:z-10 quer:block quer:bg-background/60"
          />
        )}
      </div>

      <div
        data-testid="rta-spalte"
        className="contents quer:col-start-2 quer:row-start-2 quer:flex quer:min-h-0 quer:flex-col quer:gap-1.5 quer:overflow-y-auto"
      >
        <SpektrumBedienung
          className="order-6"
          p={p}
          frozen={frozen}
          setFrozen={setFrozen}
          running={running}
          reset={reset}
        />

        <Button
          variant={karten ? 'secondary' : 'outline'}
          aria-expanded={karten}
          onClick={() => setKarten((k) => !k)}
          className="order-8 hidden shrink-0 justify-start quer:flex [@media(pointer:coarse)]:h-10"
        >
          <SlidersHorizontal className="size-4" />
          Einstellungen
          {karten ? <X className="ml-auto size-4" /> : <ChevronRight className="ml-auto size-4" />}
        </Button>
      </div>
    </Card>
  )

  return (
    <CalcPage
      head={head}
      className="quer:relative quer:h-full quer:max-w-none quer:p-2"
      rasterClassName={karten ? SCHUBLADE : 'quer:hidden'}
    >
      {/* Kopf der Schublade, nur quer. Bewusst keine Überschrift: Die Karten tragen je ein <h2>,
          und ein (hochkant verstecktes) <h2> davor zählte sonst als erste Karte mit. */}
      <div className="hidden items-center justify-between gap-2 pl-2 quer:flex">
        <p className="text-sm font-semibold">Einstellungen</p>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Einstellungen schließen"
          onClick={() => setKarten(false)}
        >
          <X className="size-4" />
        </Button>
      </div>
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
