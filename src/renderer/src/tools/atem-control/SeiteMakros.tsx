// Seite „Makros“: alle belegten Plätze des Mischers. Angelegt werden Makros dort oder in ATEM
// Software Control, hier werden sie gestartet und gestoppt. Es läuft immer nur eines.

import type { AtemMakroPlayer, AtemView } from '@shared/atem'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { MakroKnopf } from './ui'
import { senden } from './useAtem'

/** Steht bei einem laufenden Makro: Stopp und, an einer Pause, Weiter */
export function MakroSteuerung({ player }: { player: AtemMakroPlayer }): JSX.Element | null {
  if (!player.laeuft) return null
  return (
    <>
      {player.wartet && (
        <Button
          data-testid="atem-makro-weiter"
          className="h-10"
          onClick={() => senden({ type: 'makroWeiter' })}
        >
          Weiter
        </Button>
      )}
      <Button
        variant="outline"
        data-testid="atem-makro-stopp"
        className="h-10"
        onClick={() => senden({ type: 'makroStopp' })}
      >
        Stopp
      </Button>
    </>
  )
}

export function SeiteMakros({ view }: { view: AtemView }): JSX.Element {
  if (view.makros.length === 0) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        Auf dem Mischer liegen keine Makros. Angelegt werden sie dort oder in ATEM Software Control.
      </Card>
    )
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <MakroSteuerung player={view.makroPlayer} />
        {view.makroPlayer.wartet && (
          <span className="text-sm text-muted-foreground">Wartet an einer Pause</span>
        )}
      </div>
      <ul className="space-y-1.5">
        {view.makros.map((m) => (
          <li key={m.index} className="flex items-center gap-3">
            <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">
              {m.index + 1}
            </span>
            <MakroKnopf makro={m} player={view.makroPlayer} />
            {m.beschreibung && (
              <span className="min-w-0 truncate text-sm text-muted-foreground">
                {m.beschreibung}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
