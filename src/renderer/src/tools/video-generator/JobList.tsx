// Aufträge des Video-Generators: Fortschritt in Stufen, Abbrechen, danach in die
// Player-Bibliothek übernehmen, in der Medien-Info prüfen oder im Ordner zeigen.

import { FileCheck, FolderOpen, ListPlus, X } from 'lucide-react'
import { Badge, type BadgeTone } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Progress } from '@renderer/components/ui/progress'
import { api } from '@renderer/lib/api'
import { rateText } from '@shared/convertPlan'
import type { JobStatus, VgenJob } from '@shared/types'
import { basename, fmtDuration } from './presets'

const STATUS: Record<JobStatus, { label: string; tone: BadgeTone }> = {
  queued: { label: 'Wartet', tone: 'neutral' },
  probing: { label: 'Analyse', tone: 'info' },
  running: { label: 'Rechnet', tone: 'info' },
  done: { label: 'Fertig', tone: 'success' },
  error: { label: 'Fehler', tone: 'danger' },
  canceled: { label: 'Abgebrochen', tone: 'warning' }
}

export function JobRow({
  job,
  onCheck,
  onToPlayer
}: {
  job: VgenJob
  /** null = in der Kundenansicht ausgeblendet (Sprung in ein anderes Werkzeug) */
  onCheck: (() => void) | null
  onToPlayer: () => void
}): JSX.Element {
  const meta = STATUS[job.status]
  const active = job.status === 'queued' || job.status === 'probing' || job.status === 'running'
  const facts = [
    job.formatLabel,
    `${job.width}×${job.height}`,
    `${rateText(job.fps)} fps`,
    job.durationSec !== null ? fmtDuration(job.durationSec) : null,
    job.encoder
  ]
    .filter(Boolean)
    .join(' · ')
  const pieces =
    job.cachedPieces + job.renderedPieces > 0
      ? `${job.renderedPieces} Stücke gerechnet, ${job.cachedPieces} aus dem Zwischenspeicher`
      : null
  const warnings = job.hints.filter((h) => h.level !== 'info')

  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={job.outputPath}>
            {basename(job.outputPath)}
          </p>
          <p className="truncate text-xs text-muted-foreground">{facts}</p>
          {active && <p className="text-xs text-muted-foreground">{job.stageText}</p>}
          {job.status === 'done' && pieces && (
            <p className="text-xs text-muted-foreground">{pieces}</p>
          )}
        </div>
        <Badge tone={meta.tone}>{meta.label}</Badge>
        {active && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Abbrechen"
            title="Abbrechen"
            onClick={() => void api.videoGen.cancel(job.id)}
          >
            <X className="size-4" />
          </Button>
        )}
        {job.status === 'done' && (
          <>
            <Button
              variant="ghost"
              size="icon"
              aria-label="In Player-Bibliothek übernehmen"
              title="In Player-Bibliothek übernehmen"
              onClick={onToPlayer}
            >
              <ListPlus className="size-4" />
            </Button>
            {onCheck && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="In Medien-Info prüfen"
                title="In Medien-Info prüfen"
                onClick={onCheck}
              >
                <FileCheck className="size-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              aria-label="Im Ordner zeigen"
              title="Im Ordner zeigen"
              onClick={() => void api.showItemInFolder(job.outputPath)}
            >
              <FolderOpen className="size-4" />
            </Button>
          </>
        )}
      </div>
      {active && (
        <Progress
          value={job.progress}
          indeterminate={job.status !== 'running' && job.progress === 0}
          className="mt-2"
        />
      )}
      {job.status === 'error' && job.error && (
        <p className="mt-2 text-xs text-destructive">{job.error}</p>
      )}
      {job.status === 'done' && warnings.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-amber-400 light:text-amber-700">
          {warnings.map((h, i) => (
            <li key={`${h.id}-${i}`}>{h.text}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
