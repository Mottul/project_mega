// LED-Wall-Konfigurator im Werkzeug-Muster (ToolShell):
//   Leiste „Projekt“  Datei-Menü (Projektdatei .mottul), Wand-Wahl (mehrere Wände je Planung),
//                     PDF-Doku (Hoch/Quer) und Übergabe an die Packliste, rechts der Projektname
//   Schublade         Vorlagen, Projekt, Modul, Wand (Größe, Aufbau), Curving-Form (Settings.tsx)
//   Arbeitsfläche     Kennzahlen; große Zeichenfläche mit Ansicht, Draufsicht (uS2+), Signal-
//                     und Stromplan; daneben Strom, Aufbau und Moduldaten
// Die Zeichenfläche füllt die Höhe des Fensters – auf dem Laptop passt alles auf einen Blick.

import { useEffect, useMemo, type ReactNode } from 'react'
import {
  Cable,
  ClipboardList,
  Columns2,
  FileDown,
  PlugZap,
  RectangleHorizontal,
  Spline,
  type LucideIcon
} from 'lucide-react'
import { ProjectFileMenu } from '@renderer/components/ProjectFileMenu'
import { BarDivider, ToolBar, ToolShell } from '@renderer/components/ToolShell'
import { Alert } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { InfoTip } from '@renderer/components/ui/info-tip'
import { Segmented } from '@renderer/components/ui/segmented'
import { api } from '@renderer/lib/api'
import { flushStore } from '@renderer/lib/persistStorage'
import { useProjectFile } from '@renderer/lib/projectFile'
import { useElementSize } from '@renderer/lib/useElementSize'
import { useElementWidth } from '@renderer/lib/useElementWidth'
import { readStored, usePersistentState, type Codec } from '@renderer/lib/usePersistentState'
import { cn } from '@renderer/lib/utils'
import { deriveFromLedWall } from '../packing-list/derive'
import { usePacking } from '../packing-list/store'
import { fmt } from '../_calc/ui'
import { CableGrid } from './CableGrid'
import { chainCounts } from './cabling'
import { computeWall, type WallMetrics } from './compute'
import { CurvingView } from './Curving'
import { CURVE_MODE_LABELS } from './curve'
import { PWR_COLORS, SIG_COLORS } from './data'
import { FrontView, fitText } from './FrontView'
import { gridCellSize } from './front'
import { LED_WALL_FILE } from './fileSection'
import { exportLedWallPdf } from './print'
import { BUILD_LABELS, LedWallSettings } from './Settings'
import { amps, analyzePower, circuitLabel, PHASES, type PowerAnalysis } from './power'
import { analyzeProcessors, backupLabel, fiberSummary, type GroupLoad } from './processors'
import { plannedWalls, useLedWall } from './store'
import { topDownMarkup } from './topdown'
import { WallMenu } from './WallMenu'

type View = 'front' | 'top' | 'sig' | 'pwr' | 'both'

const VIEWS: { id: View; label: string; icon: LucideIcon }[] = [
  { id: 'front', label: 'Ansicht', icon: RectangleHorizontal },
  { id: 'top', label: 'Draufsicht', icon: Spline },
  { id: 'sig', label: 'Signal', icon: Cable },
  { id: 'pwr', label: 'Strom', icon: PlugZap },
  { id: 'both', label: 'Signal + Strom', icon: Columns2 }
]

const viewCodec: Codec<View> = {
  parse: (raw) => (VIEWS.some((v) => v.id === raw) ? (raw as View) : null),
  format: (v) => v
}

/** Pläne von vorne oder von hinten – Bedienzustand, auch fürs PDF (nicht in der Datei) */
type PlanSide = 'front' | 'rear'
const sideCodec: Codec<PlanSide> = {
  parse: (raw) => (raw === 'front' || raw === 'rear' ? raw : null),
  format: (v) => v
}
const SIDE_KEY = 'led-wall:planSide'
const usePlanSide = (): [PlanSide, (v: PlanSide) => void] =>
  usePersistentState<PlanSide>(SIDE_KEY, 'front', sideCodec)

/** Höhe der Leisten über einem Raster (Ketten, Verlauf) – für die Wahl der Anordnung */
const GRID_BARS = 80

/** Module ab dieser Größe (px) sind gut zu treffen – dann dürfen die Pläne nebeneinander */
const GRID_CELL_COMFORT = 28

/**
 * Signal + Strom nebeneinander, wenn der Platz reicht (Festlegung 25): sobald die Module dort gut
 * zu treffen sind oder nicht kleiner werden als untereinander – sonst untereinander (sehr breite
 * Wände in einem schmalen Fenster).
 */
