import { useEffect, useState } from 'react'
import { api } from '@renderer/lib/api'
import { hapConverterTool } from '@renderer/tools/hap-converter'

// Liefert pro Tool-ID die Anzahl aktiver Vorgaenge -- fuer eine "laeuft"-Markierung
// im Launcher. Aktuell kennt nur der HAP-Konverter laufende Jobs; weitere Tools
// koennen hier spaeter ergaenzt werden.
export function useToolActivity(): Record<string, number> {
  const [hapActive, setHapActive] = useState(0)

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

  return { [hapConverterTool.id]: hapActive }
}
