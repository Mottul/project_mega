// Rechner-PWA: Startseite mit allen Rechnern und je Rechner eine Seite mit Kopfzeile. Die
// Rechner selbst sind dieselben Komponenten wie in der Desktop-App (tools/<id>). Favoriten
// (Stern) stehen oben in eigener Reihenfolge, siehe favorites.ts.
import { Suspense, useEffect, useState, type ReactNode } from 'react'
import { HashRouter, Link, Navigate, Route, Routes, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
  RefreshCw,
  Star
} from 'lucide-react'
import { ErrorBoundary } from '@renderer/components/ErrorBoundary'
import { MottulboxLogo } from '@renderer/components/MottulboxLogo'
import { Button, buttonVariants } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { usePersistentState } from '@renderer/lib/usePersistentState'
import { cn } from '@renderer/lib/utils'
import type { ToolModule } from '@renderer/tools/types'
import {
  FAVORITES_KEY,
  favoritesCodec,
  moveFavorite,
  splitFavorites,
  toggleFavorite
} from './favorites'
import { findPwaTool, PWA_TOOLS } from './tools'
import { useInstallPrompt } from './useInstallPrompt'
import { useServiceWorker } from './useServiceWorker'
import { LookMenu } from './LookMenu'
import { usePwaLook } from './useLook'

const TITLE = 'Mottulbox Rechner'

export function App(): JSX.Element {
  const look = usePwaLook()
  const sw = useServiceWorker()
  const lookButton = <LookMenu look={look} />

  return (
    <HashRouter>
      <div className="flex h-full flex-col">
        {sw.updateReady && (
          <div className="pwa-safe-x flex items-center gap-3 border-b border-primary/35 bg-primary/[0.09] py-2 text-sm">
            <span className="flex-1 text-primary">Neue Version bereit.</span>
            <Button size="sm" onClick={sw.applyUpdate}>
              <RefreshCw className="size-4" /> Neu laden
            </Button>
          </div>
        )}
        <Routes>
          <Route path="/" element={<Home lookButton={lookButton} />} />
          <Route path="/:id" element={<CalcView lookButton={lookButton} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </HashRouter>
  )
}

/** Kopfzeile: bleibt stehen, der Inhalt darunter scrollt (Notch/Statusleiste ausgespart) */
function Header({ children }: { children: ReactNode }): JSX.Element {
  return (
    <header className="pwa-safe-top pwa-safe-x flex shrink-0 items-center gap-2 border-b border-border bg-background pb-2">
      {children}
    </header>
  )
}

function Scroll({ children }: { children: ReactNode }): JSX.Element {
  return <main className="pwa-safe-bottom min-h-0 flex-1 overflow-y-auto">{children}</main>
}

function Home({ lookButton }: { lookButton: ReactNode }): JSX.Element {
  useEffect(() => {
    document.title = TITLE
  }, [])
  const [favIds, setFavIds] = usePersistentState(FAVORITES_KEY, [], favoritesCodec)
  const { favorites, rest } = splitFavorites(PWA_TOOLS, favIds)
  const [arranging, setArranging] = useState(false)
  // Gemerkte IDs ohne Rechner (umbenannt/entfernt) beim nächsten Ändern gleich mit aufräumen
  const known = favorites.map((t) => t.id)
  const toggle = (id: string): void => setFavIds(toggleFavorite(known, id))
  const move = (id: string, dir: -1 | 1): void => setFavIds(moveFavorite(known, id, dir))
  // Nach dem Abheften bis auf einen bleibt nichts zu ordnen
  if (arranging && favorites.length < 2) setArranging(false)
  return (
    <>
      <Header>
        <MottulboxLogo height={30} className="shrink-0 text-primary" title="" />
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{TITLE}</h1>
        {lookButton}
      </Header>
      <Scroll>
        <div className="pwa-safe-x mx-auto max-w-5xl space-y-4 py-4">
          {favorites.length > 0 ? (
            <>
              <section className="space-y-2" aria-label="Favoriten">
                <div className="flex items-center gap-2">
                  <SectionHeading>Favoriten</SectionHeading>
                  {favorites.length > 1 && (
                    <Button
                      size="sm"
                      variant={arranging ? 'default' : 'ghost'}
                      aria-pressed={arranging}
                      onClick={() => setArranging((a) => !a)}
                    >
                      {arranging ? (
                        <Check className="size-4" />
                      ) : (
                        <ArrowUpDown className="size-4" />
                      )}
                      {arranging ? 'Fertig' : 'Ordnen'}
                    </Button>
                  )}
                </div>
                <ToolGrid label="Favoriten">
                  {favorites.map((t, i) => (
                    <ToolCard
                      key={t.id}
                      tool={t}
                      favorite
                      onToggleFavorite={() => toggle(t.id)}
                      arrange={
                        arranging
                          ? {
                              first: i === 0,
                              last: i === favorites.length - 1,
                              move: (dir) => move(t.id, dir)
                            }
                          : undefined
                      }
                    />
                  ))}
                </ToolGrid>
              </section>
              {rest.length > 0 && (
                <section className="space-y-2" aria-label="Weitere Rechner">
                  <SectionHeading>Weitere Rechner</SectionHeading>
                  <ToolGrid label="Weitere Rechner">
                    {rest.map((t) => (
                      <ToolCard key={t.id} tool={t} onToggleFavorite={() => toggle(t.id)} />
                    ))}
                  </ToolGrid>
                </section>
              )}
            </>
          ) : (
            <ToolGrid label="Rechner">
              {rest.map((t) => (
                <ToolCard key={t.id} tool={t} onToggleFavorite={() => toggle(t.id)} />
              ))}
            </ToolGrid>
          )}
          {favorites.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Tipp: Mit dem Stern heftest du Rechner oben an und kannst sie dort ordnen.
            </p>
          )}
          <InstallHint />
        </div>
      </Scroll>
    </>
  )
}

