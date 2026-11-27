// Bedienung unter dem Spektrum (Ansicht, Bewertung, Auflösung, Einfrieren, Zurücksetzen) und die
// Statuszeile darunter.

import type { Dispatch, SetStateAction } from 'react'
import { Pause, Play, RotateCcw, Snowflake } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Segmented } from '@renderer/components/ui/segmented'
import { cn } from '@renderer/lib/utils'
import { fmt } from '../_calc/ui'
import type { Resolution } from './bands'
import type { EngineInfo } from './engine'
import { useRta, type RtaPrefs } from './store'

/** Symbolknöpfe am Handy so hoch wie die Knopfgruppen daneben */
const iconTouch = '[@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:min-w-10'

/**
 * Bedienung des Spektrums: unter ihm, am Handy in zwei Reihen (Ansicht + Bewertung, dann
 * Auflösung + Einfrieren/Zurücksetzen) – flex-auto füllt jede Reihe ganz. Quer schmal in der
 * Spalte rechts: Ansicht, darunter Bewertung mit Einfrieren und Zurücksetzen, dann Auflösung.
 */
export function SpektrumBedienung({
  p,
  frozen,
  setFrozen,
  running,
  reset,
  className
}: {
  p: RtaPrefs
  frozen: boolean
  setFrozen: Dispatch<SetStateAction<boolean>>
  running: boolean
  reset: () => void
  className?: string
}): JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 quer:grid quer:grid-cols-[minmax(0,1fr)_auto] quer:gap-1.5',
        className
      )}
    >
      <Segmented
        label="Ansicht"
        value={p.view}
        onChange={(view) => useRta.getState().set({ view })}
        options={[
          { value: 'bars', label: 'Bänder' },
          { value: 'curve', label: 'Kurve' },
          { value: 'both', label: 'Beides' }
        ]}
        className="flex-auto quer:col-span-2"
      />
      <Segmented
        label="Bewertung"
        value={p.weighting}
        onChange={(weighting) => useRta.getState().set({ weighting })}
        options={[
          { value: 'Z', label: 'Z' },
          { value: 'A', label: 'A' },
          { value: 'C', label: 'C' }
        ]}
        className="flex-auto quer:col-start-1 quer:row-start-2"
      />
      <Segmented
        label="Auflösung (Oktave)"
        value={String(p.resolution) as '1' | '3' | '6' | '12'}
        onChange={(v) => useRta.getState().set({ resolution: Number(v) as Resolution })}
        options={[
          { value: '1', label: '1/1' },
          { value: '3', label: '1/3' },
          { value: '6', label: '1/6' },
          { value: '12', label: '1/12' }
        ]}
        className="flex-auto quer:col-span-2 quer:row-start-3"
      />
      <div className="ml-auto flex gap-1 quer:col-start-2 quer:row-start-2 quer:ml-0 quer:gap-1.5">
        {/* am Handy nur Symbole (Name per aria-label), ab sm mit Text – quer wieder ohne */}
        <Button
          size="sm"
          variant={frozen ? 'secondary' : 'ghost'}
          onClick={() => setFrozen((f) => !f)}
          disabled={!running}
          aria-label={frozen ? 'Weiter' : 'Einfrieren'}
          title="Anzeige anhalten (gemessen wird weiter)"
          className={iconTouch}
        >
          {frozen ? <Play className="size-4" /> : <Snowflake className="size-4" />}
          <span className="hidden sm:inline quer:hidden">{frozen ? 'Weiter' : 'Einfrieren'}</span>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={reset}
          aria-label="Zurücksetzen"
          title="Mittelung, Spitzen, Leq und Max zurücksetzen"
          className={iconTouch}
        >
          <RotateCcw className="size-4" />
          <span className="hidden sm:inline quer:hidden">Zurücksetzen</span>
        </Button>
      </div>
    </div>
  )
}

/** Zeile unter der Bedienung: Eingang, Abtastrate, Kanal, Korrektur, Kalibrierung, was die
 *  Messung verfälscht, Differenz und Einfrieren */
export function MessStatus({
  info,
  p,
  frozen,
  className
}: {
  info: EngineInfo | null
  p: RtaPrefs
  frozen: boolean
  className?: string
}): JSX.Element {
  const diff = p.diffRef ? p.references.find((r) => r.id === p.diffRef) : undefined

  return (
    <p
      className={cn(
        'flex flex-wrap items-center gap-x-2 text-xs',
        info?.filters.length ? 'text-warning' : 'text-muted-foreground',
        className
      )}
      data-testid="rta-status"
    >
      {info ? (
        <>
          <span className="max-w-[18rem] truncate">{info.label}</span>
          <span>· {fmt(info.sampleRate / 1000, 1)} kHz</span>
          <span>
            ·{' '}
            {info.channels === 1
              ? 'Mono'
              : p.channel === 'mix'
                ? 'Summe L+R'
                : p.channel === 'left'
                  ? 'Links'
                  : 'Rechts'}
          </span>
          {p.correction && <span>· Korrektur {p.correction.serial ?? p.correction.name}</span>}
          {p.offset != null && (
            <span>
              · kalibriert ({p.offset > 0 ? '+' : ''}
              {fmt(p.offset, 1)} dB)
            </span>
          )}
          {info.filters.length > 0 && (
            <span>· Gerät filtert: {info.filters.join(', ')} – Messung verfälscht</span>
          )}
          {diff && <span className="text-primary">· Differenz zu {diff.name}</span>}
          {frozen && (
            <span className="flex items-center gap-1 text-primary">
              · <Pause className="size-3" /> eingefroren
            </span>
          )}
        </>
      ) : (
        <span>Nicht gestartet</span>
      )}
    </p>
  )
}

/**
 * Leq, Max und Spitze quer als eine Zeile unter dem Wasserfall: Als Kacheln passten sie nicht
 * mehr in die Spalte rechts (am iPhone geht unten noch der Home-Balken ab). Hochkant stehen sie
 * als Kacheln mit ⓘ unter dem Pegel.
 */
export function PegelZeile({
  pegel,
  className
}: {
  pegel: { label: string; value: string; unit: string }[]
  className?: string
}): JSX.Element {
  return (
    <p className={cn('items-baseline gap-x-3 text-xs text-muted-foreground', className)}>
      {pegel.map((k) => (
        <span key={k.label} className="whitespace-nowrap">
          {k.label}{' '}
          <span className="font-semibold tabular-nums text-foreground">{k.value || '–'}</span>
          {k.value && ` ${k.unit}`}
        </span>
      ))}
    </p>
  )
}
