// Testton im Testbild-Werkzeug: Schalter „Ton“ in der Ausgabe-Leiste, Einstellungen in der
// Schublade. Gespielt wird in diesem Fenster (engine.ts) auf dem gewählten Ausgabegerät; die
// Einstellungen liegen in settings.json (wie Geräte und Ausgaben der übrigen Werkzeuge).

import { useEffect, useMemo, useRef, useState } from 'react'
import { AudioLines } from 'lucide-react'
import { type PatternToneSettings, type ToneSignal } from '@shared/types'
import { BarToggle, PanelSection } from '@renderer/components/ToolShell'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Field } from '@renderer/components/ui/field'
import { NumberField } from '@renderer/components/ui/number-field'
import { Select } from '@renderer/components/ui/select'
import { updateSettings, useSettings } from '@renderer/lib/settings'
import { toast } from '@renderer/lib/toast'
import { useAktivMelden } from '@renderer/lib/aktivMelden'
import { ToneEngine } from './engine'
import {
  CHANNEL_OPTIONS,
  FREQ_PRESETS,
  SIGNAL_OPTIONS,
  TONE_LEVEL_MAX,
  TONE_LEVEL_MIN,
  formatDb,
  formatHz,
  normalizeTone,
  toneSummary,
  usesChannelChoice
} from './plan'

const SIGNAL_HINTS: Record<ToneSignal, string> = {
  sine: 'Dauerton. 1 kHz bei −18 dBFS ist der übliche Bezugspegel (EBU R 68).',
  sweep:
    'Gleitender Sinus von 20 Hz bis 20 kHz (logarithmisch), danach 0,5 s Pause – findet Resonanzen, Klirren und Lücken im Frequenzgang.',
  pink: 'Gleiche Energie je Oktave – zum Einmessen von Lautsprechern und für den Analyzer (RTA).',
  white: 'Gleiche Energie je Frequenz, klingt hell – für Messungen mit FFT.',
  metronome: 'Klick im Tempo, die Eins auf Wunsch höher.',
  ident:
    '1 kHz auf beiden Kanälen; links setzt der Ton einmal aus, rechts zweimal je 4 s (angelehnt an GLITS der BBC) – vertauschte Kanäle hört man sofort.',
  polarity:
    'Positiver Puls alle 0,5 s für Polaritätsprüfer. Am Lautsprecher bewegt sich die Membran dabei nach vorn.',
  avsync:
    'Piept zu jeder vollen Sekunde, wenn das Testbild „AV-Sync“ blitzt. Ein Messgerät oder eine Zeitlupen-Aufnahme vor der Wand zeigt den Abstand – die Verzögerung des Bildwegs.'
}

export interface TestTone {
  settings: PatternToneSettings
  playing: boolean
  toggle: () => Promise<void>
  patch: (p: Partial<PatternToneSettings>) => void
  /** sofort hörbar, aber noch nicht gespeichert (Schieber beim Ziehen) */
  preview: (p: Partial<PatternToneSettings>) => void
  devices: MediaDeviceInfo[]
}

export function useTestTone(): TestTone {
  const stored = useSettings((s) => s.patternTone)
  // Zwischenstände beim Ziehen: hörbar, aber erst beim Loslassen in settings.json
  const [live, setLive] = useState<Partial<PatternToneSettings>>({})
  const settings = useMemo(() => normalizeTone({ ...stored, ...live }), [stored, live])
  const [playing, setPlaying] = useState(false)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const engine = useRef<ToneEngine | null>(null)
  useAktivMelden('testton', playing)

  // Ausgabegeräte auflisten (Labels brauchen u. U. eine Audio-Berechtigung)
  useEffect(() => {
    const load = (): void => {
      void navigator.mediaDevices
        .enumerateDevices()
        .then((d) => setDevices(d.filter((x) => x.kind === 'audiooutput')))
        .catch(() => setDevices([]))
    }
    load()
    navigator.mediaDevices.addEventListener('devicechange', load)
    return () => navigator.mediaDevices.removeEventListener('devicechange', load)
  }, [])

  // Werkzeug verlassen = Ton aus (nie unbemerkt weiterlaufen lassen)
  useEffect(
    () => () => {
      engine.current?.stop()
      engine.current = null
    },
    []
  )

  useEffect(() => {
    if (playing) engine.current?.update(settings)
  }, [playing, settings])

  async function toggle(): Promise<void> {
    const running = engine.current
    if (running) {
      running.stop()
      engine.current = null
      setPlaying(false)
      return
    }
    const e = new ToneEngine((m) => toast.warning(m))
    engine.current = e
    setPlaying(true)
    try {
      await e.start(settings)
    } catch (err) {
      e.stop()
      if (engine.current === e) {
        engine.current = null
        setPlaying(false)
      }
      toast.error('Testton konnte nicht starten', err instanceof Error ? err.message : undefined)
    }
  }

  function patch(p: Partial<PatternToneSettings>): void {
    updateSettings({ patternTone: p })
    setLive({})
  }

  return { settings, playing, toggle, patch, preview: setLive, devices }
}

/** Schalter in der Ausgabe-Leiste */
export function ToneToggle({ tone }: { tone: TestTone }): JSX.Element {
  return (
    <BarToggle
      on={tone.playing}
      title={`Testton ein/aus: ${toneSummary(tone.settings)}`}
      onClick={() => void tone.toggle()}
    >
      Ton
    </BarToggle>
  )
}

