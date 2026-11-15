// Bibliothek des Video-Players – ein Feld der Arbeitsfläche (components/WorkArea.tsx). Im Kopf
// „Bibliothek“ und die Anzahl, rechts „Importieren“ (Dateien, Ordner) und das Menü „⋯“ mit der
// Ansicht, „Alle zur Playlist“, „Medienordner öffnen“ und „Bibliothek leeren …“. Darunter die
// Suche (bleibt stehen, während die Medien scrollen), der Hinweis auf Medien in anderer
// Wand-Auflösung und die Medien als große/kleine Kacheln oder Liste; unten angeheftet die
// Import-Liste (ConvertQueue.tsx), solange etwas läuft oder ein Fehler dasteht.
//
// Die Kacheln richten sich nach dem Platz im Feld (auto-fill), nicht nach dem Fenster – mit
// angehefteter Schublade ist die Bibliothek bei gleicher Fensterbreite schmaler. Dateien nimmt
// das ganze Feld an (useDateiAblage), der gestrichelte Rahmen steht nur, solange sie darüber
// schweben. Ziehen oder Doppelklick legt ein Medium in die Playlist. Löschen und Leeren fragen
// nach – der main löscht Datei, Miniatur und Eintrag sofort.

import { useState, type HTMLAttributes } from 'react'
import {
  ChevronDown,
  Ellipsis,
  Film,
  FolderInput,
  Image as ImageIcon,
  Import,
  Plus,
  RefreshCw,
  Search,
  Trash2
} from 'lucide-react'
import { Pane } from '@renderer/components/WorkArea'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '@renderer/components/ui/menu'
import { api } from '@renderer/lib/api'
import { useDateiAblage } from '@renderer/lib/useDateiAblage'
import { cn } from '@renderer/lib/utils'
import { MEDIA_EXTENSIONS } from '@shared/mediaExtensions'
import type { FitMode, MediaItem } from '@shared/types'
import { ConvertQueue, useImportAuftraege } from './ConvertQueue'
import { fmtBytes, fmtTime } from './format'
import { sucheMedien } from './layout'

type ViewMode = 'large' | 'small' | 'list'

const ANSICHTEN: { id: ViewMode; label: string }[] = [
  { id: 'large', label: 'Große Kacheln' },
  { id: 'small', label: 'Kleine Kacheln' },
  { id: 'list', label: 'Liste' }
]

/** Spalten nach dem Platz im Feld: so viele, wie mit der Mindestbreite hineinpassen */
const KACHEL_SPALTEN: Record<Exclude<ViewMode, 'list'>, string> = {
  large: 'grid-cols-[repeat(auto-fill,minmax(min(170px,100%),1fr))]',
  small: 'grid-cols-[repeat(auto-fill,minmax(min(110px,100%),1fr))]'
}

function kindIcon(kind: MediaItem['kind']): JSX.Element {
  return kind === 'image' ? <ImageIcon className="size-3.5" /> : <Film className="size-3.5" />
}

