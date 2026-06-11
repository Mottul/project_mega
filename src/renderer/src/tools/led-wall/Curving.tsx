// Curving-Planung für das uS2+-Modul (0–45° je Modul in 2,5°-Schritten):
//  Vollkreis   – Tabelle aller sauberen Kreise, einzeln auswählbar + Vorschau
//  Kreissegment– größter Bogen, der in Sehne × Stichhöhe passt (Sehne = Wandbreite)
//  Builder     – freie Folge gerader/gebogener Abschnitte (konvex/konkav)
//  Squircle    – Rechteck mit runden 90°-Ecken (Breite = Wandbreite)
// Die hier gewählte/ermittelte Größe wird über computeCurve überall übernommen.

import { Card } from '@renderer/components/ui/card'
import { Readout, fmt, parseNum } from '../_calc/ui'
import { CURVE_MODE_LABELS, computeCurve } from './curve'
import { CIRCLE_TABLE, MODULES, MODULE_W } from './data'
import { distributeAngles, type BuilderSegment } from './math'
import { useLedWall, type CurveMode } from './store'
import { TopDownSvg } from './TopDownSvg'
import { LField } from './ui'

const US2_WEIGHT = MODULES['uS2+'].weight
const MODE_LABELS = CURVE_MODE_LABELS

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
  const s = useLedWall()
  const sel = Math.max(0, Math.min(s.selectedCircle, CIRCLE_TABLE.length - 1))
  const row = CIRCLE_TABLE[sel]
  const angles = distributeAngles(360, row.mods).angles

  return (
    <div>
      <p className="mb-2 text-xs text-muted-foreground">
        Vollkreise mit gleichem Winkel pro Modul (0,5 m Modulbreite) – Zeile wählen:
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
          {CIRCLE_TABLE.map((c, i) => (
            <tr
              key={c.angle}
              onClick={() => s.set({ selectedCircle: i })}
              className={`cursor-pointer border-t border-border ${
                i === sel ? 'bg-primary/10' : 'hover:bg-muted/40'
              }`}
            >
              <td className="py-1.5 pr-3">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className={`inline-block size-2 rounded-full ${i === sel ? 'bg-primary' : 'bg-transparent ring-1 ring-border'}`}
                  />
                  {c.angle}°
                </span>
              </td>
              <td className="py-1.5 pr-3">{c.mods} Stk.</td>
              <td className="py-1.5 pr-3">{c.circ.toFixed(1)} m</td>
              <td className="py-1.5 pr-3 font-semibold text-primary">{c.r.toFixed(3)} m</td>
              <td className="py-1.5">{(c.mods * US2_WEIGHT).toFixed(0)} kg</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <Readout label="Radius" value={fmt(row.r, 3)} unit="m" accent />
        <Readout label="Durchmesser" value={fmt(row.r * 2, 3)} unit="m" />
        <Readout label="Module/Reihe" value={`${row.mods}`} unit="Stk." accent />
      </div>
      <p className="mb-1.5 mt-3 text-xs text-muted-foreground">
        Vorschau: gewählter Kreis (R {row.r.toFixed(2)} m, {row.mods} Module):
      </p>
      <TopDownSvg angles={angles} />
    </div>
  )
}

function SegmentMode(): JSX.Element {
  const s = useLedWall()
  const c = computeCurve({
    curveMode: 'segment',
    widthM: parseNum(s.widthM),
    segSag: parseNum(s.segSag),
    builderSegs: s.builderSegs,
    sqD: parseNum(s.sqD),
    sqCorner: s.sqCorner,
    selectedCircle: s.selectedCircle
  })
  const arc = c.arc

  function intoBuilder(): void {
    if (!arc) return
    s.set({
      curveMode: 'builder',
      builderSegs: [{ type: 'curved', count: arc.mods, angle: arc.totalDeg, dir: 'convex' }]
    })
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <LField label="Sehne / max. Breite (= Wandbreite)" unit="m" value={s.widthM} onChange={(v) => s.set({ widthM: v })} />
        <LField label="Stichhöhe / max. Tiefe" unit="m" value={s.segSag} onChange={(v) => s.set({ segSag: v })} />
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
            <Readout label="Erreichte Sehne (Breite)" value={fmt(arc.ca, 3)} unit="m" />
            <Readout label="Erreichte Tiefe (Stich)" value={fmt(arc.sa, 3)} unit="m" />
            <Readout label="Belegte Fläche (B×T)" value={`${fmt(c.footprintW, 2)} × ${fmt(c.footprintD, 2)} m`} />
            <Readout label="Gewicht/Reihe" value={fmt(arc.mods * US2_WEIGHT, 1)} unit="kg" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="mb-1 text-xs text-muted-foreground">Winkelverteilung (höhere Winkel zur Mitte):</p>
              <AnglePills angles={arc.dist.angles} />
            </div>
            <button
              type="button"
              onClick={intoBuilder}
              className="shrink-0 rounded-md border border-primary/50 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10"
              title="Diese Winkel als bearbeitbare Abschnitte in den Segment-Builder übernehmen"
            >
              In Segment-Builder übernehmen →
            </button>
          </div>
          <TopDownSvg angles={arc.dist.angles} showChord chordHorizontal chordLabel={arc.ca} sagLabel={arc.sa} />
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

  const c = computeCurve({
    curveMode: 'builder',
    widthM: parseNum(s.widthM),
    segSag: parseNum(s.segSag),
    builderSegs: s.builderSegs,
    sqD: parseNum(s.sqD),
    sqCorner: s.sqCorner,
    selectedCircle: s.selectedCircle
  })
  const angles = c.angles
  const totalAngle = angles.reduce((sum, a) => sum + Math.abs(a), 0)

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Gerade und gebogene Abschnitte definieren – die Winkel werden automatisch in 2,5°-Schritten verteilt.
        Tipp: Ein Kreissegment lässt sich oben mit „In Segment-Builder übernehmen" als Startpunkt holen.
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
        <Readout label="Module gesamt" value={`${c.mods}`} unit="Stk." accent />
        <Readout label="Gesamtwinkel" value={fmt(totalAngle, 1)} unit="°" />
        <Readout label="Belegte Fläche (B×T)" value={`${fmt(c.footprintW, 2)} × ${fmt(c.footprintD, 2)} m`} accent />
        <Readout label="Gewicht/Reihe" value={fmt(c.mods * US2_WEIGHT, 1)} unit="kg" />
      </div>
      {angles.some((a) => a !== 0) && (
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Winkelverteilung:</p>
          <AnglePills angles={angles} />
        </div>
      )}
      {c.mods > 0 && <TopDownSvg angles={angles} />}
    </div>
  )
}

function SquircleMode(): JSX.Element {
  const s = useLedWall()
  const c = computeCurve({
    curveMode: 'squircle',
    widthM: parseNum(s.widthM),
    segSag: parseNum(s.segSag),
    builderSegs: s.builderSegs,
    sqD: parseNum(s.sqD),
    sqCorner: s.sqCorner,
    selectedCircle: s.selectedCircle
  })
  const sq = c.squircle!
  const angles = c.angles

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <LField label="Breite (= Wandbreite)" unit="m" value={s.widthM} onChange={(v) => s.set({ widthM: v })} />
        <LField label="Tiefe" unit="m" value={s.sqD} onChange={(v) => s.set({ sqD: v })} />
        <LField
          label="Module/Ecke"
          value={String(s.sqCorner)}
          number
          min={2}
          max={36}
          onChange={(v) => s.set({ sqCorner: Math.max(2, parseInt(v) || 2) })}
        />
      </div>
      {!c.feasible && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          ⚠ Mindestens 2 Module pro Ecke nötig (90° ÷ 45° = 2). Eck-Module erhöhen.
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <Readout label="Module gesamt" value={`${sq.totalMods}`} unit="Stk." accent />
        <Readout label="Eckradius" value={fmt(sq.cornerR, 3)} unit="m" accent />
        <Readout label="Gerade Breite" value={`${sq.straightW} Mod. (${(sq.straightW * MODULE_W).toFixed(1)} m)`} />
        <Readout label="Gerade Tiefe" value={`${sq.straightD} Mod. (${(sq.straightD * MODULE_W).toFixed(1)} m)`} />
        <Readout label="Belegte Fläche (B×T)" value={`${fmt(c.footprintW, 2)} × ${fmt(c.footprintD, 2)} m`} accent />
        <Readout label="Gewicht/Reihe" value={fmt(sq.totalMods * US2_WEIGHT, 1)} unit="kg" />
      </div>
      <div>
        <p className="mb-1 text-xs text-muted-foreground">Winkelverteilung pro Ecke:</p>
        <AnglePills angles={sq.cornerDist.angles} />
      </div>
      {angles.length > 0 && <TopDownSvg angles={angles} />}
    </div>
  )
}
