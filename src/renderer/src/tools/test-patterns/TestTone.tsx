// Testton im Testbild-Werkzeug: Schalter „Ton“ in der Ausgabe-Leiste, Einstellungen in der
// Schublade. Gespielt wird in diesem Fenster über den gemeinsamen Ton-Kern (tools/_tone, den auch
// der Testtongenerator nutzt) auf dem gewählten Ausgabegerät; die Einstellungen liegen in
// settings.json (wie Geräte und Ausgaben der übrigen Werkzeuge), Meldungen kommen als Toast.

import { useMemo, useState } from 'react'
import { AudioLines } from 'lucide-react'
import { type PatternToneSettings, type ToneSignal } from '@shared/testton'
import { BarToggle, PanelSection } from '@renderer/components/ToolShell'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Field } from '@renderer/components/ui/field'
import { NumberField } from '@renderer/components/ui/number-field'
import { Select } from '@renderer/components/ui/select'
import { updateSettings, useSettings } from '@renderer/lib/settings'
import { toast } from '@renderer/lib/toast'
import {
  CHANNEL_HINT,
  CHANNEL_OPTIONS,
  FREQ_PRESETS,
  SIGNAL_HINTS,
  SIGNAL_OPTIONS,
  TONE_LEVEL_MAX,
  TONE_LEVEL_MIN,
  formatDb,
  formatHz,
  normalizeTone,
  toneSummary,
  usesChannelChoice
} from '../_tone/plan'
import { useToneEngine } from '../_tone/useToneEngine'

export interface TestTone {
  settings: PatternToneSettings
  playing: boolean
  toggle: () => void
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
  const tone = useToneEngine(settings, {
    onWarning: (m) => toast.warning(m),
    onError: (m) => toast.error('Testton konnte nicht starten', m),
    onEnded: (m) => toast.warning(m)
  })

  function patch(p: Partial<PatternToneSettings>): void {
    updateSettings({ patternTone: p })
    setLive({})
  }

  return {
    settings,
    playing: tone.playing,
    toggle: tone.toggle,
    patch,
    preview: setLive,
    devices: tone.devices
  }
}

/** Schalter in der Ausgabe-Leiste */
export function ToneToggle({ tone }: { tone: TestTone }): JSX.Element {
  return (
    <BarToggle
      on={tone.playing}
      title={`Testton ein/aus: ${toneSummary(tone.settings)}`}
      onClick={() => tone.toggle()}
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

      <Field label="Kanäle" hint={CHANNEL_HINT}>
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
