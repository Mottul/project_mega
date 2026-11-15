// Arbeitsfläche aus Feldern – das Gerüst für Werkzeuge, die während der Show bedient werden
// (zuerst der Video-Player; Muster, Messungen und die nächsten Werkzeuge: docs/PLAN.md,
// „Muster 1: Arbeitsfläche“ und Teil W).
//
// WorkArea füllt den Platz, den ToolShell ihr gibt, misst sich selbst und ordnet ihre Felder nach
// der Stufe an (workAreaRaster.ts). In den Stufen breit und mittel scrollt nie die Seite, nur der
// Inhalt einzelner Felder; in der Stufe schmal scrollt die Arbeitsfläche selbst.
//
// Die Felder stehen in jeder Stufe in derselben Reihenfolge im DOM, nur ihre Bereiche im Raster
// wechseln (grid-template-areas). So baut React beim Wechsel der Stufe – Schublade auf, Fenster
// schmaler – nichts neu auf: Die Wiedergabe-Engine des Players lüde sonst ihr Video neu.

import { createContext, useContext, type ReactNode } from 'react'
import type { DateiAblage } from '@renderer/lib/useDateiAblage'
import { useElementSize } from '@renderer/lib/useElementSize'
import { cn } from '@renderer/lib/utils'
import {
  GRENZEN,
  rasterStil,
  stufe as stufeAus,
  type Grenzen,
  type Raster,
  type Stufe
} from './workAreaRaster'

const StufeCtx = createContext<Stufe>('breit')

/** Stufe der umgebenden Arbeitsfläche – für Felder, deren Inhalt sich anpasst (Bühne). */
export function useStufe(): Stufe {
  return useContext(StufeCtx)
}

export function WorkArea<F extends string>({
  raster,
  grenzen = GRENZEN,
  children
}: {
  /** Raster je Stufe; die Felder nennen ihren Bereich über `area` */
  raster: Record<Stufe, Raster<F>>
  grenzen?: Grenzen
  /** die Felder (Pane), in jeder Stufe dieselben in derselben Reihenfolge */
  children: ReactNode
}): JSX.Element {
  // Vor der ersten Messung (0 × 0) gilt schmal; gemessen wird vor dem ersten Zeichnen
  // (useElementSize), es springt also nichts sichtbar um.
  const [ref, size] = useElementSize<HTMLDivElement>()
  const s = stufeAus(size.width, size.height, grenzen)
  return (
    <div
      ref={ref}
      data-testid="arbeitsflaeche"
      data-stufe={s}
      className={cn('h-full min-h-0 w-full', s === 'schmal' ? 'overflow-auto' : 'overflow-hidden')}
    >
      <div
        className={cn('grid gap-3 p-3', s !== 'schmal' && 'h-full')}
        style={rasterStil(raster[s])}
      >
        <StufeCtx.Provider value={s}>{children}</StufeCtx.Provider>
      </div>
    </div>
  )
}

/**
 * Ein Feld der Arbeitsfläche: Kopf (Titel, Zahl, Aktionen), Inhalt, optional ein Fuß. Der Inhalt
 * scrollt in sich (`scroll`) oder regelt sein Scrollen selbst – etwa eine Liste unter einer
 * Kopfzeile, die stehen bleiben soll. Der Fuß bleibt unten stehen, während der Inhalt scrollt.
 */
export function Pane({
  area,
  title,
  label,
  count,
  actions,
  footer,
  scroll = true,
  kappen = true,
  ablage,
  testId,
  children
}: {
  /** Name des Bereichs im Raster */
  area: string
  title?: string
  /** Name für Screenreader, wenn das Feld keinen Titel zeigt */
  label?: string
  /** klein neben dem Titel, z. B. Anzahl und Dauer */
  count?: ReactNode
  /** rechts im Kopf */
  actions?: ReactNode
  footer?: ReactNode
  /** false: Der Inhalt scrollt nicht als Ganzes, sondern regelt es selbst */
  scroll?: boolean
  /** In der Stufe schmal höchstens 60 % der Fensterhöhe (Listen); false: so hoch wie der Inhalt */
  kappen?: boolean
  /** Dateien hineinziehen (useDateiAblage): Das ganze Feld nimmt sie an, mit gestricheltem Rahmen */
  ablage?: DateiAblage
  testId?: string
  children: ReactNode
}): JSX.Element {
  const s = useStufe()
  const { aktiv: ablageAktiv, ...ablageEreignisse } = ablage ?? { aktiv: false }
  return (
    <section
      data-pane=""
      data-testid={testId}
      aria-label={title ?? label}
      style={{ gridArea: area }}
      {...ablageEreignisse}
      className={cn(
        'flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card',
        s === 'schmal' && kappen && 'max-h-[60vh]',
        ablage && 'relative'
      )}
    >
      {(title || actions) && (
        <div
          data-pane-kopf=""
          className="flex min-h-10 shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-border px-3 py-1.5"
        >
          {title && <h2 className="text-sm font-medium">{title}</h2>}
          {count != null && (
            <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
          )}
          {actions && <div className="ml-auto flex flex-wrap items-center gap-1">{actions}</div>}
        </div>
      )}
      <div
        data-pane-inhalt=""
        className={cn('min-h-0 flex-1 p-3', scroll ? 'overflow-auto' : 'flex flex-col')}
      >
        {children}
      </div>
      {footer && (
        // Bleibt unten stehen. Ist das Feld zu niedrig, gibt er Höhe ab und sein Inhalt scrollt
        // selbst (min-h-0) – sonst schnitte das Feld unten ab (Import-Liste bei 1024 × 600)
        <div className="flex min-h-0 flex-col border-t border-border px-3 py-2">{footer}</div>
      )}
      {/* über allem, auch dem Kopf – nimmt keine Ereignisse, das Ziehen geht ans Feld */}
      {ablageAktiv && (
        <div
          aria-hidden
          data-testid="ablage-rahmen"
          className="pointer-events-none absolute inset-0 z-20 rounded-lg border-2 border-dashed border-primary bg-primary/10"
        />
      )}
    </section>
  )
}
