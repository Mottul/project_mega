// Zeichenbares Verkabelungs-Raster (Signal ODER Strom): Module anklicken weist sie der aktiven
// Kette zu (erneut klicken entfernt), Spalten-/Zeilen-Köpfe schalten ganze Linien. Ketten sind
// farbcodiert; jeder Ketten-Knopf zählt seine Module (zugleich die Legende). Die Zellen wachsen
// mit der Fläche, die das Raster bekommt (front.ts: gridCellSize) – große Wände scrollen.

import { InfoTip } from '@renderer/components/ui/info-tip'
import { useElementSize } from '@renderer/lib/useElementSize'
import { GRID_GAP, GRID_HEADER, gridCellSize } from './front'

interface Props {
  /** „Signal“ bzw. „Strom“ – für Beschriftungen */
  label: string
  grid: number[][]
  colors: string[]
  prefix: string // 'S' | 'P'
  activeChain: number
  onChain: (chain: number) => void
  onCell: (row: number, col: number) => void
  onLine: (kind: 'row' | 'col', index: number) => void
  onReset: () => void
}

export function CableGrid({
  label,
  grid,
  colors,
  prefix,
  activeChain,
  onChain,
  onCell,
  onLine,
  onReset
}: Props): JSX.Element {
  const [areaRef, area] = useElementSize<HTMLDivElement>()
  const rows = grid.length
  const cols = grid[0]?.length ?? 0
  const counts = new Map<number, number>()
  for (const r of grid) for (const v of r) if (v >= 0) counts.set(v, (counts.get(v) ?? 0) + 1)
  const used = [...counts.keys()].sort((a, b) => a - b)
  const nextChain = used.length ? Math.max(...used) + 1 : 0
  const btnCount = Math.max(nextChain + 1, activeChain + 1)
  const cell = gridCellSize(area.width, area.height, cols, rows)

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-muted-foreground">Kette</span>
        {Array.from({ length: btnCount }, (_, i) => (
          <button
            key={i}
            type="button"
            aria-pressed={activeChain === i}
            aria-label={`${label}-Kette ${i + 1}: ${counts.get(i) ?? 0} Module`}
            title={`${prefix}${i + 1}: ${counts.get(i) ?? 0} Module`}
            onClick={() => onChain(i)}
            className={`flex h-7 min-w-8 items-center justify-center gap-1 rounded px-1.5 text-[11px] font-bold text-black ${
              activeChain === i ? 'ring-2 ring-foreground ring-offset-1 ring-offset-card' : ''
            }`}
            style={{ background: colors[i % colors.length] }}
          >
            {prefix}
            {i + 1}
            {counts.has(i) && (
              <span className="rounded-sm bg-black/15 px-1 font-semibold tabular-nums">
                {counts.get(i)}
              </span>
            )}
          </button>
        ))}
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
          text="Kette wählen, dann Module anklicken – erneut klicken nimmt ein Modul wieder heraus. Die Köpfe der Spalten und Zeilen schalten eine ganze Linie. „+“ beginnt eine neue Kette; die Zahl am Ketten-Knopf zählt ihre Module."
        />
        <button
          type="button"
          onClick={onReset}
          className="ml-auto h-7 rounded border border-border px-2 text-xs text-muted-foreground hover:border-danger hover:text-danger"
        >
          Zurücksetzen
        </button>
      </div>

      <div ref={areaRef} className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto w-fit">
          <div className="flex" style={{ gap: GRID_GAP, marginLeft: GRID_HEADER + GRID_GAP }}>
            {Array.from({ length: cols }, (_, c) => (
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
            ))}
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
              {row.map((v, c) => {
                const color = v >= 0 ? colors[v % colors.length] : undefined
                return (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Modul Zeile ${r + 1}, Spalte ${c + 1}${v >= 0 ? ` – ${prefix}${v + 1}` : ''}`}
                    onClick={() => onCell(r, c)}
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
        </div>
      </div>
    </div>
  )
}
