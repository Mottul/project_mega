// Zeichenbares Verkabelungs-Raster (Signal ODER Strom): Module anklicken weist sie der aktiven
// Kette zu (erneut klicken entfernt), Spalten-/Zeilen-Köpfe schalten ganze Linien. Ketten sind
// farbcodiert; jeder Ketten-Knopf zählt seine Module (zugleich die Legende). Die Zellen wachsen
// mit der Fläche, die das Raster bekommt (front.ts: gridCellSize) – große Wände scrollen.
//
// Verlauf je Kette nur von Hand (cabling.ts): Startecke + Richtung oder „Zeichnen“ – mit
// gedrückter Maustaste über die Module ziehen. Die Pfeile liegen als SVG über dem Raster
// (pointer-events: none), dieselbe Quelle wie im PDF. Ansicht von hinten spiegelt nur die
// Darstellung; Spalten- und Kettennummern bleiben am Modul.

import { useEffect, useMemo, useRef, useState } from 'react'
import { PenLine } from 'lucide-react'
import { InfoTip } from '@renderer/components/ui/info-tip'
import { Segmented } from '@renderer/components/ui/segmented'
import { Select } from '@renderer/components/ui/select'
import { LiveInput } from '@renderer/components/ui/textarea'
import { useElementSize } from '@renderer/lib/useElementSize'
import { cn } from '@renderer/lib/utils'
import {
  chainRoutes,
  CORNER_LABELS,
  mirrorCorner,
  routeHints,
  routeSvg,
  type Cell
} from './cabling'
import type { ChainRoute, Corner, PwrChainMeta, SigChainMeta } from './config'
import { GRID_GAP, GRID_HEADER, gridCellSize } from './front'
import { amps, circuitLabel, PHASES, type Phase, type PowerChainLoad } from './power'
import { hasBackup, type ChainLoad } from './processors'

interface Props {
  /** „Signal“ bzw. „Strom“ – für Beschriftungen */
  label: string
  /** eindeutig je Plan (Marker-IDs der Pfeile): „sig“ / „pwr“ */
  id: string
  grid: number[][]
  meta: Record<string, ChainRoute>
  colors: string[]
  prefix: string // 'S' | 'P'
  activeChain: number
  /** Ansicht von hinten: Spalten gespiegelt */
  mirror: boolean
  onChain: (chain: number) => void
  onCell: (row: number, col: number) => void
  onLine: (kind: 'row' | 'col', index: number) => void
  onReset: () => void
  onRoute: (chain: number, route: { start: Corner; axis: 'row' | 'col' } | null) => void
  onDraw: (chain: number, cells: Cell[], extend: boolean) => void
  /** nur Signal: Ports und Backup je Kette (processors.ts) */
  ports?: {
    /** Ports des Prozessors (Auswahl 1 … n) */
    count: number
    loads: Map<number, ChainLoad>
    /** Vorgabe der Wand für Ketten ohne eigene Angabe */
    redundancy: boolean
    onChange: (chain: number, patch: Partial<SigChainMeta>) => void
  }
  /** nur Strom: Stromkreis und Phase je Kette, Last (power.ts) */
  power?: {
    loads: Map<number, PowerChainLoad>
    onChange: (chain: number, patch: Partial<PwrChainMeta>) => void
  }
}

const CORNERS: Corner[] = ['tl', 'tr', 'bl', 'br']

