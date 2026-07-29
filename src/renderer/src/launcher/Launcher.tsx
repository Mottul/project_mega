import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ExternalLink, Search, Star } from 'lucide-react'
import { Badge } from '@renderer/components/ui/badge'
import { Card } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { ThemeToggle } from '@renderer/components/ThemeToggle'
import { DensityToggle } from '@renderer/components/DensityToggle'
import { AccentPicker } from '@renderer/components/AccentPicker'
import { api } from '@renderer/lib/api'
import { APP_NAME, APP_TAGLINE } from '@shared/brand'
import { MottulboxLogo } from '@renderer/components/MottulboxLogo'
import { cn } from '@renderer/lib/utils'
import { findTool, tools } from '@renderer/tools/registry'
import { CATEGORY_LABELS, type ToolModule } from '@renderer/tools/types'
import type { ToolCategoryId } from '@shared/types'
import { useToolActivity, type ToolActivity } from './useToolActivity'
import { useToolFavorites } from './useToolFavorites'

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

/** Eine Werkzeug-Kachel (Homescreen). Stern = Favorit, Pfeil = eigenes Fenster. */
function ToolCard({
  tool,
  activity,
  favorite,
  onOpen,
  onToggleFavorite
}: {
  tool: ToolModule
  activity?: ToolActivity
  favorite: boolean
  onOpen: () => void
  onToggleFavorite: () => void
}): JSX.Element {
  const Icon = tool.icon
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onOpen()
      }}
      className="group relative cursor-pointer p-4 transition-colors hover:border-primary/50 hover:bg-muted/40"
    >
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
          <div className="flex items-center gap-1.5 pr-6">
            <h3 className="truncate text-sm font-medium">{tool.name}</h3>
            {activity && (
              <Badge tone="success" dot className="shrink-0">
                {activity.label}
              </Badge>
            )}
          </div>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{tool.description}</p>
        </div>
      </div>
    </Card>
  )
}

export function Launcher(): JSX.Element {
  const [q, setQ] = useState('')
  const navigate = useNavigate()
  const activity = useToolActivity()
  const { favorites, isFavorite, toggle } = useToolFavorites()

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
  const groups = useMemo(
    () =>
      CATEGORY_ORDER.map((cat) => ({
        cat,
        items: filtered.filter((t) => t.category === cat)
      })).filter((g) => g.items.length > 0),
    [filtered]
  )
  // Favoriten in Markierungs-Reihenfolge, gefiltert nach der aktuellen Suche.
  const favItems = useMemo(
    () =>
      favorites
        .map((id) => filtered.find((t) => t.id === id))
        .filter((t): t is ToolModule => t != null),
    [favorites, filtered]
  )

  const gridClass = 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
  const nothing = groups.length === 0 && favItems.length === 0

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border px-8 py-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <MottulboxLogo size={44} className="shrink-0" />
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{APP_NAME}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{APP_TAGLINE}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <AccentPicker />
            <DensityToggle />
            <ThemeToggle />
          </div>
        </div>
        <div className="relative mt-4 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Werkzeug suchen…"
            className="pl-9"
          />
        </div>
      </header>

      <main className="flex-1 overflow-auto px-8 py-6">
        {nothing ? (
          <p className="text-sm text-muted-foreground">Kein Werkzeug gefunden.</p>
        ) : (
          <div className="space-y-8">
            {favItems.length > 0 && (
              <section>
                <h2 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Star className="size-3.5 fill-current text-primary" /> Favoriten
                </h2>
                <div className={gridClass}>
                  {favItems.map((tool) => (
                    <ToolCard
                      key={tool.id}
                      tool={tool}
                      activity={activity[tool.id]}
                      favorite
                      onOpen={() => navigate(`/tool/${tool.id}`)}
                      onToggleFavorite={() => toggle(tool.id)}
                    />
                  ))}
                </div>
              </section>
            )}
            {groups.map((g) => (
              <section key={g.cat}>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {CATEGORY_LABELS[g.cat]}
                </h2>
                <div className={gridClass}>
                  {g.items.map((tool) => (
                    <ToolCard
                      key={tool.id}
                      tool={tool}
                      activity={activity[tool.id]}
                      favorite={isFavorite(tool.id)}
                      onOpen={() => navigate(`/tool/${tool.id}`)}
                      onToggleFavorite={() => toggle(tool.id)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
