// LED-Wall-Konfigurator im Werkzeug-Muster (ToolShell):
//   Leiste „Projekt“  PDF-Doku (Hoch/Quer) und Übergabe an die Packliste, rechts der Projektname
//   Schublade         Vorlagen, Projekt, Modul, Wand (Größe, Aufbau), Curving-Form (Settings.tsx)
//   Arbeitsfläche     Kennzahlen; große Zeichenfläche mit Ansicht, Draufsicht (uS2+), Signal-
//                     und Stromplan; daneben Strom, Aufbau und Moduldaten
// Die Zeichenfläche füllt die Höhe des Fensters – auf dem Laptop passt alles auf einen Blick.

import { useEffect, useMemo, type ReactNode } from 'react'
import {
  Cable,
  ClipboardList,
  FileDown,
  PlugZap,
  RectangleHorizontal,
  Spline,
  type LucideIcon
} from 'lucide-react'
import { BarDivider, ToolBar, ToolShell } from '@renderer/components/ToolShell'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { InfoTip } from '@renderer/components/ui/info-tip'
import { Segmented } from '@renderer/components/ui/segmented'
import { api } from '@renderer/lib/api'
import { flushStore } from '@renderer/lib/persistStorage'
import { useElementWidth } from '@renderer/lib/useElementWidth'
import { usePersistentState, type Codec } from '@renderer/lib/usePersistentState'
import { cn } from '@renderer/lib/utils'
import { deriveFromLedWall } from '../packing-list/derive'
import { usePacking } from '../packing-list/store'
import { fmt } from '../_calc/ui'
import { CableGrid } from './CableGrid'
import { computeWall, type WallMetrics } from './compute'
import { CurvingView } from './Curving'
import { CURVE_MODE_LABELS } from './curve'
import { PWR_COLORS, SIG_COLORS } from './data'
import { FrontView, fitText } from './FrontView'
import { exportLedWallPdf } from './print'
import { BUILD_LABELS, LedWallSettings } from './Settings'
import { useLedWall } from './store'
import { topDownMarkup } from './topdown'

type View = 'front' | 'top' | 'sig' | 'pwr'

const VIEWS: { id: View; label: string; icon: LucideIcon }[] = [
  { id: 'front', label: 'Ansicht', icon: RectangleHorizontal },
  { id: 'top', label: 'Draufsicht', icon: Spline },
  { id: 'sig', label: 'Signal', icon: Cable },
  { id: 'pwr', label: 'Strom', icon: PlugZap }
]

const viewCodec: Codec<View> = {
  parse: (raw) => (VIEWS.some((v) => v.id === raw) ? (raw as View) : null),
  format: (v) => v
}

/** Maß in m mit Komma und zwei Nachkommastellen */
const m2 = (n: number): string =>
  n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function LedWall(): JSX.Element {
  const s = useLedWall()

  const d = useMemo(
    () =>
      computeWall({
        moduleKey: s.moduleKey,
        widthM: s.widthM,
        heightM: s.heightM,
        curveMode: s.curveMode,
        segSag: s.segSag,
        builderSegs: s.builderSegs,
        sqD: s.sqD,
        sqCorner: s.sqCorner,
        selectedCircle: s.selectedCircle
      }),
    [
      s.moduleKey,
      s.widthM,
      s.heightM,
      s.curveMode,
      s.segSag,
      s.builderSegs,
      s.sqD,
      s.sqCorner,
      s.selectedCircle
    ]
  )

  // Verkabelungs-Grids an die Modulzahl anpassen (Zuordnungen bleiben erhalten).
  useEffect(() => {
    s.ensureGridSize(d.rows, d.cols)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.rows, d.cols])

  function doExport(): void {
    const curve = d.curve
    const curveForPdf = curve
      ? {
          modeLabel: CURVE_MODE_LABELS[curve.mode],
          mods: curve.mods,
          angles: curve.angles,
          footprintW: curve.footprintW,
          footprintD: curve.footprintD,
          svg: topDownMarkup(curve.angles, {
            showChord: curve.mode === 'segment',
            chordHorizontal: curve.mode === 'segment',
            chordLabel: curve.arc?.ca ?? null,
            sagLabel: curve.arc?.sa ?? null,
            maxPx: s.pdfLandscape ? 620 : 470
          })
        }
      : null
    void exportLedWallPdf({
      ...d,
      projectName: s.projectName,
      customerName: s.customerName,
      buildMode: s.buildMode,
      sig: s.sig,
      pwr: s.pwr,
      landscape: s.pdfLandscape,
      curve: curveForPdf
    })
  }

  function toPackingList(): void {
    usePacking.getState().mergeItems(deriveFromLedWall())
    // sofort speichern: das neue Fenster liest den Stand beim Öffnen (offene Packlisten
    // übernehmen ihn über syncAcrossWindows)
    flushStore(usePacking)
    void api.openToolWindow('packing-list')
  }

  const project = [s.projectName.trim(), s.customerName.trim()].filter(Boolean)

  return (
    <ToolShell
      id="led-wall"
      bar={
        <ToolBar
          label="Projekt"
          kind="job"
          status={
            project.length ? (
              <span className="truncate">
                <span className="font-medium">{project[0]}</span>
                {project[1] && <span className="text-muted-foreground"> · {project[1]}</span>}
              </span>
            ) : (
              <span className="text-muted-foreground">ohne Projektnamen</span>
            )
          }
        >
          <Button size="sm" onClick={doExport}>
            <FileDown className="size-4" /> PDF exportieren
          </Button>
          <Segmented
            label="Seitenformat der PDF-Doku"
            className="w-auto [&>button]:py-1"
            value={s.pdfLandscape ? 'quer' : 'hoch'}
            options={[
              { value: 'hoch', label: 'Hoch' },
              { value: 'quer', label: 'Quer' }
            ]}
            onChange={(v) => s.set({ pdfLandscape: v === 'quer' })}
          />
          <BarDivider />
          <Button
            size="sm"
            variant="outline"
            title="Material in die Packliste übernehmen und sie in einem eigenen Fenster öffnen"
            onClick={toPackingList}
          >
            <ClipboardList className="size-4" /> In die Packliste
          </Button>
        </ToolBar>
      }
      aside={<LedWallSettings d={d} />}
      main={<Workspace d={d} />}
    />
  )
}

