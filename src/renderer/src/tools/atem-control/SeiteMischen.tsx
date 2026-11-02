// Seite „Mischen“: was auf Sendung geht und was als Nächstes kommt: Quellen, Keyer, Makros.
// Übergang, Cut, Auto, Hebel und Fade to Black stehen in der Spalte daneben (UebergangSpalte), die
// auf jeder Seite bleibt. Ein Knopf leuchtet erst, wenn der Mischer es gemeldet hat; bis dahin zeigt
// er „läuft“, damit der Klick spürbar bleibt. Reihen, Keyer und M/Es kommen aus dem, was der Mischer
// meldet.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ATEM_HINTERGRUND,
  bilderJeSchritt,
  keyerBit,
  quelleAufMe,
  type AtemMe,
  type AtemQuelle,
  type AtemView
} from '@shared/atem'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import { MakroSteuerung } from './SeiteMakros'
import { tasteGiltFuerMischer, tasteZuAktion } from './tastatur'
import {
  AKTION,
  AUS,
  Bereich,
  istHintergrund,
  KNOPF,
  LAEUFT_MS,
  MakroKnopf,
  naechsterUmschalten,
  SchaltKnopf,
  WARTET
} from './ui'
import { senden } from './useAtem'

/** So viele Makros passen in die Reihe, der Rest liegt auf der Seite „Makros“ */
const MAKROS_IN_REIHE = 8

type Bus = 'programm' | 'vorschau'

const AN: Record<Bus, string> = {
  programm: 'border-destructive bg-destructive text-destructive-foreground',
  vorschau: 'border-success bg-success text-background'
}

function QuellenKnopf({
  bus,
  quelle,
  an,
  laeuft,
  onClick
}: {
  bus: Bus
  quelle: AtemQuelle
  an: boolean
  laeuft: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      title={quelle.lang}
      aria-pressed={an}
      data-testid={`atem-${bus}-${quelle.id}`}
      data-zustand={an ? 'an' : laeuft ? 'laeuft' : 'aus'}
      onClick={onClick}
      className={cn(
        KNOPF,
        // Eingänge groß, Schwarz, Farben und Media-Player kleiner darunter
        quelle.extern ? 'h-12 min-w-[3.75rem] px-2' : 'h-10 min-w-[3.25rem] px-1.5 text-xs',
        an ? AN[bus] : AUS,
        laeuft && !an && WARTET
      )}
    >
      {quelle.kurz}
    </button>
  )
}

function Reihe({
  bus,
  titel,
  quellen,
  aktiv,
  offen,
  onWahl
}: {
  bus: Bus
  titel: string
  quellen: AtemQuelle[]
  aktiv: number
  offen: number | undefined
  onWahl: (quelle: number) => void
}): JSX.Element {
  const gruppe = (extern: boolean): JSX.Element[] =>
    quellen
      .filter((q) => q.extern === extern)
      .map((q) => (
        <QuellenKnopf
          key={q.id}
          bus={bus}
          quelle={q}
          an={q.id === aktiv}
          laeuft={q.id === offen}
          onClick={() => onWahl(q.id)}
        />
      ))
  const intern = gruppe(false)
  return (
    <section aria-label={titel} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5">
      <h3
        className={cn(
          'flex h-12 items-center text-sm font-semibold',
          bus === 'programm' ? 'text-danger' : 'text-success'
        )}
      >
        {titel}
      </h3>
      <div className="flex flex-wrap gap-1.5">{gruppe(true)}</div>
      {intern.length > 0 && <div className="col-start-2 flex flex-wrap gap-1.5">{intern}</div>}
    </section>
  )
}

function Kopf({ children }: { children: ReactNode }): JSX.Element {
  return (
    <span className="truncate text-center text-xs font-medium text-muted-foreground">
      {children}
    </span>
  )
}

function Zeile({ children }: { children: ReactNode }): JSX.Element {
  return <span className="text-xs font-semibold">{children}</span>
}

/**
 * Keyer als Streifen: je Keyer eine Spalte, darin „Auf Sendung“ (rot, sofort) und „Mit Übergang“
 * (gelb, beim nächsten Übergang). Früher standen die Keys zweimal nebeneinander („Tasten“ und
 * „Nächster Übergang“), der Unterschied war nicht zu sehen. DSKs gelten für den ganzen Mischer und
 * blenden mit „Auto“ über ihre eigene Dauer.
 */
