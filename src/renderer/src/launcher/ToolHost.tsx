import { Suspense, useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ExternalLink, Loader2, Lock } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { ErrorBoundary } from '@renderer/components/ErrorBoundary'
import { AppMenu } from '@renderer/components/app/AppMenu'
import { ToolChromeContext } from '@renderer/components/ToolShell'
import { api } from '@renderer/lib/api'
import { windowTitle } from '@shared/brand'
import { isSmallTool, OWN_WINDOW_PARAM } from '@shared/toolWindows'
import { findTool } from '@renderer/tools/registry'
import { KioskContext } from './kiosk'
import { useFitToolWindow } from './useFitToolWindow'

export function ToolHost(): JSX.Element {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const tool = id ? findTool(id) : undefined
  const kiosk = params.get('kiosk') === '1'
  // Läuft das Werkzeug in seinem eigenen Fenster? Kleine Werkzeuge NUR dort (shared/toolWindows).
  const ownWindow = params.get(OWN_WINDOW_PARAM) === '1'
  const small = tool ? isSmallTool(tool.id) : false
  const redirect = small && !ownWindow && !kiosk
  // Kleines Werkzeug im eigenen Fenster: nur Name (und ggf. „Einstellungen“) – kein Weg zum
  // Startbildschirm, kein weiteres Fenster, keine Kundenansicht; das App-Menü bleibt im
  // Hauptfenster. Die Fensterhöhe folgt dem Inhalt.
  const compact = small && ownWindow
  // Platz für den Knopf „Einstellungen“ des Werkzeugs (ToolShell hängt ihn per Portal ein)
  const [settingsSlot, setSettingsSlot] = useState<HTMLElement | null>(null)
  const [header, setHeader] = useState<HTMLElement | null>(null)
  const [page, setPage] = useState<HTMLElement | null>(null)
  useFitToolWindow(compact, header, page)

  // Fenstertitel = Werkzeugname · App (auch in eigenen Fenstern). Beim Verlassen
  // zurück auf den App-Namen (Launcher setzt ihn selbst wieder).
  useEffect(() => {
    document.title = windowTitle(tool?.name)
  }, [tool])

  // Kleines Werkzeug im Hauptfenster angesteuert (Kachel, Verlauf, alter Link): eigenes Fenster
  // öffnen bzw. nach vorn holen, das Hauptfenster bleibt am Startbildschirm.
  useEffect(() => {
    if (!redirect || !tool) return
    void api.openToolWindow(tool.id)
    navigate('/', { replace: true })
  }, [redirect, tool, navigate])

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

  if (redirect) return <div className="h-full" />

  const Icon = tool.icon
  const Tool = tool.component

  async function enableKiosk(): Promise<void> {
    if (!tool) return
    await api.setSettings({ kioskToolId: tool.id })
    navigate(`/tool/${tool.id}?kiosk=1`, { replace: true })
  }

  return (
    <div className="flex h-full flex-col">
      {/* Kopfleiste: links die ganze App (Menü „Mottulbox“), dann das Werkzeug mit seinem
          Knopf „Einstellungen“; rechts nur Aktionen dieses Werkzeugs – mit Text, damit nichts
          mit Einstellungen verwechselt wird. */}
      <header
        ref={setHeader}
        className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2"
      >
        {!kiosk && !compact && (
          <>
            <AppMenu />
            <span className="mx-1 h-6 w-px bg-border" aria-hidden="true" />
            <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
              <ArrowLeft className="size-4" /> Start
            </Button>
          </>
        )}
        <div className="ml-1 flex min-w-0 items-center gap-2">
          <Icon className="size-5 shrink-0 text-primary" />
          <h1 className="truncate font-semibold">{tool.name}</h1>
        </div>
        <span ref={setSettingsSlot} className="ml-2 flex items-center" />
        {kiosk && (
          <span className="text-xs text-muted-foreground">
            Kundenansicht · Strg+Shift+K zum Verlassen
          </span>
        )}
        <div className="flex-1" />
        {!kiosk && !compact && (
          <>
            {!ownWindow && (
              <Button variant="ghost" size="sm" onClick={() => void api.openToolWindow(tool.id)}>
                <ExternalLink className="size-4" /> Eigenes Fenster
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              title="Gesperrt starten, ohne Zurück und ohne heikle Einstellungen"
              onClick={() => void enableKiosk()}
            >
              <Lock className="size-4" /> Kundenansicht
            </Button>
          </>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">
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
              <ToolChromeContext.Provider value={{ settingsSlot, toolName: tool.name }}>
                <div data-testid="tool-content" className="h-full overflow-auto">
                  {/* eigene Hülle nur zum Messen: hat die natürliche Höhe der Seite */}
                  {compact ? (
                    <div ref={setPage}>
                      <Tool />
                    </div>
                  ) : (
                    <Tool />
                  )}
                </div>
              </ToolChromeContext.Provider>
            </KioskContext.Provider>
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  )
}
