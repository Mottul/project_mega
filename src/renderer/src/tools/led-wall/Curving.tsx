// Curving-Planung für das uS2+-Modul (0–45° je Modul in 2,5°-Schritten):
//  Vollkreis   – Tabelle aller sauberen Kreise (gleicher Winkel pro Modul)
//  Kreissegment– größter Bogen, der in Sehne × Stichhöhe passt
//  Builder     – freie Folge gerader/gebogener Abschnitte (konvex/konkav)
//  Squircle    – Rechteck mit runden 90°-Ecken
// Alle Modi zeigen die Draufsicht inkl. Winkelverteilung.

import { Card } from '@renderer/components/ui/card'
import { NumField, Readout, fmt, parseNum, trimNum } from '../_calc/ui'
import { CIRCLE_TABLE, MODULES, MODULE_W } from './data'
import { buildSquircle, calcArc, distributeAngles, segsToAngles, type BuilderSegment } from './math'
import { useLedWall, type CurveMode } from './store'
import { TopDownSvg } from './TopDownSvg'

const US2_WEIGHT = MODULES['uS2+'].weight

const MODE_LABELS: Record<CurveMode, string> = {
  circle: 'Vollkreis',
  segment: 'Kreissegment',
  builder: 'Segment-Builder',
  squircle: 'Squircle'
}

