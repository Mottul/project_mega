import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ExternalLink, Search } from 'lucide-react'
import { Card } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { ThemeToggle } from '@renderer/components/ThemeToggle'
import { AccentPicker } from '@renderer/components/AccentPicker'
import { api } from '@renderer/lib/api'
import { findTool, tools } from '@renderer/tools/registry'
import { CATEGORY_LABELS, type ToolModule } from '@renderer/tools/types'
import type { ToolCategoryId } from '@shared/types'
import { useToolActivity } from './useToolActivity'

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

export function Launcher(): JSX.Element {
  const [q, setQ] = useState('')
  const navigate = useNavigate()
  const activity = useToolActivity()

  // Kundenansicht: ist ein Start-Tool gesetzt, direkt (gesperrt) dorthin springen.
  useEffect(() => {
    void api.getSettings().then((s) => {
      if (s.kioskToolId && findTool(s.kioskToolId)) {
        navigate(`/tool/${s.kioskToolId}?kiosk=1`, { replace: true })
      }
    })
  }, [navigate])

  const groups = useMemo(() => {
    const filtered = tools.filter((t) => matches(t, q))
    return CATEGORY_ORDER.map((cat) => ({
      cat,
      items: filtered.filter((t) => t.category === cat)
    })).filter((g) => g.items.length > 0)
  }, [q])

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border px-8 py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">MegaToolBox</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Werkzeuge für den AV-Alltag – offline, an einem Ort.
            </p>
          </div>
          <div className="flex items-center gap-1">
            <AccentPicker />
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
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">Kein Werkzeug gefunden.</p>
        ) : (
          <div className="space-y-8">
            {groups.map((g) => (
              <section key={g.cat}>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {CATEGORY_LABELS[g.cat]}
                </h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {g.items.map((tool) => {
                    const Icon = tool.icon
                    const act = activity[tool.id]
                    return (
                      <Card
                        key={tool.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => navigate(`/tool/${tool.id}`)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') navigate(`/tool/${tool.id}`)
                        }}
                        className="group relative cursor-pointer p-4 transition-colors hover:border-primary/50 hover:bg-muted/40"
                      >
                        <button
                          type="button"
                          title="In neuem Fenster öffnen"
                          onClick={(e) => {
                            e.stopPropagation()
                            void api.openToolWindow(tool.id)
                          }}
                          className="absolute right-2 top-2 rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                        >
                          <ExternalLink className="size-4" />
                        </button>
                        <div className="flex items-start gap-3">
                          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
                            <Icon className="size-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <h3 className="truncate text-sm font-medium">{tool.name}</h3>
                              {act && (
                                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400 light:text-emerald-700">
                                  <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
                                  {act.label}
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                              {tool.description}
                            </p>
                          </div>
                        </div>
                      </Card>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
