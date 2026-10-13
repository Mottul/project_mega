// Inspector der OSC-Steuerung: Mitschnitt gesendeter und empfangener Nachrichten.

import { SlidersHorizontal } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import { fmtArgs, type LogEntry } from './oscShared'

/* ------------------------- Inspector: Monitor --------------------------- */

export function Monitor({ log, onClear }: { log: LogEntry[]; onClear: () => void }): JSX.Element {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{log.length} Nachrichten</span>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onClear}>
          Leeren
        </Button>
      </div>
      <div className="max-h-72 space-y-1 overflow-auto rounded-md border border-border bg-background/50 p-2">
        {log.length === 0 ? (
          <p className="px-1 py-2 text-center text-xs text-muted-foreground">
            Noch keine OSC-Aktivität.
          </p>
        ) : (
          log.map((e) => (
            <div key={e.id} className="flex items-baseline gap-2 font-mono text-[11px]">
              <SlidersHorizontal
                className={cn(
                  'size-3 shrink-0 translate-y-0.5',
                  e.dir === 'out' ? 'text-primary' : 'text-success'
                )}
              />
              <span className="shrink-0 text-muted-foreground">{e.dir === 'out' ? '→' : '←'}</span>
              <span className="truncate text-foreground" title={e.address}>
                {e.address}
              </span>
              <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
                {fmtArgs(e.args)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