export function Library({
  library,
  fit,
  wallW,
  wallH,
  onReload
}: {
  library: MediaItem[]
  fit: FitMode
  wallW: number
  wallH: number
  /** Bibliothek neu laden (ein Import ist fertig) */
  onReload: () => void
}): JSX.Element {
  const [view, setView] = useState<ViewMode>('large')
  const [suche, setSuche] = useState('')
  const auftraege = useImportAuftraege(onReload)
  const cmd = api.player.command
  const leer = library.length === 0
  const treffer = sucheMedien(library, suche)

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

  const ablage = useDateiAblage((dateien) =>
    importSources(dateien.map((f) => api.pathForFile(f)).filter(Boolean))
  )

  async function openMediaDir(): Promise<void> {
    const dir = await api.player.mediaDir()
    await api.openPath(dir)
  }

  async function leeren(): Promise<void> {
    const ok = await api.confirm({
      message: 'Gesamte Bibliothek löschen?',
      detail: 'Die konvertierten Dateien werden entfernt.',
      confirmLabel: 'Leeren',
      danger: true
    })
    if (ok) await api.player.libraryClear()
  }

  // Wie „Bibliothek leeren“: Der main löscht sofort, ein Klick daneben wäre nicht zurückzuholen
  async function loeschen(m: MediaItem): Promise<void> {
    const ok = await api.confirm({
      message: `„${m.title}“ aus der Bibliothek löschen?`,
      detail:
        'Die Datei in der Bibliothek wird entfernt, die Originaldatei bleibt erhalten. Steht das Medium in der Playlist, verschwindet es auch dort.',
      confirmLabel: 'Löschen',
      danger: true
    })
    if (ok) await api.player.libraryDelete(m.id)
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

  function libraryItemDnd(m: MediaItem): HTMLAttributes<HTMLElement> {
    return {
      draggable: true,
      onDragStart: (e) => e.dataTransfer.setData('text/x-media-id', m.id),
      onDoubleClick: () => void cmd({ type: 'add', mediaIds: [m.id] })
    }
  }

  return (
    <Pane
      area="bibliothek"
      testId="feld-bibliothek"
      title="Bibliothek"
      count={leer ? undefined : library.length}
      ablage={ablage}
      actions={
        <>
          {/* h-6: Der Kopf bleibt 40 px hoch, wie in der Playlist */}
          <Menu
            label="Importieren"
            knopf={
              <>
                <Import className="size-3.5" /> Importieren
                <ChevronDown className="size-3 text-muted-foreground" />
              </>
            }
            variant="secondary"
            align="end"
            breite="w-44"
            className="h-6 gap-1 px-2"
          >
            <MenuItem onSelect={() => void importFiles()}>Dateien …</MenuItem>
            <MenuItem onSelect={() => void importFolder()}>Ordner …</MenuItem>
          </Menu>
          <Menu
            label="Bibliothek"
            knopf={<Ellipsis className="size-4" />}
            knopfLabel="Mehr zur Bibliothek"
            title="Mehr"
            align="end"
            className="size-6 p-0 text-muted-foreground hover:text-foreground"
          >
            <MenuLabel>Ansicht</MenuLabel>
            {ANSICHTEN.map((a) => (
              <MenuItem key={a.id} checked={view === a.id} onSelect={() => setView(a.id)}>
                {a.label}
              </MenuItem>
            ))}
            <MenuSeparator />
            <MenuItem
              disabled={leer}
              onSelect={() => void cmd({ type: 'add', mediaIds: library.map((m) => m.id) })}
            >
              Alle zur Playlist
            </MenuItem>
            <MenuItem
              title="Speicherort der konvertierten Medien"
              onSelect={() => void openMediaDir()}
            >
              Medienordner öffnen
            </MenuItem>
            <MenuSeparator />
            <MenuItem disabled={leer} onSelect={() => void leeren()}>
              Bibliothek leeren …
            </MenuItem>
          </Menu>
        </>
      }
      footer={auftraege.sichtbar ? <ConvertQueue auftraege={auftraege} /> : undefined}
    >
      {!leer && (
        // Bleibt oben stehen, während die Medien darunter scrollen, und deckt dabei den Rand des
        // Inhalts mit ab. -top-3: Chromium lässt `sticky` am inneren Rand des Polsters kleben – mit
        // top-0 rutschte der Block 12 px über die erste Reihe, gescrollt schauten darüber Kacheln
        // hervor (im Bild gesehen)
        <div
          data-testid="bibliothek-suche"
          className="sticky -top-3 z-10 -mx-3 -mt-3 bg-card px-3 pb-2 pt-3"
        >
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              placeholder="Titel suchen …"
              aria-label="Bibliothek durchsuchen"
              className="h-8 pl-8"
            />
          </div>
        </div>
      )}

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

      {leer ? (
        <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-1 text-center text-sm text-muted-foreground">
          <FolderInput className="size-5" />
          <p>Medien hierher ziehen oder über „Importieren“ hinzufügen.</p>
          <p className="text-xs">
            {fit === 'original'
              ? 'Unverändert übernommen, beim Abspielen eingepasst.'
              : `Konvertierung auf ${wallW}×${wallH}.`}
          </p>
        </div>
      ) : treffer.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Kein Medium heißt so</p>
      ) : view === 'list' ? (
        <div className="space-y-1">
          {treffer.map((m) => (
            <div
              key={m.id}
              {...libraryItemDnd(m)}
              className="group flex items-center gap-2 rounded-md border border-transparent px-2 py-1 hover:bg-muted/40"
            >
              <div className="h-9 w-16 shrink-0 overflow-hidden rounded bg-black">
                {m.thumbUrl ? (
                  <img
                    src={m.thumbUrl}
                    alt=""
                    draggable={false}
                    className="h-full w-full object-cover"
                  />
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
                onClick={() => void loeschen(m)}
                title="Aus der Bibliothek löschen"
                aria-label={`„${m.title}“ aus der Bibliothek löschen`}
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className={cn('grid gap-2', KACHEL_SPALTEN[view])}>
          {treffer.map((m) => (
            <div
              key={m.id}
              {...libraryItemDnd(m)}
              className="group relative cursor-grab overflow-hidden rounded-md border border-border bg-muted/30"
            >
              <div className="aspect-video w-full bg-black">
                {m.thumbUrl ? (
                  // Gezogen wird die Kachel: Ein gezogenes Bild brächte als Datei („Files“) den
                  // Rahmen fürs Hineinziehen auf die Bibliothek selbst
                  <img
                    src={m.thumbUrl}
                    alt=""
                    draggable={false}
                    className="h-full w-full object-cover"
                  />
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
                  onClick={() => void loeschen(m)}
                  title="Aus der Bibliothek löschen"
                  aria-label={`„${m.title}“ aus der Bibliothek löschen`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Pane>
  )
}
