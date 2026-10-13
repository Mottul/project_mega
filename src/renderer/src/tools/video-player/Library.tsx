// Bibliothek des Video-Players: Import (Dateien, Ordner, Hineinziehen), Konvertier-Liste,
// Hinweis auf Medien in anderer Wand-Auflösung und die Medien als große/kleine Kacheln oder
// Liste. Ziehen oder Doppelklick legt ein Medium in die Playlist.

import { useState, type DragEvent, type HTMLAttributes } from 'react'
import {
  Eraser,
  Film,
  FolderInput,
  FolderOpen,
  FolderSearch,
  Grid3x3,
  Image as ImageIcon,
  LayoutGrid,
  List,
  ListPlus,
  Plus,
  RefreshCw,
  Trash2
} from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { api } from '@renderer/lib/api'
import { MEDIA_EXTENSIONS } from '@shared/mediaExtensions'
import type { FitMode, MediaItem } from '@shared/types'
import { ConvertQueue } from './ConvertQueue'
import { fmtBytes, fmtTime } from './format'

type ViewMode = 'large' | 'small' | 'list'

function kindIcon(kind: MediaItem['kind']): JSX.Element {
  return kind === 'image' ? <ImageIcon className="size-3.5" /> : <Film className="size-3.5" />
}

export function Library({
  library,
  fit,
  wallW,
  wallH,
  onReload,
  className
}: {
  library: MediaItem[]
  fit: FitMode
  wallW: number
  wallH: number
  /** Bibliothek neu laden (ein Import ist fertig) */
  onReload: () => void
  className: string
}): JSX.Element {
  const [dragOver, setDragOver] = useState(false)
  const [view, setView] = useState<ViewMode>('large')
  const cmd = api.player.command

  function importSources(sources: string[]): void {
    if (sources.length)
      void api.player.import({ sources, fitMode: fit, wall: { width: wallW, height: wallH } })
  }

  async function importFiles(): Promise<void> {
    const sources = await api.selectPaths({
      title: 'Medien auswählen',
      multi: true,
      filters: [{ name: 'Medien', extensions: [...MEDIA_EXTENSIONS] }]
    })
    importSources(sources)
  }

  async function importFolder(): Promise<void> {
    const sources = await api.selectPaths({ title: 'Ordner auswählen', directories: true })
    importSources(sources)
  }

  function onDropFiles(e: DragEvent): void {
    e.preventDefault()
    setDragOver(false)
    const sources = Array.from(e.dataTransfer.files)
      .map((f) => api.pathForFile(f))
      .filter(Boolean)
    importSources(sources)
  }

  async function openMediaDir(): Promise<void> {
    const dir = await api.player.mediaDir()
    await api.openPath(dir)
  }

  // Medien, die nicht in der aktuellen Wand-Auflösung vorliegen. Unverändert übernommene
  // haben die Maße ihrer Datei und werden beim Abspielen eingepasst – nie „veraltet“.
  const staleItems = library.filter(
    (m) => m.fitMode !== 'original' && (m.width !== wallW || m.height !== wallH)
  )
  async function reconvertStale(): Promise<void> {
    if (staleItems.length === 0) return
    const res = await api.player.reconvert(
      staleItems.map((m) => m.id),
      { width: wallW, height: wallH }
    )
    if (res.skipped > 0)
      void api.notify({
        message: `${res.skipped} Medium/Medien ohne bekannte Originalquelle übersprungen (vor diesem Update importiert).`,
        kind: 'warning'
      })
  }

  const viewButtons: { id: ViewMode; icon: JSX.Element; title: string }[] = [
    { id: 'large', icon: <LayoutGrid className="size-4" />, title: 'Große Kacheln' },
    { id: 'small', icon: <Grid3x3 className="size-4" />, title: 'Kleine Kacheln' },
    { id: 'list', icon: <List className="size-4" />, title: 'Liste' }
  ]

  function libraryItemDnd(m: MediaItem): HTMLAttributes<HTMLElement> {
    return {
      draggable: true,
      onDragStart: (e) => e.dataTransfer.setData('text/x-media-id', m.id),
      onDoubleClick: () => void cmd({ type: 'add', mediaIds: [m.id] })
    }
  }

  return (
    <Card className={`flex min-w-0 flex-col p-5 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-medium">Bibliothek</h2>
        <div className="flex items-center gap-1">
          <div className="mr-1 flex rounded-md border border-border">
            {viewButtons.map((b) => (
              <button
                key={b.id}
                title={b.title}
                onClick={() => setView(b.id)}
                className={`p-1.5 ${view === b.id ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {b.icon}
              </button>
            ))}
          </div>
          <Button variant="secondary" size="sm" onClick={() => void importFiles()}>
            <FolderSearch className="size-4" /> Dateien
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void importFolder()}>
            <FolderOpen className="size-4" /> Ordner
          </Button>
        </div>
      </div>

      <ConvertQueue onDone={onReload} />

      {staleItems.length > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs">
          <RefreshCw className="size-4 shrink-0 text-warning" />
          <span className="flex-1 text-warning">
            {staleItems.length} Medium/Medien ≠ Wand-Auflösung ({wallW}×{wallH}).
          </span>
          <Button size="sm" variant="outline" onClick={() => void reconvertStale()}>
            Neu konvertieren
          </Button>
        </div>
      )}

      {/* Drop-Zone + Bibliotheksinhalt */}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          if (!dragOver) setDragOver(true)
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setDragOver(false)
        }}
        onDrop={onDropFiles}
        className={`min-h-[120px] rounded-md border-2 border-dashed p-2 transition-colors ${
          dragOver ? 'border-primary bg-primary/10' : 'border-border/60'
        }`}
      >
        {library.length === 0 ? (
          <p className="flex h-[120px] flex-col items-center justify-center gap-1 text-center text-sm text-muted-foreground">
            <FolderInput className="size-5" />
            Medien hierher ziehen oder über „Dateien"/„Ordner" importieren.
            <span className="text-xs">
              {fit === 'original'
                ? 'Unverändert übernommen, beim Abspielen eingepasst.'
                : `Konvertierung auf ${wallW}×${wallH}.`}
            </span>
          </p>
        ) : view === 'list' ? (
          <div className="max-h-[460px] space-y-1 overflow-auto pr-1">
            {library.map((m) => (
              <div
                key={m.id}
                {...libraryItemDnd(m)}
                className="group flex items-center gap-2 rounded-md border border-transparent px-2 py-1 hover:bg-muted/40"
              >
                <div className="h-9 w-16 shrink-0 overflow-hidden rounded bg-black">
                  {m.thumbUrl ? (
                    <img src={m.thumbUrl} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm" title={m.title}>
                    {m.title}
                  </p>
                  <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    {kindIcon(m.kind)} {m.width}×{m.height}
                    {m.durationSec ? ` · ${fmtTime(m.durationSec)}` : ''} · {fmtBytes(m.sizeBytes)}
                  </p>
                </div>
                <button
                  className="shrink-0 rounded p-1 text-muted-foreground hover:bg-primary hover:text-primary-foreground"
                  onClick={() => void cmd({ type: 'add', mediaIds: [m.id] })}
                  title="Zur Playlist"
                >
                  <Plus className="size-4" />
                </button>
                <button
                  className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
                  onClick={() =>
                    void api.player.reconvert([m.id], { width: wallW, height: wallH }, fit)
                  }
                  title="Neu einbacken aus dem Original (aktuelle Auflösung + Aufbereitung/Blur)"
                >
                  <RefreshCw className="size-4" />
                </button>
                <button
                  className="shrink-0 rounded p-1 text-muted-foreground hover:text-danger"
                  onClick={() => void api.player.libraryDelete(m.id)}
                  title="Löschen"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div
            className={`grid max-h-[460px] gap-2 overflow-auto pr-1 ${
              view === 'small' ? 'grid-cols-3 sm:grid-cols-5' : 'grid-cols-2 sm:grid-cols-3'
            }`}
          >
            {library.map((m) => (
              <div
                key={m.id}
                {...libraryItemDnd(m)}
                className="group relative cursor-grab overflow-hidden rounded-md border border-border bg-muted/30"
              >
                <div className="aspect-video w-full bg-black">
                  {m.thumbUrl ? (
                    <img src={m.thumbUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      {kindIcon(m.kind)}
                    </div>
                  )}
                </div>
                {view === 'large' && (
                  <div className="p-1.5">
                    <p className="truncate text-xs font-medium" title={m.title}>
                      {m.title}
                    </p>
                    <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      {kindIcon(m.kind)} {m.width}×{m.height}
                      {m.durationSec ? ` · ${fmtTime(m.durationSec)}` : ''}
                    </p>
                  </div>
                )}
                <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    className="rounded bg-black/70 p-1 text-white hover:bg-primary hover:text-primary-foreground"
                    onClick={() => void cmd({ type: 'add', mediaIds: [m.id] })}
                    title="Zur Playlist hinzufügen"
                  >
                    <Plus className="size-3.5" />
                  </button>
                  <button
                    className="rounded bg-black/70 p-1 text-white hover:bg-primary hover:text-primary-foreground"
                    onClick={() =>
                      void api.player.reconvert([m.id], { width: wallW, height: wallH }, fit)
                    }
                    title="Neu einbacken aus dem Original (aktuelle Auflösung + Aufbereitung/Blur)"
                  >
                    <RefreshCw className="size-3.5" />
                  </button>
                  <button
                    className="rounded bg-black/70 p-1 text-white hover:bg-destructive"
                    onClick={() => void api.player.libraryDelete(m.id)}
                    title="Aus Bibliothek löschen"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        {library.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void cmd({ type: 'add', mediaIds: library.map((m) => m.id) })}
          >
            <ListPlus className="size-4" /> Alle zur Playlist
          </Button>
        )}
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void openMediaDir()}
          title="Speicherort der konvertierten Medien"
        >
          <FolderOpen className="size-4" /> Ordner
        </Button>
        {library.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="text-danger hover:text-danger/80"
            onClick={() => {
              void api
                .confirm({
                  message: 'Gesamte Bibliothek löschen?',
                  detail: 'Die konvertierten Dateien werden entfernt.',
                  confirmLabel: 'Leeren',
                  danger: true
                })
                .then((ok) => {
                  if (ok) void api.player.libraryClear()
                })
            }}
          >
            <Eraser className="size-4" /> Leeren
          </Button>
        )}
      </div>
    </Card>
  )
}
