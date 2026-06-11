// Zeichenbares Verkabelungs-Raster (Signal ODER Strom): Module anklicken weist
// sie der aktiven Kette zu (erneut klicken entfernt), Spalten-/Zeilen-Köpfe
// schalten ganze Linien. Ketten sind farbcodiert; Legende zählt Module je Kette.

interface Props {
  grid: number[][]
  colors: string[]
  prefix: string // 'S' | 'P'
  activeChain: number
  onChain: (chain: number) => void
  onCell: (row: number, col: number) => void
  onLine: (kind: 'row' | 'col', index: number) => void
  onReset: () => void
}

export function CableGrid({ grid, colors, prefix, activeChain, onChain, onCell, onLine, onReset }: Props): JSX.Element {
  const rows = grid.length
  const cols = grid[0]?.length ?? 0
  const used = new Set<number>()
  for (const r of grid) for (const v of r) if (v >= 0) used.add(v)
  const nextChain = used.size ? Math.max(...used) + 1 : 0
  const btnCount = Math.max(nextChain + 1, activeChain + 1)

  const cell = Math.min(44, Math.max(18, Math.floor(520 / Math.max(cols, rows, 1))))
  const hdr = Math.max(16, Math.round(cell * 0.55))

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-muted-foreground">Kette:</span>
        {Array.from({ length: btnCount }, (_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onChain(i)}
            className={`flex h-6 w-7 items-center justify-center rounded text-[10px] font-bold text-black ${
              activeChain === i ? 'ring-2 ring-foreground' : ''
            }`}
            style={{ background: colors[i % colors.length] }}
          >
            {prefix}
            {i + 1}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onChain(nextChain)}
          title="Neue Kette"
          className="flex h-6 w-7 items-center justify-center rounded border border-dashed border-muted-foreground/50 text-sm text-muted-foreground hover:border-primary hover:text-primary"
        >
          +
        </button>
        <button
          type="button"
          onClick={onReset}
          className="h-6 rounded border border-border px-2 text-[10px] text-muted-foreground hover:border-destructive hover:text-destructive"
        >
          Reset
        </button>
      </div>
      <p className="mb-2 text-xs text-muted-foreground">
        Module einzeln anklicken – oder Spalten-/Zeilen-Köpfe für ganze Reihen.
      </p>

      <div className="overflow-x-auto">
        <div className="inline-block">
          <div className="flex gap-0.5" style={{ marginLeft: hdr + 2 }}>
            {Array.from({ length: cols }, (_, c) => (
              <button
                key={c}
                type="button"
                title={`Spalte ${c + 1}`}
                onClick={() => onLine('col', c)}
                className="mb-0.5 flex items-center justify-center rounded-sm border border-dashed border-border text-[9px] text-muted-foreground hover:border-primary hover:text-foreground"
                style={{ width: cell, height: hdr }}
              >
                S{c + 1}
              </button>
            ))}
          </div>
          {grid.map((row, r) => (
            <div key={r} className="flex items-center gap-0.5">
              <button
                type="button"
                title={`Zeile ${r + 1}`}
                onClick={() => onLine('row', r)}
                className="mb-0.5 flex shrink-0 items-center justify-center rounded-sm border border-dashed border-border text-[9px] text-muted-foreground hover:border-primary hover:text-foreground"
                style={{ width: hdr, height: cell }}
              >
                Z{r + 1}
              </button>
              {row.map((v, c) => {
                const color = v >= 0 ? colors[v % colors.length] : undefined
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => onCell(r, c)}
                    className="mb-0.5 flex items-center justify-center rounded-sm border font-bold transition-[filter] hover:brightness-125"
                    style={{
                      width: cell,
                      height: cell,
                      fontSize: Math.min(9, cell / 3.5),
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

      {used.size > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {[...used].sort((a, b) => a - b).map((ci) => {
            const count = grid.flat().filter((v) => v === ci).length
            return (
              <span key={ci} className="flex items-center gap-1.5 text-xs">
                <span className="size-2.5 rounded-sm" style={{ background: colors[ci % colors.length] }} />
                <span className="font-semibold">
                  {prefix}
                  {ci + 1}
                </span>
                <span className="text-muted-foreground">({count} Mod.)</span>
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
