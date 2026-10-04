import { useEffect, useMemo, useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowDownAZ,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  LayoutGrid,
  Search,
  Star,
  Wifi
} from 'lucide-react'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { ThemeToggle } from '@renderer/components/ThemeToggle'
import { DensityToggle } from '@renderer/components/DensityToggle'
import { AccentPicker } from '@renderer/components/AccentPicker'
import { api } from '@renderer/lib/api'
import { APP_NAME } from '@shared/brand'
import { MottulboxLogo } from '@renderer/components/MottulboxLogo'
import { cn } from '@renderer/lib/utils'
import { findTool, tools } from '@renderer/tools/registry'
import { CATEGORY_LABELS, type ToolModule } from '@renderer/tools/types'
import type { ToolCategoryId } from '@shared/types'
import { dropOn, moveBy, sortByName } from './favoritesOrder'
import { useToolActivity, type ToolActivity } from './useToolActivity'
import { useToolFavorites } from './useToolFavorites'
import { RemoteAppButton } from './RemoteAppButton'
import { remoteToolIds, useRemoteApp } from './useRemoteApp'

const CATEGORY_ORDER: ToolCategoryId[] = [
  'playback',
  'control',
  'visual',
  'media',
  'rigging',
  'calc'
]

function matches(tool: ToolModule, q: string): boolean {
  if (!q) return true
  const hay = [tool.name, tool.description, ...(tool.keywords ?? [])].join(' ').toLowerCase()
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((term) => hay.includes(term))
}

/** Sortier-Fähigkeiten einer Favoriten-Kachel (Ziehen & Ablegen + Pfeile). */
interface Reorder {
  dragging: boolean
  /** Einfügemarke beim Ziehen über dieser Kachel */
  dropSide: 'before' | 'after' | null
  canPrev: boolean
  canNext: boolean
  onMove: (delta: -1 | 1) => void
  onDragStart: (e: DragEvent) => void
  onDragOver: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
  onDragEnd: () => void
}

