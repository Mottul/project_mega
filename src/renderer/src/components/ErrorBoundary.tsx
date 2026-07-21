// React-Fehlergrenze: fängt Render-Fehler einer Komponente (bzw. eines Tools)
// ab, damit ein kaputtes Werkzeug NICHT die ganze SPA zum weißen Fenster reißt.
// Zeigt eine Ersatzfläche mit „Erneut versuchen" und „App neu laden" und meldet
// den Fehler an die Konsole + (best effort) an das Debug-Log des main-Prozesses.

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from './ui/button'

interface Props {
  children: ReactNode
  /** Optionaler Name (z.B. Werkzeug), erscheint in der Fehlermeldung. */
  label?: string
}
interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const where = this.props.label ? ` (${this.props.label})` : ''
    // Renderer-Konsole (per F12 auch im Paket erreichbar) ...
    console.error(`[ErrorBoundary]${where}`, error, info.componentStack)
    // ... und ins main-Debug-Log, damit Feldfehler ohne offene DevTools auffindbar sind.
    try {
      window.api?.util?.log?.(
        `[renderer] Komponenten-Fehler${where}: ${error.message}\n${info.componentStack ?? ''}`
      )
    } catch {
      /* Log ist best effort */
    }
  }

  private reset = (): void => this.setState({ error: null })

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <AlertTriangle className="size-10 text-destructive" />
        <div>
          <p className="font-semibold">
            {this.props.label
              ? `Fehler im Werkzeug „${this.props.label}“`
              : 'Etwas ist schiefgelaufen'}
          </p>
          <p className="mx-auto mt-1 max-w-md break-words text-sm text-muted-foreground">
            {error.message || String(error)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={this.reset}>
            Erneut versuchen
          </Button>
          <Button variant="ghost" onClick={() => window.location.reload()}>
            App neu laden
          </Button>
        </div>
      </div>
    )
  }
}
