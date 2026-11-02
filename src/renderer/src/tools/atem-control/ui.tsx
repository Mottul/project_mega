// Bausteine der Seiten. Auch hier gilt: Ein Knopf leuchtet erst, wenn der Mischer es gemeldet hat,
// und eine Auswahlliste zeigt immer den gemeldeten Stand, nicht den Klick.
//
// Jede Art Bedienelement sieht überall gleich aus, damit man ihr ansieht, was sie tut (besprochen
// mit dem Nutzer, 2.11.2026: „die optionen sind nicht klar als solche erkennbar“):
//   massiv (AKTION)    löst sofort aus: Cut, Auto, Makro, DSK-Auto
//   Rot (live)         ist auf Sendung
//   Grün               liegt in der Vorschau, nur in der Vorschau-Reihe
//   Gelb (gewaehlt)    gewählt, wirkt erst beim nächsten Übergang: Stil, Dauer, „Mit Übergang“
//   hell umrandet (an) sonstiger Schalter, der nichts auf Sendung bringt: Clip spielt, Schleife

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
import { Card } from '@renderer/components/ui/card'
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

/** Ein Bereich der Seite: Karte mit Überschrift */
export function Bereich({ titel, children }: { titel: string; children: ReactNode }): JSX.Element {
  return (
    <Card className="p-4">
      <section aria-label={titel} className="space-y-3">
        <h2 className="text-sm font-semibold">{titel}</h2>
        {children}
      </section>
    </Card>
  )
}

/** Grundform aller Knöpfe der Seiten; Größe und Ton kommen dazu */
export const KNOPF =
  'rounded-md border text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 disabled:pointer-events-none disabled:opacity-50'

/** Aus oder nicht gewählt: ruhig, damit Rot und Gelb auffallen */
export const AUS = 'border-border bg-muted/40 hover:bg-muted'

/** Löst sofort aus: massiv, damit es sich von Schaltern und Auswahl abhebt */
export const AKTION = 'border-foreground bg-foreground text-background hover:bg-foreground/85'

/** Geklickt, die Meldung des Mischers steht noch aus */
export const WARTET = 'animate-pulse ring-2 ring-inset ring-primary'

const TON = {
  /** Geht auf Sendung: rot wie Programm */
  live: 'border-destructive bg-destructive text-destructive-foreground',
  /**
   * Gewählt, wirkt erst beim nächsten Übergang. Immer Gelb, nie die Akzentfarbe: Die lässt sich
   * auf Grün stellen und sähe dann aus wie die Vorschau.
   */
  gewaehlt: 'border-warning bg-warning text-warning-foreground',
  /** Sonst an, ohne Sendung und ohne Übergang */
  an: 'border-foreground bg-foreground/15 text-foreground'
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
  label,
  className,
  onClick,
  children
}: {
  an: boolean
  ton?: keyof typeof TON
  testId: string
  titel?: string
  /** Name für Vorlesewerkzeuge, wenn der Text allein nicht sagt, was geschaltet wird */
  label?: string
  className?: string
  onClick: () => void
  children: ReactNode
}): JSX.Element {
  const [wartet, warte] = useWartet(an)
  return (
    <button
      type="button"
      title={titel}
      aria-label={label}
      aria-pressed={an}
      data-testid={testId}
      data-zustand={wartet ? 'laeuft' : an ? 'an' : 'aus'}
      onClick={() => {
        warte()
        onClick()
      }}
      className={cn(
        KNOPF,
        'h-10 min-w-[4.25rem] px-2',
        an ? TON[ton] : AUS,
        wartet && WARTET,
        className
      )}
    >
      {children}
    </button>
  )
}

/** Eine von mehreren, die erst beim Übergang wirkt (Stil, Dauer): gewählt in Gelb */
export function Wahl<T extends string | number>({
  label,
  wert,
  optionen,
  onWahl
}: {
  label: string
  wert: T | undefined
  optionen: readonly { wert: T; text: string }[]
  onWahl: (wert: T) => void
}): JSX.Element {
  return (
    <div
      role="group"
      aria-label={label}
      className="grid shrink-0 grid-cols-[repeat(auto-fit,minmax(3.25rem,1fr))] gap-1"
    >
      {optionen.map((o) => (
        <button
          key={o.wert}
          type="button"
          aria-pressed={o.wert === wert}
          onClick={() => onWahl(o.wert)}
          className={cn(KNOPF, 'h-10 px-1', o.wert === wert ? TON.gewaehlt : AUS)}
        >
          {o.text}
        </button>
      ))}
    </div>
  )
}

/** Zeigt, dass ein Keyer auf Sendung ist; geschaltet wird er auf der Seite „Mischen“ */
export function AufSendung({ an }: { an: boolean }): JSX.Element | null {
  if (!an) return null
  return (
    <span className="rounded bg-destructive px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-destructive-foreground">
      Auf Sendung
    </span>
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
      {/* Die Einheit steht im Feld: Daneben stehen schon die Sekunden */}
      <div className="relative">
        <NumberField
          aria-label={ariaLabel}
          className="pr-12"
          min={ATEM_RATE_MIN * je}
          max={ATEM_RATE_MAX * je}
          step={je}
          zeigtMeldung
          value={rate * je}
          onCommit={(bilder) => onRate(bilder / je)}
        />
        <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-muted-foreground">
          Bilder
        </span>
      </div>
    </Field>
  )
}

/** Teil des nächsten Übergangs umschalten; einer muss bleiben, das verlangt auch der Mischer */
export function naechsterUmschalten(me: number, m: AtemMe, bit: number): void {
  const maske = m.naechster ^ bit
  if (maske !== 0) senden({ type: 'naechster', me, maske })
}

export const istHintergrund = (m: AtemMe): boolean => (m.naechster & ATEM_HINTERGRUND) !== 0

/** Makro starten: löst sofort aus, deshalb massiv; ein laufendes trägt einen Punkt */
export function MakroKnopf({
  makro,
  player
}: {
  makro: AtemMakro
  player: AtemMakroPlayer
}): JSX.Element {
  const aktiv = player.laeuft && player.index === makro.index
  const [wartet, warte] = useWartet(aktiv)
  return (
    <button
      type="button"
      title={makro.beschreibung || makro.name}
      aria-pressed={aktiv}
      data-testid={`atem-makro-${makro.index}`}
      data-zustand={wartet ? 'laeuft' : aktiv ? 'an' : 'aus'}
      onClick={() => {
        warte()
        senden({ type: 'makroStart', index: makro.index })
      }}
      className={cn(
        KNOPF,
        AKTION,
        'inline-flex h-10 min-w-[4.25rem] items-center justify-center gap-2 px-3',
        wartet && WARTET
      )}
    >
      {aktiv && <span aria-hidden className="size-2 animate-pulse rounded-full bg-current" />}
      {makro.name}
    </button>
  )
}
