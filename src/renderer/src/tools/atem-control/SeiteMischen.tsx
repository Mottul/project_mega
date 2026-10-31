// Seite „Mischen“: Programm und Vorschau, Cut, Auto, Hebel, Fade to Black, Übergangsart und -dauer.
// Ein Knopf leuchtet erst, wenn der Mischer es gemeldet hat; bis dahin zeigt er „läuft“, damit der
// Klick spürbar bleibt. Reihen, Stile und M/Es kommen aus dem, was der Mischer meldet.

import { useEffect, useRef, useState } from 'react'
import {
  ATEM_RATEN_STILE,
  ATEM_RATE_MAX,
  ATEM_RATE_MIN,
  bilderInSekunden,
  quelleAufMe,
  type AtemCommand,
  type AtemFtb,
  type AtemQuelle,
  type AtemRatenStil,
  type AtemStil,
  type AtemView
} from '@shared/atem'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Field } from '@renderer/components/ui/field'
import { NumberField } from '@renderer/components/ui/number-field'
import { Segmented } from '@renderer/components/ui/segmented'
import { api } from '@renderer/lib/api'
import { usePersistentState, type Codec } from '@renderer/lib/usePersistentState'
import { cn } from '@renderer/lib/utils'
import { Hebel } from './Hebel'
import { tasteGiltFuerMischer, tasteZuAktion } from './tastatur'

/** Antwortet der Mischer nicht, geht „läuft“ nach dieser Zeit wieder aus */
const LAEUFT_MS = 1500
/** So lange wartet Fade to Black auf den zweiten Klick */
const SCHARF_MS = 3000

const STIL_NAMEN: Record<AtemStil, string> = {
  mix: 'Mix',
  dip: 'Dip',
  wipe: 'Wipe',
  dve: 'DVE',
  sting: 'Stinger'
}

/** Gewählte M/E: Größere Mischer haben höchstens vier */
const ZAHL: Codec<number> = {
  parse: (roh) => (/^d$/.test(roh) ? Number(roh) : null),
  format: String
}

type Bus = 'programm' | 'vorschau'

const AN: Record<Bus, string> = {
  programm: 'border-destructive bg-destructive text-destructive-foreground',
  vorschau: 'border-success bg-success text-background'
}

function istRatenStil(s: AtemStil): s is AtemRatenStil {
  return (ATEM_RATEN_STILE as readonly string[]).includes(s)
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
        'h-12 min-w-[4.25rem] rounded-md border px-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 disabled:pointer-events-none disabled:opacity-50',
        an ? AN[bus] : 'border-border bg-muted/40 hover:bg-muted',
        laeuft && !an && 'animate-pulse ring-2 ring-inset ring-primary'
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
  return (
    <section aria-label={titel} className="space-y-1.5">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">{titel}</h2>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        <div className="flex flex-wrap gap-1.5">{gruppe(true)}</div>
        <div className="flex flex-wrap gap-1.5">{gruppe(false)}</div>
      </div>
    </section>
  )
}

/** Fade to Black verlangt einen zweiten Klick: Eine Fehlbedienung ginge sofort auf Sendung */
function FtbKnopf({ ftb, onAusloesen }: { ftb: AtemFtb; onAusloesen: () => void }): JSX.Element {
  const [scharf, setScharf] = useState(false)

  useEffect(() => {
    if (!scharf) return
    const t = setTimeout(() => setScharf(false), SCHARF_MS)
    return () => clearTimeout(t)
  }, [scharf])

  return (
    <Button
      variant={ftb.schwarz ? 'destructive' : 'outline'}
      data-testid="atem-ftb"
      data-scharf={scharf}
      data-schwarz={ftb.schwarz}
      title="Fade to Black: zweimal klicken"
      className={cn(
        'h-14 w-full flex-col gap-0 text-xs font-bold',
        ftb.schwarz && !scharf && 'animate-pulse',
        scharf && 'border-warning text-warning'
      )}
      onClick={() => {
        setScharf(!scharf)
        if (scharf) onAusloesen()
      }}
    >
      {scharf ? 'Noch einmal' : 'FTB'}
      {ftb.laeuft && <span className="tabular-nums">{ftb.restBilder}</span>}
    </Button>
  )
}

