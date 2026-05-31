import { Suspense } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { findTool } from '@renderer/tools/registry'

export function ToolHost(): JSX.Element {
  const { id } = useParams()
  const navigate = useNavigate()
  const tool = id ? findTool(id) : undefined

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
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')} aria-label="Zurück">
          <ArrowLeft className="size-4" />
        </Button>
        <Icon className="size-5 text-primary" />
        <h1 className="font-semibold">{tool.name}</h1>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          }
        >
          <Tool />
        </Suspense>
      </div>
    </div>
  )
}
