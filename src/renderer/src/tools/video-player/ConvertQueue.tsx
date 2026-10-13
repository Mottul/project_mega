// Konvertier-Liste des Player-Imports über der Bibliothek: laufende Aufträge mit Fortschritt
// und Abbrechen, Fehler, „Erledigte entfernen“. Hält die Aufträge selbst (nur sie braucht sie)
// und meldet fertige, damit die Bibliothek neu lädt.

import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Progress } from '@renderer/components/ui/progress'
import { api } from '@renderer/lib/api'
import type { ConvertJob } from '@shared/types'

/** Aufträge des Player-Imports, nach ihrer id */
function fetchJobs(): Promise<Record<string, ConvertJob>> {
  return api.player.convertList().then((list) => Object.fromEntries(list.map((j) => [j.id, j])))
}

export function ConvertQueue({ onDone }: { onDone: () => void }): JSX.Element | null {
  const [jobs, setJobs] = useState<Record<string, ConvertJob>>({})
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  useEffect(() => {
    void fetchJobs().then(setJobs)
    return api.player.onConvertUpdate((job) => {
      setJobs((prev) => ({ ...prev, [job.id]: job }))
      if (job.status === 'done') onDoneRef.current()
    })
  }, [])

  const jobList = useMemo(
    () => Object.values(jobs).sort((a, b) => a.createdAt - b.createdAt),
    [jobs]
  )
  const activeJobs = jobList.filter(
    (j) => j.status !== 'done' && j.status !== 'error' && j.status !== 'canceled'
  )
  const finishedJobs = jobList.filter(
    (j) => j.status === 'done' || j.status === 'error' || j.status === 'canceled'
  )
  if (activeJobs.length === 0 && finishedJobs.length === 0) return null

  return (
    <div className="mb-3 space-y-1.5 rounded-md border border-border p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          Konvertierung · {activeJobs.length} aktiv
        </span>
        {finishedJobs.length > 0 && (
          <button
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => void api.player.convertClearFinished().then(fetchJobs).then(setJobs)}
          >
            Erledigte entfernen
          </button>
        )}
      </div>
      {activeJobs.map((j) => (
        <div key={j.id} className="text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate" title={j.sourcePath}>
              {j.title}
            </span>
            <span className="flex items-center gap-2 text-muted-foreground">
              {j.status === 'converting' ? `${Math.round(j.progress * 100)}%` : j.status}
              <button
                className="hover:text-foreground"
                onClick={() => void api.player.convertCancel(j.id)}
                aria-label="Abbrechen"
              >
                <X className="size-3.5" />
              </button>
            </span>
          </div>
          <Progress
            value={j.progress}
            indeterminate={j.status === 'probing' || j.status === 'thumbnail'}
            className="mt-1"
          />
        </div>
      ))}
      {finishedJobs
        .filter((j) => j.status === 'error')
        .map((j) => (
          <p key={j.id} className="truncate text-xs text-danger" title={j.error}>
            {j.title}: {j.error}
          </p>
        ))}
    </div>
  )
}
