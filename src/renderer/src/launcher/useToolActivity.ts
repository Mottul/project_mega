import { useEffect, useState } from 'react'
import { api } from '@renderer/lib/api'
import { hapConverterTool } from '@renderer/tools/hap-converter'
import { stageTimerTool } from '@renderer/tools/stage-timer'

// Liefert pro Tool-ID die Anzahl aktiver Vorgaenge -- fuer eine "laeuft"-Markierung
// im Launcher (HAP-Jobs, laufender Stage-Timer; weitere Tools spaeter ergaenzbar).
export function useToolActivity(): Record<string, number> {
  const [hapActive, setHapActive] = useState(0)
  const [timerActive, setTimerActive] = useState(0)

  useEffect(() => {
    const jobs = new Map<string, string>()
    const recompute = (): void =>
      setHapActive(
        [...jobs.values()].filter(
          (s) => s === 'running' || s === 'queued' || s === 'probing'
        ).length
      )
    void api.hap.list().then((list) => {
      for (const j of list) jobs.set(j.id, j.status)
      recompute()
    })
    return api.hap.onUpdate((job) => {
      jobs.set(job.id, job.status)
      recompute()
    })
  }, [])

  useEffect(() => {
    void api.timer.getState().then((s) => setTimerActive(s.running ? 1 : 0))
    return api.timer.onState((s) => setTimerActive(s.running ? 1 : 0))
  }, [])

  return { [hapConverterTool.id]: hapActive, [stageTimerTool.id]: timerActive }
}