function AnglePills({ angles }: { angles: number[] }): JSX.Element {
  return (
    <div className="flex flex-wrap gap-1">
      {angles.map((a, i) => {
        const abs = Math.abs(a)
        const cls =
          abs === 0
            ? 'border-teal-500/30 bg-teal-500/10 text-teal-500'
            : a > 0
              ? 'border-primary/30 bg-primary/10 text-primary'
              : 'border-violet-500/30 bg-violet-500/10 text-violet-500'
        return (
          <span key={i} className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${cls}`}>
            {abs}°{a < 0 ? ' ↺' : ''}
          </span>
        )
      })}
    </div>
  )
}

export function Curving(): JSX.Element {
  const s = useLedWall()

  return (
    <Card className="p-5">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
        Curving (uS2+) — 0° bis 45° in 2,5°-Schritten
      </h2>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {(Object.keys(MODE_LABELS) as CurveMode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => s.set({ curveMode: m })}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
              s.curveMode === m
                ? 'border-primary/60 bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
            }`}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {s.curveMode === 'circle' && <CircleMode />}
        {s.curveMode === 'segment' && <SegmentMode />}
        {s.curveMode === 'builder' && <BuilderMode />}
        {s.curveMode === 'squircle' && <SquircleMode />}
      </div>
    </Card>
  )
}

function CircleMode(): JSX.Element {
  const smallest = CIRCLE_TABLE[0]
  const dist = distributeAngles(360, smallest.mods)
  return (
    <div>
      <p className="mb-2 text-xs text-muted-foreground">
        Mögliche Vollkreise mit gleichem Winkel pro Modul (0,5 m Modulbreite):
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wider text-primary">
            <th className="py-1.5 pr-3 font-semibold">Winkel/Modul</th>
            <th className="py-1.5 pr-3 font-semibold">Module</th>
            <th className="py-1.5 pr-3 font-semibold">Umfang</th>
            <th className="py-1.5 pr-3 font-semibold">Radius</th>
            <th className="py-1.5 font-semibold">Gewicht/Reihe</th>
          </tr>
        </thead>
        <tbody>
          {CIRCLE_TABLE.map((c) => (
            <tr key={c.angle} className="border-t border-border">
              <td className="py-1.5 pr-3">{c.angle}°</td>
              <td className="py-1.5 pr-3">{c.mods} Stk.</td>
              <td className="py-1.5 pr-3">{c.circ.toFixed(1)} m</td>
              <td className="py-1.5 pr-3 font-semibold text-primary">{c.r.toFixed(3)} m</td>
              <td className="py-1.5">{(c.mods * US2_WEIGHT).toFixed(0)} kg</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mb-1.5 mt-4 text-xs text-muted-foreground">
        Vorschau: kleinster Kreis (R {smallest.r.toFixed(2)} m, {smallest.mods} Module):
      </p>
      <div className="flex justify-center">
        <TopDownSvg angles={dist.angles} />
      </div>
    </div>
  )
}

function SegmentMode(): JSX.Element {
  const s = useLedWall()
  const chord = parseNum(s.segChord)
  const sag = parseNum(s.segSag)
  const arc = chord != null && sag != null ? calcArc(chord, sag) : null

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <NumField label="Sehne / max. Breite" unit="m" value={s.segChord} onChange={(v) => s.set({ segChord: v })} />
        <NumField label="Stichhöhe / max. Tiefe" unit="m" value={s.segSag} onChange={(v) => s.set({ segSag: v })} />
      </div>
      {!arc ? (
        <p className="text-sm text-muted-foreground">Keine passende Konfiguration gefunden.</p>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <Readout label="Radius" value={fmt(arc.r, 3)} unit="m" accent />
            <Readout label="Module" value={`${arc.mods}`} unit="Stk." accent />
            <Readout label="Bogenlänge" value={fmt(arc.arcLen, 3)} unit="m" />
            <Readout label="Gesamtwinkel" value={fmt(arc.dist.achieved, 1)} unit="°" />
            <Readout label="Erreichte Sehne" value={fmt(arc.ca, 3)} unit="m" />
            <Readout label="Erreichte Höhe" value={fmt(arc.sa, 3)} unit="m" />
            <Readout label="Gewicht/Reihe" value={fmt(arc.mods * US2_WEIGHT, 1)} unit="kg" />
            <Readout
              label="Fläche genutzt"
              value={chord && sag ? `${Math.round((arc.ca / chord) * 100)} % × ${Math.round((arc.sa / sag) * 100)} %` : ''}
            />
          </div>
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Winkelverteilung (höhere Winkel zur Mitte):</p>
            <AnglePills angles={arc.dist.angles} />
          </div>
          <div className="flex justify-center">
            <TopDownSvg angles={arc.dist.angles} showChord chordHorizontal chordLabel={arc.ca} sagLabel={arc.sa} />
          </div>
        </>
      )}
    </div>
  )
}

function BuilderMode(): JSX.Element {
  const s = useLedWall()

  function update(i: number, patch: Partial<BuilderSegment>): void {
    const next = s.builderSegs.map((seg, j) => (j === i ? ({ ...seg, ...patch } as BuilderSegment) : seg))
    s.set({ builderSegs: next })
  }

  const angles = segsToAngles(s.builderSegs)
  const totalMods = angles.length
  const totalAngle = angles.reduce((sum, a) => sum + Math.abs(a), 0)

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Gerade und gebogene Abschnitte definieren – die Winkel werden automatisch in 2,5°-Schritten verteilt.
      </p>
      <div className="space-y-1.5">
        {s.builderSegs.map((seg, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/20 p-2">
            <button
              type="button"
              onClick={() => update(i, { type: 'straight' })}
              className={`rounded border px-2 py-1 text-xs ${seg.type === 'straight' ? 'border-primary/60 bg-primary/10 font-semibold text-primary' : 'border-border text-muted-foreground'}`}
            >
              Gerade
            </button>
            <button
              type="button"
              onClick={() =>
                update(i, seg.type === 'curved' ? { type: 'curved' } : { type: 'curved', angle: 30, dir: 'convex' })
              }
              className={`rounded border px-2 py-1 text-xs ${seg.type === 'curved' ? 'border-primary/60 bg-primary/10 font-semibold text-primary' : 'border-border text-muted-foreground'}`}
            >
              Bogen
            </button>
            <label className="ml-1 flex items-center gap-1 text-[10px] text-muted-foreground">
              Mod:
              <input
                type="number"
                min={1}
                max={50}
                value={seg.count}
                onChange={(e) => update(i, { count: Math.max(1, parseInt(e.target.value) || 1) })}
                className="h-7 w-14 rounded border border-border bg-input/40 px-1.5 text-xs text-foreground"
              />
            </label>
            {seg.type === 'curved' && (
              <>
                <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  Winkel:
                  <input
                    type="number"
                    min={2.5}
                    max={360}
                    step={2.5}
                    value={seg.angle}
                    onChange={(e) => update(i, { angle: Math.max(2.5, parseFloat(e.target.value) || 2.5) })}
                    className="h-7 w-16 rounded border border-border bg-input/40 px-1.5 text-xs text-foreground"
                  />
                  °
                </label>
                <button
                  type="button"
                  onClick={() => update(i, { dir: 'convex' })}
                  className={`rounded border px-2 py-1 text-[10px] ${seg.dir === 'convex' ? 'border-primary/60 bg-primary/10 font-semibold text-primary' : 'border-border text-muted-foreground'}`}
                >
                  Konvex
                </button>
                <button
                  type="button"
                  onClick={() => update(i, { dir: 'concave' })}
                  className={`rounded border px-2 py-1 text-[10px] ${seg.dir === 'concave' ? 'border-violet-500/60 bg-violet-500/10 font-semibold text-violet-500' : 'border-border text-muted-foreground'}`}
                >
                  Konkav
                </button>
              </>
            )}
            {s.builderSegs.length > 1 && (
              <button
                type="button"
                onClick={() => s.set({ builderSegs: s.builderSegs.filter((_, j) => j !== i) })}
                title="Abschnitt entfernen"
                className="ml-auto flex size-6 items-center justify-center rounded border border-border text-muted-foreground hover:border-destructive hover:text-destructive"
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => s.set({ builderSegs: [...s.builderSegs, { type: 'straight', count: 3 }] })}
        className="rounded-md border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground hover:border-primary hover:text-primary"
      >
        + Abschnitt hinzufügen
      </button>

      <div className="grid gap-2 sm:grid-cols-2">
        <Readout label="Module gesamt" value={`${totalMods}`} unit="Stk." accent />
        <Readout label="Gesamtwinkel" value={fmt(totalAngle, 1)} unit="°" />
        <Readout label="Gewicht/Reihe" value={fmt(totalMods * US2_WEIGHT, 1)} unit="kg" />
        <Readout label="Breite (gerade Anteile)" value={trimNum(angles.filter((a) => a === 0).length * MODULE_W, 1)} unit="m" />
      </div>
      {angles.some((a) => a !== 0) && (
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Winkelverteilung:</p>
          <AnglePills angles={angles} />
        </div>
      )}
      {totalMods > 0 && (
        <div className="flex justify-center">
          <TopDownSvg angles={angles} />
        </div>
      )}
    </div>
  )
}

function SquircleMode(): JSX.Element {
  const s = useLedWall()
  const w = parseNum(s.sqW) ?? 2
  const d = parseNum(s.sqD) ?? 1
  const sq = buildSquircle(w, d, s.sqCorner)
  const angles = segsToAngles(sq.segs)
  const feasible = Math.max(...sq.cornerDist.angles) <= 45

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <NumField label="Breite" unit="m" value={s.sqW} onChange={(v) => s.set({ sqW: v })} />
        <NumField label="Tiefe" unit="m" value={s.sqD} onChange={(v) => s.set({ sqD: v })} />
        <label className="flex items-center gap-3">
          <span className="w-44 shrink-0 text-sm text-muted-foreground">Module/Ecke</span>
          <input
            type="number"
            min={2}
            max={36}
            value={s.sqCorner}
            onChange={(e) => s.set({ sqCorner: Math.max(2, parseInt(e.target.value) || 2) })}
            className="h-9 w-full flex-1 rounded-md border border-border bg-input/40 px-3 text-sm"
          />
        </label>
      </div>
      {!feasible && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          ⚠ Mindestens 2 Module pro Ecke nötig (90° ÷ 45° = 2). Eck-Module erhöhen.
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <Readout label="Module gesamt" value={`${sq.totalMods}`} unit="Stk." accent />
        <Readout label="Eckradius" value={fmt(sq.cornerR, 3)} unit="m" accent />
        <Readout label="Gerade Breite" value={`${sq.straightW} Mod. (${(sq.straightW * MODULE_W).toFixed(1)} m)`} />
        <Readout label="Gerade Tiefe" value={`${sq.straightD} Mod. (${(sq.straightD * MODULE_W).toFixed(1)} m)`} />
        <Readout label="Winkel/Ecke" value={fmt(sq.cornerDist.achieved, 1)} unit="°" />
        <Readout label="Gewicht/Reihe" value={fmt(sq.totalMods * US2_WEIGHT, 1)} unit="kg" />
      </div>
      <div>
        <p className="mb-1 text-xs text-muted-foreground">Winkelverteilung pro Ecke:</p>
        <AnglePills angles={sq.cornerDist.angles} />
      </div>
      {angles.length > 0 && (
        <div className="flex justify-center">
          <TopDownSvg angles={angles} />
        </div>
      )}
    </div>
  )
}