function bothSideBySide(w: number, h: number, cols: number, rows: number): boolean {
  if (w === 0 || h === 0) return true
  const side = gridCellSize((w - 16) / 2, h - GRID_BARS, cols, rows)
  const stacked = gridCellSize(w, (h - 16) / 2 - GRID_BARS, cols, rows)
  return side >= Math.min(stacked, GRID_CELL_COMFORT)
}

/** Maß in m mit Komma und zwei Nachkommastellen */
const m2 = (n: number): string =>
  n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function LedWall(): JSX.Element {
  const s = useLedWall()
  const file = useProjectFile(LED_WALL_FILE)

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
        selectedCircle: s.selectedCircle,
        mains: s.mains
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
      s.selectedCircle,
      s.mains
    ]
  )

  // Verkabelungs-Grids an die Modulzahl anpassen (Zuordnungen bleiben erhalten) – auch nach dem
  // Wechsel der Wand: Eine neue Wand hat noch leere Raster, vielleicht bei gleicher Modulzahl.
  useEffect(() => {
    s.ensureGridSize(d.rows, d.cols)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.rows, d.cols, s.wallId])

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
      wallName: s.walls.length > 1 ? s.walls.find((w) => w.id === s.wallId)?.name : undefined,
      wallId: s.wallId,
      signal: analyzeProcessors(plannedWalls(useLedWall.getState())).find((g) =>
        g.walls.some((w) => w.wallId === s.wallId)
      ),
      power: analyzePower(s),
      buildMode: s.buildMode,
      sig: s.sig,
      pwr: s.pwr,
      sigMeta: s.sigMeta,
      pwrMeta: s.pwrMeta,
      // frisch gelesen: der Umschalter sitzt in der Zeichenfläche (eigener Zustand)
      rear: readStored<PlanSide>(SIDE_KEY, 'front', sideCodec) === 'rear',
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
          <ProjectFileMenu file={file} />
          <BarDivider />
          <WallMenu />
          <BarDivider />
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
          <SignalCard />
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
function viewInfo(view: View, d: WallMetrics, sig: number[][], pwr: number[][]): string {
  if (view === 'front') return fitText(d)
  if (view === 'top') {
    return d.curve ? `${CURVE_MODE_LABELS[d.curve.mode]} · 0–45° je Modul, 2,5°-Schritte` : ''
  }
  const count = (grid: number[][]): string => {
    const c = chainCounts(grid)
    const assigned = [...c.values()].reduce((a, b) => a + b, 0)
    return `${c.size} ${c.size === 1 ? 'Kette' : 'Ketten'} · ${assigned} von ${d.total} Modulen`
  }
  if (view === 'both') return `Signal ${count(sig)} | Strom ${count(pwr)}`
  return count(view === 'pwr' ? pwr : sig)
}

