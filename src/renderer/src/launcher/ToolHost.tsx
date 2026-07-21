import { Suspense, useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ExternalLink, Loader2, MonitorSmartphone } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { ErrorBoundary } from '@renderer/components/ErrorBoundary'
import { ThemeToggle } from '@renderer/components/ThemeToggle'
import { AccentPicker } from '@renderer/components/AccentPicker'
import { api } from '@renderer/lib/api'
import { findTool } from '@renderer/tools/registry'
import { KioskContext } from './kiosk'

export function ToolHost(): JSX.Element {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const tool = id ? findTool(id) : undefined
  const kiosk = params.get('kiosk') === '1'

  // In der Kundenansicht: Strg+Shift+K verlässt sie (und hebt den Auto-Start auf).
  useEffect(() => {
    if (!kiosk) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'k') {
        void api.setSettings({ kioskToolId: null })
        navigate('/')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [kiosk, navigate])

  if (!tool) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Werkzeug nicht gefunden.</p>
        <Button variant="outline" onClick={() => navigate('/')}>
          Zur Übersicht
        </Button>
      </div>
    )
  }

  const Icon = tool.icon
  const Tool = tool.component

  async function enableKiosk(): Promise<void> {
    if (!tool) return
    await api.setSettings({ kioskToolId: tool.id })
    navigate(`/tool/${tool.id}?kiosk=1`, { replace: true })
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        {!kiosk && (
          <Button variant="ghost" size="icon" onClick={() => navigate('/')} aria-label="Zurück">
            <ArrowLeft className="size-4" />
          </Button>
        )}
        <Icon className="size-5 text-primary" />
        <h1 className="font-semibold">{tool.name}</h1>
        {kiosk && (
          <span className="text-xs text-muted-foreground">
            Kundenansicht · Strg+Shift+K zum Verlassen
          </span>
        )}
        <div className="flex-1" />
        {!kiosk && (
          <>
            <Button
              variant="ghost"
              size="icon"
              title="In neuem Fenster öffnen"
              onClick={() => void api.openToolWindow(tool.id)}
            >
              <ExternalLink className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title="Als Kundenansicht starten (gesperrt, ohne Zurück)"
              onClick={() => void enableKiosk()}
            >
              <MonitorSmartphone className="size-4" />
            </Button>
            <AccentPicker />
            <ThemeToggle />
          </>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        {/* Pro Werkzeug eine Fehlergrenze (key = Tool-Id -> Wechsel setzt sie
            zurück). Ein Absturz bleibt im Inhaltsbereich; Kopfzeile/Zurück wirken. */}
        <ErrorBoundary key={tool.id} label={tool.name}>
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            }
          >
            <KioskContext.Provider value={kiosk}>
              <Tool />
            </KioskContext.Provider>
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  )
}