/** Bereich „Testton“ in der Schublade */
export function ToneSection({
  tone,
  onSignalChange
}: {
  tone: TestTone
  /** z. B. AV-Sync: das passende Testbild gleich mitwählen */
  onSignalChange?: (signal: ToneSignal) => void
}): JSX.Element {
  const s = tone.settings
  const patch = tone.patch
  const noLabels = tone.devices.length === 0 || tone.devices.every((d) => !d.label)
  return (
    <PanelSection
      id="tone"
      title="Testton"
      icon={AudioLines}
      defaultOpen={false}
      summary={toneSummary(s)}
      right={tone.playing ? <Badge tone="success">an</Badge> : undefined}
    >
      <Field label="Signal" hint={SIGNAL_HINTS[s.signal]}>
        <Select
          value={s.signal}
          onChange={(e) => {
            const signal = e.target.value as ToneSignal
            patch({ signal })
            onSignalChange?.(signal)
          }}
        >
          {SIGNAL_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>

      {s.signal === 'sine' && (
        <Field label="Frequenz (Hz)" aside={formatHz(s.frequency)}>
          <div className="flex flex-wrap items-center gap-1.5">
            <NumberField
              value={s.frequency}
              min={20}
              max={20000}
              className="w-24"
              aria-label="Frequenz in Hz"
              onCommit={(v) => patch({ frequency: v })}
            />
            {FREQ_PRESETS.map((f) => (
              <Button
                key={f}
                size="sm"
                variant={s.frequency === f ? 'secondary' : 'outline'}
                onClick={() => patch({ frequency: f })}
              >
                {formatHz(f)}
              </Button>
            ))}
          </div>
        </Field>
      )}

      {s.signal === 'sweep' && (
        <Field label="Dauer je Sweep (s)">
          <NumberField
            value={s.sweepSeconds}
            min={1}
            max={60}
            className="w-24"
            onCommit={(v) => patch({ sweepSeconds: v })}
          />
        </Field>
      )}

      {s.signal === 'metronome' && (
        <>
          <div className="flex gap-3">
            <Field label="Tempo (BPM)">
              <NumberField
                value={s.bpm}
                min={30}
                max={300}
                className="w-24"
                onCommit={(v) => patch({ bpm: v })}
              />
            </Field>
            <Field label="Schläge je Takt">
              <NumberField
                value={s.beatsPerBar}
                min={1}
                max={12}
                className="w-24"
                onCommit={(v) => patch({ beatsPerBar: v })}
              />
            </Field>
          </div>
          <Checkbox
            checked={s.accent}
            onChange={(accent) => patch({ accent })}
            label="Eins betonen"
            disabled={s.beatsPerBar < 2}
          />
        </>
      )}

      {s.signal === 'avsync' && (
        <Field
          label="Versatz Ton (ms)"
          hint="Verschiebt den Piep gegenüber dem Blitz (+ = später). Zum Eichen einen Monitor direkt anschließen und so einstellen, dass das Messgerät 0 zeigt – an der Wand misst es dann nur deren Verzögerung."
        >
          <NumberField
            value={s.syncOffsetMs}
            min={-500}
            max={500}
            className="w-24"
            onCommit={(v) => patch({ syncOffsetMs: v })}
          />
        </Field>
      )}

      <Field
        label="Pegel"
        aside={formatDb(s.levelDb)}
        hint="Spitzenpegel. Bei Sinus liegt der Effektivwert 3 dB darunter, bei Rauschen 12 dB. Gedeckelt bei −6 dBFS und beim Start sanft eingeblendet – schont Ohren und Hochtöner."
      >
        <input
          type="range"
          min={TONE_LEVEL_MIN}
          max={TONE_LEVEL_MAX}
          step={0.5}
          value={s.levelDb}
          aria-label="Pegel in dBFS"
          onChange={(e) => tone.preview({ levelDb: Number(e.target.value) })}
          // erst beim Loslassen speichern (sonst eine Schreibung je Zwischenschritt)
          onPointerUp={(e) => patch({ levelDb: Number(e.currentTarget.value) })}
          onKeyUp={(e) => patch({ levelDb: Number(e.currentTarget.value) })}
          onBlur={(e) => patch({ levelDb: Number(e.currentTarget.value) })}
          className="w-full accent-[hsl(var(--primary))]"
        />
      </Field>

      <Field
        label="Kanäle"
        hint={
          usesChannelChoice(s.signal)
            ? 'Abwechselnd: jede Sekunde der andere Kanal.'
            : 'Die Kanal-Kennung nutzt immer beide Kanäle.'
        }
      >
        <Select
          value={usesChannelChoice(s.signal) ? s.channels : 'both'}
          disabled={!usesChannelChoice(s.signal)}
          onChange={(e) => patch({ channels: e.target.value as PatternToneSettings['channels'] })}
        >
          {CHANNEL_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Ausgabegerät"
        hint={
          noLabels
            ? 'Gerätenamen erscheinen erst nach Audio-Freigabe – der Ton läuft dennoch.'
            : undefined
        }
      >
        <Select value={s.deviceId} onChange={(e) => patch({ deviceId: e.target.value })}>
          <option value="">Standardgerät</option>
          {tone.devices.map((d, i) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Ausgabegerät ${i + 1}`}
            </option>
          ))}
        </Select>
      </Field>
    </PanelSection>
  )
}
