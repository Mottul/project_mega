// Rechner-PWA: Startseite mit allen Rechnern und je Rechner eine Seite mit Kopfzeile. Die
// Rechner selbst sind dieselben Komponenten wie in der Desktop-App (tools/<id>).
import { Suspense, useEffect, useState, type ReactNode } from 'react'
import { HashRouter, Link, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { ArrowLeft, Download, Loader2, RefreshCw } from 'lucide-react'
import { ErrorBoundary } from '@renderer/components/ErrorBoundary'
import { MottulboxLogo } from '@renderer/components/MottulboxLogo'
import { Button, buttonVariants } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
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
  return (
    <>
      <Header>
        <MottulboxLogo height={30} className="shrink-0 text-primary" title="" />
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{TITLE}</h1>
        {lookButton}
      </Header>
      <Scroll>
        <div className="pwa-safe-x mx-auto max-w-5xl space-y-4 py-4">
          <nav
            aria-label="Rechner"
            className="grid grid-cols-[repeat(auto-fill,minmax(min(18rem,100%),1fr))] gap-3"
          >
            {PWA_TOOLS.map((t) => {
              const Icon = t.icon
              return (
                <Link
                  key={t.id}
                  to={`/${t.id}`}
                  className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
                >
                  <Card className="flex h-full items-start gap-3 p-4 transition-colors hover:border-primary/40 active:bg-muted/40">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/[0.12] text-primary">
                      <Icon className="size-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-medium">{t.name}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {t.description}
                      </span>
                    </span>
                  </Card>
                </Link>
              )
            })}
          </nav>
          <InstallHint />
        </div>
      </Scroll>
    </>
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
