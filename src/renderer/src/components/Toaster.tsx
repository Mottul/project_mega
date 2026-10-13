// Anzeige der In-App-Toasts (unten rechts gestapelt). Themefähig, mit aria-live
// für Screenreader. Wird einmalig im Hauptfenster gemountet (nicht in den
// randlosen Ausgabefenstern, damit auf der Projektion nie ein Toast aufblitzt).

import { X } from 'lucide-react'
import { STATUS, type StatusTone } from '@renderer/components/ui/status'
import { dismissToast, useToasts, type ToastKind } from '@renderer/lib/toast'
import { cn } from '@renderer/lib/utils'

const TONE: Record<ToastKind, StatusTone> = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  error: 'danger'
}

export function Toaster(): JSX.Element {
  const items = useToasts((s) => s.items)
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
    >
      {items.map((t) => {
        const m = STATUS[TONE[t.kind]]
        return (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex items-start gap-2 rounded-lg border border-border bg-card p-3 shadow-lg"
          >
            <m.icon className={cn('mt-0.5 size-4 shrink-0', m.className)} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{t.message}</p>
              {t.detail && (
                <p className="mt-0.5 break-words text-xs text-muted-foreground">{t.detail}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
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
