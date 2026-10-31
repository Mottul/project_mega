// Seite „Medien“: was die Media-Player zeigen. Die Inhalte des Media-Pools kommen aus dem Mischer,
// hochgeladen wird in ATEM Software Control. Die ATEM-Mini-Reihe kennt nur Standbilder.

import type { AtemMedienArt, AtemMedium, AtemPlayer, AtemView } from '@shared/atem'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Segmented } from '@renderer/components/ui/segmented'
import { Select } from '@renderer/components/ui/select'
import { SchaltKnopf } from './ui'
import { senden } from './useAtem'

const ARTEN: { value: AtemMedienArt; label: string }[] = [
  { value: 'still', label: 'Standbild' },
  { value: 'clip', label: 'Clip' }
]

function PlayerKarte({
  i,
  p,
  stills,
  clips
}: {
  i: number
  p: AtemPlayer
  stills: AtemMedium[]
  clips: AtemMedium[]
}): JSX.Element {
  const name = `Media-Player ${i + 1}`
  const pool = p.art === 'clip' ? clips : stills
  return (
    <Card className="space-y-3 p-4">
      <h3 className="font-semibold">{name}</h3>
      {clips.length > 0 && (
        <Segmented
          label={`${name} Art`}
          value={p.art}
          options={ARTEN}
          onChange={(art) => {
            const erstes = (art === 'clip' ? clips : stills)[0]
            if (erstes) senden({ type: 'mediaQuelle', player: i, art, index: erstes.index })
          }}
        />
      )}
      <Select
        size="sm"
        aria-label={`${name} Inhalt`}
        className="w-full"
        value={p.index}
        onChange={(e) =>
          senden({ type: 'mediaQuelle', player: i, art: p.art, index: Number(e.target.value) })
        }
      >
        {!pool.some((m) => m.index === p.index) && <option value={p.index}>Leerer Platz</option>}
        {pool.map((m) => (
          <option key={m.index} value={m.index}>
            {m.name}
          </option>
        ))}
      </Select>
      {p.art === 'clip' && (
        <div className="flex flex-wrap gap-2">
          <SchaltKnopf
            ton="akzent"
            an={p.spielt}
            testId={`atem-clip-spielen-${i}`}
            onClick={() => senden({ type: 'clipSpielen', player: i, an: !p.spielt })}
          >
            {p.spielt ? 'Pause' : 'Abspielen'}
          </SchaltKnopf>
          <Button
            variant="outline"
            className="h-10"
            data-testid={`atem-clip-anfang-${i}`}
            onClick={() => senden({ type: 'clipAnfang', player: i })}
          >
            Zum Anfang
          </Button>
          <SchaltKnopf
            ton="akzent"
            an={p.schleife}
            testId={`atem-clip-schleife-${i}`}
            onClick={() => senden({ type: 'clipSchleife', player: i, an: !p.schleife })}
          >
            Schleife
          </SchaltKnopf>
        </div>
      )}
    </Card>
  )
}

export function SeiteMedien({ view }: { view: AtemView }): JSX.Element {
  const { stills, clips, player } = view.medien
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-3">
      {player.map((p, i) => (
        <PlayerKarte key={i} i={i} p={p} stills={stills} clips={clips} />
      ))}
    </div>
  )
}
