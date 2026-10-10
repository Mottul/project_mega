// Werkzeug-Kachel des Startbildschirms in drei Größen. Stern = Favorit, Pfeil = eigenes
// Fenster; optional ziehbar (in/zwischen Favoriten-Kategorien), Ablage-Ziel mit
// Einfügemarke und Pfeil-Knöpfe zum Sortieren ohne Maus.

import type { CSSProperties, DragEvent } from 'react'
import { AppWindow, ChevronLeft, ChevronRight, ExternalLink, Star, Wifi } from 'lucide-react'
import { Badge } from '@renderer/components/ui/badge'
import { Card } from '@renderer/components/ui/card'
import { api } from '@renderer/lib/api'
import { cn } from '@renderer/lib/utils'
import type { ToolModule } from '@renderer/tools/types'
import { isSmallTool } from '@shared/toolWindows'
import type { LauncherTileSize } from '@shared/types'
import { softHyphenate } from './text'
import type { ToolActivity } from './useToolActivity'

// Mindestbreite je Größe: das Raster füllt die Breite mit so vielen Spalten wie passen
// (auch in schmalen Kategorien – min(…, 100 %) verhindert Überlauf)
const TILE_MIN: Record<LauncherTileSize, number> = { small: 160, medium: 240, large: 300 }

export function tileGridStyle(size: LauncherTileSize): CSSProperties {
  return {
    gridTemplateColumns: `repeat(auto-fill, minmax(min(${TILE_MIN[size]}px, 100%), 1fr))`,
    // alle Zeilen so hoch wie die höchste -> Kacheln gleich hoch, auch mit weniger Text
    // oder wenn ein Status-Badge den Titel umbricht
    gridAutoRows: '1fr'
  }
}

const SIZE: Record<
  LauncherTileSize,
  { pad: string; box: string; icon: string; title: string; desc: string | null }
> = {
  small: { pad: 'p-2.5', box: 'size-8', icon: 'size-4', title: 'text-sm', desc: null },
  // Beschreibung reserviert immer ihre volle Zeilenzahl: kurze Texte machen die Kachel nicht
  // niedriger (gleiche Höhe auch über Kategorien hinweg)
  medium: {
    pad: 'p-4',
    box: 'size-9',
    icon: 'size-5',
    title: 'text-sm',
    desc: 'mt-0.5 line-clamp-2 min-h-[2lh] text-xs'
  },
  large: {
    pad: 'p-5',
    box: 'size-11',
    icon: 'size-6',
    title: 'text-base',
    desc: 'mt-1 line-clamp-3 min-h-[3lh] text-sm'
  }
}

export interface TileDrag {
  dragging: boolean
  onDragStart: (e: DragEvent) => void
  onDragEnd: () => void
}

export interface TileDrop {
  /** Einfügemarke beim Ziehen über dieser Kachel */
  side: 'before' | 'after' | null
  onDragOver: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
}

export interface TileMove {
  canPrev: boolean
  canNext: boolean
  onMove: (delta: -1 | 1) => void
}

