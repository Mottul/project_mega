// Playlist des Video-Players: gespeicherte Playlists als Reiter (laden, speichern, löschen) und
// die laufende Liste (springen, umsortieren, entfernen, aus der Bibliothek hineinziehen).

import { useState, type DragEvent } from 'react'
import { Eraser, Play, Save, X } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { api } from '@renderer/lib/api'
import type { MediaItem, PlayerState, SavedPlaylist } from '@shared/types'
import { fmtTime } from './format'

/** Gespeicherte Playlists als Reiter (prominent mit Akzentfarbe + Anzahl) */
export function PlaylistTabs({
  saved,
  playlist,
  onSave
}: {
  saved: SavedPlaylist[]
  playlist: MediaItem[]
  /** neue Liste merken (settings.json) */
  onSave: (next: SavedPlaylist[]) => Promise<void>
}): JSX.Element {
  const [naming, setNaming] = useState(false)
  const [nameInput, setNameInput] = useState('')

  function confirmSavePlaylist(): void {
    const name = nameInput.trim()
    if (!name) {
      setNaming(false)
      return
    }
    const next = [
      ...saved.filter((p) => p.name !== name),
      { name, mediaIds: playlist.map((m) => m.id) }
    ].sort((a, b) => a.name.localeCompare(b.name))
    void onSave(next)
    setNaming(false)
  }

  async function loadSaved(p: SavedPlaylist): Promise<void> {
    // Atomar ersetzen statt clear + add: kein Zwischenstopp über eine leere Liste
    // -> der Wechsel pausiert nicht und blendet nicht kurz aufs Idle-Bild.
    await api.player.command({ type: 'replace', mediaIds: p.mediaIds })
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      {saved.map((p) => (
        <span
          key={p.name}
          className="flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 py-1 pl-3 pr-1.5 text-sm font-medium text-foreground transition-colors hover:border-primary/70 hover:bg-primary/20"
        >
          <button
            onClick={() => void loadSaved(p)}
            title={`Playlist „${p.name}" laden (${p.mediaIds.length} Medien)`}
            className="flex items-center gap-1.5"
          >
            {p.name}
            <span className="rounded-full bg-primary/25 px-1.5 text-xs tabular-nums text-primary">
              {p.mediaIds.length}
            </span>
          </button>
          <button
            onClick={() =>
              void api
                .confirm({
                  message: `Playlist „${p.name}“ löschen?`,
                  detail: 'Die Medien bleiben in der Bibliothek.',
                  confirmLabel: 'Löschen',
                  danger: true
                })
                // erst nach der Rückfrage den aktuellen Stand lesen: Während der
                // Dialog offen war, kann ein anderes Fenster eine Playlist gespeichert
                // haben – die alte Liste würde sie wieder löschen
                .then(async (ok) => {
                  if (!ok) return
                  const cur = (await api.getSettings()).player.savedPlaylists ?? []
                  await onSave(cur.filter((x) => x.name !== p.name))
                })
            }
            className="text-muted-foreground hover:text-danger"
            title="Playlist löschen"
            aria-label={`Playlist „${p.name}“ löschen`}
          >
            <X className="size-3.5" />
          </button>
        </span>
      ))}
      {naming ? (
        <span className="flex items-center gap-1">
          <input
            autoFocus
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirmSavePlaylist()
              else if (e.key === 'Escape') setNaming(false)
            }}
            placeholder="Name…"
            className="h-7 w-32 rounded border border-border bg-background px-2 text-xs"
          />
          <Button variant="ghost" size="sm" onClick={confirmSavePlaylist}>
            ✓
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setNaming(false)}>
            ✕
          </Button>
        </span>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setNameInput('')
            setNaming(true)
          }}
          disabled={playlist.length === 0}
        >
          <Save className="size-4" /> Speichern
        </Button>
      )}
    </div>
  )
}

/** Die laufende Playlist */
export function Playlist({ pstate }: { pstate: PlayerState }): JSX.Element {
  const cmd = api.player.command

  // Drop auf die Playlist: aus der Bibliothek (x-media-id) hinzufügen ODER innerhalb
  // der Liste umsortieren (x-reorder). Position = Ziel-Index (Ende, wenn -1).
  function onPlaylistDrop(e: DragEvent, to: number): void {
    e.preventDefault()
    const mediaId = e.dataTransfer.getData('text/x-media-id')
    const reorder = e.dataTransfer.getData('text/x-reorder')
    const at = to < 0 ? pstate.playlist.length : to
    if (mediaId) void cmd({ type: 'add', mediaIds: [mediaId], at })
    else if (reorder !== '') {
      const from = Number(reorder)
      if (Number.isFinite(from) && from !== to && to >= 0) void cmd({ type: 'move', from, to })
    }
  }

  return (
    <>
      {pstate.playlist.length > 0 && (
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Playlist · {pstate.playlist.length}
          </span>
          <button
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
            onClick={() => void cmd({ type: 'clear' })}
            title="Playlist leeren"
          >
            <Eraser className="size-3.5" /> Leeren
          </button>
        </div>
      )}
      <div
        className="min-h-0 flex-1 space-y-1 overflow-auto"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => onPlaylistDrop(e, -1)}
      >
        {pstate.playlist.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Playlist leer. Medien aus der Bibliothek doppelklicken oder herziehen.
          </p>
        ) : (
          pstate.playlist.map((m, i) => (
            <div
              key={`${m.id}-${i}`}
              draggable
              onDragStart={(e) => e.dataTransfer.setData('text/x-reorder', String(i))}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onPlaylistDrop(e, i)}
              className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm ${
                i === pstate.index
                  ? 'border-primary bg-primary/10'
                  : 'border-transparent hover:bg-muted/40'
              }`}
            >
              <button
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                onClick={() => void cmd({ type: 'goto', index: i })}
              >
                {i === pstate.index && pstate.playing ? (
                  <Play className="size-3.5 shrink-0 text-primary" />
                ) : (
                  <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {i + 1}
                  </span>
                )}
                <span className="truncate" title={m.title}>
                  {m.title}
                </span>
              </button>
              <span className="shrink-0 text-xs text-muted-foreground">
                {m.durationSec ? fmtTime(m.durationSec) : 'Bild'}
              </span>
              <button
                className="shrink-0 text-muted-foreground hover:text-foreground"
                onClick={() => void cmd({ type: 'remove', index: i })}
                aria-label="Entfernen"
              >
                <X className="size-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </>
  )
}