/** Ab dieser Breite der Arbeitsfläche stehen Zeichnung und Datenspalte nebeneinander */
const SIDE_BY_SIDE = 860

function Workspace({ d }: { d: WallMetrics }): JSX.Element {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  // Nebeneinander füllt die Zeichnung die Fensterhöhe, die Datenspalte scrollt bei Bedarf
  // für sich – so bleibt auf dem Laptop alles in einem Bild. Schmal: untereinander.
  const wide = width === 0 || width >= SIDE_BY_SIDE
  return (
    <div ref={ref} className={cn('flex flex-col gap-4 p-4', wide && 'h-full min-h-[34rem]')}>
      <KeyFigures d={d} width={width} />
      <div className={cn('flex gap-4', wide ? 'min-h-0 flex-1' : 'flex-col')}>
        <Drawing d={d} className={wide ? 'min-w-0 flex-1' : 'h-[32rem]'} />
        <div
          className={cn(
            'flex flex-col gap-4',
            wide && 'w-[19rem] shrink-0 overflow-y-auto xl:w-[22rem]'
          )}
        >
          <PowerCard d={d} />
          <BuildCard d={d} />
          <ModuleCard d={d} />
        </div>
      </div>
    </div>
  )
}

function Kpi({
  label,
  value,
  unit,
  sub,
  accent
}: {
  label: string
  value: string
  unit?: string
  /** klein rechts neben der Beschriftung */
  sub?: string
  accent?: boolean
}): JSX.Element {
  return (
    <div
      className={cn(
        'min-w-0 rounded-lg border px-3 py-2',
        accent ? 'border-primary/40 bg-primary/[0.09]' : 'border-border bg-card'
      )}
    >
      <div className="flex items-baseline gap-2 text-xs text-muted-foreground">
        <span className={cn('truncate', accent && 'font-medium text-primary')}>{label}</span>
        {sub && <span className="ml-auto shrink-0 tabular-nums">{sub}</span>}
      </div>
      <div
        className={cn(
          'mt-0.5 whitespace-nowrap text-lg font-bold tabular-nums tracking-tight',
          accent && 'text-primary'
        )}
      >
        {value}
        {unit && (
          <span
            className={cn(
              'ml-1 text-xs font-normal',
              accent ? 'text-primary/70' : 'text-muted-foreground'
            )}
          >
            {unit}
          </span>
        )}
      </div>
    </div>
  )
}

/** Kacheln je Zeile: alle sechs nebeneinander, sonst zwei gleich volle Reihen */
function kpiColumns(width: number): number {
  return width === 0 || width >= 880 ? 6 : width >= 440 ? 3 : 2
}

