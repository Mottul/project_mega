import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ExternalLink, Search } from 'lucide-react'
import { Card } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { ThemeToggle } from '@renderer/components/ThemeToggle'
import { api } from '@renderer/lib/api'
import { findTool, tools } from '@renderer/tools/registry'
import { CATEGORY_LABELS, type ToolModule } from '@renderer/tools/types'
import type { ToolCategoryId } from '@shared/types'
import { useToolActivity } from './useToolActivity'

const CATEGORY_ORDER: ToolCategoryId[] = ['media', 'database', 'calc', 'utility']

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
          <ThemeToggle />
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
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                        className="group relative cursor-pointer p-5 transition-colors hover:border-primary/50 hover:bg-muted/40"
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
                        <div className="flex items-start gap-4">
                          <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                            <Icon className="size-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-medium">{tool.name}</h3>
                              {act && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400 light:text-emerald-700">
                                  <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
                                  {act.label}
                                </span>
                              )}
                            </div>
                            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
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
