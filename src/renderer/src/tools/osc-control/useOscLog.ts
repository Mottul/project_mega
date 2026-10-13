// Mitschnitt der OSC-Steuerung: gesendete und empfangene Nachrichten (die letzten 60, gleiche
// Adresse in schneller Folge zusammengefasst), gedrosselt an etwaige Monitor-Fenster gespiegelt.

import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@renderer/lib/api'
import type { LogEntry } from './oscShared'

export type PushLog = (
  dir: 'out' | 'in',
  address: string,
  args: (number | string | boolean)[]
) => void

export function useOscLog(): { log: LogEntry[]; pushLog: PushLog; clearLog: () => void } {
  const [log, setLog] = useState<LogEntry[]>([])
  const logRef = useRef<LogEntry[]>([])
  const logSeq = useRef(0)
  // Gedrosselte Spiegelung des Logs an etwaige OSC-Monitor-Fenster.
  const monPub = useRef<{ last: number; t: ReturnType<typeof setTimeout> | null }>({
    last: 0,
    t: null
  })

  const pushLog = useCallback(
    (dir: 'out' | 'in', address: string, args: (number | string | boolean)[]) => {
      const now = Date.now()
      const cur = logRef.current
      const top = cur[0]
      if (top && top.dir === dir && top.address === address && now - top.at < 80) {
        logRef.current = [{ ...top, args, at: now }, ...cur.slice(1)]
      } else {
        logRef.current = [{ id: logSeq.current++, dir, address, args, at: now }, ...cur].slice(
          0,
          60
        )
      }
      setLog(logRef.current)
      // gedrosselt (~150 ms) an etwaige Monitor-Fenster spiegeln
      const p = monPub.current
      const flush = (): void => {
        p.last = Date.now()
        p.t = null
        void api.osc.publishMonitor(logRef.current)
      }
      const since = now - p.last
      if (since >= 150) flush()
      else if (!p.t) p.t = setTimeout(flush, 150 - since)
    },
    []
  )

  // Anstehende Monitor-Spiegelung beim Schließen aufräumen.
  useEffect(() => {
    const p = monPub.current
    return () => {
      if (p.t) clearTimeout(p.t)
    }
  }, [])

  const clearLog = useCallback((): void => {
    logRef.current = []
    setLog([])
  }, [])

  return { log, pushLog, clearLog }
}
