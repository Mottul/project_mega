// Karte „Signal“ des Testtongenerators: Wahl des Signals und seine Felder – Frequenz (Feld,
// Schieber, Schnellwahl), Sweep-Dauer oder das Metronom (Tempo mit „Tippen“, Takt, Schlag-Anzeige).

import { useEffect, useRef, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import type { PatternToneSettings, ToneSignal } from '@shared/testton'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { NumberField } from '@renderer/components/ui/number-field'
import { Segmented } from '@renderer/components/ui/segmented'
import { cn } from '@renderer/lib/utils'
import { FieldRow, FieldUnit, QuickPick, SectionCard, Slider } from '../_calc/ui'
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

export function SignalCard({
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
  return (
    <SectionCard
      title="Signal"
      desc="Ein Tipp wechselt – auch während der Ton läuft."
      hint={SIGNAL_HINTS[tone.signal]}
    >
      <Segmented<ToneSignal>
        label="Signal"
        value={tone.signal}
        options={SIGNALS}
        onChange={(signal) => set({ signal })}
        wrap
      />
      {tone.signal === 'sine' && (
        <FrequencyRow value={tone.frequency} onChange={(frequency) => set({ frequency })} />
      )}
      {tone.signal === 'sweep' && (
        <FieldRow label="Dauer" hint="Ein Durchlauf von 20 Hz bis 20 kHz, danach 0,5 s Pause.">
          <div className="relative w-28">
            <NumberField
              value={tone.sweepSeconds}
              min={1}
              max={60}
              onCommit={(sweepSeconds) => set({ sweepSeconds })}
              aria-label="Dauer je Sweep in Sekunden"
              className="pr-8"
            />
            <FieldUnit>s</FieldUnit>
          </div>
        </FieldRow>
      )}
      {tone.signal === 'metronome' && (
        <Metronome tone={tone} set={set} playing={playing} currentBeat={currentBeat} />
      )}
    </SectionCard>
  )
}

function FrequencyRow({
  value,
  onChange
}: {
  value: number
  onChange: (hz: number) => void
}): JSX.Element {
  return (
    <FieldRow label="Frequenz">
      <div className="space-y-2">
        <div className="relative w-32">
          <NumberField
            value={value}
            min={F_MIN}
            max={F_MAX}
            onCommit={onChange}
            aria-label="Frequenz in Hz"
            className="pr-10"
          />
          <FieldUnit>Hz</FieldUnit>
        </div>
        <Slider
          label="Frequenz, logarithmisch"
          value={hzToSlider(value)}
          min={0}
          max={SLIDER_STEPS}
          step={1}
          onChange={(pos) => onChange(sliderToHz(pos))}
        />
        <QuickPick
          label="Frequenz-Schnellwahl"
          value={value}
          options={FREQ_PRESETS.map((f) => ({ value: f, label: formatHz(f) }))}
          onPick={onChange}
        />
      </div>
    </FieldRow>
  )
}

/** Zahl mit „−“ und „+“ daneben – am Handy leichter zu treffen als das Feld */
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
  return (
    <div className="flex items-center gap-1.5">
      <Button
        size="icon"
        variant="outline"
        aria-label={less}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <Minus className="size-4" />
      </Button>
      <div className={cn('relative', unit ? 'w-24' : 'w-16')}>
        <NumberField
          value={value}
          min={min}
          max={max}
          onCommit={onChange}
          aria-label={label}
          className={cn('text-center', unit && 'pr-11')}
        />
        {unit && <FieldUnit>{unit}</FieldUnit>}
      </div>
      <Button
        size="icon"
        variant="outline"
        aria-label={more}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
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
      <FieldRow
        label="Tempo"
        hint="„Tippen“ im Takt: Aus den letzten Tipps ergibt sich das Tempo; nach 2 s Pause zählt es neu. Ein neues Tempo gilt ab dem nächsten Schlag, ohne neu bei der Eins anzufangen."
      >
        <div className="flex flex-wrap items-center gap-1.5">
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
            className="select-none [@media(pointer:coarse)]:h-10"
            // beim Drücken zählen, nicht beim Loslassen: genauer, besonders mit dem Finger
            onPointerDown={(e) => e.button === 0 && tap(e.timeStamp)}
            // Tastatur (Eingabe auf dem Knopf): Klick ohne Zeiger
            onClick={(e) => e.detail === 0 && tap(performance.now())}
          >
            Tippen
          </Button>
        </div>
      </FieldRow>
      <FieldRow label="Takt">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Stepper
            value={tone.beatsPerBar}
            min={1}
            max={12}
            onChange={(beatsPerBar) => set({ beatsPerBar })}
            label="Schläge je Takt"
            less="Ein Schlag weniger"
            more="Ein Schlag mehr"
          />
          <Checkbox
            checked={tone.accent}
            onChange={(accent) => set({ accent })}
            label="Eins betonen"
            disabled={tone.beatsPerBar < 2}
          />
        </div>
      </FieldRow>
      <FieldRow label="Schlag">
        <BeatDots
          beatsPerBar={tone.beatsPerBar}
          accent={tone.accent}
          playing={playing}
          currentBeat={currentBeat}
        />
      </FieldRow>
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
      className="flex min-h-5 flex-wrap items-center gap-2"
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
