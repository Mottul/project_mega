import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Grid2x2, Grid3x3, LayoutGrid, Search, Square, Star } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { AppMenu } from '@renderer/components/app/AppMenu'
import { api } from '@renderer/lib/api'
import { APP_NAME } from '@shared/brand'
import { MottulboxLogo } from '@renderer/components/MottulboxLogo'
import { cn } from '@renderer/lib/utils'
import { findTool, tools } from '@renderer/tools/registry'
import { CATEGORY_LABELS, type ToolModule } from '@renderer/tools/types'
import type { LauncherTileSize, ToolCategoryId } from '@shared/types'
import { FavoritesBoard, type DragItem } from './FavoritesBoard'
import { flatten } from './favoriteGroups'
import { ToolCard, tileGridStyle, type TileDrag, type TileDrop, type TileMove } from './ToolCard'
import { useLauncherPrefs } from './useLauncherPrefs'
import { useToolActivity } from './useToolActivity'
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

const TILE_SIZES: { value: LauncherTileSize; label: string; Icon: typeof Square }[] = [
  { value: 'small', label: 'Kleine Kacheln', Icon: Grid3x3 },
  { value: 'medium', label: 'Mittlere Kacheln', Icon: Grid2x2 },
  { value: 'large', label: 'Große Kacheln', Icon: Square }
]

function matches(tool: ToolModule, q: string): boolean {
  if (!q) return true
  const hay = [tool.name, tool.description, ...(tool.keywords ?? [])].join(' ').toLowerCase()
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((term) => hay.includes(term))
}

/** Umschalter aus mehreren Knöpfen (Ansicht, Kachelgröße). */
function Segmented<T extends string | boolean>({
  label,
  value,
  options,
  onChange
}: {
  label: string
  value: T
  options: { value: T; label: string; Icon: typeof Square; text?: string; activeIcon?: string }[]
  onChange: (v: T) => void
}): JSX.Element {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex rounded-md border border-border bg-muted/30 p-0.5"
    >
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={value === o.value}
          title={o.label}
          aria-label={o.text ? undefined : o.label}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex items-center gap-1.5 rounded px-2.5 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70',
            value === o.value
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <o.Icon className={cn('size-4', value === o.value && o.activeIcon)} />
          {o.text}
        </button>
      ))}
    </div>
  )
}

export function Launcher(): JSX.Element {
  const [q, setQ] = useState('')
  const navigate = useNavigate()
  const activity = useToolActivity()
  const remoteApp = useRemoteApp()
  const remoteTools = remoteToolIds(remoteApp)
  const prefs = useLauncherPrefs()
  const { groups, favoritesOnly, tileSize } = prefs
  // Zieh-Zustand für Board UND Kacheln aus „Alle" (Ziehen in eine Kategorie = Favorit)
  const [drag, setDrag] = useState<DragItem | null>(null)
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
  const groupsByCategory = useMemo(
    () =>
      CATEGORY_ORDER.map((cat) => ({
        cat,
        items: filtered.filter((t) => t.category === cat)
      })).filter((g) => g.items.length > 0),
    [filtered]
  )
  const favIds = useMemo(() => new Set(flatten(groups)), [groups])
  const favCount = useMemo(() => [...favIds].filter((id) => findTool(id)).length, [favIds])
  const favHits = useMemo(() => filtered.filter((t) => favIds.has(t.id)).length, [filtered, favIds])
  // „Nur Favoriten" + Suche: weitere Treffer trotzdem zeigen (sonst wirkt die Suche kaputt)
  const otherHits = useMemo(
    () => (favoritesOnly && q ? filtered.filter((t) => !favIds.has(t.id)) : []),
    [favoritesOnly, q, filtered, favIds]
  )

  const card = (
    tool: ToolModule,
    extras: { drag?: TileDrag; drop?: TileDrop; move?: TileMove } = {}
  ): JSX.Element => (
    <ToolCard
      key={tool.id}
      tool={tool}
      size={tileSize}
      activity={activity[tool.id]}
      remote={remoteTools.has(tool.id)}
      favorite={prefs.isFavorite(tool.id)}
      {...extras}
      onOpen={() => navigate(`/tool/${tool.id}`)}
      onToggleFavorite={() => prefs.toggle(tool.id)}
    />
  )

  // Kacheln aus „Alle" lassen sich in eine Favoriten-Kategorie ziehen
  const catalogDrag = (tool: ToolModule): TileDrag | undefined =>
    q
      ? undefined
      : {
          dragging: drag?.kind === 'tool' && drag.id === tool.id,
          onDragStart: (e) => {
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', tool.id)
            setDrag({ kind: 'tool', id: tool.id })
          },
          onDragEnd: () => setDrag(null)
        }

  const showBoard = groups.length > 0 && (!q || favHits > 0)
  const nothing = favoritesOnly
    ? q !== '' && favHits === 0 && otherHits.length === 0
    : groupsByCategory.length === 0
  const grid = 'grid gap-3'

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
            <AppMenu variant="plain" align="right" />
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
          <Segmented
            label="Ansicht"
            value={favoritesOnly}
            onChange={prefs.setFavoritesOnly}
            options={[
              { value: false, label: 'Alle Werkzeuge', Icon: LayoutGrid, text: 'Alle' },
              {
                value: true,
                label: 'Nur Favoriten',
                Icon: Star,
                text: 'Favoriten',
                activeIcon: 'fill-current text-primary'
              }
            ]}
          />
          <Segmented
            label="Kachelgröße"
            value={tileSize}
            onChange={prefs.setTileSize}
            options={TILE_SIZES}
          />
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
            {favoritesOnly && favCount === 0 && !q && groups.length === 0 && (
              <Card className="flex flex-col items-center gap-3 border-dashed px-6 py-12 text-center">
                <Star className="size-8 text-muted-foreground" />
                <p className="font-medium">Noch keine Favoriten</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  In der Ansicht „Alle“ den Stern an einer Kachel antippen – die Werkzeuge
                  erscheinen dann hier. Mit eigenen Kategorien lassen sie sich frei anordnen.
                </p>
                <Button variant="secondary" onClick={() => prefs.setFavoritesOnly(false)}>
                  <LayoutGrid className="size-4" /> Alle Werkzeuge zeigen
                </Button>
              </Card>
            )}
            {showBoard && (
              <FavoritesBoard
                groups={groups}
                toolById={findTool}
                visible={(t) => matches(t, q)}
                searching={q !== ''}
                size={tileSize}
                drag={drag}
                setDrag={setDrag}
                renderTile={card}
                update={prefs.updateGroups}
                announce={setAnnounce}
              />
            )}
            {otherHits.length > 0 && (
              <section>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Weitere Treffer
                </h2>
                <div className={grid} style={tileGridStyle(tileSize)}>
                  {otherHits.map((tool) => card(tool))}
                </div>
              </section>
            )}
            {!favoritesOnly &&
              groupsByCategory.map((g) => (
                <section key={g.cat}>
                  <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {CATEGORY_LABELS[g.cat]}
                  </h2>
                  <div className={grid} style={tileGridStyle(tileSize)}>
                    {g.items.map((tool) => card(tool, { drag: catalogDrag(tool) }))}
                  </div>
                </section>
              ))}
          </div>
        )}
      </main>
    </div>
  )
}
