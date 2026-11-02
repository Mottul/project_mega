// Spalte „Übergang“: alles für den nächsten Übergang, von oben nach unten in der Reihenfolge, in der
// man es braucht. Sie steht auf jeder Seite, wie der Hebel am Pult: Auch beim Einrichten eines
// Keyers sind Cut, Auto und Hebel ohne Seitenwechsel da. Der Hebel nimmt den Platz, der übrig ist.

import { useEffect, useState } from 'react'
import {
  ATEM_RATEN_STILE,
  bilderJeSchritt,
  rateAusSekunden,
  type AtemFtb,
  type AtemRatenStil,
  type AtemStil,
  type AtemView
} from '@shared/atem'
import { cn } from '@renderer/lib/utils'
import { Hebel } from './Hebel'
import { AKTION, DauerFeld, KNOPF, Wahl } from './ui'
import { senden } from './useAtem'

/** So lange wartet Fade to Black auf den zweiten Klick */
const SCHARF_MS = 3000
/** Schnellwahl der Dauer in Sekunden, für den Finger */
const SCHNELL = [0.5, 1, 2]

const STIL_NAMEN: Record<AtemStil, string> = {
  mix: 'Mix',
  dip: 'Dip',
  wipe: 'Wipe',
  dve: 'DVE',
  sting: 'Stinger'
}

function istRatenStil(s: AtemStil): s is AtemRatenStil {
  return (ATEM_RATEN_STILE as readonly string[]).includes(s)
}

/** Fade to Black verlangt einen zweiten Klick: Eine Fehlbedienung ginge sofort auf Sendung */
function FtbKnopf({
  ftb,
  je,
  onAusloesen
}: {
  ftb: AtemFtb
  /** Bilder je Zählschritt des Mischers */
  je: number
  onAusloesen: () => void
}): JSX.Element {
  const [scharf, setScharf] = useState(false)

  useEffect(() => {
    if (!scharf) return
    const t = setTimeout(() => setScharf(false), SCHARF_MS)
    return () => clearTimeout(t)
  }, [scharf])

  return (
    <button
      type="button"
      data-testid="atem-ftb"
      data-scharf={scharf}
      data-schwarz={ftb.schwarz}
      title="Fade to Black: zweimal klicken"
      className={cn(
        KNOPF,
        'flex h-12 w-full shrink-0 flex-col items-center justify-center gap-0',
        ftb.schwarz
          ? 'border-destructive bg-destructive text-destructive-foreground'
          : 'border-danger bg-transparent text-danger hover:bg-danger/10',
        ftb.schwarz && !scharf && 'animate-pulse',
        scharf && 'border-warning bg-transparent text-warning'
      )}
      onClick={() => {
        setScharf(!scharf)
        if (scharf) onAusloesen()
      }}
    >
      {scharf ? 'Noch einmal' : 'FTB'}
      {ftb.laeuft && <span className="text-xs tabular-nums">{ftb.rest * je}</span>}
    </button>
  )
}

export function UebergangSpalte({
  view,
  me,
  bedienbar
}: {
  view: AtemView
  me: number
  bedienbar: boolean
}): JSX.Element {
  const m = view.mes[me]
  const je = bilderJeSchritt(view.bildrate)
  const rate = istRatenStil(m.stil) ? m.raten[m.stil] : undefined
  const schnell = SCHNELL.flatMap((s) => {
    const r = rateAusSekunden(s, view.bildrate)
    return r === null ? [] : [{ wert: r, text: `${String(s).replace('.', ',')} s` }]
  })

  function setzeRate(neu: number): void {
    if (istRatenStil(m.stil)) senden({ type: 'rate', me, stil: m.stil, rate: neu })
  }

  // Nur der Hebel gibt nach. Reicht die Höhe nicht, scrollt die Spalte, statt Knöpfe zu stauchen
  return (
    <div className="flex min-h-0 flex-col gap-2.5 overflow-y-auto rounded-xl border border-border bg-card p-3">
      <h2 className="shrink-0 text-sm font-semibold">Übergang</h2>
      <Wahl
        label="Übergang"
        wert={m.stil}
        optionen={view.stile.map((s) => ({ wert: s, text: STIL_NAMEN[s] }))}
        onWahl={(stil) => senden({ type: 'stil', me, stil })}
      />
      {rate !== undefined && schnell.length > 0 && (
        <Wahl label="Dauer in Sekunden" wert={rate} optionen={schnell} onWahl={setzeRate} />
      )}
      <div className="grid shrink-0 grid-cols-2 gap-2">
        {/* Beim Stinger bestimmt der Clip die Länge, das Feld bleibt leer stehen */}
        {rate !== undefined ? (
          <DauerFeld
            label="Dauer"
            ariaLabel="Dauer in Bildern"
            rate={rate}
            bildrate={view.bildrate}
            onRate={setzeRate}
          />
        ) : (
          <div />
        )}
        <DauerFeld
          label="FTB"
          ariaLabel="FTB in Bildern"
          rate={m.ftb.rate}
          bildrate={view.bildrate}
          onRate={(neu) => senden({ type: 'ftbRate', me, rate: neu })}
        />
      </div>
      <div className="grid shrink-0 grid-cols-2 gap-2">
        <button
          type="button"
          data-testid="atem-cut"
          className={cn(KNOPF, AKTION, 'h-12 text-base')}
          onClick={() => senden({ type: 'cut', me })}
        >
          Cut
        </button>
        <button
          type="button"
          data-testid="atem-auto"
          data-laeuft={m.uebergang}
          className={cn(
            KNOPF,
            AKTION,
            'flex h-12 flex-col items-center justify-center gap-0 text-base',
            m.uebergang && 'ring-2 ring-inset ring-primary'
          )}
          onClick={() => senden({ type: 'auto', me })}
        >
          Auto
          {m.uebergang && m.rest > 0 && <span className="text-xs tabular-nums">{m.rest * je}</span>}
        </button>
      </div>
      <div className="flex min-h-[200px] flex-1 items-center justify-center">
        <Hebel
          wert={m.hebel}
          oben={m.hebelOben}
          bedienbar={bedienbar}
          className="h-full max-h-[460px]"
          onWert={(wert) => senden({ type: 'hebel', me, wert })}
        />
      </div>
      <FtbKnopf ftb={m.ftb} je={je} onAusloesen={() => senden({ type: 'ftb', me })} />
    </div>
  )
}