function Drawing({ d, className }: { d: WallMetrics; className?: string }): JSX.Element {
  const s = useLedWall()
  const [stored, setView] = usePersistentState<View>('led-wall:view', 'front', viewCodec)
  const [side, setSide] = usePlanSide()
  const [bodyRef, body] = useElementSize<HTMLDivElement>()
  const hasCurving = d.curve != null
  // Draufsicht gibt es nur mit Curving; danach wieder die Ansicht
  const view: View = stored === 'top' && !hasCurving ? 'front' : stored
  const views = VIEWS.filter((v) => v.id !== 'top' || hasCurving)
  const plan = view === 'sig' || view === 'pwr' || view === 'both'
  const mirror = side === 'rear'

  const info = viewInfo(view, d, s.sig, s.pwr)
  const group = useWallGroup()
  const loads = new Map(
    (group?.walls.find((w) => w.wallId === s.wallId)?.chains ?? []).map((c) => [c.chain, c])
  )
  const power = usePower()
  const powerLoads = new Map(power.chains.map((c) => [c.chain, c]))
  const grid = (g: 'sig' | 'pwr'): JSX.Element => (
    <CableGrid
      label={g === 'sig' ? 'Signal' : 'Strom'}
      id={g}
      grid={s[g]}
      meta={g === 'sig' ? s.sigMeta : s.pwrMeta}
      colors={g === 'sig' ? SIG_COLORS : PWR_COLORS}
      prefix={g === 'sig' ? 'S' : 'P'}
      activeChain={g === 'sig' ? s.sigChain : s.pwrChain}
      mirror={mirror}
      onChain={(c) => s.set(g === 'sig' ? { sigChain: c } : { pwrChain: c })}
      onCell={(r, c) => s.setCell(g, r, c)}
      onLine={(k, i) => s.fillLine(g, k, i)}
      onReset={() => s.resetGrid(g)}
      onRoute={(c, route) => s.setRoute(g, c, route)}
      onDraw={(c, cells, extend) => s.drawChain(g, c, cells, extend)}
      ports={
        g === 'sig' && group
          ? {
              count: group.processor.ports || 16,
              loads,
              // Hot-Backup über eine zweite CVT10: ab Werk jede Kette mit Backup
              redundancy: s.redundancy || group.fiber?.redundancy === 'hot-backup',
              hotBackup: group.fiber?.redundancy === 'hot-backup',
              onChange: (c, patch) => s.setSigChain(c, patch)
            }
          : undefined
      }
      power={
        g === 'pwr'
          ? { loads: powerLoads, onChange: (c, patch) => s.setPwrChain(c, patch) }
          : undefined
      }
    />
  )

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
        {plan && (
          <Segmented
            label="Blickrichtung der Pläne"
            className="w-auto shrink-0 [&>button]:py-1"
            value={side}
            options={[
              { value: 'front', label: 'Vorne' },
              { value: 'rear', label: 'Hinten' }
            ]}
            onChange={setSide}
          />
        )}
        <p
          className="min-w-0 flex-1 truncate text-right text-xs text-muted-foreground"
          title={info}
        >
          {info}
        </p>
      </div>
      <div
        ref={bodyRef}
        role="tabpanel"
        aria-label={VIEWS.find((v) => v.id === view)?.label}
        className="min-h-0 flex-1 p-3"
      >
        {view === 'front' && <FrontView d={d} buildMode={s.buildMode} />}
        {view === 'top' && <CurvingView d={d} />}
        {view === 'sig' && grid('sig')}
        {view === 'pwr' && grid('pwr')}
        {view === 'both' && (
          <div
            className={cn(
              'grid h-full min-h-0 gap-4',
              bothSideBySide(body.width, body.height, d.cols, d.rows)
                ? 'grid-cols-2'
                : 'grid-cols-1 grid-rows-2'
            )}
          >
            <section aria-label="Signal" className="min-h-0 min-w-0">
              {grid('sig')}
            </section>
            <section aria-label="Strom" className="min-h-0 min-w-0">
              {grid('pwr')}
            </section>
          </div>
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
          ['IMs je Modul', `${m.ims.count} (${m.ims.layout})`],
          ['Stromanschluss', m.connector]
        ]}
      />
    </SideCard>
  )
}

/** Prozessor der gewählten Wand (bei geteiltem Prozessor die ganze Gruppe) mit Lasten */
function useWallGroup(): GroupLoad | null {
  const s = useLedWall()
  const groups = useMemo(() => analyzeProcessors(plannedWalls(s)), [s])
  return groups.find((g) => g.walls.some((w) => w.wallId === s.wallId)) ?? null
}

const px = (n: number): string => n.toLocaleString('de-DE')

/**
 * Signal: Prozessor, Grenze je Port, Ketten mit Port und Last, Warnungen (keine Sperre). Bei einem
 * geteilten Prozessor stehen die Ketten aller Wände darin – Ports zählen gemeinsam.
 */
