// Auswahl der Einträge einer erkannten Playlist: Häkchen je Eintrag, „Alle/Keine“,
// Umschalt-Klick für Bereiche. Nicht ladbare (privat/gelöscht) sind gesperrt,
// verschachtelte Playlists (Kanal-Reiter) lassen sich einzeln öffnen.

import { useRef } from 'react'
import { Download, ExternalLink, ListVideo, X } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { cn } from '@renderer/lib/utils'
import {
  fmtDuration,
  numberDigits,
  selectable,
  selectRange,
  type PlaylistOptions,
  type YtPlaylist
} from './playlist'

export function PlaylistPicker({
  playlist,
  selected,
  onSelected,
  options,
  onOptions,
  ready,
  onDownload,
  onDownloadVideo,
  onClose,
  onOpenNested
}: {
  playlist: YtPlaylist
  selected: Set<number>
  onSelected: (next: Set<number>) => void
  options: PlaylistOptions
  onOptions: (patch: Partial<PlaylistOptions>) => void
  /** yt-dlp da und Zielordner gewählt */
  ready: boolean
  onDownload: (selection: Set<number>) => void
  /** Nur das Video aus der Adresse laden, wenn es nicht unter den Einträgen ist. */
  onDownloadVideo: () => void
  onClose: () => void
  onOpenNested: (url: string) => void
}): JSX.Element {
  // Ausgangspunkt für Umschalt-Klick (Bereichsauswahl)
  const anchor = useRef<number | null>(null)
  const { entries } = playlist
  const loadable = entries.filter(selectable)
  const count = loadable.filter((e) => selected.has(e.index)).length
  const current = playlist.currentId
    ? entries.find((e) => e.id === playlist.currentId && selectable(e))
    : undefined
  const sample = `${'1'.padStart(numberDigits(playlist), '0')} - Titel`

  function toggle(index: number, shift: boolean): void {
    const on = !selected.has(index)
    if (shift && anchor.current !== null) {
      onSelected(selectRange(entries, selected, anchor.current, index, on))
    } else {
      const next = new Set(selected)
      if (on) next.add(index)
      else next.delete(index)
      onSelected(next)
    }
    anchor.current = index
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-start gap-3">
        <ListVideo className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-medium" title={playlist.title}>
            {playlist.title}
          </h2>
          <p className="text-xs text-muted-foreground">
            Playlist · {entries.length} {entries.length === 1 ? 'Eintrag' : 'Einträge'}
            {playlist.uploader && ` · ${playlist.uploader}`}
            {playlist.truncated &&
              ` · nur die ersten ${entries.length}${playlist.total ? ` von ${playlist.total}` : ''}`}
          </p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Playlist schließen" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      {(current || playlist.videoUrl) && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-xs">
          <span className="min-w-0 flex-1">
            Die Adresse zeigt auf ein Video dieser Playlist
            {current ? (
              <>
                : <span className="font-medium text-foreground">{current.title}</span>
              </>
            ) : (
              ' (nicht unter den angezeigten Einträgen).'
            )}
          </span>
          <Button
            size="sm"
            variant="secondary"
            disabled={!ready}
            onClick={() => (current ? onDownload(new Set([current.index])) : onDownloadVideo())}
          >
            Nur dieses Video laden
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onSelected(new Set(loadable.map((e) => e.index)))}
        >
          Alle
        </Button>
        <Button variant="outline" size="sm" onClick={() => onSelected(new Set())}>
          Keine
        </Button>
        <span className="text-xs text-muted-foreground">Umschalt-Klick wählt einen Bereich</span>
        <span className="ml-auto text-xs text-muted-foreground" aria-live="polite">
          {count} von {loadable.length} gewählt
        </span>
      </div>

      <ul className="max-h-80 divide-y divide-border overflow-auto rounded-md border border-border">
        {entries.map((e) => {
          const ok = selectable(e)
          return (
            <li key={`${e.index}-${e.id}`}>
              <label
                className={cn(
                  'flex items-center gap-3 px-3 py-1.5 text-sm',
                  ok ? 'cursor-pointer hover:bg-muted/40' : 'text-muted-foreground'
                )}
              >
                <input
                  type="checkbox"
                  className="size-4 shrink-0 accent-primary"
                  checked={ok && selected.has(e.index)}
                  disabled={!ok}
                  onChange={(ev) => toggle(e.index, (ev.nativeEvent as MouseEvent).shiftKey)}
                />
                <span className="w-8 shrink-0 text-right font-mono text-xs text-muted-foreground">
                  {e.index}
                </span>
                <span className="min-w-0 flex-1 truncate" title={e.title}>
                  {e.title}
                </span>
                {e.nested && e.url ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7"
                    title="Diese Playlist öffnen und daraus wählen"
                    onClick={(ev) => {
                      ev.preventDefault()
                      onOpenNested(e.url as string)
                    }}
                  >
                    <ExternalLink className="size-3.5" /> Öffnen
                  </Button>
                ) : (
                  <span
                    className={cn(
                      'shrink-0 text-xs text-muted-foreground',
                      !e.unavailable && 'font-mono'
                    )}
                  >
                    {e.unavailable ? 'nicht verfügbar' : fmtDuration(e.durationSec)}
                  </span>
                )}
              </label>
            </li>
          )
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex min-w-0 items-center gap-2 text-xs">
          <input
            type="checkbox"
            className="accent-primary"
            checked={options.folder}
            onChange={(e) => onOptions({ folder: e.target.checked })}
          />
          <span className="truncate">In Unterordner „{playlist.title}“ speichern</span>
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            className="accent-primary"
            checked={options.numbers}
            onChange={(e) => onOptions({ numbers: e.target.checked })}
          />
          Nummer voranstellen ({sample})
        </label>
        <Button
          className="ml-auto"
          disabled={!ready || count === 0}
          onClick={() => onDownload(selected)}
        >
          <Download className="size-4" />
          {count === 1 ? '1 Eintrag laden' : `${count} Einträge laden`}
        </Button>
      </div>
    </Card>
  )
}
