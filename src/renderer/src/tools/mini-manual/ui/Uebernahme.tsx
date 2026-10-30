// Knöpfe „Aus … übernehmen“: Jingle-Player und OSC-Steuerung im Kapitel Bedienfeld, Video-Player
// im Kapitel Software. Die Stores der Werkzeuge werden erst beim Klick geladen (dynamischer
// Import) – das Mini-Manual braucht sie sonst nicht. Gibt es schon eine Übernahme derselben
// Quelle, fragt es vor dem Ersetzen: Ergänzungen von Hand gingen dabei verloren.

import { useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Select } from '@renderer/components/ui/select'
import { api } from '@renderer/lib/api'
import { toast } from '@renderer/lib/toast'
import type { OscProject } from '../../osc-control/store'
import { bloecke } from '../aktionen'
import type { Bedienfeld } from '../model'
import { useMiniManual } from '../store'
import {
  HERKUNFT_PLAYER,
  ausJingle,
  ausOsc,
  ausPlayer,
  felderEinsetzen,
  playerEinsetzen
} from '../uebernahme'

/** Ersetzen bestätigen, wenn schon Felder derselben Quelle da sind */
async function felderUebernehmen(neu: Bedienfeld[], was: string): Promise<void> {
  const quellen = new Set(neu.map((b) => b.quelle))
  const vorhanden = useMiniManual
    .getState()
    .anleitung.bedienfelder.filter((b) => quellen.has(b.quelle))
  if (vorhanden.length) {
    const ok = await api.confirm({
      message: `${was} ist schon übernommen – ersetzen?`,
      detail:
        'Die Tasten kommen neu aus dem Werkzeug. Was du an den übernommenen Tasten ergänzt hast (Funktion, Notiz, Stufe), geht dabei verloren.',
      confirmLabel: 'Ersetzen'
    })
    if (!ok) return
  }
  // frisch aus dem Store einsetzen: Während der Rückfrage kann sich die Anleitung geändert haben
  useMiniManual
    .getState()
    .update((a) => ({ ...a, bedienfelder: felderEinsetzen(a.bedienfelder, neu) }))
  toast.success(`${was} übernommen`, 'Funktion und Notiz je Taste kannst du jetzt ergänzen.')
}

export function BedienfeldUebernahme(): JSX.Element {
  const [projekte, setProjekte] = useState<OscProject[] | null>(null)
  const [projekt, setProjekt] = useState('')

  async function jingle(): Promise<void> {
    const { useJingles } = await import('../../jingle-player/store')
    const j = useJingles.getState()
    if (!j.banks.some((b) => b.pads.some((p) => p.storedName))) {
      toast.warning('Im Jingle-Player ist noch kein Pad belegt.')
      return
    }
    await felderUebernehmen([ausJingle(j)], 'Der Jingle-Player')
  }

  async function oscLaden(): Promise<void> {
    const { useOscSurface } = await import('../../osc-control/store')
    const s = useOscSurface.getState()
    const mitKacheln = s.projects.filter((p) => p.sets.some((x) => x.widgets.length))
    if (!mitKacheln.length) {
      toast.warning('In der OSC-Steuerung gibt es noch keine Kacheln.')
      return
    }
    // ein Projekt: gleich übernehmen; mehrere: erst wählen
    if (mitKacheln.length === 1) return osc(mitKacheln[0])
    setProjekte(mitKacheln)
    setProjekt(
      mitKacheln.some((p) => p.id === s.currentProjectId) ? s.currentProjectId : mitKacheln[0].id
    )
  }

  async function osc(p: OscProject): Promise<void> {
    setProjekte(null)
    await felderUebernehmen(ausOsc(p), `„${p.name}“ aus der OSC-Steuerung`)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" onClick={() => void jingle()}>
        <Download className="size-4" /> Aus dem Jingle-Player
      </Button>
      <Button size="sm" variant="outline" onClick={() => void oscLaden()}>
        <Download className="size-4" /> Aus der OSC-Steuerung …
      </Button>
      {projekte && (
        <span className="flex items-center gap-2">
          <Select
            size="xs"
            aria-label="Projekt der OSC-Steuerung"
            value={projekt}
            onChange={(e) => setProjekt(e.target.value)}
          >
            {projekte.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.sets.length === 1 ? '1 Set' : `${p.sets.length} Sets`})
              </option>
            ))}
          </Select>
          <Button
            size="sm"
            onClick={() => {
              const p = projekte.find((x) => x.id === projekt)
              if (p) void osc(p)
            }}
          >
            Übernehmen
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setProjekte(null)}>
            Abbrechen
          </Button>
        </span>
      )}
    </div>
  )
}

export function PlayerUebernahme(): JSX.Element {
  async function los(): Promise<void> {
    const [settings, zustand, bibliothek, bildschirme] = await Promise.all([
      api.getSettings(),
      api.player.getState(),
      api.player.libraryList(),
      api.screen.list()
    ])
    const neu = ausPlayer({
      playlists: settings.player.savedPlaylists ?? [],
      bibliothek,
      zustand,
      // „Als Fenster“ ist kein Bildschirm, den die Anleitung nennen könnte
      ausgabe: bildschirme.find((b) => b.id === settings.player.outputDisplayId)?.label ?? null
    })
    const k = useMiniManual.getState().anleitung.kapitel.find((x) => x.id === 'software')
    if (
      k?.bloecke.some((b) => 'herkunft' in b && b.herkunft?.baustein === HERKUNFT_PLAYER.baustein)
    ) {
      const ok = await api.confirm({
        message: 'Der Video-Player ist schon übernommen – ersetzen?',
        detail:
          'Die Texte zu Player und Playlists kommen neu; was du darin geändert hast, geht verloren.',
        confirmLabel: 'Ersetzen'
      })
      if (!ok) return
    }
    useMiniManual.getState().update((a) => bloecke(a, 'software', (bs) => playerEinsetzen(bs, neu)))
    toast.success(
      'Video-Player übernommen',
      neu.length > 1
        ? `${neu.length - 1} Playlist(s) im Kapitel Software`
        : 'Noch keine Playlist gespeichert.'
    )
  }
  return (
    <Button size="sm" variant="outline" onClick={() => void los()}>
      <Download className="size-4" /> Aus dem Video-Player
    </Button>
  )
}