function SignalCard(): JSX.Element | null {
  const g = useWallGroup()
  if (!g) return null
  const p = g.processor
  const several = g.walls.length > 1
  const limit =
    p.portPx > 0
      ? `${px(p.portPx)} px je Port (${p.bitDepth} bit, ${p.hz} Hz${p.limitBy === 'karte' ? `, Grenze der Karte ${p.card}` : ''})`
      : 'Grenze je Port nicht angegeben'
  const chains = g.walls.flatMap((w) => w.chains.map((c) => ({ ...c, wall: w.wallName })))
  return (
    <SideCard
      title="Signal"
      hint={`${p.name}: ${limit}. Grenze je Port = kleinerer Wert aus Prozessor und Empfangskarte (Handbücher). Backup-Leitungen belegen eigene Ports; beim Tessera laufen sie als Schleife über Portpaare und zählen doppelt.`}
    >
      <Specs
        rows={[
          ['Prozessor', several ? `${p.name} (geteilt)` : p.name],
          ...(g.fiber ? [['Glasfaser', fiberSummary(g.fiber)] as [string, string]] : []),
          [
            'Ports belegt',
            p.ports ? `${g.portsUsed} von ${p.ports}` : String(g.portsUsed),
            g.portsUsed > p.ports && p.ports > 0
          ],
          ['Je Port', p.portPx > 0 ? `${px(p.portPx)} px` : '–'],
          ['Gesamt', p.totalPx > 0 ? `${px(g.totalPx)} von ${px(p.totalPx)} px` : px(g.totalPx)]
        ]}
      />
      {chains.length > 0 && (
        <table className="mt-2 w-full text-xs tabular-nums" aria-label="Signalketten">
          <thead>
            <tr className="text-muted-foreground">
              <th className="text-left font-normal">Kette</th>
              <th className="text-right font-normal">Module</th>
              <th className="text-right font-normal">Pixel</th>
              <th className="text-right font-normal">Port</th>
            </tr>
          </thead>
          <tbody>
            {chains.map((c) => (
              <tr
                key={`${c.wall}-${c.chain}`}
                className={cn(c.over && 'font-semibold text-danger')}
              >
                <td>
                  {several && <span className="text-muted-foreground">{c.wall} </span>}S
                  {c.chain + 1}
                </td>
                <td className="text-right">{c.modules}</td>
                <td className="text-right">{px(c.px)}</td>
                <td className="text-right">
                  {c.port}
                  {c.backupPort !== null && (
                    <span className="text-muted-foreground"> · {backupLabel(c)}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {g.warnings.length > 0 && (
        <div className="mt-2 space-y-1.5" data-testid="signal-warnungen">
          {g.warnings.map((w, i) =>
            w.level === 'info' ? (
              <p key={i} className="text-xs text-muted-foreground">
                {w.text}
              </p>
            ) : (
              <Alert key={i} tone={w.level}>
                {w.text}
              </Alert>
            )
          )}
        </div>
      )}
    </SideCard>
  )
}

/** Strom der gewählten Wand: Lasten je Kette, Kreise, Phasen (power.ts) */
function usePower(): PowerAnalysis {
  const moduleKey = useLedWall((s) => s.moduleKey)
  const pwr = useLedWall((s) => s.pwr)
  const pwrMeta = useLedWall((s) => s.pwrMeta)
  const mains = useLedWall((s) => s.mains)
  return useMemo(
    () => analyzePower({ moduleKey, pwr, pwrMeta, mains }),
    [moduleKey, pwr, pwrMeta, mains]
  )
}

/**
 * Strom: Summe der Wand, darunter je Stromkette Last, Kreis und Phase, die Phasenbilanz und
 * Warnungen (keine Sperre). Phasen ohne Angabe sind ein Vorschlag (in Klammern).
 */
function PowerCard({ d }: { d: WallMetrics }): JSX.Element {
  const p = usePower()
  return (
    <SideCard
      title="Strom"
      hint={`Leistung je Modul ${d.mod.powerTyp} W typisch, ${d.mod.powerMax} W maximal; Strom bei ${p.voltage} V. Ein Kreis mit ${p.breakerA} A trägt bei Maximalleistung ${p.maxModules} Module. Netz und Absicherung in der Schublade (Strom), Kreis und Phase je Kette in der Leiste über dem Strom-Plan; ohne Phase verteilt die Rechnung die Kreise als Vorschlag (in Klammern).`}
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
      {p.chains.length > 0 && (
        <>
          <table className="mt-2 w-full text-xs tabular-nums" aria-label="Stromketten">
            <thead>
              <tr className="text-muted-foreground">
                <th className="text-left font-normal">Kette</th>
                <th className="text-right font-normal">Module</th>
                <th className="text-right font-normal">A max</th>
                <th className="text-right font-normal">Kreis · Phase</th>
              </tr>
            </thead>
            <tbody>
              {p.chains.map((c) => (
                <tr key={c.chain} className={cn(c.over && 'font-semibold text-danger')}>
                  <td>P{c.chain + 1}</td>
                  <td className="text-right">{c.modules}</td>
                  <td className="text-right">{amps(c.amps)}</td>
                  <td
                    className={cn('text-right', c.phaseAuto && !c.over && 'text-muted-foreground')}
                  >
                    {circuitLabel(c)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div
            className="mt-2 grid grid-cols-3 gap-1 text-center text-xs"
            role="group"
            aria-label="Phasen"
          >
            {PHASES.map((ph) => (
              <div key={ph} className="rounded bg-muted/40 py-1">
                <div className="text-muted-foreground">{ph}</div>
                <div className="font-semibold tabular-nums">{amps(p.phases[ph])} A</div>
              </div>
            ))}
          </div>
        </>
      )}
      {p.warnings.length > 0 && (
        <div className="mt-2 space-y-1.5" data-testid="strom-warnungen">
          {p.warnings.map((w, i) =>
            w.level === 'info' ? (
              <p key={i} className="text-xs text-muted-foreground">
                {w.text}
              </p>
            ) : (
              <Alert key={i} tone={w.level}>
                {w.text}
              </Alert>
            )
          )}
        </div>
      )}
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