function KeyFigures({ d, width }: { d: WallMetrics; width: number }): JSX.Element {
  const buildMode = useLedWall((s) => s.buildMode)
  const w = parseFloat(d.actualW)
  const h = parseFloat(d.actualH)
  const weight = parseFloat(d.weightKg)
  const unrolled = (d.cols * d.mod.dimW) / 1000
  return (
    <section
      aria-label="Kennzahlen"
      className="grid gap-3"
      style={{ gridTemplateColumns: `repeat(${kpiColumns(width)}, minmax(0, 1fr))` }}
    >
      <Kpi
        label="Auflösung"
        value={`${d.resX} × ${d.resY}`}
        unit="px"
        sub={`${d.ratioW}:${d.ratioH}`}
        accent
      />
      <Kpi label="Module" value={String(d.total)} unit="Stk." sub={`${d.cols} × ${d.rows}`} />
      <Kpi
        label="Größe"
        value={`${m2(w)} × ${m2(h)}`}
        unit="m"
        sub={d.curve ? `Bogen ${m2(unrolled)} m` : `${fmt(w * h, 1)} m²`}
      />
      <Kpi label="Gewicht" value={fmt(weight, 0)} unit="kg" />
      <Kpi
        label="Leistung max."
        value={fmt(d.powerMaxW, 0)}
        unit="W"
        sub={`${fmt(parseFloat(d.ampsMax), 1)} A`}
      />
      {buildMode === 'stacked' ? (
        <Kpi
          label="Ballast"
          value={fmt(d.totalBallast, 0)}
          unit="kg"
          sub={`${d.baseUnits} × ${d.ballastPerBase} kg`}
          accent
        />
      ) : (
        <Kpi label="Last an Traverse" value={fmt(weight, 0)} unit="kg" accent />
      )}
    </section>
  )
}

/** Kopfzeile der Zeichenfläche: das Wichtigste zur gezeigten Darstellung */
function viewInfo(view: View, d: WallMetrics, grid: number[][]): string {
  if (view === 'front') return fitText(d)
  if (view === 'top') {
    return d.curve ? `${CURVE_MODE_LABELS[d.curve.mode]} · 0–45° je Modul, 2,5°-Schritte` : ''
  }
  const chains = new Set<number>()
  let assigned = 0
  for (const r of grid)
    for (const v of r)
      if (v >= 0) {
        chains.add(v)
        assigned++
      }
  return `${chains.size} ${chains.size === 1 ? 'Kette' : 'Ketten'} · ${assigned} von ${d.total} Modulen`
}

function Drawing({ d, className }: { d: WallMetrics; className?: string }): JSX.Element {
  const s = useLedWall()
  const [stored, setView] = usePersistentState<View>('led-wall:view', 'front', viewCodec)
  const hasCurving = d.curve != null
  // Draufsicht gibt es nur mit Curving; danach wieder die Ansicht
  const view: View = stored === 'top' && !hasCurving ? 'front' : stored
  const views = VIEWS.filter((v) => v.id !== 'top' || hasCurving)

  const info = viewInfo(view, d, view === 'pwr' ? s.pwr : s.sig)

  return (
    <Card className={cn('flex min-h-[22rem] flex-col', className)}>
      <div className="flex items-center gap-3 border-b border-border px-3 py-2">
        <div
          role="tablist"
          aria-label="Darstellung"
          className="flex rounded-md border border-border bg-muted/30 p-0.5"
        >
          {views.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={view === v.id}
              onClick={() => setView(v.id)}
              className={cn(
                'flex items-center gap-1.5 rounded px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70',
                view === v.id
                  ? 'bg-card font-medium text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <v.icon className="size-4" />
              {v.label}
            </button>
          ))}
        </div>
        <p
          className="min-w-0 flex-1 truncate text-right text-xs text-muted-foreground"
          title={info}
        >
          {info}
        </p>
      </div>
      <div
        role="tabpanel"
        aria-label={VIEWS.find((v) => v.id === view)?.label}
        className="min-h-0 flex-1 p-3"
      >
        {view === 'front' && <FrontView d={d} buildMode={s.buildMode} />}
        {view === 'top' && <CurvingView d={d} />}
        {view === 'sig' && (
          <CableGrid
            label="Signal"
            grid={s.sig}
            colors={SIG_COLORS}
            prefix="S"
            activeChain={s.sigChain}
            onChain={(c) => s.set({ sigChain: c })}
            onCell={(r, c) => s.setCell('sig', r, c)}
            onLine={(k, i) => s.fillLine('sig', k, i)}
            onReset={() => s.resetGrid('sig')}
          />
        )}
        {view === 'pwr' && (
          <CableGrid
            label="Strom"
            grid={s.pwr}
            colors={PWR_COLORS}
            prefix="P"
            activeChain={s.pwrChain}
            onChain={(c) => s.set({ pwrChain: c })}
            onCell={(r, c) => s.setCell('pwr', r, c)}
            onLine={(k, i) => s.fillLine('pwr', k, i)}
            onReset={() => s.resetGrid('pwr')}
          />
        )}
      </div>
    </Card>
  )
}

