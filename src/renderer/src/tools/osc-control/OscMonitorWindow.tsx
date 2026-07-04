// Eigenständiges Fenster für den OSC-Monitor (Route #/osc-monitor). Spiegelt das
// Aktivitäts-Log des OSC-Tabs: der OSC-Tab publiziert sein Log gedrosselt über
// den main-Prozess (osc:monitorPublish -> osc:monitorLog), dieses Fenster zeigt
// es nur an. Der OSC-Tab muss dafür geöffnet sein.

import { useEffect, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Eraser } from 'lucide-react'
import { api } from '@renderer/lib/api'
import type { OscLogEntry } from '@shared/types'

function fmtArg(a: number | string | boolean): string {
  if (typeof a === 'number') return Number.isInteger(a) ? String(a) : a.toFixed(3)
  if (typeof a === 'boolean') return a ? 'T' : 'F'
  return JSON.stringify(a)
}
function fmtTime(at: number): string {
  const d = new Date(at)
  return (
    d.toLocaleTimeString('de-DE', { hour12: false }) +
    '.' +
    String(d.getMilliseconds()).padStart(3, '0')
  )
}

export function OscMonitorWindow(): JSX.Element {
  const [log, setLog] = useState<OscLogEntry[]>([])
  // „Leeren" blendet Älteres aus, ohne das Log im OSC-Tab zu verändern.
  const [since, setSince] = useState(0)

  useEffect(() => api.osc.onMonitor((entries) => setLog(entries)), [])

  const visible = log.filter((e) => e.at >= since)

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <h1 className="text-sm font-semibold">OSC-Monitor</h1>
        <span className="text-xs text-muted-foreground">{visible.length} Nachrichten</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setSince(Date.now())}
          className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <Eraser className="size-3.5" /> Leeren
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {visible.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-muted-foreground">
            Warte auf OSC-Aktivität … (der OSC-Tab muss geöffnet sein)
          </p>
        ) : (
          <div className="space-y-0.5 font-mono text-xs">
            {visible.map((e) => (
              <div
                key={e.id}
                className="flex items-baseline gap-2 rounded px-1.5 py-0.5 hover:bg-muted/40"
              >
                <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground">
                  {fmtTime(e.at)}
                </span>
                {e.dir === 'out' ? (
                  <ArrowUpRight className="size-3.5 shrink-0 translate-y-0.5 text-primary" />
                ) : (
                  <ArrowDownLeft className="size-3.5 shrink-0 translate-y-0.5 text-emerald-500 light:text-emerald-700" />
                )}
                <span className="truncate text-foreground" title={e.address}>
                  {e.address}
                </span>
                <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
                  {e.args.map(fmtArg).join('  ')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