function KeyerStreifen({
  view,
  me,
  m
}: {
  view: AtemView
  me: number
  m: AtemMe
}): JSX.Element | null {
  if (m.keyer.length === 0 && view.dsk.length === 0) return null
  const je = bilderJeSchritt(view.bildrate)
  const spalten = 1 + m.keyer.length + view.dsk.length
  return (
    <Bereich titel="Keyer">
      <div
        className="grid items-center gap-1.5"
        style={{ gridTemplateColumns: `6.5rem repeat(${spalten}, minmax(3.5rem, 1fr))` }}
      >
        <span />
        <Kopf>Bild</Kopf>
        {m.keyer.map((_, i) => (
          <Kopf key={i}>Key {i + 1}</Kopf>
        ))}
        {view.dsk.map((_, i) => (
          <Kopf key={i}>DSK {i + 1}</Kopf>
        ))}

        <Zeile>Auf Sendung</Zeile>
        <span />
        {m.keyer.map((k, i) => (
          <SchaltKnopf
            key={i}
            an={k.onAir}
            testId={`atem-usk-taste-${i}`}
            label={`Key ${i + 1} auf Sendung`}
            className="min-w-0"
            onClick={() => senden({ type: 'uskOnAir', me, keyer: i, an: !k.onAir })}
          >
            {k.onAir ? 'An' : 'Aus'}
          </SchaltKnopf>
        ))}
        {view.dsk.map((k, i) => (
          <SchaltKnopf
            key={i}
            an={k.onAir}
            testId={`atem-dsk-taste-${i}`}
            label={`DSK ${i + 1} auf Sendung`}
            className="min-w-0"
            onClick={() => senden({ type: 'dskOnAir', keyer: i, an: !k.onAir })}
          >
            {k.onAir ? 'An' : 'Aus'}
          </SchaltKnopf>
        ))}

        <Zeile>Mit Übergang</Zeile>
        <SchaltKnopf
          ton="gewaehlt"
          an={istHintergrund(m)}
          testId="atem-naechster-hintergrund"
          label="Bild mit Übergang"
          className="min-w-0"
          onClick={() => naechsterUmschalten(me, m, ATEM_HINTERGRUND)}
        >
          {istHintergrund(m) ? 'Ja' : 'Nein'}
        </SchaltKnopf>
        {m.keyer.map((_, i) => {
          const an = (m.naechster & keyerBit(i)) !== 0
          return (
            <SchaltKnopf
              key={i}
              ton="gewaehlt"
              an={an}
              testId={`atem-naechster-${i}`}
              label={`Key ${i + 1} mit Übergang`}
              className="min-w-0"
              onClick={() => naechsterUmschalten(me, m, keyerBit(i))}
            >
              {an ? 'Ja' : 'Nein'}
            </SchaltKnopf>
          )
        })}
        {view.dsk.map((k, i) => (
          <SchaltKnopf
            key={i}
            ton="gewaehlt"
            an={k.tie}
            testId={`atem-dsk-tie-${i}`}
            label={`DSK ${i + 1} mit Übergang`}
            className="min-w-0"
            onClick={() => senden({ type: 'dskTie', keyer: i, an: !k.tie })}
          >
            {k.tie ? 'Ja' : 'Nein'}
          </SchaltKnopf>
        ))}

        {view.dsk.length > 0 && (
          <>
            <Zeile>Auto</Zeile>
            <span />
            {m.keyer.map((_, i) => (
              <span key={i} />
            ))}
            {view.dsk.map((k, i) => (
              <button
                key={i}
                type="button"
                data-testid={`atem-dsk-auto-${i}`}
                data-laeuft={k.laeuft}
                aria-label={`DSK ${i + 1} Auto`}
                title="Blendet über die Dauer des DSK ein oder aus (Seite Keyer)"
                className={cn(
                  KNOPF,
                  AKTION,
                  'flex h-10 items-center justify-center gap-1.5',
                  k.laeuft && 'ring-2 ring-inset ring-primary'
                )}
                onClick={() => senden({ type: 'dskAuto', keyer: i })}
              >
                Auto
                {k.laeuft && <span className="text-xs tabular-nums">{k.rest * je}</span>}
              </button>
            ))}
          </>
        )}
      </div>
    </Bereich>
  )
}

