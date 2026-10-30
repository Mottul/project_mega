import type { ReactNode } from 'react'
import { cn } from '@renderer/lib/utils'
import { InfoTip } from './info-tip'

/**
 * Eine Einstellung: Beschriftung über dem Bedienelement, eine Erklärung hinter dem ⓘ rechts
 * daneben statt als Absatz darunter. Das <label> umschließt das Bedienelement (Klick auf die
 * Beschriftung fokussiert es); das ⓘ liegt bewusst AUSSERHALB, sonst würde ein Klick auf die
 * Beschriftung den ⓘ-Knopf auslösen.
 *
 * `group` für Knopfgruppen (`Segmented`): dann ohne <label> – es gälte sonst für den ersten Knopf.
 * Der hieße für Vorlesewerkzeuge wie die Beschriftung, und ein Klick darauf löste ihn aus.
 */
export function Field({
  label,
  hint,
  aside,
  group,
  className,
  children
}: {
  label: string
  hint?: string
  /** kleine Anzeige rechts in der Beschriftungszeile (z. B. „50 %“) */
  aside?: ReactNode
  group?: boolean
  className?: string
  children: ReactNode
}): JSX.Element {
  const Huelle = group ? 'div' : 'label'
  return (
    <div className={cn('relative flex flex-col', className)}>
      <Huelle className="flex flex-col gap-1.5">
        <span className={cn('flex items-center gap-2 text-sm font-medium', hint && 'pr-6')}>
          <span className="min-w-0 flex-1">{label}</span>
          {aside != null && (
            <span className="text-xs font-normal tabular-nums text-muted-foreground">{aside}</span>
          )}
        </span>
        {children}
      </Huelle>
      {hint && (
        <span className="absolute right-0 top-0.5">
          <InfoTip text={hint} label={`Erklärung zu „${label}“`} />
        </span>
      )}
    </div>
  )
}
