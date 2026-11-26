// Feld „Aufträge“ des Video-Generators (Arbeitsfläche, components/WorkArea.tsx) – nur, solange es
// Aufträge gibt. Eine Zeile je Auftrag: Name, was gerade ist (die Stufe, „Fertig“, der Fehler
// selbst), Fortschritt und die Knöpfe – Abbrechen, danach in die Player-Bibliothek übernehmen, in
// der Medien-Info prüfen, im Ordner zeigen. Format, Größe, Bildrate, Stücke und Warnungen stehen
// im Tooltip der Zeile (layout.ts, auftragZeile). Höchstens drei Zeilen hoch, mehr scrollen in
// sich – wie die Import-Liste des Players.
//
// Eine Zeile statt der früheren Karten (78 bis 94 px je Auftrag) hat Matthias am 25. November 2026
// freigegeben: Mit den Karten passten Vorschau und Aufträge bei 1024 × 600 nicht übereinander.

import { FileCheck, FolderOpen, ListPlus, X } from 'lucide-react'
import { Pane } from '@renderer/components/WorkArea'
import { Button } from '@renderer/components/ui/button'
import { Progress } from '@renderer/components/ui/progress'
import { STATUS } from '@renderer/components/ui/status'
import { api } from '@renderer/lib/api'
import { cn } from '@renderer/lib/utils'
import type { VgenJob } from '@shared/types'
import { auftragAktiv, auftraegeZahl, auftragName, auftragZeile, type AuftragTon } from './layout'

/** Schriftfarbe der Zustandsangabe – laufend und wartend ruhig, Ergebnisse in ihrer Statusstufe */
const TON: Record<AuftragTon, string> = {
  neutral: 'text-muted-foreground',
  info: STATUS.info.className,
  success: STATUS.success.className,
  warning: STATUS.warning.className,
  danger: STATUS.danger.className
}

/** Symbol vor der Zustandsangabe – nur für Ergebnisse (fertig, mit Hinweis, Fehler, abgebrochen) */
const SYMBOL: Partial<Record<AuftragTon, (typeof STATUS)['success']['icon']>> = {
  success: STATUS.success.icon,
  warning: STATUS.warning.icon,
  danger: STATUS.danger.icon
}

/** Knöpfe der Zeile: so hoch wie die Zeile (24 px) */
const ZEILEN_KNOPF = 'size-6 shrink-0 text-muted-foreground hover:text-foreground'

export function AuftraegeFeld({
  jobs,
  onCheck,
  onToPlayer,
  onClearFinished
}: {
  /** neueste zuerst */
  jobs: VgenJob[]
  /** null = in der Kundenansicht ausgeblendet (Sprung in ein anderes Werkzeug) */
  onCheck: ((job: VgenJob) => void) | null
  onToPlayer: (job: VgenJob) => void
  onClearFinished: () => void
}): JSX.Element {
  const fertige = jobs.some((j) => !auftragAktiv(j))
  return (
    <Pane
      area="auftraege"
      testId="feld-auftraege"
      title="Aufträge"
      count={auftraegeZahl(jobs)}
      scroll={false}
      actions={
        fertige ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-muted-foreground hover:text-foreground"
            onClick={onClearFinished}
          >
            Fertige entfernen
          </Button>
        ) : undefined
      }
    >
      {/* 3 × 24 px + 2 × 4 px Abstand – ein vierter Auftrag scrollt in der Liste */}
      <ul
        data-testid="auftraege-liste"
        aria-label="Aufträge"
        className="max-h-20 min-h-0 space-y-1 overflow-y-auto"
      >
        {jobs.map((job) => (
          <JobRow
            key={job.id}
            job={job}
            onCheck={onCheck ? () => onCheck(job) : null}
            onToPlayer={() => onToPlayer(job)}
          />
        ))}
      </ul>
    </Pane>
  )
}

function JobRow({
  job,
  onCheck,
  onToPlayer
}: {
  job: VgenJob
  onCheck: (() => void) | null
  onToPlayer: () => void
}): JSX.Element {
  const { zustand, ton, info } = auftragZeile(job)
  const Zeichen = SYMBOL[ton]
  const aktiv = auftragAktiv(job)
  return (
    <li className="flex h-6 items-center gap-2 text-xs" title={info}>
      <span className="min-w-0 max-w-[50%] shrink truncate font-medium">{auftragName(job)}</span>
      <span className={cn('flex min-w-0 flex-1 items-center gap-1', TON[ton])}>
        {Zeichen && <Zeichen className="size-3.5 shrink-0" />}
        <span className="truncate">{zustand}</span>
      </span>
      {aktiv && (
        <Progress
          value={job.progress}
          indeterminate={job.status !== 'running' && job.progress === 0}
          className="h-1.5 w-16 shrink-0"
        />
      )}
      {job.status === 'running' && (
        <span className="w-9 shrink-0 text-right tabular-nums text-muted-foreground">
          {Math.round(job.progress * 100)} %
        </span>
      )}
      {aktiv && (
        <Button
          variant="ghost"
          size="icon"
          className={ZEILEN_KNOPF}
          aria-label="Abbrechen"
          title="Abbrechen"
          onClick={() => void api.videoGen.cancel(job.id)}
        >
          <X className="size-3.5" />
        </Button>
      )}
      {job.status === 'done' && (
        <>
          <Button
            variant="ghost"
            size="icon"
            className={ZEILEN_KNOPF}
            aria-label="In Player-Bibliothek übernehmen"
            title="In Player-Bibliothek übernehmen"
            onClick={onToPlayer}
          >
            <ListPlus className="size-3.5" />
          </Button>
          {onCheck && (
            <Button
              variant="ghost"
              size="icon"
              className={ZEILEN_KNOPF}
              aria-label="In Medien-Info prüfen"
              title="In Medien-Info prüfen"
              onClick={onCheck}
            >
              <FileCheck className="size-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className={ZEILEN_KNOPF}
            aria-label="Im Ordner zeigen"
            title="Im Ordner zeigen"
            onClick={() => void api.showItemInFolder(job.outputPath)}
          >
            <FolderOpen className="size-3.5" />
          </Button>
        </>
      )}
    </li>
  )
}