function Makros({ view, onAlle }: { view: AtemView; onAlle: () => void }): JSX.Element | null {
  if (view.makros.length === 0) return null
  return (
    <Bereich titel="Makros">
      <div className="flex flex-wrap items-center gap-1.5">
        {view.makros.slice(0, MAKROS_IN_REIHE).map((m) => (
          <MakroKnopf key={m.index} makro={m} player={view.makroPlayer} />
        ))}
        {view.makros.length > MAKROS_IN_REIHE && (
          <Button variant="ghost" className="h-10" onClick={onAlle}>
            Alle {view.makros.length}
          </Button>
        )}
        <MakroSteuerung player={view.makroPlayer} />
      </div>
    </Bereich>
  )
}

export function SeiteMischen({
  view,
  me,
  bedienbar,
  onAlleMakros
}: {
  view: AtemView
  me: number
  bedienbar: boolean
  onAlleMakros: () => void
}): JSX.Element {
  const [offen, setOffen] = useState<Partial<Record<Bus, number>>>({})
  const flaeche = useRef<HTMLDivElement>(null)

  const m = view.mes[me]
  // Das Key-Signal eines Media-Players zeigt kein Bild: Es bleibt Quelle für Keyer, nicht für Sendung
  const quellen = view.quellen.filter((q) => quelleAufMe(q, me) && !q.schluessel)

  // Die andere M/E hat ihren eigenen Stand: Was hier noch lief, gilt dort nicht
  useEffect(() => setOffen({}), [me])

  function waehle(bus: Bus, quelle: number): void {
    if (m[bus] === quelle) return
    setOffen((o) => ({ ...o, [bus]: quelle }))
    senden({ type: bus, me, quelle })
  }

  // „läuft“ endet mit der Meldung des Mischers oder nach der Frist
  useEffect(() => {
    setOffen((o) => {
      const bleibt = { ...o }
      if (bleibt.programm === m.programm) delete bleibt.programm
      if (bleibt.vorschau === m.vorschau) delete bleibt.vorschau
      return Object.keys(bleibt).length === Object.keys(o).length ? o : bleibt
    })
  }, [m.programm, m.vorschau])

  useEffect(() => {
    if (offen.programm === undefined && offen.vorschau === undefined) return
    const t = setTimeout(() => setOffen({}), LAEUFT_MS)
    return () => clearTimeout(t)
  }, [offen])

  // Die Tastatur greift auf den neuesten Stand zu, ohne sich je Bild neu anzumelden
  const aktion = useRef<(e: KeyboardEvent) => void>(() => {})
  aktion.current = (e) => {
    if (!tasteGiltFuerMischer(e.target as Element | null, flaeche.current)) return
    const a = tasteZuAktion(e)
    if (!a) return
    // auch gesperrt: Sonst löste die Leertaste den Knopf mit dem Fokus aus, etwa die Sperre selbst
    e.preventDefault()
    if (!bedienbar) return
    if (a.art === 'cut') senden({ type: 'cut', me })
    else if (a.art === 'auto') senden({ type: 'auto', me })
    else if (quellen[a.index]) waehle(a.art, quellen[a.index].id)
  }

  useEffect(() => {
    const hoeren = (e: KeyboardEvent): void => aktion.current(e)
    window.addEventListener('keydown', hoeren)
    return () => window.removeEventListener('keydown', hoeren)
  }, [])

  return (
    <div ref={flaeche} className="space-y-3">
      <Bereich titel="Quellen">
        <Reihe
          bus="programm"
          titel="Programm"
          quellen={quellen}
          aktiv={m.programm}
          offen={offen.programm}
          onWahl={(q) => waehle('programm', q)}
        />
        <div className="border-t border-border" />
        <Reihe
          bus="vorschau"
          titel="Vorschau"
          quellen={quellen}
          aktiv={m.vorschau}
          offen={offen.vorschau}
          onWahl={(q) => waehle('vorschau', q)}
        />
      </Bereich>
      <KeyerStreifen view={view} me={me} m={m} />
      <Makros view={view} onAlle={onAlleMakros} />
    </div>
  )
}