/** Eine Werkzeug-Kachel (Homescreen). Stern = Favorit, Pfeil = eigenes Fenster. */
function ToolCard({
  tool,
  activity,
  remote,
  favorite,
  reorder,
  onOpen,
  onToggleFavorite
}: {
  tool: ToolModule
  activity?: ToolActivity
  /** Handy-Fernsteuerung dieses Werkzeugs läuft. */
  remote?: boolean
  favorite: boolean
  /** nur in der Favoriten-Reihe (und nicht während einer Suche) */
  reorder?: Reorder
  onOpen: () => void
  onToggleFavorite: () => void
}): JSX.Element {
  const Icon = tool.icon
  return (
    <Card
      role="button"
      tabIndex={0}
      // eigener Name: sonst flössen die Beschriftungen der inneren Knöpfe mit ein
      aria-label={tool.name}
      aria-describedby={`tool-desc-${tool.id}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') onOpen()
      }}
      draggable={Boolean(reorder)}
      onDragStart={reorder?.onDragStart}
      onDragOver={reorder?.onDragOver}
      onDrop={reorder?.onDrop}
      onDragEnd={reorder?.onDragEnd}
      className={cn(
        'group relative cursor-pointer p-4 transition-colors hover:border-primary/50 hover:bg-muted/40',
        reorder?.dragging && 'opacity-40'
      )}
    >
      {/* Einfügemarke beim Sortieren: Balken an der Seite, an der abgelegt wird */}
      {reorder?.dropSide && (
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-y-2 w-1 rounded-full bg-primary',
            reorder.dropSide === 'before' ? '-left-2' : '-right-2'
          )}
        />
      )}
      {/* Aktionen oben rechts: Favorit umschalten + in neuem Fenster öffnen. Der
          Stern bleibt bei Favoriten sichtbar, sonst erscheint alles beim Hover. */}
      <div className="absolute right-2 top-2 flex items-center gap-0.5">
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
        <button
          type="button"
          title="In neuem Fenster öffnen"
          onClick={(e) => {
            e.stopPropagation()
            void api.openToolWindow(tool.id)
          }}
          className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
        >
          <ExternalLink className="size-4" />
        </button>
      </div>
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
          <Icon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 pr-6">
            <h3 className="truncate text-sm font-medium">{tool.name}</h3>
            {activity && (
              <Badge tone="success" dot className="shrink-0">
                {activity.label}
              </Badge>
            )}
            {remote && (
              <Badge tone="info" className="shrink-0" title="Handy-Fernsteuerung ist aktiv">
                <Wifi className="size-3" /> Fernsteuerung
              </Badge>
            )}
          </div>
          {/* sortierbar: rechts unten Platz für die Pfeile lassen */}
          <p
            id={`tool-desc-${tool.id}`}
            className={cn('mt-0.5 line-clamp-2 text-xs text-muted-foreground', reorder && 'pr-11')}
          >
            {tool.description}
          </p>
        </div>
      </div>
      {/* Sortieren ohne Ziehen (Tastatur, Touch): erscheint bei Hover/Fokus */}
      {reorder && (
        <div className="absolute bottom-1.5 right-2 flex items-center gap-0.5">
          {(
            [
              [-1, reorder.canPrev, ChevronLeft, 'Nach vorne'],
              [1, reorder.canNext, ChevronRight, 'Nach hinten']
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
                reorder.onMove(delta)
              }}
              className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 disabled:pointer-events-none disabled:opacity-0 group-hover:opacity-100 group-hover:disabled:opacity-30"
            >
              <Arrow className="size-3.5" />
            </button>
          ))}
        </div>
      )}
    </Card>
  )
}

export function Launcher(): JSX.Element {
  const [q, setQ] = useState('')
  const navigate = useNavigate()
  const activity = useToolActivity()
  const remoteApp = useRemoteApp()
  const remoteTools = remoteToolIds(remoteApp)
  const { favorites, isFavorite, toggle, reorder, favoritesOnly, setFavoritesOnly } =
    useToolFavorites()
  const [dragId, setDragId] = useState<string | null>(null)
  const [drop, setDrop] = useState<{ id: string; after: boolean } | null>(null)
  // Ansage für Screenreader nach dem Verschieben per Pfeil
  const [announce, setAnnounce] = useState('')

  // Übersicht -> Fenstertitel zurück auf den App-Namen.
  useEffect(() => {
    document.title = APP_NAME
  }, [])

  // Kundenansicht: ist ein Start-Tool gesetzt, direkt (gesperrt) dorthin springen.
  useEffect(() => {
    void api.getSettings().then((s) => {
      if (s.kioskToolId && findTool(s.kioskToolId)) {
        navigate(`/tool/${s.kioskToolId}?kiosk=1`, { replace: true })
      }
    })
  }, [navigate])

  const filtered = useMemo(() => tools.filter((t) => matches(t, q)), [q])
  // Favoriten in eigener Reihenfolge (nur noch existierende Werkzeuge)
  const favTools = useMemo(
    () =>
      favorites
        .map((id) => tools.find((t) => t.id === id))
        .filter((t): t is ToolModule => t != null),
    [favorites]
  )
  const favItems = useMemo(() => favTools.filter((t) => matches(t, q)), [favTools, q])
  const groups = useMemo(
    () =>
      CATEGORY_ORDER.map((cat) => ({
        cat,
        items: filtered.filter((t) => t.category === cat)
      })).filter((g) => g.items.length > 0),
    [filtered]
  )
  // „Nur Favoriten" + Suche: weitere Treffer trotzdem zeigen (sonst wirkt die Suche kaputt)
  const otherHits = useMemo(
    () => (favoritesOnly && q ? filtered.filter((t) => !favorites.includes(t.id)) : []),
    [favoritesOnly, q, filtered, favorites]
  )

  // Sortieren nur ohne Suche: sonst wären Nachbarn unsichtbar und die Ziele mehrdeutig
  const sortable = !q && favTools.length > 1
  const visibleIds = favTools.map((t) => t.id)

  function reorderFor(tool: ToolModule, index: number): Reorder | undefined {
    if (!sortable) return undefined
    return {
      dragging: dragId === tool.id,
      dropSide:
        drop?.id === tool.id && dragId && dragId !== tool.id
          ? drop.after
            ? 'after'
            : 'before'
          : null,
      canPrev: index > 0,
      canNext: index < favTools.length - 1,
      onMove: (delta) => {
        reorder(moveBy(favorites, visibleIds, tool.id, delta))
        setAnnounce(`${tool.name} an Position ${index + 1 + delta} verschoben`)
      },
      onDragStart: (e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', tool.id)
        setDragId(tool.id)
      },
      onDragOver: (e) => {
        if (!dragId) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        const r = e.currentTarget.getBoundingClientRect()
        const after = e.clientX > r.left + r.width / 2
        if (drop?.id !== tool.id || drop.after !== after) setDrop({ id: tool.id, after })
      },
      onDrop: (e) => {
        e.preventDefault()
        // Seite aus dem Ablegepunkt selbst bestimmen (nicht aus evtl. veraltetem State)
        const r = e.currentTarget.getBoundingClientRect()
        const after = e.clientX > r.left + r.width / 2
        if (dragId) reorder(dropOn(favorites, dragId, tool.id, after))
        setDragId(null)
        setDrop(null)
      },
      onDragEnd: () => {
        setDragId(null)
        setDrop(null)
      }
    }
  }

  const gridClass = 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
  const showCategories = !favoritesOnly
  const nothing = favoritesOnly
    ? q !== '' && favItems.length === 0 && otherHits.length === 0
    : groups.length === 0 && favItems.length === 0

  const card = (tool: ToolModule, reorderProps?: Reorder): JSX.Element => (
    <ToolCard
      key={tool.id}
      tool={tool}
      activity={activity[tool.id]}
      remote={remoteTools.has(tool.id)}
      favorite={isFavorite(tool.id)}
      reorder={reorderProps}
      onOpen={() => navigate(`/tool/${tool.id}`)}
      onToggleFavorite={() => toggle(tool.id)}
    />
  )

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border px-8 py-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* themetreu: folgt der Textfarbe in Hell/Dunkel */}
            <MottulboxLogo height={40} className="shrink-0 text-foreground" title="" />
            <h1 className="text-2xl font-semibold tracking-tight">{APP_NAME}</h1>
          </div>
          <div className="flex items-center gap-1">
            <RemoteAppButton status={remoteApp} />
            <AccentPicker />
            <DensityToggle />
            <ThemeToggle />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Werkzeug suchen…"
              className="pl-9"
            />
          </div>
          {/* Ansicht: alle Werkzeuge nach Kategorie oder nur die Favoriten */}
          <div
            role="group"
            aria-label="Ansicht"
            className="flex rounded-md border border-border bg-muted/30 p-0.5"
          >
            {(
              [
                [false, 'Alle', LayoutGrid],
                [true, 'Favoriten', Star]
              ] as const
            ).map(([only, label, Icon]) => (
              <button
                key={label}
                type="button"
                aria-pressed={favoritesOnly === only}
                onClick={() => setFavoritesOnly(only)}
                className={cn(
                  'flex items-center gap-1.5 rounded px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70',
                  favoritesOnly === only
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon
                  className={cn('size-4', only && favoritesOnly && 'fill-current text-primary')}
                />
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto px-8 py-6">
        <span className="sr-only" aria-live="polite">
          {announce}
        </span>
        {nothing ? (
          <p className="text-sm text-muted-foreground">Kein Werkzeug gefunden.</p>
        ) : (
          <div className="space-y-8">
            {favoritesOnly && favTools.length === 0 && !q && (
              <Card className="flex flex-col items-center gap-3 border-dashed px-6 py-12 text-center">
                <Star className="size-8 text-muted-foreground" />
                <p className="font-medium">Noch keine Favoriten</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  In der Ansicht „Alle“ den Stern an einer Kachel antippen – die Werkzeuge
                  erscheinen dann hier, in eigener Reihenfolge.
                </p>
                <Button variant="secondary" onClick={() => setFavoritesOnly(false)}>
                  <LayoutGrid className="size-4" /> Alle Werkzeuge zeigen
                </Button>
              </Card>
            )}
            {favItems.length > 0 && (
              <section>
                <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Star className="size-3.5 fill-current text-primary" /> Favoriten
                  </h2>
                  {sortable && (
                    <>
                      <span className="text-xs text-muted-foreground">
                        Zum Sortieren ziehen oder die Pfeile an der Kachel nutzen
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto h-7 text-xs"
                        title="Favoriten alphabetisch sortieren"
                        onClick={() => reorder(sortByName(favorites, (id) => findTool(id)?.name))}
                      >
                        <ArrowDownAZ className="size-3.5" /> A–Z
                      </Button>
                    </>
                  )}
                </div>
                <div className={gridClass}>
                  {favItems.map((tool, i) => card(tool, reorderFor(tool, i)))}
                </div>
              </section>
            )}
            {otherHits.length > 0 && (
              <section>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Weitere Treffer
                </h2>
                <div className={gridClass}>{otherHits.map((tool) => card(tool))}</div>
              </section>
            )}
            {showCategories &&
              groups.map((g) => (
                <section key={g.cat}>
                  <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {CATEGORY_LABELS[g.cat]}
                  </h2>
                  <div className={gridClass}>{g.items.map((tool) => card(tool))}</div>
                </section>
              ))}
          </div>
        )}
      </main>
    </div>
  )
}