export function ToolCard({
  tool,
  size,
  activity,
  remote,
  favorite,
  drag,
  drop,
  move,
  onOpen,
  onToggleFavorite
}: {
  tool: ToolModule
  size: LauncherTileSize
  activity?: ToolActivity
  /** Handy-Fernsteuerung dieses Werkzeugs läuft. */
  remote?: boolean
  favorite: boolean
  drag?: TileDrag
  drop?: TileDrop
  move?: TileMove
  onOpen: () => void
  onToggleFavorite: () => void
}): JSX.Element {
  const Icon = tool.icon
  const s = SIZE[size]
  const small = isSmallTool(tool.id)
  return (
    <Card
      role="button"
      tabIndex={0}
      // eigener Name: sonst flössen die Beschriftungen der inneren Knöpfe mit ein
      aria-label={tool.name}
      aria-describedby={`tool-desc-${tool.id}`}
      // kleine Kacheln zeigen keine Beschreibung -> als Tooltip
      title={s.desc ? undefined : tool.description}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') onOpen()
      }}
      draggable={Boolean(drag)}
      onDragStart={drag?.onDragStart}
      onDragEnd={drag?.onDragEnd}
      onDragOver={drop?.onDragOver}
      onDrop={drop?.onDrop}
      className={cn(
        'group relative h-full cursor-pointer transition-colors hover:border-primary/50 hover:bg-muted/40',
        s.pad,
        drag?.dragging && 'opacity-40'
      )}
    >
      {/* Einfügemarke beim Sortieren: Balken an der Seite, an der abgelegt wird */}
      {drop?.side && (
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-y-2 w-1 rounded-full bg-primary',
            drop.side === 'before' ? '-left-2' : '-right-2'
          )}
        />
      )}
      {/* Aktionen oben rechts: Favorit umschalten + in neuem Fenster öffnen. Der
          Stern bleibt bei Favoriten sichtbar, sonst erscheint alles beim Hover. */}
      {/* Stern fest in der Ecke (Platz dafür ist reserviert); „Neues Fenster" schwebt
          links daneben und belegt keinen Platz, solange es unsichtbar ist */}
      <div className="absolute right-1.5 top-1.5">
        <button
          type="button"
          title={favorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
          aria-pressed={favorite}
          onClick={(e) => {
            e.stopPropagation()
            onToggleFavorite()
          }}
          className={cn(
            'rounded-md p-1.5 transition-opacity hover:bg-muted focus-visible:opacity-100',
            favorite
              ? 'text-primary opacity-100'
              : 'text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100'
          )}
        >
          <Star className={cn('size-4', favorite && 'fill-current')} />
        </button>
      </div>
      {/* Kleine Werkzeuge öffnen sich ohnehin im eigenen Fenster -> kein Extra-Knopf */}
      {!small && (
        <button
          type="button"
          title="In neuem Fenster öffnen"
          onClick={(e) => {
            e.stopPropagation()
            void api.openToolWindow(tool.id)
          }}
          className="absolute right-9 top-1.5 rounded-md bg-card/90 p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
        >
          <ExternalLink className="size-4" />
        </button>
      )}
      <div className={cn('flex gap-3', s.desc ? 'items-start' : 'items-center')}>
        <div
          className={cn(
            'flex shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary',
            s.box
          )}
        >
          <Icon className={s.icon} />
        </div>
        <div className="min-w-0 flex-1">
          {/* rechts Platz für den Stern; min-w-0 -> Kürzen greift auch in schmalen Spalten */}
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 pr-7">
            {/* Name und Fenster-Zeichen bleiben in einer Zeile (der Name kürzt sich), sonst
                bräche das Zeichen um und die Kachel würde höher als die anderen */}
            <span className="flex min-w-0 max-w-full items-center gap-1.5">
              <h3
                className={cn(
                  'min-w-0 font-medium',
                  s.title,
                  // klein: Name darf zweizeilig sein (sonst bliebe nur „Video-Pla…")
                  s.desc
                    ? 'max-w-full truncate'
                    : 'line-clamp-2 hyphens-auto break-words text-[13px] leading-tight'
                )}
              >
                {s.desc ? tool.name : softHyphenate(tool.name)}
              </h3>
              {small && (
                // nur fürs Auge: der Name der Kachel kommt aus aria-label
                <span title="Öffnet ein eigenes kleines Fenster" className="shrink-0">
                  <AppWindow className="size-3.5 text-muted-foreground" aria-hidden />
                </span>
              )}
            </span>
            {activity && (
              <Badge tone="success" dot className="shrink-0">
                {activity.label}
              </Badge>
            )}
            {remote && (
              <Badge tone="info" className="shrink-0" title="Handy-Fernsteuerung ist aktiv">
                <Wifi className="size-3" /> {size === 'small' ? '' : 'Fernsteuerung'}
              </Badge>
            )}
          </div>
          {s.desc ? (
            // sortierbar: rechts unten Platz für die Pfeile lassen
            <p
              id={`tool-desc-${tool.id}`}
              className={cn(s.desc, 'text-muted-foreground', move && 'pr-11')}
            >
              {tool.description}
            </p>
          ) : (
            <span id={`tool-desc-${tool.id}`} className="sr-only">
              {tool.description}
            </span>
          )}
        </div>
      </div>
      {/* Sortieren ohne Ziehen (Tastatur, Touch): erscheint bei Hover/Fokus */}
      {move && (
        <div
          className={cn(
            'absolute bottom-1 right-1.5 flex items-center gap-0.5 rounded-md opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100',
            // kleine Kacheln haben keinen freien Rand -> lesbar über dem Namen
            !s.desc && 'bg-card/90 shadow-sm'
          )}
        >
          {(
            [
              [-1, move.canPrev, ChevronLeft, 'Nach vorne'],
              [1, move.canNext, ChevronRight, 'Nach hinten']
            ] as const
          ).map(([delta, enabled, Arrow, label]) => (
            <button
              key={delta}
              type="button"
              disabled={!enabled}
              title={`${label} verschieben`}
              aria-label={`${tool.name} ${label.toLowerCase()} verschieben`}
              onClick={(e) => {
                e.stopPropagation()
                move.onMove(delta)
              }}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
            >
              <Arrow className="size-3.5" />
            </button>
          ))}
        </div>
      )}
    </Card>
  )
}
