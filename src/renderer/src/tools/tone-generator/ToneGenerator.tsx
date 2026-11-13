// Testtongenerator: kleines Werkzeug im eigenen Fenster und in der Handy-PWA. Spielt die Signale
// des Ton-Kerns (tools/_tone, derselbe wie im Testbildgenerator) – ohne AV-Sync, das braucht den
// Blitz des Testbilds. Oben, was man im Betrieb greift (Start, Pegel, Kanäle), darunter das
// Signal: Dessen Felder wechseln unten, oben verrutscht beim Umschalten nichts.
// Gemerkt im eigenen Store (store.ts); Meldungen stehen in der Seite – die PWA hat keine Toasts.

import { useEffect, useRef, useState } from 'react'
import { Play } from 'lucide-react'
import { Alert, type AlertTone } from '@renderer/components/ui/alert'
import { useWakeLock } from '@renderer/lib/useWakeLock'
import { cn } from '@renderer/lib/utils'
import {
  CalcPage,
  ChoiceField,
  QuickPick,
  RangeField,
  RunButton,
  SectionCard,
  SelectField
} from '../_calc/ui'
import { toneUnsupportedReason } from '../_tone/engine'
import {
  CHANNEL_HINT,
  CHANNEL_OPTIONS,
  LEVEL_PRESETS,
  TONE_LEVEL_MAX,
  TONE_LEVEL_MIN,
  channelText,
  formatDb,
  toneWhat,
  usesChannelChoice
} from '../_tone/plan'
import { useToneEngine } from '../_tone/useToneEngine'
import { leertasteSchaltet, type TastenZiel } from './bedienung'
import { SignalCard } from './SignalCard'
import { useToneGen } from './store'

const CHANNELS = CHANNEL_OPTIONS.map((o) => ({ value: o.value, label: o.short }))

const LEVEL_HINT =
  'Spitzenpegel in dBFS. Bei Sinus liegt der Effektivwert 3 dB darunter, bei Rauschen 12 dB. Gedeckelt bei −6 dBFS; Dauertöne werden beim Start sanft eingeblendet – schont Ohren und Hochtöner. Am Handy regeln die Lautstärketasten zusätzlich; das iPhone spielt ab iOS 17 auch im Stumm-Modus.'

/** Was die Leertaste trifft (bedienung.ts entscheidet) */
function zielVon(target: EventTarget | null): TastenZiel | null {
  if (!(target instanceof HTMLElement) || target === document.body) return null
  return {
    tag: target.tagName,
    type: target instanceof HTMLInputElement ? target.type : null,
    editable: target.isContentEditable,
    role: target.getAttribute('role')
  }
}

export function ToneGenerator(): JSX.Element {
  const tone = useToneGen((s) => s.tone)
  const set = useToneGen((s) => s.set)
  const [notice, setNotice] = useState<{ tone: AlertTone; text: string } | null>(null)
  const unsupported = toneUnsupportedReason()
  const engine = useToneEngine(tone, {
    onWarning: (text) => setNotice({ tone: 'warning', text }),
    onError: (text) => setNotice({ tone: 'danger', text }),
    onEnded: (text) => setNotice({ tone: 'warning', text })
  })
  // Am Handy ginge sonst nach der Sperrzeit das Display aus – und iOS hielte den Ton an
  useWakeLock(engine.playing)

  function toggle(): void {
    if (!engine.playing) setNotice(null)
    engine.toggle()
  }
  const toggleRef = useRef(toggle)
  toggleRef.current = toggle

  // Leertaste startet und stoppt. Nach einem Mausklick gehört sie dem Ton, nicht dem geklickten
  // Knopf (der behielte sonst den Fokus, und die Taste löste ihn erneut aus – Muster ATEM); per
  // Tab angesteuerte Knöpfe (detail 0) behalten ihn, das ⓘ auch (es schlösse beim Verlust).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!leertasteSchaltet(e, zielVon(e.target))) return
      e.preventDefault()
      if (!e.repeat) toggleRef.current()
    }
    const onClick = (e: MouseEvent): void => {
      const el = document.activeElement
      if (e.detail > 0 && el instanceof HTMLButtonElement && !el.hasAttribute('data-infotip')) {
        el.blur()
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('click', onClick)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('click', onClick)
    }
  }, [])

  const extra = channelText(tone)
  const named = engine.devices.filter((d) => d.label && d.deviceId !== 'default')

  return (
    <CalcPage>
      <SectionCard title="Ausgabe" hint={LEVEL_HINT}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <RunButton
            big
            running={engine.playing}
            onStart={toggle}
            onStop={toggle}
            startLabel="Ton starten"
            startIcon={Play}
            disabled={Boolean(unsupported)}
          />
          <p
            className={cn(
              'min-w-0 flex-1 text-sm',
              engine.playing ? 'font-medium text-foreground' : 'text-muted-foreground'
            )}
            data-testid="tone-summary"
          >
            {toneWhat(tone)}
            {extra && ` · ${extra}`}
          </p>
        </div>
        {unsupported && <Alert tone="warning">{unsupported}</Alert>}
        {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
        <RangeField
          label="Pegel"
          value={tone.levelDb}
          min={TONE_LEVEL_MIN}
          max={TONE_LEVEL_MAX}
          step={0.5}
          onChange={(levelDb) => set({ levelDb })}
          display={formatDb(tone.levelDb)}
          ariaLabel="Pegel in dBFS"
        >
          <QuickPick
            label="Pegel-Schnellwahl"
            value={tone.levelDb}
            options={LEVEL_PRESETS.map((db) => ({ value: db, label: formatDb(db) }))}
            onPick={(levelDb) => set({ levelDb })}
          />
        </RangeField>
        <ChoiceField
          label="Kanäle"
          hint={CHANNEL_HINT}
          value={usesChannelChoice(tone.signal) ? tone.channels : 'both'}
          options={CHANNELS}
          onChange={(channels) => set({ channels })}
          disabled={!usesChannelChoice(tone.signal)}
          wrap
        />
        {engine.canChooseDevice && named.length > 0 && (
          <SelectField
            label="Ausgabegerät"
            value={tone.deviceId}
            onChange={(deviceId) => set({ deviceId })}
          >
            <option value="">Standardgerät</option>
            {named.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label}
              </option>
            ))}
          </SelectField>
        )}
      </SectionCard>
      <SignalCard tone={tone} set={set} playing={engine.playing} currentBeat={engine.currentBeat} />
    </CalcPage>
  )
}