function SideCard({
  title,
  hint,
  children
}: {
  title: string
  hint?: string
  children: ReactNode
}): JSX.Element {
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">{title}</h2>
        {hint && <InfoTip text={hint} label={`Erklärung zu „${title}“`} />}
      </div>
      {children}
    </Card>
  )
}

/** Zeilen „Bezeichnung … Wert“ */
function Specs({ rows }: { rows: [string, ReactNode, boolean?][] }): JSX.Element {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
      {rows.map(([k, v, accent]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd
            className={cn(
              'text-right font-medium tabular-nums',
              accent && 'font-semibold text-primary'
            )}
          >
            {v}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function ModuleCard({ d }: { d: WallMetrics }): JSX.Element {
  const m = d.mod
  return (
    <SideCard title={`Modul ${m.name}`}>
      <Specs
        rows={[
          ['Typ', m.tag],
          ['Pixelpitch', `${fmt(m.pitch, 3)} mm`],
          ['Pixel je Modul', `${m.resX} × ${m.resY}`],
          ['Maße', `${m.dimW} × ${m.dimH} × ${m.dimD} mm`],
          ['Gewicht', `${fmt(m.weight, 1)} kg`],
          [
            'Helligkeit',
            m.brightnessMax
              ? `${fmt(m.brightness, 0)} nit (max. ${fmt(m.brightnessMax, 0)})`
              : `${fmt(m.brightness, 0)} nit`
          ],
          ['Kontrast', `> ${m.contrast}`],
          ['Refresh', `≥ ${fmt(m.refresh, 0)} Hz`],
          ['Blickwinkel', m.viewAngle],
          ['Schutzart', m.ip],
          ['Stromanschluss', m.connector]
        ]}
      />
    </SideCard>
  )
}

function PowerCard({ d }: { d: WallMetrics }): JSX.Element {
  return (
    <SideCard
      title="Strom"
      hint={`Leistung je Modul ${d.mod.powerTyp} W typisch, ${d.mod.powerMax} W maximal; Strom bei 230 V.`}
    >
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th className="pb-1 text-left font-normal" />
            <th className="pb-1 text-right font-normal">Leistung</th>
            <th className="pb-1 text-right font-normal">Strom</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="text-muted-foreground">Typisch</td>
            <td className="text-right font-medium">{fmt(d.powerTypW, 0)} W</td>
            <td className="text-right font-medium">{fmt(parseFloat(d.ampsTyp), 1)} A</td>
          </tr>
          <tr className="text-primary">
            <td>Maximal</td>
            <td className="text-right font-semibold">{fmt(d.powerMaxW, 0)} W</td>
            <td className="text-right font-semibold">{fmt(parseFloat(d.ampsMax), 1)} A</td>
          </tr>
        </tbody>
      </table>
    </SideCard>
  )
}

function BuildCard({ d }: { d: WallMetrics }): JSX.Element {
  const buildMode = useLedWall((s) => s.buildMode)
  if (buildMode === 'flying') {
    return (
      <SideCard
        title={BUILD_LABELS.flying}
        hint="Rigging-Punkte und Traverse je nach Situation planen – etwa mit dem Rechner „Rigging-Last“."
      >
        <Specs rows={[['Gewicht an der Traverse', `${fmt(parseFloat(d.weightKg), 1)} kg`, true]]} />
      </SideCard>
    )
  }
  return (
    <SideCard
      title={`${BUILD_LABELS.stacked} (LSU)`}
      hint={`1 LSU-Fuß je laufendem Meter Bildbreite (${m2(parseFloat(d.actualW))} m → ${d.baseUnits} Füße); der Ballast je Fuß richtet sich nach der Wandhöhe.`}
    >
      <Specs
        rows={[
          ['Standfüße', `${d.baseUnits} Stk.`],
          ['Ballast je Fuß', `${fmt(d.ballastPerBase, 0)} kg`],
          ['Ballast gesamt', `${fmt(d.totalBallast, 0)} kg`, true]
        ]}
      />
    </SideCard>
  )
}
