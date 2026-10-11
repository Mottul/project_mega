// Curving-Ergebnis für das uS2+-Modul (Reiter „Draufsicht“): Draufsicht in der Größe der
// Arbeitsfläche, die Kennzahlen der gewählten Form und die Winkelverteilung. Die Form selbst
// stellt man in der Schublade ein (Settings.tsx: Curving).

import { useElementSize } from '@renderer/lib/useElementSize'
import { cn } from '@renderer/lib/utils'
import { Readout, ReadoutGrid, fmt } from '../_calc/ui'
import type { WallMetrics } from './compute'
import { MODULES, MODULE_W } from './data'
import { TopDownSvg } from './TopDownSvg'

const US2_WEIGHT = MODULES['uS2+'].weight

function AnglePills({ angles }: { angles: number[] }): JSX.Element {
  return (
    <div className="flex flex-wrap gap-1">
      {angles.map((a, i) => {
        const abs = Math.abs(a)
        const cls =
          abs === 0
            ? 'border-teal-500/30 bg-teal-500/10 text-teal-500 light:text-teal-700'
            : a > 0
              ? 'border-primary/30 bg-primary/10 text-primary'
              : 'border-violet-500/30 bg-violet-500/10 text-violet-500 light:text-violet-700'
        return (
          <span key={i} className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${cls}`}>
            {fmt(abs, 1)}°{a < 0 ? ' ↺' : ''}
          </span>
        )
      })}
    </div>
  )
}

/** Kennzahlen der gewählten Form (Kacheln) */
function CurveReadouts({ d }: { d: WallMetrics }): JSX.Element | null {
  const c = d.curve
  if (!c) return null
  const area = (
    <Readout
      key="area"
      label="Fläche B × T"
      value={`${fmt(c.footprintW, 2)} × ${fmt(c.footprintD, 2)}`}
      unit="m"
      accent
    />
  )
  const weight = (
    <Readout key="weight" label="Gewicht je Reihe" value={fmt(c.mods * US2_WEIGHT, 1)} unit="kg" />
  )
  if (c.mode === 'circle' && c.circleRow) {
    const row = c.circleRow
    return (
      <ReadoutGrid>
        <Readout label="Radius" value={fmt(row.r, 3)} unit="m" accent />
        <Readout label="Durchmesser" value={fmt(row.r * 2, 3)} unit="m" />
        <Readout label="Module je Reihe" value={String(row.mods)} unit="Stk." />
        <Readout label="Umfang" value={fmt(row.circ, 1)} unit="m" />
        {area}
        {weight}
      </ReadoutGrid>
    )
  }
  if (c.mode === 'segment') {
    const arc = c.arc
    if (!arc) return null
    return (
      <ReadoutGrid>
        <Readout label="Radius" value={fmt(arc.r, 3)} unit="m" accent />
        <Readout label="Module je Reihe" value={String(arc.mods)} unit="Stk." />
        <Readout label="Bogenlänge" value={fmt(arc.arcLen, 3)} unit="m" />
        <Readout label="Gesamtwinkel" value={fmt(arc.dist.achieved, 1)} unit="°" />
        <Readout label="Erreichte Sehne" value={fmt(arc.ca, 3)} unit="m" />
        <Readout label="Erreichte Tiefe" value={fmt(arc.sa, 3)} unit="m" />
        {area}
        {weight}
      </ReadoutGrid>
    )
  }
  if (c.mode === 'squircle' && c.squircle) {
    const sq = c.squircle
    return (
      <ReadoutGrid>
        <Readout label="Module je Reihe" value={String(sq.totalMods)} unit="Stk." />
        <Readout label="Eckradius" value={fmt(sq.cornerR, 3)} unit="m" accent />
        <Readout
          label="Gerade Breite"
          value={String(sq.straightW)}
          unit="Mod."
          sub={`${fmt(sq.straightW * MODULE_W, 1)} m`}
        />
        <Readout
          label="Gerade Tiefe"
          value={String(sq.straightD)}
          unit="Mod."
          sub={`${fmt(sq.straightD * MODULE_W, 1)} m`}
        />
        {area}
        {weight}
      </ReadoutGrid>
    )
  }
  const total = c.angles.reduce((sum, a) => sum + Math.abs(a), 0)
  return (
    <ReadoutGrid>
      <Readout label="Module je Reihe" value={String(c.mods)} unit="Stk." />
      <Readout label="Gesamtwinkel" value={fmt(total, 1)} unit="°" />
      {area}
      {weight}
    </ReadoutGrid>
  )
}

/** Winkel, die die Verteilung zeigt: beim Squircle reicht eine Ecke */
function shownAngles(d: WallMetrics): { label: string; angles: number[] } | null {
  const c = d.curve
  if (!c) return null
  if (c.mode === 'squircle' && c.squircle) {
    return { label: 'Winkel je Ecke', angles: c.squircle.cornerDist.angles }
  }
  if (c.mode === 'circle') return null // überall derselbe Winkel – steht in der Draufsicht
  if (!c.angles.some((a) => a !== 0)) return null
  return {
    label: c.mode === 'segment' ? 'Winkelverteilung (höhere Winkel zur Mitte)' : 'Winkelverteilung',
    angles: c.angles
  }
}

export function CurvingView({ d }: { d: WallMetrics }): JSX.Element {
  const [paneRef, pane] = useElementSize<HTMLDivElement>()
  const [svgRef, svgBox] = useElementSize<HTMLDivElement>()
  const c = d.curve
  // Breit genug: Kennzahlen rechts neben der Draufsicht, sonst darunter
  const side = pane.width >= 820
  const pills = shownAngles(d)

  if (!c || c.mods === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        Keine Module – Form und Maße in der Schublade unter „Curving“ prüfen.
      </p>
    )
  }

  return (
    <div ref={paneRef} className={cn('flex h-full min-h-0 gap-4', side ? 'flex-row' : 'flex-col')}>
      <div ref={svgRef} className="flex min-h-[12rem] min-w-0 flex-1 items-center justify-center">
        {svgBox.width > 0 && (
          <TopDownSvg
            angles={c.angles}
            fill
            maxPx={svgBox.width}
            maxHeightPx={svgBox.height}
            showChord={c.mode === 'segment'}
            chordHorizontal={c.mode === 'segment'}
            chordLabel={c.arc?.ca ?? null}
            sagLabel={c.arc?.sa ?? null}
          />
        )}
      </div>
      <div className={cn('shrink-0 space-y-3', side && 'w-80 overflow-y-auto')}>
        <CurveReadouts d={d} />
        {pills && (
          <div>
            <p className="mb-1 text-xs text-muted-foreground">{pills.label}</p>
            <AnglePills angles={pills.angles} />
          </div>
        )}
      </div>
    </div>
  )
}
