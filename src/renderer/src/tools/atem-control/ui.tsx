// Bausteine der Seiten. Auch hier gilt: Ein Knopf leuchtet erst, wenn der Mischer es gemeldet hat,
// und eine Auswahlliste zeigt immer den gemeldeten Stand, nicht den Klick.

import { useEffect, useState, type ReactNode } from 'react'
import {
  ATEM_HINTERGRUND,
  ATEM_RATE_MAX,
  ATEM_RATE_MIN,
  bilderInSekunden,
  bilderJeSchritt,
  type AtemMakro,
  type AtemMakroPlayer,
  type AtemMe,
  type AtemQuelle
} from '@shared/atem'
import { Field } from '@renderer/components/ui/field'
import { NumberField } from '@renderer/components/ui/number-field'
import { Select } from '@renderer/components/ui/select'
import { cn } from '@renderer/lib/utils'
import { senden } from './useAtem'

/** Antwortet der Mischer nicht, geht „läuft“ nach dieser Zeit wieder aus */
export const LAEUFT_MS = 1500

export function Titel({ children }: { children: ReactNode }): JSX.Element {
  return (
    <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">{children}</h2>
  )
}

const TON = {
  /** Geht auf Sendung: rot wie Programm */
  live: 'border-destructive bg-destructive text-destructive-foreground',
  /** Auswahl, die erst beim nächsten Übergang wirkt */
  akzent: 'border-primary bg-primary text-primary-foreground'
} as const

/** „läuft“ bis zur Meldung des Mischers oder bis zur Frist */
function useWartet(stand: unknown): [boolean, () => void] {
  const [wartet, setWartet] = useState(false)

  useEffect(() => setWartet(false), [stand])

  useEffect(() => {
    if (!wartet) return
    const t = setTimeout(() => setWartet(false), LAEUFT_MS)
    return () => clearTimeout(t)
  }, [wartet])

  return [wartet, () => setWartet(true)]
}

/** Knopf für etwas, das der Mischer ein- und ausschaltet */
export function SchaltKnopf({
  an,
  ton = 'live',
  testId,
  titel,
  onClick,
  children
}: {
  an: boolean
  ton?: keyof typeof TON
  testId: string
  titel?: string
  onClick: () => void
  children: ReactNode
}): JSX.Element {
  const [wartet, warte] = useWartet(an)
  return (
    <button
      type="button"
      title={titel}
      aria-pressed={an}
      data-testid={testId}
      data-zustand={wartet ? 'laeuft' : an ? 'an' : 'aus'}
      onClick={() => {
        warte()
        onClick()
      }}
      className={cn(
        'h-10 min-w-[4.25rem] rounded-md border px-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 disabled:pointer-events-none disabled:opacity-50',
        an ? TON[ton] : 'border-border bg-muted/40 hover:bg-muted',
        wartet && 'animate-pulse ring-2 ring-inset ring-primary'
      )}
    >
      {children}
    </button>
  )
}

/** Auswahl einer Quelle; ein Wert außerhalb der Liste bleibt sichtbar, statt still umzuspringen */
export function QuellenWahl({
  label,
  quellen,
  wert,
  onWahl
}: {
  label: string
  quellen: AtemQuelle[]
  wert: number
  onWahl: (quelle: number) => void
}): JSX.Element {
  return (
    <Select
      size="sm"
      aria-label={label}
      className="w-full"
      value={wert}
      onChange={(e) => onWahl(Number(e.target.value))}
    >
      {!quellen.some((q) => q.id === wert) && <option value={wert}>Quelle {wert}</option>}
      {quellen.map((q) => (
        <option key={q.id} value={q.id}>
          {q.lang}
        </option>
      ))}
    </Select>
  )
}

/**
 * Eine Dauer in echten Bildern mit den Sekunden daneben. `rate` ist der Wert des Mischers, nur hier
 * wird umgerechnet, siehe `bilderJeSchritt`. Bei 50p gibt es deshalb nur gerade Bilderzahlen.
 */
export function DauerFeld({
  label,
  ariaLabel = label,
  rate,
  bildrate,
  className,
  onRate
}: {
  label: string
  ariaLabel?: string
  rate: number
  bildrate: number | null
  className?: string
  onRate: (rate: number) => void
}): JSX.Element {
  const je = bilderJeSchritt(bildrate)
  return (
    <Field label={label} aside={bilderInSekunden(rate * je, bildrate)} className={className}>
      <NumberField
        aria-label={ariaLabel}
        min={ATEM_RATE_MIN * je}
        max={ATEM_RATE_MAX * je}
        step={je}
        value={rate * je}
        onCommit={(bilder) => onRate(bilder / je)}
      />
    </Field>
  )
}

/** Teil des nächsten Übergangs umschalten; einer muss bleiben, das verlangt auch der Mischer */
export function naechsterUmschalten(me: number, m: AtemMe, bit: number): void {
  const maske = m.naechster ^ bit
  if (maske !== 0) senden({ type: 'naechster', me, maske })
}

export const istHintergrund = (m: AtemMe): boolean => (m.naechster & ATEM_HINTERGRUND) !== 0

export function MakroKnopf({
  makro,
  player
}: {
  makro: AtemMakro
  player: AtemMakroPlayer
}): JSX.Element {
  const aktiv = player.laeuft && player.index === makro.index
  return (
    <SchaltKnopf
      ton="akzent"
      an={aktiv}
      testId={`atem-makro-${makro.index}`}
      titel={makro.beschreibung || makro.name}
      onClick={() => senden({ type: 'makroStart', index: makro.index })}
    >
      {makro.name}
    </SchaltKnopf>
  )
}
