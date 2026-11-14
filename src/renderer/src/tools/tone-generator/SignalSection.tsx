// Teil „Signal“ des Testtongenerators (untere Hälfte der Karte): Wahl des Signals und seine Felder – Frequenz (Feld,
// Schieber, Schnellwahl), Sweep-Dauer oder das Metronom (Tempo mit „Tippen“, Takt, Schlag-Anzeige
// rechts neben „Takt“). Signale ohne Felder zeigen an deren Stelle ihre Erklärung.

import { useEffect, useRef, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import type { PatternToneSettings, ToneSignal } from '@shared/testton'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { NumberField } from '@renderer/components/ui/number-field'
import { Segmented } from '@renderer/components/ui/segmented'
import { cn } from '@renderer/lib/utils'
import { FieldBlock, FieldUnit, QuickPick, Slider } from '../_calc/ui'
import { FREQ_PRESETS, SIGNAL_HINTS, SIGNAL_OPTIONS, formatHz } from '../_tone/plan'
import type { SoundingBeat } from '../_tone/engine'
import {
  BPM_MAX,
  BPM_MIN,
  F_MAX,
  F_MIN,
  SLIDER_STEPS,
  hzToSlider,
  sliderToHz,
  tapTempo
} from './bedienung'

/** Alle Signale des Kerns außer AV-Sync (braucht den Blitz des Testbilds) */
const SIGNALS = SIGNAL_OPTIONS.filter((o) => o.value !== 'avsync').map((o) => ({
  value: o.value,
  label: o.short
}))

/** Signale ohne eigene Felder: Dort steht stattdessen ihre Erklärung (sonst hinter dem ⓘ) */
const HAS_FIELDS: ToneSignal[] = ['sine', 'sweep', 'metronome']

/** Höhe am Handy wie die Knopfgruppen: eine Zeile, ein Raster */
const touchRow = '[@media(pointer:coarse)]:h-10'
/** Rechte Spalte neben einem Zahlenknopf („Tippen“, „Eins betonen“): in jeder Zeile gleich breit */
const sideCol = 'w-32 shrink-0'

export function SignalSection({
  tone,
  set,
  playing,
  currentBeat
}: {
  tone: PatternToneSettings
  set: (patch: Partial<PatternToneSettings>) => void
  playing: boolean
  currentBeat: () => SoundingBeat | null
}): JSX.Element {
  const fields = HAS_FIELDS.includes(tone.signal)
  return (
    <>
      <FieldBlock label="Signal" hint={fields ? SIGNAL_HINTS[tone.signal] : undefined}>
        <Segmented<ToneSignal>
          label="Signal"
          value={tone.signal}
          options={SIGNALS}
          onChange={(signal) => set({ signal })}
          wrap={4.75}
        />
      </FieldBlock>
      {!fields && (
        <p className="text-sm text-muted-foreground" data-testid="signal-text">
          {SIGNAL_HINTS[tone.signal]}
        </p>
      )}
      {tone.signal === 'sine' && (
        <Frequency value={tone.frequency} onChange={(frequency) => set({ frequency })} />
      )}
      {tone.signal === 'sweep' && (
        <FieldBlock label="Dauer" hint="Ein Durchlauf von 20 Hz bis 20 kHz, danach 0,5 s Pause.">
          <div className="flex flex-wrap items-center gap-2">
            <Stepper
              value={tone.sweepSeconds}
              min={1}
              max={60}
              onChange={(sweepSeconds) => set({ sweepSeconds })}
              label="Dauer je Sweep in Sekunden"
              less="Kürzer"
              more="Länger"
              unit="s"
            />
            <span className={cn(sideCol, 'text-sm text-muted-foreground')}>20 Hz → 20 kHz</span>
          </div>
        </FieldBlock>
      )}
      {tone.signal === 'metronome' && (
        <Metronome tone={tone} set={set} playing={playing} currentBeat={currentBeat} />
      )}
    </>
  )
}

function Frequency({
  value,
  onChange
}: {
  value: number
  onChange: (hz: number) => void
}): JSX.Element {
  return (
    <FieldBlock
      label="Frequenz"
      value={
        <div className="relative w-28">
          <NumberField
            value={value}
            min={F_MIN}
            max={F_MAX}
            onCommit={onChange}
            aria-label="Frequenz in Hz"
            className={cn('pr-10 text-right', touchRow)}
          />
          <FieldUnit>Hz</FieldUnit>
        </div>
      }
    >
      <Slider
        label="Frequenz, logarithmisch"
        value={hzToSlider(value)}
        min={0}
        max={SLIDER_STEPS}
        step={1}
        onChange={(pos) => onChange(sliderToHz(pos))}
        className="h-7"
      />
      <QuickPick
        fill
        label="Frequenz-Schnellwahl"
        value={value}
        options={FREQ_PRESETS.map((f) => ({ value: f, label: formatHz(f) }))}
        onPick={onChange}
      />
    </FieldBlock>
  )
}

/**
 * Zahl mit „−“ und „+“ daneben – am Handy leichter zu treffen als das Feld. Füllt die Zeile bis
 * auf die rechte Spalte; zu schmal (unter 11rem) rückt die rechte Spalte darunter.
 */
function Stepper({
  value,
  min,
  max,
  onChange,
  label,
  less,
  more,
  unit
}: {
  value: number
  min: number
  max: number
  onChange: (v: number) => void
  /** Name des Felds */
  label: string
  /** Namen der Knöpfe */
  less: string
  more: string
  unit?: string
}): JSX.Element {
  const icon = cn('shrink-0', touchRow, '[@media(pointer:coarse)]:w-10')
  return (
    <div className="flex min-w-[11rem] flex-1 items-center gap-1.5">
      <Button
        size="icon"
        variant="outline"
        aria-label={less}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className={icon}
      >
        <Minus className="size-4" />
      </Button>
      <div className="relative min-w-0 flex-1">
        <NumberField
          value={value}
          min={min}
          max={max}
          onCommit={onChange}
          aria-label={label}
          className={cn('text-center', unit && 'pl-2 pr-11', touchRow)}
        />
        {unit && <FieldUnit>{unit}</FieldUnit>}
      </div>
      <Button
        size="icon"
        variant="outline"
        aria-label={more}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className={icon}
      >
        <Plus className="size-4" />
      </Button>
    </div>
  )
}

function Metronome({
  tone,
  set,
  playing,
  currentBeat
}: {
  tone: PatternToneSettings
  set: (patch: Partial<PatternToneSettings>) => void
  playing: boolean
  currentBeat: () => SoundingBeat | null
}): JSX.Element {
  const taps = useRef<number[]>([])
  function tap(at: number): void {
    const r = tapTempo(taps.current, at)
    taps.current = r.taps
    if (r.bpm != null) set({ bpm: r.bpm })
  }
  return (
    <>
      <FieldBlock
        label="Tempo"
        hint="„Tippen“ im Takt: Aus den letzten Tipps ergibt sich das Tempo; nach 2 s Pause zählt es neu. Ein neues Tempo gilt ab dem nächsten Schlag, ohne neu bei der Eins anzufangen."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Stepper
            value={tone.bpm}
            min={BPM_MIN}
            max={BPM_MAX}
            onChange={(bpm) => set({ bpm })}
            label="Tempo in BPM"
            less="Langsamer"
            more="Schneller"
            unit="BPM"
          />
          <Button
            variant="outline"
            className={cn(sideCol, 'select-none', touchRow)}
            // beim Drücken zählen, nicht beim Loslassen: genauer, besonders mit dem Finger
            onPointerDown={(e) => e.button === 0 && tap(e.timeStamp)}
            // Tastatur (Eingabe auf dem Knopf): Klick ohne Zeiger
            onClick={(e) => e.detail === 0 && tap(performance.now())}
          >
            Tippen
          </Button>
        </div>
      </FieldBlock>
      <FieldBlock
        label="Takt"
        value={
          <BeatDots
            beatsPerBar={tone.beatsPerBar}
            accent={tone.accent}
            playing={playing}
            currentBeat={currentBeat}
          />
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <Stepper
            value={tone.beatsPerBar}
            min={1}
            max={12}
            onChange={(beatsPerBar) => set({ beatsPerBar })}
            label="Schläge je Takt"
            less="Ein Schlag weniger"
            more="Ein Schlag mehr"
          />
          <div className={cn(sideCol, 'pl-1')}>
            <Checkbox
              checked={tone.accent}
              onChange={(accent) => set({ accent })}
              label="Eins betonen"
              disabled={tone.beatsPerBar < 2}
            />
          </div>
        </div>
      </FieldBlock>
    </>
  )
}

/**
 * Ein Punkt je Schlag, der klingende leuchtet, die Eins ist größer. Liest den Schlag aus der Uhr
 * des Tons (abzüglich der Ausgabelatenz) statt aus einem eigenen Timer – sonst liefe die Anzeige
 * dem Ton davon. React rendert nur, wenn ein neuer Schlag kommt.
 */
function BeatDots({
  beatsPerBar,
  accent,
  playing,
  currentBeat
}: {
  beatsPerBar: number
  accent: boolean
  playing: boolean
  currentBeat: () => SoundingBeat | null
}): JSX.Element {
  const [beat, setBeat] = useState<number | null>(null)
  useEffect(() => {
    if (!playing) {
      setBeat(null)
      return
    }
    let frame = 0
    let last: number | null = null
    const loop = (): void => {
      const b = currentBeat()
      const at = b ? b.at : null
      if (at !== last) {
        last = at
        setBeat(b ? b.inBar : null)
      }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [playing, currentBeat])
  return (
    <div
      className="flex min-h-5 flex-wrap items-center justify-end gap-2"
      data-testid="beat-dots"
      data-beat={beat ?? ''}
      aria-hidden
    >
      {Array.from({ length: beatsPerBar }, (_, i) => (
        <span
          key={i}
          className={cn(
            'rounded-full transition-colors duration-75',
            i === 0 && accent && beatsPerBar > 1 ? 'size-5' : 'size-3.5',
            beat === i ? 'bg-primary' : 'bg-muted-foreground/25'
          )}
        />
      ))}
    </div>
  )
}
