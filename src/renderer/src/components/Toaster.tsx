// Anzeige der In-App-Toasts (unten rechts gestapelt). Themefähig, mit aria-live
// für Screenreader. Wird einmalig im Hauptfenster gemountet (nicht in den
// randlosen Ausgabefenstern, damit auf der Projektion nie ein Toast aufblitzt).

import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useToasts, type ToastKind } from '@renderer/lib/toast'
import { cn } from '@renderer/lib/utils'

const META: Record<ToastKind, { icon: LucideIcon; cls: string }> = {
  info: { icon: Info, cls: 'text-primary' },
  success: { icon: CheckCircle2, cls: 'text-emerald-500 light:text-emerald-700' },
  warning: { icon: AlertTriangle, cls: 'text-amber-500 light:text-amber-700' },
  error: { icon: XCircle, cls: 'text-destructive' }
}

export function Toaster(): JSX.Element {
  const items = useToasts((s) => s.items)
  const dismiss = useToasts((s) => s.dismiss)
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
    >
      {items.map((t) => {
        const m = META[t.kind]
        return (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex items-start gap-2 rounded-lg border border-border bg-card p-3 shadow-lg"
          >
            <m.icon className={cn('mt-0.5 size-4 shrink-0', m.cls)} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{t.message}</p>
              {t.detail && (
                <p className="mt-0.5 break-words text-xs text-muted-foreground">{t.detail}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Schließen"
            >
              <X className="size-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