export function CableGrid({
  label,
  id,
  grid,
  meta,
  colors,
  prefix,
  activeChain,
  mirror,
  onChain,
  onCell,
  onLine,
  onReset,
  onRoute,
  onDraw,
  ports,
  power
}: Props): JSX.Element {
  const [areaRef, area] = useElementSize<HTMLDivElement>()
  const [drawing, setDrawing] = useState(false)
  const stroke = useRef<{ last: string } | null>(null)
  const rows = grid.length
  const cols = grid[0]?.length ?? 0
  const routes = useMemo(() => chainRoutes(grid, meta), [grid, meta])
  const hints = useMemo(() => routeHints(routes, prefix), [routes, prefix])
  const used = [...routes.keys()].sort((a, b) => a - b)
  const nextChain = used.length ? Math.max(...used) + 1 : 0
  const btnCount = Math.max(nextChain + 1, activeChain + 1)
  const cell = gridCellSize(area.width, area.height, cols, rows)
  const active = routes.get(activeChain)
  const own = Object.hasOwn(meta, String(activeChain)) ? meta[String(activeChain)] : undefined
  // Startecke so beschriften, wie man die Wand gerade sieht
  const shown = (c: Corner): Corner => (mirror ? mirrorCorner(c) : c)
  const colAt = (d: number): number => (mirror ? cols - 1 - d : d)

  // Strich endet, wo auch immer die Maustaste losgelassen wird
  useEffect(() => {
    const end = (): void => {
      stroke.current = null
    }
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
  }, [])

  const cellFrom = (x: number, y: number): Cell | null => {
    const el = document.elementFromPoint(x, y)
    const v =
      el instanceof HTMLElement ? el.closest<HTMLElement>('[data-cell]')?.dataset.cell : null
    if (!v) return null
    const [r, c] = v.split(',').map(Number)
    return [r, c]
  }

  function startStroke(c: Cell): void {
    const last = active?.order.at(-1)
    // am letzten Modul der gezeichneten Kette weiterziehen = verlängern, sonst neu zeichnen
    const extend = !!last && active?.source === 'drawn' && last[0] === c[0] && last[1] === c[1]
    stroke.current = { last: `${c[0]},${c[1]}` }
    onDraw(activeChain, [c], extend)
  }

  function moveStroke(x: number, y: number): void {
    if (!stroke.current) return
    const c = cellFrom(x, y)
    if (!c) return
    const k = `${c[0]},${c[1]}`
    if (k === stroke.current.last) return
    stroke.current.last = k
    onDraw(activeChain, [c], true)
  }

  const step = cell + GRID_GAP
  const backups = new Set(
    [...(ports?.loads ?? [])].filter(([, l]) => l.backupPort !== null).map(([c]) => c)
  )
  const overlay = routeSvg(routes, {
    cell,
    gap: GRID_GAP,
    x0: GRID_HEADER + GRID_GAP,
    y0: GRID_HEADER + GRID_GAP,
    cols,
    colors,
    id: `${id}-raster`,
    mirror,
    backups
  })
  const load = ports?.loads.get(activeChain)
  const sigOwn = own as SigChainMeta | undefined
  const pwrOwn = own as PwrChainMeta | undefined
  const pload = power?.loads.get(activeChain)
  const backupOn = ports ? hasBackup(sigOwn, ports.redundancy) : false
  const portOptions = Array.from({ length: Math.max(ports?.count ?? 0, 1) }, (_, i) => i + 1)

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-muted-foreground">Kette</span>
        {Array.from({ length: btnCount }, (_, i) => {
          const n = routes.get(i)?.cells.length ?? 0
          const l = ports?.loads.get(i)
          const pl = power?.loads.get(i)
          const extra = l
            ? ` · ${l.px.toLocaleString('de-DE')} px · Port ${l.port}${l.backupPort !== null ? `, Backup ${l.backupPort}` : ''}${l.over ? ' · über der Grenze je Port' : ''}`
            : pl
              ? ` · ${amps(pl.amps)} A · ${circuitLabel(pl)}${pl.over ? ' · über der Absicherung' : ''}`
              : ''
          return (
            <button
              key={i}
              type="button"
              aria-pressed={activeChain === i}
              aria-label={`${label}-Kette ${i + 1}: ${n} Module`}
              title={`${prefix}${i + 1}: ${n} Module${extra}`}
              onClick={() => onChain(i)}
              className={`flex h-7 min-w-8 items-center justify-center gap-1 rounded px-1.5 text-[11px] font-bold text-black ${
                activeChain === i ? 'ring-2 ring-foreground ring-offset-1 ring-offset-card' : ''
              }`}
              style={{ background: colors[i % colors.length] }}
            >
              {prefix}
              {i + 1}
              {n > 0 && (
                <span className="rounded-sm bg-black/15 px-1 font-semibold tabular-nums">{n}</span>
              )}
              {(l?.over || pl?.over) && (
                <span className="rounded-sm bg-destructive px-1 text-white" aria-hidden>
                  !
                </span>
              )}
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => onChain(nextChain)}
          title="Neue Kette"
          aria-label={`Neue ${label}-Kette`}
          className="flex h-7 w-8 items-center justify-center rounded border border-dashed border-muted-foreground/50 text-sm text-muted-foreground hover:border-primary hover:text-primary"
        >
          +
        </button>
        <InfoTip
          label={`Erklärung zur ${label}-Verkabelung`}
          text="Kette wählen, dann Module anklicken – erneut klicken nimmt ein Modul wieder heraus. Die Köpfe der Spalten und Zeilen schalten eine ganze Linie. „+“ beginnt eine neue Kette. Den Verlauf legst du je Kette fest: Startecke und Richtung, oder „Zeichnen“ und mit gedrückter Maustaste über die Module ziehen (am letzten Modul ansetzen verlängert die Kette)."
        />
        <button
          type="button"
          onClick={onReset}
          className="ml-auto h-7 rounded border border-border px-2 text-xs text-muted-foreground hover:border-danger hover:text-danger"
        >
          Zurücksetzen
        </button>
      </div>

      <div
        className="flex flex-wrap items-center gap-2 text-xs"
        role="group"
        aria-label={`Verlauf ${prefix}${activeChain + 1}`}
      >
        <span className="font-medium" style={{ color: colors[activeChain % colors.length] }}>
          Verlauf {prefix}
          {activeChain + 1}
        </span>
        <Select
          size="xs"
          aria-label="Startecke"
          value={active?.source === 'snake' && own?.start ? own.start : ''}
          onChange={(e) =>
            onRoute(
              activeChain,
              e.target.value ? { start: e.target.value as Corner, axis: own?.axis ?? 'row' } : null
            )
          }
        >
          <option value="">{active?.source === 'drawn' ? 'gezeichnet' : 'Start …'}</option>
          {CORNERS.map((c) => (
            <option key={c} value={c}>
              Start {CORNER_LABELS[shown(c)]}
            </option>
          ))}
        </Select>
        {active?.source === 'snake' && own?.start && (
          <Segmented
            label="Richtung"
            className="w-auto [&>button]:py-0.5"
            value={own.axis ?? 'row'}
            options={[
              { value: 'row', label: 'waagrecht' },
              { value: 'col', label: 'senkrecht' }
            ]}
            onChange={(axis) => onRoute(activeChain, { start: own.start!, axis })}
          />
        )}
        <button
          type="button"
          aria-pressed={drawing}
          onClick={() => setDrawing((v) => !v)}
          className={cn(
            'flex h-7 items-center gap-1 rounded border px-2',
            drawing
              ? 'border-primary bg-primary/15 text-primary'
              : 'border-border text-muted-foreground hover:text-foreground'
          )}
        >
          <PenLine className="size-3.5" /> Zeichnen
        </button>
        {active?.source && (
          <button
            type="button"
            onClick={() => onRoute(activeChain, null)}
            className="h-7 rounded px-1.5 text-muted-foreground hover:text-danger"
          >
            Verlauf löschen
          </button>
        )}
        {ports && (
          <>
            <Select
              size="xs"
              aria-label="Port"
              value={sigOwn?.port ?? ''}
              onChange={(e) => ports.onChange(activeChain, { port: e.target.value || undefined })}
            >
              <option value="">Port {load?.port ?? '–'} (fortlaufend)</option>
              {portOptions.map((p) => (
                <option key={p} value={String(p)}>
                  Port {p}
                </option>
              ))}
            </Select>
            <label className="flex h-7 items-center gap-1.5 rounded border border-border px-2">
              <input
                type="checkbox"
                checked={backupOn}
                onChange={(e) =>
                  ports.onChange(activeChain, {
                    backup: e.target.checked ? (sigOwn?.backup ?? {}) : null
                  })
                }
                className="size-3.5 accent-[hsl(var(--primary))]"
              />
              Backup
            </label>
            {backupOn && (
              <Select
                size="xs"
                aria-label="Backup-Port"
                value={sigOwn?.backup?.port ?? ''}
                onChange={(e) =>
                  ports.onChange(activeChain, {
                    backup: e.target.value ? { port: e.target.value } : {}
                  })
                }
              >
                <option value="">Backup {load?.backupPort ?? '–'} (fortlaufend)</option>
                {portOptions.map((p) => (
                  <option key={p} value={String(p)}>
                    Backup {p}
                  </option>
                ))}
              </Select>
            )}
          </>
        )}
        {power && (
          <>
            <LiveInput
              key={activeChain}
              aria-label="Stromkreis"
              value={pwrOwn?.circuit ?? ''}
              placeholder="Kreis, z. B. F3"
              maxLength={40}
              className="h-7 w-28 text-xs"
              onCommit={(v) => power.onChange(activeChain, { circuit: v.trim() || undefined })}
            />
            <Select
              size="xs"
              aria-label="Phase"
              value={pwrOwn?.phase ?? ''}
              onChange={(e) =>
                power.onChange(activeChain, {
                  phase: (e.target.value || undefined) as Phase | undefined
                })
              }
            >
              <option value="">{pload ? `${pload.phase} (Vorschlag)` : 'Phase …'}</option>
              {PHASES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
            {pload && (
              <span
                className={cn(
                  'tabular-nums',
                  pload.over ? 'font-semibold text-danger' : 'text-muted-foreground'
                )}
              >
                {amps(pload.amps)} A
              </span>
            )}
          </>
        )}
        {hints.length > 0 && (
          <span className="text-warning" data-testid="verlauf-hinweise">
            {hints.map((h) => h.text).join(' · ')}
          </span>
        )}
      </div>

      {mirror && (
        <p className="rounded border border-warning/50 bg-warning/10 px-2 py-1 text-center text-xs font-semibold uppercase tracking-wide text-warning">
          Ansicht von hinten – Publikum auf der anderen Seite
        </p>
      )}

      <div ref={areaRef} className="min-h-0 flex-1 overflow-auto">
        <div
          className={cn('relative mx-auto w-fit', drawing && 'cursor-crosshair touch-none')}
          onPointerMove={drawing ? (e) => moveStroke(e.clientX, e.clientY) : undefined}
        >
          <div className="flex" style={{ gap: GRID_GAP, marginLeft: GRID_HEADER + GRID_GAP }}>
            {Array.from({ length: cols }, (_, d) => {
              const c = colAt(d)
              return (
                <button
                  key={c}
                  type="button"
                  title={`Spalte ${c + 1} – ganze Spalte zuweisen`}
                  onClick={() => onLine('col', c)}
                  className="flex items-center justify-center rounded-sm border border-dashed border-border text-[10px] tabular-nums text-muted-foreground hover:border-primary hover:text-foreground"
                  style={{ width: cell, height: GRID_HEADER, marginBottom: GRID_GAP }}
                >
                  {c + 1}
                </button>
              )
            })}
          </div>
          {grid.map((row, r) => (
            <div
              key={r}
              className="flex items-center"
              style={{ gap: GRID_GAP, marginBottom: GRID_GAP }}
            >
              <button
                type="button"
                title={`Zeile ${r + 1} – ganze Zeile zuweisen`}
                onClick={() => onLine('row', r)}
                className="flex shrink-0 items-center justify-center rounded-sm border border-dashed border-border text-[10px] tabular-nums text-muted-foreground hover:border-primary hover:text-foreground"
                style={{ width: GRID_HEADER, height: cell }}
              >
                {r + 1}
              </button>
              {Array.from({ length: cols }, (_, d) => {
                const c = colAt(d)
                const v = row[c] ?? -1
                const color = v >= 0 ? colors[v % colors.length] : undefined
                return (
                  <button
                    key={c}
                    type="button"
                    data-cell={`${r},${c}`}
                    aria-label={`Modul Zeile ${r + 1}, Spalte ${c + 1}${v >= 0 ? ` – ${prefix}${v + 1}` : ''}`}
                    onClick={drawing ? undefined : () => onCell(r, c)}
                    onPointerDown={
                      drawing
                        ? (e) => {
                            e.preventDefault()
                            startStroke([r, c])
                          }
                        : undefined
                    }
                    className="flex items-center justify-center rounded-sm border font-bold transition-[filter] hover:brightness-125"
                    style={{
                      width: cell,
                      height: cell,
                      fontSize: Math.max(8, Math.min(12, cell / 3.4)),
                      background: color ? `${color}30` : 'hsl(var(--input) / 0.4)',
                      borderColor: color ?? 'hsl(var(--border))',
                      color: color ?? 'transparent'
                    }}
                  >
                    {v >= 0 ? `${prefix}${v + 1}` : ''}
                  </button>
                )
              })}
            </div>
          ))}
          {overlay && (
            <svg
              aria-hidden
              className="pointer-events-none absolute left-0 top-0"
              width={GRID_HEADER + GRID_GAP + cols * step}
              height={GRID_HEADER + GRID_GAP + rows * step}
              data-testid={`${id}-verlauf`}
              dangerouslySetInnerHTML={{ __html: overlay }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