function SectionHeading({ children }: { children: string }): JSX.Element {
  return (
    <h2 className="flex-1 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
      {children}
    </h2>
  )
}

function ToolGrid({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <nav
      aria-label={label}
      className="grid grid-cols-[repeat(auto-fill,minmax(min(18rem,100%),1fr))] gap-3"
    >
      {children}
    </nav>
  )
}

interface Arrange {
  first: boolean
  last: boolean
  move: (dir: -1 | 1) => void
}

/**
 * Karte eines Rechners. Der Stern liegt neben dem Link, nicht darin (kein Knopf im Link); beim
 * Ordnen ersetzen Pfeile den Stern und die Karte öffnet nichts – sonst startete ein knapp
 * daneben getippter Pfeil auf dem Handy den Rechner.
 */
function ToolCard({
  tool,
  favorite = false,
  onToggleFavorite,
  arrange
}: {
  tool: ToolModule
  favorite?: boolean
  onToggleFavorite: () => void
  arrange?: Arrange
}): JSX.Element {
  const Icon = tool.icon
  const body = (
    <>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/[0.12] text-primary">
        <Icon className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block font-medium">{tool.name}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{tool.description}</span>
      </span>
    </>
  )
  return (
    <Card
      className={cn(
        'flex h-full items-stretch transition-colors',
        arrange ? 'border-primary/40' : 'hover:border-primary/40'
      )}
    >
      {arrange ? (
        <div className="flex min-w-0 flex-1 items-start gap-3 p-4">{body}</div>
      ) : (
        <Link
          to={`/${tool.id}`}
          className="flex min-w-0 flex-1 items-start gap-3 rounded-l-lg p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 active:bg-muted/40"
        >
          {body}
        </Link>
      )}
      {arrange ? (
        <div className="flex shrink-0 flex-col justify-center gap-1 pr-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label={`${tool.name} nach oben`}
            disabled={arrange.first}
            onClick={() => arrange.move(-1)}
          >
            <ChevronUp className="size-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`${tool.name} nach unten`}
            disabled={arrange.last}
            onClick={() => arrange.move(1)}
          >
            <ChevronDown className="size-5" />
          </Button>
        </div>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          className={cn('m-1.5 shrink-0', favorite ? 'text-primary' : 'text-muted-foreground')}
          aria-label={favorite ? `${tool.name} abheften` : `${tool.name} oben anheften`}
          aria-pressed={favorite}
          title={favorite ? 'Aus den Favoriten nehmen' : 'Zu den Favoriten (oben anheften)'}
          onClick={onToggleFavorite}
        >
          <Star className={cn('size-5', favorite && 'fill-current')} />
        </Button>
      )}
    </Card>
  )
}

/** Hinweis bzw. Knopf zum Installieren – nur solange die Seite im Browser-Tab läuft */
function InstallHint(): JSX.Element | null {
  const install = useInstallPrompt()
  if (install.standalone) return null
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">
      <span className="min-w-0 flex-1">
        {install.canPrompt
          ? 'Als App installieren: eigenes Symbol, ohne Browserleiste und offline nutzbar.'
          : install.ios
            ? 'Als App nutzen: „Teilen“ → „Zum Home-Bildschirm“. Danach auch offline.'
            : 'Als App nutzen: im Browser-Menü „App installieren“ bzw. „Zum Startbildschirm hinzufügen“. Danach auch offline.'}
      </span>
      {install.canPrompt && (
        <Button size="sm" variant="outline" onClick={install.prompt}>
          <Download className="size-4" /> Installieren
        </Button>
      )}
    </div>
  )
}

function CalcView({ lookButton }: { lookButton: ReactNode }): JSX.Element {
  const { id } = useParams()
  const tool = findPwaTool(id)
  useEffect(() => {
    if (tool) document.title = `${tool.name} · ${TITLE}`
  }, [tool])
  // Ein Rechner ist schnell geladen; der Kreisel erscheint nur, wenn es doch dauert
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setSlow(true), 300)
    return () => window.clearTimeout(t)
  }, [])

  if (!tool) return <Navigate to="/" replace />
  const Icon = tool.icon
  const Tool = tool.component
  return (
    <>
      <Header>
        <Link
          to="/"
          aria-label="Alle Rechner"
          className={buttonVariants({ variant: 'ghost', size: 'icon' })}
        >
          <ArrowLeft className="size-5" />
        </Link>
        <Icon className="size-5 shrink-0 text-primary" />
        <h1 className="min-w-0 flex-1 truncate font-semibold">{tool.name}</h1>
        {lookButton}
      </Header>
      <Scroll>
        <ErrorBoundary label={tool.name}>
          <Suspense
            fallback={
              slow ? (
                <div className="flex justify-center p-10 text-muted-foreground">
                  <Loader2 className="size-6 animate-spin" />
                </div>
              ) : null
            }
          >
            <Tool />
          </Suspense>
        </ErrorBoundary>
      </Scroll>
    </>
  )
}