export function SeiteMischen({
  view,
  bedienbar
}: {
  view: AtemView
  bedienbar: boolean
}): JSX.Element {
  const [meWahl, setMeWahl] = usePersistentState('atem:me', 0, ZAHL)
  const [offen, setOffen] = useState<Partial<Record<Bus, number>>>({})
  const flaeche = useRef<HTMLDivElement>(null)

  const me = Math.min(meWahl, view.mes.length - 1)
  const m = view.mes[me]
  const quellen = view.quellen.filter((q) => quelleAufMe(q, me))

  function senden(cmd: AtemCommand): void {
    void api.atem.command(cmd)
  }

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

  const rate = istRatenStil(m.stil) ? m.raten[m.stil] : undefined

  return (
    <div ref={flaeche} className="space-y-4">
      <fieldset disabled={!bedienbar} className="space-y-4">
        {view.mes.length > 1 && (
          <Segmented
            label="M/E"
            className="max-w-xs"
            value={String(me)}
            options={view.mes.map((_, i) => ({ value: String(i), label: `M/E ${i + 1}` }))}
            onChange={(v) => {
              setMeWahl(Number(v))
              setOffen({})
            }}
          />
        )}
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1 space-y-4">
            <Reihe
              bus="programm"
              titel="Programm"
              quellen={quellen}
              aktiv={m.programm}
              offen={offen.programm}
              onWahl={(q) => waehle('programm', q)}
            />
            <Reihe
              bus="vorschau"
              titel="Vorschau"
              quellen={quellen}
              aktiv={m.vorschau}
              offen={offen.vorschau}
              onWahl={(q) => waehle('vorschau', q)}
            />
            <Card className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_9rem_9rem]">
              <Field label="Übergang" group>
                <Segmented
                  label="Übergang"
                  value={m.stil}
                  options={view.stile.map((s) => ({ value: s, label: STIL_NAMEN[s] }))}
                  onChange={(stil) => senden({ type: 'stil', me, stil })}
                />
              </Field>
              {istRatenStil(m.stil) && rate !== undefined && (
                <Field label="Dauer in Bildern" aside={bilderInSekunden(rate, view.bildrate)}>
                  <NumberField
                    aria-label="Dauer in Bildern"
                    min={ATEM_RATE_MIN}
                    max={ATEM_RATE_MAX}
                    value={rate}
                    onCommit={(bilder) => {
                      if (istRatenStil(m.stil)) {
                        senden({ type: 'rate', me, stil: m.stil, bilder })
                      }
                    }}
                  />
                </Field>
              )}
              <Field
                label="FTB in Bildern"
                aside={bilderInSekunden(m.ftb.rate, view.bildrate)}
                className="sm:col-start-3"
              >
                <NumberField
                  aria-label="FTB in Bildern"
                  min={ATEM_RATE_MIN}
                  max={ATEM_RATE_MAX}
                  value={m.ftb.rate}
                  onCommit={(bilder) => senden({ type: 'ftbRate', me, bilder })}
                />
              </Field>
            </Card>
          </div>
          <div className="flex w-36 shrink-0 flex-col items-center gap-2">
            <Button
              data-testid="atem-cut"
              variant="secondary"
              className="h-14 w-full text-base font-bold"
              onClick={() => senden({ type: 'cut', me })}
            >
              Cut
            </Button>
            <Button
              data-testid="atem-auto"
              data-laeuft={m.uebergang}
              variant="secondary"
              className={cn(
                'h-14 w-full flex-col gap-0 text-base font-bold',
                m.uebergang && 'ring-2 ring-inset ring-primary'
              )}
              onClick={() => senden({ type: 'auto', me })}
            >
              Auto
              {m.uebergang && m.restBilder > 0 && (
                <span className="text-xs tabular-nums">{m.restBilder}</span>
              )}
            </Button>
            <Hebel
              wert={m.hebel}
              oben={m.hebelOben}
              bedienbar={bedienbar}
              onWert={(wert) => senden({ type: 'hebel', me, wert })}
            />
            <FtbKnopf ftb={m.ftb} onAusloesen={() => senden({ type: 'ftb', me })} />
          </div>
        </div>
      </fieldset>
    </div>
  )
}
