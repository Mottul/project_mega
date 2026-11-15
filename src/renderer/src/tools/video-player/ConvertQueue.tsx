// Import-Liste der Bibliothek: laufende Aufträge des Player-Imports mit Fortschritt und
// Abbrechen, Fehler, „Erledigte entfernen“. Sie steht als Fuß unten im Feld (Pane `footer`) und
// bleibt dort, während die Medien darüber scrollen – höchstens drei Aufträge hoch, mehr scrollen
// in sich. Ohne laufende Aufträge und ohne Fehler ist sie weg; Fehler bleiben stehen, bis
// „Erledigte entfernen“ sie räumt.
//
// Die Aufträge hält useImportAuftraege (nur die Bibliothek braucht sie); fertige meldet es, damit
// die Bibliothek neu lädt.

import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Progress } from '@renderer/components/ui/progress'
import { api } from '@renderer/lib/api'
import type { ConvertJob } from '@shared/types'

/** Aufträge des Player-Imports, nach ihrer id */
function fetchJobs(): Promise<Record<string, ConvertJob>> {
  return api.player.convertList().then((list) => Object.fromEntries(list.map((j) => [j.id, j])))
}

const fertig = (j: ConvertJob): boolean =>
  j.status === 'done' || j.status === 'error' || j.status === 'canceled'

export interface ImportAuftraege {
  /** laufen oder warten */
  aktive: ConvertJob[]
  /** gescheitert, bis „Erledigte entfernen“ */
  fehler: ConvertJob[]
  /** fertig, gescheitert oder abgebrochen – das räumt „Erledigte entfernen“ */
  erledigt: number
  /** Liste zeigen: Es läuft etwas, oder ein Fehler steht noch da */
  sichtbar: boolean
  erledigteEntfernen: () => void
}

/** Aufträge des Player-Imports; `onDone` bei jedem fertigen (die Bibliothek lädt neu) */
export function useImportAuftraege(onDone: () => void): ImportAuftraege {
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

  return useMemo(() => {
    const liste = Object.values(jobs).sort((a, b) => a.createdAt - b.createdAt)
    const aktive = liste.filter((j) => !fertig(j))
    const fehler = liste.filter((j) => j.status === 'error')
    return {
      aktive,
      fehler,
      erledigt: liste.length - aktive.length,
      sichtbar: aktive.length > 0 || fehler.length > 0,
      erledigteEntfernen: () => void api.player.convertClearFinished().then(fetchJobs).then(setJobs)
    }
  }, [jobs])
}

/** Eine Zeile: 24 px hoch, auch für Fehler – so sind drei Aufträge immer gleich hoch */
const ZEILE = 'flex h-6 items-center gap-2'

/** Die Liste für den Fuß des Felds: Kopfzeile, darunter höchstens drei Aufträge hoch */
export function ConvertQueue({ auftraege }: { auftraege: ImportAuftraege }): JSX.Element {
  const { aktive, fehler, erledigt, erledigteEntfernen } = auftraege
  return (
    <div data-testid="import-liste" className="flex min-h-0 w-full min-w-0 flex-col text-xs">
      <div className="flex shrink-0 items-center justify-between gap-2 text-muted-foreground">
        <span>Konvertierung · {aktive.length} aktiv</span>
        {erledigt > 0 && (
          <button type="button" className="hover:text-foreground" onClick={erledigteEntfernen}>
            Erledigte entfernen
          </button>
        )}
      </div>
      {/* 3 × 24 px + 2 × 4 px Abstand – ein vierter Auftrag scrollt; in einem niedrigen Feld
      (min-h-0) auch weniger */}
      <ul
        data-testid="import-auftraege"
        className="mt-1 min-h-0 max-h-20 space-y-1 overflow-y-auto"
      >
        {aktive.map((j) => (
          <li key={j.id} className={ZEILE}>
            <span className="min-w-0 flex-1 truncate" title={j.sourcePath}>
              {j.title}
            </span>
            <Progress
              value={j.progress}
              indeterminate={j.status === 'probing' || j.status === 'thumbnail'}
              className="h-1.5 w-16 shrink-0"
            />
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {j.status === 'converting' ? `${Math.round(j.progress * 100)}%` : j.status}
            </span>
            <button
              type="button"
              className="shrink-0 text-muted-foreground hover:text-foreground"
              onClick={() => void api.player.convertCancel(j.id)}
              aria-label={`Import von „${j.title}“ abbrechen`}
              title="Abbrechen"
            >
              <X className="size-3.5" />
            </button>
          </li>
        ))}
        {fehler.map((j) => (
          <li key={j.id} className={ZEILE}>
            <span className="truncate text-danger" title={j.error}>
              {j.title}: {j.error}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
